// Growth loop: strong model writes tools/<name>/{manifest.json,index.ts,index.test.ts} → authority → bun test → install.
// Authority never changes (contracts/authority.json); growth is never served from the LLM cache.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent, Session, ToolInputType, ToolKind, ToolManifest, ToolResult } from '../../contracts/types';
import authority from '../../contracts/authority.json';
import { checkAll } from './authority';
import type { Budget } from './cost';
import type { LlmRequest, LlmResponse } from './llm';
import type { LogEntry } from './log';
import { install, list } from './registry';
import { runTool, type ToolInput } from './runner';

export interface GrowNeed { kind: ToolKind; inputType: ToolInputType; activity: string; formatId?: string }
export interface GrowArgs {
  need: GrowNeed;
  evidence: { sampleStats?: Record<string, unknown>; head30?: string; filename?: string };
  userMessage: string;
  /** The exact input the step will be run with (landmarks, parsed session, or `{ raw, filename }`); the candidate must work on it. */
  realInput?: ToolInput;
}
export interface GrowResult { ok: boolean; manifest?: ToolManifest }
export interface GrowDeps {
  llm(req: LlmRequest): Promise<LlmResponse>;
  /** `bun test tools/<name>` in a subprocess (runner.runToolTests). */
  run(name: string): Promise<{ pass: boolean; summary: string }>;
  /** Acceptance run on the real input (runner.runTool, same root/timeout as the loop's step 6). */
  runReal?(name: string, input: ToolInput): Promise<ToolResult | Session>;
  root: string;
  emit(e: AgentEvent): void;
  budget: Budget;
  stepIndex?: number;
  /** reuse.promptContext; defaults to a lazy import so tests can inject a fake. */
  promptContext?: (need: { kind: ToolKind; inputType: ToolInputType }) => string;
  appendLog?: (e: LogEntry) => void;
  sessionId?: string;
  now?: () => string;
  maxAttempts?: number;
}

const MAX_ATTEMPTS: number = authority.maxGrowAttempts;
const ALLOWED_FILES = ['index.ts', 'index.test.ts'];

/** parser → <formatId>; analyzer → <activity>-technique (landmarks) | <activity>-profile (session). */
export function toolName(need: GrowNeed): string {
  if (need.kind === 'parser') return need.formatId ?? need.inputType.replace(/^raw:/, '');
  return `${need.activity}-${need.inputType === 'landmarks' ? 'technique' : 'profile'}`;
}

