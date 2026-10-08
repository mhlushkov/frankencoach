import type {
  AgentEvent, AnalyzeRequest, ChainStep, Landmarks, Session, ToolInputType, ToolKind, ToolManifest, ToolResult,
} from '../../contracts/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import thresholds from '../../contracts/gate-thresholds.json';
import { Budget } from './cost';
import type { LlmRequest, LlmResponse } from './llm';
import type { ClassifyArgs, Classification } from '../gate/classify';
import type { SniffArgs, Sniff } from '../gate/sniff';
import type { LogEntry } from './log';
import { ToolRunError, type ToolInput } from './runner';
import { plan, type FindFn } from './planner';

// ---------- dependency surface (A3/A7/A9/A10 are injected; tests pass fakes) ----------
export type Rejection = { ok: false; reason: string; text: string; tips: string[]; stats?: Record<string, unknown> };
export type LandmarksValidity = { ok: true; stats?: Record<string, unknown> } | Rejection;
export type TableValidity =
  | { ok: true; header: string[]; rows: number; numericCols: number; timeCol?: string }
  | Rejection;

export interface GrowNeed { kind: ToolKind; inputType: ToolInputType; activity: string; formatId?: string }
export interface GrowArgs {
  need: GrowNeed;
  evidence: { sampleStats?: Record<string, unknown>; head30?: string; filename?: string };
  userMessage: string;
  realInput?: ToolInput;
}
export interface GrowResult { ok: boolean; manifest?: ToolManifest }

export interface LoopDeps {
  registry: {
    find: FindFn;
    findFallback(q: { kind: ToolKind; inputType: ToolInputType }): ToolManifest | undefined;
    bumpUses(name: string): void;
    list(): ToolManifest[];
    knownActivities(): string[];
  };
  validity: { checkLandmarks(l: Landmarks): LandmarksValidity; checkTable(text: string): TableValidity };
  classify(args: ClassifyArgs): Promise<{ value: Classification; llm: LlmResponse }>;
  sniff(args: SniffArgs): Promise<{ value: Sniff; llm: LlmResponse }>;
  canonicalize(activity: string): { canonical: string; how: 'exact' | 'synonym' | 'new' };
  grow(args: GrowArgs, ctx: { emit(e: AgentEvent): void; budget: Budget; stepIndex: number }): Promise<GrowResult>;
  runTool(name: string, input: ToolInput): Promise<ToolResult | Session>;
  llm(req: LlmRequest): Promise<LlmResponse>;
  checkIntent(message: string): { allowed: boolean; reason?: string };
  estimateGrowUsd(kind: ToolKind): number;
  budgetLimitUsd: number;
  maxToolsPerSession: number;
  autoConfirm: boolean;
  appendLog(entry: LogEntry): void;
  now?: () => string;
  /** per-session budgets; default = module-level Map */
  budgets?: Map<string, Budget>;
  /** per-session count of grown tools; default = module-level Map */
  grown?: Map<string, number>;
}

const coachPrompt = readFileSync(join(import.meta.dir, 'prompts/coach-feedback.md'), 'utf8');
const defaultBudgets = new Map<string, Budget>();
const defaultGrown = new Map<string, number>();

const LOW_CONF = new Set(['unstable', 'multiple_people', 'too_long', 'low_confidence']);
type RejectReason = Extract<AgentEvent, { type: 'rejected' }>['reason'];
function mapReason(r: string): RejectReason {
  if (r === 'no_human' || r === 'no_motion' || r === 'not_a_sport' || r === 'mismatch' || r === 'bad_table') return r;
  return LOW_CONF.has(r) ? 'low_confidence' : 'low_confidence';
}
const reject = (reason: RejectReason, text: string, tips: string[] = []): AgentEvent => ({ type: 'rejected', reason, text, tips });

/** Small async queue so events emitted by growTool's callback stream out while it is still running. */
function channel<T>() {
  const buf: T[] = []; let done = false; let wake: (() => void) | null = null;
  return {
    push(v: T) { buf.push(v); wake?.(); },
    close() { done = true; wake?.(); },
    async *drain(): AsyncGenerator<T> {
      for (;;) {
        if (buf.length) { yield buf.shift()!; continue; }
        if (done) return;
        await new Promise<void>((r) => { wake = r; });
        wake = null;
      }
    },
  };
}