/** `../<tool>` imports (excluding contracts/data) → basedOn evidence of reuse. */
export function basedOnFrom(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(/\bfrom\s*['"]\.\.\/([a-z0-9][a-z0-9-]*)['"]/g)) out.add(m[1]!);
  return [...out].sort();
}

function loadPrompt(kind: ToolKind): string {
  return readFileSync(join(import.meta.dir, 'prompts', `grow-${kind}.md`), 'utf8');
}

interface ModelAnswer { manifest: Record<string, unknown>; files: Record<string, string> }
function parseAnswer(json: unknown): { ok: true; value: ModelAnswer } | { ok: false; error: string } {
  const a = json as Partial<ModelAnswer> | null;
  if (!a || typeof a !== 'object') return { ok: false, error: 'answer is not a JSON object' };
  if (!a.manifest || typeof a.manifest !== 'object') return { ok: false, error: 'missing "manifest" object' };
  if (!a.files || typeof a.files !== 'object') return { ok: false, error: 'missing "files" object' };
  for (const f of ALLOWED_FILES) if (typeof a.files[f] !== 'string' || !a.files[f]!.trim()) return { ok: false, error: `files["${f}"] must be a non-empty string` };
  const extra = Object.keys(a.files).filter((f) => !ALLOWED_FILES.includes(f));
  if (extra.length) return { ok: false, error: `only index.ts and index.test.ts are allowed; got ${extra.join(', ')}` };
  return { ok: true, value: a as ModelAnswer };
}

/** sampleStats (analyzer) or head30 (parser): shown in the first prompt and again after a failed acceptance run. */
function evidenceBlock(args: GrowArgs, name: string): string | null {
  const { need, evidence } = args;
  if (need.kind === 'parser') {
    return `# Sample\nfilename: ${evidence.filename ?? '(unknown)'}\nformatId: ${need.formatId ?? name}\n\nFirst 30 lines:\n\`\`\`\n${evidence.head30 ?? ''}\n\`\`\``;
  }
  if (evidence.sampleStats) {
    return `# Input statistics (from the validity gate)\n\`\`\`json\n${JSON.stringify(evidence.sampleStats, null, 2)}\n\`\`\``;
  }
  return null;
}

function userPrompt(args: GrowArgs, name: string, context: string, feedback: string | null): string {
  const { need } = args;
  const parts: string[] = [
    `# Task\nWrite the ${need.kind} tool \`tools/${name}/\` (manifest.name = "${name}") for activity "${need.activity}", inputType "${need.inputType}", outputType "${need.kind === 'parser' ? 'session' : 'result'}".`,
    `# User request\n${args.userMessage}`,
  ];
  const ev = evidenceBlock(args, name);
  if (ev) parts.push(ev);
  parts.push(`# Context (contracts, example tool, available helpers)\n${context}`);
  if (feedback) parts.push(feedback);
  parts.push('Return JSON `{manifest, files:{"index.ts","index.test.ts"}}` only.');
  return parts.join('\n\n');
}

/** Acceptance on the real input: analyzer → usable:true; parser → durationSec > 0 and at least one series. */
async function acceptReal(kind: ToolKind, name: string, input: ToolInput, runReal: NonNullable<GrowDeps['runReal']>):
  Promise<{ pass: true; summary: string } | { pass: false; summary: string; problem: string }> {
  let out: ToolResult | Session;
  try {
    out = await runReal(name, input);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    return { pass: false, summary: `real input: threw: ${msg}`, problem: `threw: ${msg}` };
  }
  if (kind === 'parser') {
    const s = out as Partial<Session> | null;
    const series = Object.keys(s?.series ?? {});
    const dur = typeof s?.durationSec === 'number' ? s.durationSec : 0;
    if (dur > 0 && series.length) return { pass: true, summary: `real input: session ${dur}s, series ${series.join(',')}` };
    const what = `an empty session (durationSec ${dur}, series: ${series.join(',') || 'none'})`;
    return { pass: false, summary: `real input: ${what}`, problem: `returned ${what}` };
  }
  const r = out as Partial<ToolResult> | null;
  if (r?.usable === true) return { pass: true, summary: `real input: usable, ${Object.keys(r.metrics ?? {}).length} metrics` };
  const warn = (r?.warnings ?? []).join('; ') || '(none)';
  return { pass: false, summary: `real input: usable:false, warnings: ${warn}`, problem: `returned usable:false with warnings: ${warn}` };
}

function moveToFailed(root: string, name: string): void {
  const dir = join(root, 'tools', name);
  if (!existsSync(dir)) return;
  const dest = join(root, 'tools', '.failed');
  mkdirSync(dest, { recursive: true });
  renameSync(dir, join(dest, `${name}-${Date.now()}`));
}

export async function growTool(args: GrowArgs, deps: GrowDeps, stepIndexArg?: number): Promise<GrowResult> {
  const stepIndex = deps.stepIndex ?? stepIndexArg;
  const now = deps.now ?? (() => new Date().toISOString());
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;
  const { need } = args;
  const name = toolName(need);
  const root = deps.root;
  const withStep = <E extends AgentEvent>(e: E): E => (stepIndex === undefined ? e : { ...e, stepIndex });
  const emit = (e: AgentEvent) => deps.emit(withStep(e));

  // 1. idempotent: an installed, passing tool with this name is the answer
  const existing = list(root).find((t) => t.name === name && t.testStatus === 'pass');
  if (existing) return { ok: true, manifest: existing };

  // 2. prompt
  const promptContext = deps.promptContext ?? (await import('./reuse')).promptContext;
  const context = promptContext({ kind: need.kind, inputType: need.inputType });
  const system = loadPrompt(need.kind);

  // 3. attempts
  let feedback: string | null = null;
  let costUsd = 0;
  let lastModel: string | undefined;
  const dir = join(root, 'tools', name);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (deps.budget.exceeded) {
      emit({ type: 'error', text: `Session budget of $${deps.budget.limit.toFixed(2)} is used up; cannot grow ${name}.` });
      break;
    }
    emit({ type: 'growing', name, attempt, text: attempt === 1 ? `Writing ${name} (${need.kind} for ${need.activity})…` : `Attempt ${attempt}: fixing ${name} from the test output…` });
    const res = await deps.llm({ tier: 'strong', json: true, maxTokens: 8192, system, user: userPrompt(args, name, context, feedback) });   // no cacheKey: growth is never cached
    deps.budget.spend(res.usd); costUsd += res.usd; lastModel = res.model;
    emit({ type: 'cost', step: 'grow', model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, usd: res.usd, sessionUsd: deps.budget.spent, cached: res.cached });

    const parsed = parseAnswer(res.json);
    if (!parsed.ok) {
      feedback = `# Previous answer was rejected\n${parsed.error}. Return the full JSON with "manifest" and "files" {"index.ts","index.test.ts"} again.`;
      continue;
    }
    const { files } = parsed.value;
    const manifest: ToolManifest = {
      ...(parsed.value.manifest as Partial<ToolManifest>),
      name, kind: need.kind, activity: need.activity, inputType: need.inputType,
      outputType: need.kind === 'parser' ? 'session' : 'result',
      description: String(parsed.value.manifest.description ?? `${need.kind} for ${need.activity}`),
      permissions: ['compute'], createdBy: 'agent', createdAt: now(), model: res.model, costUsd, attempts: attempt,
      basedOn: basedOnFrom(files['index.ts']!), uses: 0, testStatus: 'fail',
    };

    // authority: violations → nothing is written; the errors go into the next prompt
    const check = checkAll({ manifest, files, name, registryNames: list(root).map((t) => t.name) });
    if (!check.pass) {
      emit({ type: 'authority_check', name, pass: false, text: `Authority violations: ${check.errors.join('; ')}` });
      feedback = `# Authority violations in the previous answer (the tool was NOT written)\n${check.errors.map((e) => `- ${e}`).join('\n')}\nRemove them and return the full files again.`;
      continue;
    }

    // write + test
    mkdirSync(dir, { recursive: true });
    for (const f of ALLOWED_FILES) writeFileSync(join(dir, f), files[f]!);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const t = await deps.run(name);
    emit({ type: 'test_result', name, attempt, pass: t.pass, summary: t.summary });
    if (!t.pass) {
      feedback = `# Test output of the previous attempt (bun test tools/${name})\n\`\`\`\n${t.summary}\n\`\`\`\nFix the tool so this test output passes. Return full files again.`;
      continue;
    }

    // acceptance: the candidate must work on the input it was grown for
    if (args.realInput !== undefined) {
      const runReal = deps.runReal ?? ((n: string, i: ToolInput) => runTool(n, i, { root }));
      const a = await acceptReal(need.kind, name, args.realInput, runReal);
      emit({ type: 'test_result', name, attempt, pass: a.pass, summary: a.summary });
      if (!a.pass) {
        const ev = evidenceBlock(args, name);
        feedback = [
          `# Acceptance on the real input failed\nYour tests passed, but on the member's actual input (statistics / first lines below) the tool ${a.problem}.\nThis input IS ${need.activity}: the member said so and the classifier agreed. Your gate is too strict or you measure the wrong signal. Loosen thresholds to what real camera data looks like (MediaPipe jitter, partial visibility, pauses between reps, 10–30 s clips), keep garbage / no-person input → usable:false, keep your tests passing. Return full files again.`,
          ...(ev ? [ev] : []),
        ].join('\n\n');
        continue;
      }
    }

    // install
    manifest.testStatus = 'pass';
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    emit({ type: 'authority_check', name, pass: true, text: 'compute-only; imports limited to the registry; files inside tools/' + name + '/' });
    const installed = install(manifest, root);
    emit({ type: 'tool_installed', manifest: installed });
    deps.appendLog?.({ ts: now(), sessionId: deps.sessionId ?? 'grow', step: 'grow', model: lastModel, usd: costUsd, data: { name, attempts: attempt, basedOn: installed.basedOn } });
    return { ok: true, manifest: installed };
  }

  // 4. gave up
  moveToFailed(root, name);
  rmSync(dir, { recursive: true, force: true });
  deps.appendLog?.({ ts: now(), sessionId: deps.sessionId ?? 'grow', step: 'grow_failed', model: lastModel, usd: costUsd, data: { name, attempts: maxAttempts } });
  return { ok: false };
}