export async function* analyze(req: AnalyzeRequest, deps: LoopDeps): AsyncGenerator<AgentEvent> {
  const now = deps.now ?? (() => new Date().toISOString());
  const budgets = deps.budgets ?? defaultBudgets;
  const grown = deps.grown ?? defaultGrown;
  let budget = budgets.get(req.sessionId);
  if (!budget) { budget = new Budget(deps.budgetLimitUsd); budgets.set(req.sessionId, budget); }
  let requestUsd = 0;

  const cost = (step: Extract<AgentEvent, { type: 'cost' }>['step'], r: LlmResponse): AgentEvent => {
    budget!.spend(r.usd); requestUsd += r.usd;
    deps.appendLog({ ts: now(), sessionId: req.sessionId, step, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, usd: r.usd, ms: r.ms });
    return { type: 'cost', step, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, usd: r.usd, sessionUsd: budget!.spent, cached: r.cached };
  };
  const total = (): AgentEvent => ({ type: 'cost', step: 'total', inputTokens: 0, outputTokens: 0, usd: requestUsd, sessionUsd: budget!.spent });

  // 1. intent (authority, $0)
  const intent = deps.checkIntent(req.message);
  if (!intent.allowed) {
    yield { type: 'refused', text: 'I do not assess readiness, clearance, or medical questions. I can analyze technique or a session export and give training cues.' };
    return;
  }

  const input = req.input;
  if (input.kind === 'none') {
    yield { type: 'clarify', text: 'Send a short video (one person, whole body in frame) or a watch/app export (CSV, GPX, TCX) and I will analyze it.' };
    return;
  }

  // 2. validity ($0) → 3. classify / sniff (cheap model)
  let activity: string; let how: 'exact' | 'synonym' | 'new' = 'new'; let formatId: string | undefined;
  let sampleStats: Record<string, unknown> | undefined; let head30: string | undefined;
  if (input.kind === 'landmarks') {
    yield { type: 'thinking', text: 'Checking the landmarks: person present, motion, stability…' };
    const v = deps.validity.checkLandmarks(input.landmarks);
    if (!v.ok) { yield reject(mapReason(v.reason), v.text, v.tips); return; }
    sampleStats = v.stats;
    yield { type: 'thinking', text: 'Identifying the activity…' };
    if (budget.exceeded) { yield { type: 'error', text: `Session budget of $${budget.limit.toFixed(2)} is used up.` }; return; }
    const c = await deps.classify({ message: req.message, sportHint: req.sportHint, frames: input.frames, stats: v.stats, knownActivities: deps.registry.knownActivities() });
    yield cost('classify', c.llm);
    const k = c.value;
    if (!k.isHuman) { yield reject('no_human', `No person recognized in the frames. ${k.reason}`, ['Film one person, whole body visible']); return; }
    if (k.numPeople > 1) { yield reject('low_confidence', `Several people in frame (${k.numPeople}); I analyze one athlete at a time.`, ['Film a single athlete']); return; }
    if (k.mismatchWithHint) { yield reject('mismatch', `The video does not match the hint "${req.sportHint}": ${k.reason}`, ['Check the sport hint or upload the right video']); return; }
    if (!k.isSport) { yield reject('not_a_sport', `This does not look like a sport activity: ${k.reason}`, ['Upload a training clip']); return; }
    if (k.confidence < thresholds.minClassifyConfidence) { yield reject('low_confidence', `Not sure what activity this is (confidence ${k.confidence.toFixed(2)}): ${k.reason}`, ['Add a sport hint', 'Film from the side, whole body visible']); return; }
    const can = deps.canonicalize(k.activity);
    activity = can.canonical; how = can.how;
    yield { type: 'identified', activity, confidence: k.confidence, text: `Looks like ${activity} (${Math.round(k.confidence * 100)}%). ${k.reason}` };
  } else {
    yield { type: 'thinking', text: 'Checking the table: rows, numeric columns, time column…' };
    const v = deps.validity.checkTable(input.text);
    if (!v.ok) { yield reject('bad_table', v.text, v.tips); return; }
    const lines = input.text.split(/\r?\n/);
    head30 = lines.slice(0, 30).join('\n');
    yield { type: 'thinking', text: 'Identifying the export format…' };
    if (budget.exceeded) { yield { type: 'error', text: `Session budget of $${budget.limit.toFixed(2)} is used up.` }; return; }
    const knownFormats = deps.registry.list().filter((t) => t.kind === 'parser').map((t) => t.inputType.replace(/^raw:/, ''));
    const s = await deps.sniff({ filename: input.filename, head30, header: v.header.join(','), knownFormats });
    yield cost('sniff', s.llm);
    if (!s.value.isSportData) { yield reject('bad_table', `This table does not look like sport data (${s.value.formatId}).`, ['Export a workout/dive from your watch app']); return; }
    const can = deps.canonicalize(s.value.activity);
    activity = can.canonical; how = can.how; formatId = s.value.formatId;
    yield { type: 'identified', activity, formatId, confidence: s.value.confidence, text: `Format ${formatId}, activity ${activity} (${Math.round(s.value.confidence * 100)}%).` };
  }

  // 4. plan
  const chain: ChainStep[] = plan(input, { activity, formatId }, deps.registry.find);
  yield { type: 'plan', chain };
  const grownHere = new Set<string>();
  const initial: ToolInput = input.kind === 'landmarks' ? input.landmarks : { raw: input.text, filename: input.filename };

  // 5. missing capability → one confirmation for the whole chain
  const missing = chain.map((s, i) => [s, i] as const).filter(([s]) => s.missing);
  if (missing.length) {
    const estimateUsd = missing.reduce((sum, [s]) => sum + deps.estimateGrowUsd(s.step === 'parse' ? 'parser' : 'analyzer'), 0);
    const [first, firstIdx] = missing[0];
    const names = missing.map(([s]) => `${s.step === 'parse' ? 'parser' : 'analyzer'} for ${s.step === 'parse' ? s.inputType : s.activity}`).join(' and ');
    yield {
      type: 'missing_capability', kind: first.step === 'parse' ? 'parser' : 'analyzer', activity: first.activity, inputType: first.inputType,
      estimateUsd, stepIndex: firstIdx,
      text: `I have no ${names} yet. I can write and test ${missing.length > 1 ? 'them' : 'it'} now for about $${estimateUsd.toFixed(2)}. Confirm to grow.`,
    };
    if (!req.confirmGrow && !deps.autoConfirm) return;

    const used = grown.get(req.sessionId) ?? 0;
    let allowed = used + missing.length <= deps.maxToolsPerSession;
    if (!allowed) yield { type: 'thinking', text: `Max ${deps.maxToolsPerSession} new tools per session reached; falling back to the generic tool.` };
    for (const [step, i] of missing) {
      let ok = false;
      if (allowed && !budget.exceeded) {
        const kind: ToolKind = step.step === 'parse' ? 'parser' : 'analyzer';
        // acceptance input = what step 6 will feed this step: the raw input, or the session a preceding parser makes of it
        let realInput: ToolInput | undefined = initial;
        if (i > 0 && chain[i - 1].step === 'parse' && chain[i - 1].tool) {
          try { realInput = (await deps.runTool(chain[i - 1].tool!, initial)) as Session; } catch { realInput = undefined; }
        }
        const ch = channel<AgentEvent>();
        const p = deps.grow(
          { need: { kind, inputType: step.inputType, activity: step.activity, formatId }, evidence: { sampleStats, head30, filename: input.kind === 'file' ? input.filename : undefined }, userMessage: req.message, realInput },
          { emit: (e) => ch.push(e), budget, stepIndex: i },
        ).then((r) => { ch.close(); return r; }, (err) => { ch.close(); throw err; });
        for await (const e of ch.drain()) yield withStep(e, i);
        let r: GrowResult;
        try { r = await p; } catch (e) { yield { type: 'error', text: `growth failed: ${(e as Error).message}` }; r = { ok: false }; }
        if (r.ok && r.manifest) {
          ok = true; step.tool = r.manifest.name; step.missing = false; grownHere.add(r.manifest.name);
          grown.set(req.sessionId, (grown.get(req.sessionId) ?? 0) + 1);
          if (r.manifest.costUsd) { requestUsd += r.manifest.costUsd; }
        } else if (allowed) {
          allowed = false; // one failure → stop growing further links; fall back where possible
        }
      }
      if (!ok) {
        const kind: ToolKind = step.step === 'parse' ? 'parser' : 'analyzer';
        const fb = deps.registry.findFallback({ kind, inputType: step.inputType });
        if (!fb) {
          yield reject(input.kind === 'file' ? 'bad_table' : 'not_a_sport', `I could not build a ${kind} for ${step.step === 'parse' ? step.inputType : step.activity} and have no generic fallback.`, ['Try again later', 'Try a different export format']);
          return;
        }
        step.tool = fb.name; step.missing = false;
        yield { type: 'reused', tool: fb.name, how: 'fallback', savedUsd: 0, text: `Growth was not possible; using the generic ${fb.name} instead.`, stepIndex: i };
      }
    }
  }

  // 6. run the chain (subprocess per tool; never import())
  let current: ToolInput = initial;
  let result: ToolResult | undefined;
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const name = step.tool!;
    const manifest = deps.registry.list().find((t) => t.name === name);
    if (!grownHere.has(name) && manifest && manifest.activity !== '*') {
      yield { type: 'reused', tool: name, how: how === 'synonym' ? 'synonym' : 'exact', savedUsd: manifest.costUsd ?? 0, text: `Reusing ${name} (${manifest.createdBy}, ${manifest.uses} prior uses).`, stepIndex: i };
    }
    let out: ToolResult | Session;
    try {
      out = await deps.runTool(name, current);
    } catch (e) {
      const msg = e instanceof ToolRunError ? e.message : (e as Error).message;
      yield { type: 'error', text: `${name} failed to run: ${msg}` };
      return;
    }
    deps.registry.bumpUses(name);
    if (step.step === 'parse') {
      const session = out as Session;
      yield { type: 'parsed', tool: name, session, summary: { durationSec: session.durationSec, series: Object.keys(session.series ?? {}) }, stepIndex: i };
      current = session;
    } else {
      result = out as ToolResult;
      yield { type: 'tool_used', name, result, stepIndex: i };
      if (!result.usable) {
        const warn = (result.warnings ?? []).join('; ');
        yield reject(input.kind === 'file' ? 'bad_table' : 'not_a_sport',
          `${name} could not find the ${activity} pattern in this input${warn ? `: ${warn}` : '.'}`,
          ['Film the whole movement from the side', 'Check that the export is the right activity']);
        yield total();
        return;
      }
    }
  }
  if (!result) { yield { type: 'clarify', text: 'Nothing to analyze yet. Upload a video or an export.' }; return; }

  // 7. coach feedback (cheap model; only metrics/warnings/activity/message go to the model)
  if (budget.exceeded) { yield { type: 'error', text: `Session budget of $${budget.limit.toFixed(2)} is used up before feedback.` }; yield total(); return; }
  const fb = await deps.llm({
    tier: 'cheap', system: coachPrompt, maxTokens: 600,
    user: JSON.stringify({ message: req.message, activity, metrics: result.metrics, warnings: result.warnings ?? [] }),
  });
  yield { type: 'answer', text: fb.text.trim() };
  yield cost('feedback', fb);
  yield total();
}

function withStep(e: AgentEvent, stepIndex: number): AgentEvent {
  switch (e.type) {
    case 'growing': case 'test_result': case 'authority_check': case 'tool_installed': case 'reused': case 'parsed': case 'tool_used':
      return e.stepIndex === undefined ? { ...e, stepIndex } : e;
    default:
      return e;
  }
}
