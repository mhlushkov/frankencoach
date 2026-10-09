import { describe, expect, test } from 'bun:test';
import type { AgentEvent, AnalyzeRequest, Landmarks, Session, ToolManifest, ToolResult } from '../contracts/types';
import type { Exam, ExamArgs } from './agent/examiner';
import { analyze, type LoopDeps } from './agent/loop';
import { plan } from './agent/planner';
import noHuman from '../data/synthetic/fixtures/noHuman.landmarks.json';
import squat from '../data/synthetic/fixtures/squat.landmarks.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const diveCsv = readFileSync(join(import.meta.dir, '../data/synthetic/fixtures/dive-garmin-like.csv'), 'utf8');

const now = '2026-10-08T22:00:00.000Z';
const man = (p: Partial<ToolManifest> & Pick<ToolManifest, 'name' | 'kind' | 'inputType' | 'activity'>): ToolManifest => ({
  outputType: p.kind === 'parser' ? 'session' : 'result', description: p.name, permissions: ['compute'],
  createdBy: 'human', createdAt: now, uses: 0, testStatus: 'pass', ...p,
});
const poseMetrics = man({ name: 'pose-metrics', kind: 'analyzer', inputType: 'landmarks', activity: '*' });
const seriesCore = man({ name: 'series-core', kind: 'analyzer', inputType: 'session', activity: '*' });
const squatTool = man({ name: 'squat-technique', kind: 'analyzer', inputType: 'landmarks', activity: 'squat', createdBy: 'agent', costUsd: 0.42 });
const diveParser = man({ name: 'garmin-dive-csv', kind: 'parser', inputType: 'raw:garmin-dive-csv', activity: 'freediving', createdBy: 'agent', costUsd: 0.3 });
const diveTool = man({ name: 'freediving-profile', kind: 'analyzer', inputType: 'session', activity: 'freediving', createdBy: 'agent', costUsd: 0.5 });

const okResult: ToolResult = { metrics: { reps: 2, kneeAngleMin: 90 }, usable: true };
const session: Session = { version: 1, source: 'garmin-dive-csv', durationSec: 90, series: { depth_m: { t: [0, 1], v: [0, 1] } }, meta: {} };
const llmResp = (text: string) => ({ text, model: 'claude-haiku-5-5', inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, usd: 0.001, ms: 1, cached: false });

function fakeDeps(tools: ToolManifest[], opts: { activity?: string; formatId?: string } = {}) {
  const calls = { llm: 0, classify: 0, sniff: 0, grow: 0, run: [] as string[] };
  const find: LoopDeps['registry']['find'] = (q) =>
    tools.find((t) => t.kind === q.kind && t.inputType === q.inputType && t.activity === q.activity && t.activity !== '*');
  const deps: LoopDeps = {
    registry: {
      find,
      findFallback: (q) => tools.find((t) => t.kind === q.kind && t.inputType === q.inputType && t.activity === '*'),
      bumpUses: () => {},
      list: () => tools,
      knownActivities: () => ['squat', 'freediving'],
    },
    validity: {
      checkLandmarks: (l: Landmarks) =>
        l.frames.every((f) => f.landmarks === null)
          ? { ok: false, reason: 'no_human', text: 'No person detected', tips: ['Film the whole body'] }
          : { ok: true, stats: { personFrameRatio: 1 } },
      checkTable: (text: string) =>
        text.split('\n').length > 10
          ? { ok: true, header: text.split('\n')[0].split(','), rows: 90, numericCols: 3, timeCol: 'timestamp' }
          : { ok: false, reason: 'bad_table', text: 'Not a table', tips: [] },
    },
    classify: async () => { calls.classify++; calls.llm++; return { value: { isHuman: true, numPeople: 1, activity: opts.activity ?? 'squat', isSport: true, environment: 'gym', intent: 'technique', mismatchWithHint: false, confidence: 0.95, reason: 'squat pattern' }, llm: llmResp('{}') }; },
    sniff: async () => { calls.sniff++; calls.llm++; return { value: { formatId: opts.formatId ?? 'garmin-dive-csv', activity: opts.activity ?? 'freediving', isSportData: true, timeColumn: 'timestamp', columns: [], confidence: 0.9 }, llm: llmResp('{}') }; },
    canonicalize: (a) => ({ canonical: a, how: 'exact' }),
    grow: async () => { calls.grow++; return { ok: false }; },
    runTool: async (name) => { calls.run.push(name); return name === diveParser.name ? session : okResult; },
    llm: async () => { calls.llm++; return llmResp('Nice squat. Keep the knees tracking over the toes.'); },
    checkIntent: (m) => (/am i ready/i.test(m) ? { allowed: false, reason: 'refused' } : { allowed: true }),
    estimateGrowUsd: () => 0.2,
    budgetLimitUsd: 1,
    maxToolsPerSession: 6,
    autoConfirm: false,
    appendLog: () => {},
    now: () => now,
  };
  return { deps, calls };
}

async function collect(req: AnalyzeRequest, deps: LoopDeps): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of analyze(req, deps)) out.push(e);
  return out;
}
const types = (ev: AgentEvent[]) => ev.map((e) => e.type);

describe('plan', () => {
  const tools = [poseMetrics, squatTool, seriesCore];
  const find = fakeDeps(tools).deps.registry.find;
  test('landmarks → one analyze step resolved exactly', () => {
    const chain = plan({ kind: 'landmarks', landmarks: squat as Landmarks }, { activity: 'squat' }, find);
    expect(chain).toEqual([{ step: 'analyze', inputType: 'landmarks', activity: 'squat', tool: 'squat-technique', missing: false }]);
  });
  test("'*' tools never satisfy a step", () => {
    const chain = plan({ kind: 'landmarks', landmarks: squat as Landmarks }, { activity: 'freediving' }, find);
    expect(chain[0].missing).toBe(true);
    expect(chain[0].tool).toBeUndefined();
  });
  test('file → parse + analyze', () => {
    const chain = plan({ kind: 'file', filename: 'd.csv', mime: 'text/csv', text: diveCsv }, { activity: 'freediving', formatId: 'garmin-dive-csv' }, find);
    expect(chain.map((c) => c.step)).toEqual(['parse', 'analyze']);
    expect(chain[0].inputType).toBe('raw:garmin-dive-csv');
    expect(chain[1].inputType).toBe('session');
    expect(chain.every((c) => c.missing)).toBe(true);
  });
  test('none → []', () => {
    expect(plan({ kind: 'none' }, { activity: 'squat' }, find)).toEqual([]);
  });
});

describe('analyze loop', () => {
  test('noHuman → rejected, llm never called', async () => {
    const { deps, calls } = fakeDeps([poseMetrics]);
    const ev = await collect({ sessionId: 's1', message: 'how is my squat', input: { kind: 'landmarks', landmarks: noHuman as Landmarks } }, deps);
    const rej = ev.find((e) => e.type === 'rejected');
    expect(rej && rej.type === 'rejected' && rej.reason).toBe('no_human');
    expect(calls.llm).toBe(0);
    expect(types(ev)).not.toContain('answer');
  });

  test('known sport → reused exact → tool_used → answer, no growing', async () => {
    const { deps, calls } = fakeDeps([poseMetrics, squatTool]);
    const ev = await collect({ sessionId: 's2', message: 'how is my squat', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    const t = types(ev);
    expect(t).toContain('identified');
    expect(t).toContain('plan');
    expect(t.indexOf('reused')).toBeLessThan(t.indexOf('tool_used'));
    expect(t.indexOf('tool_used')).toBeLessThan(t.indexOf('answer'));
    expect(t).not.toContain('growing');
    expect(t).not.toContain('missing_capability');
    const reused = ev.find((e) => e.type === 'reused');
    expect(reused && reused.type === 'reused' ? [reused.how, reused.tool, reused.savedUsd] : null).toEqual(['exact', 'squat-technique', 0.42]);
    const used = ev.find((e) => e.type === 'tool_used');
    expect(used && used.type === 'tool_used' ? used.stepIndex : -1).toBe(0);
    expect(calls.run).toEqual(['squat-technique']);
    const costs = ev.filter((e) => e.type === 'cost').map((e) => (e as any).step);
    expect(costs).toContain('classify');
    expect(costs).toContain('feedback');
    expect(costs[costs.length - 1]).toBe('total');
  });

  test('unknown sport without confirm → missing_capability then stop', async () => {
    const { deps, calls } = fakeDeps([poseMetrics], { activity: 'kitesurfing' });
    const ev = await collect({ sessionId: 's3', message: 'check this', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    const last = ev[ev.length - 1];
    expect(last.type).toBe('missing_capability');
    if (last.type === 'missing_capability') {
      expect(last.activity).toBe('kitesurfing');
      expect(last.inputType).toBe('landmarks');
      expect(last.estimateUsd).toBe(0.2);
      expect(last.stepIndex).toBe(0);
    }
    expect(calls.grow).toBe(0);
    expect(calls.run).toEqual([]);
  });

  test('"am I ready for 40 m" → refused first', async () => {
    const { deps, calls } = fakeDeps([poseMetrics, squatTool]);
    const ev = await collect({ sessionId: 's4', message: 'am I ready for 40 m?', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    expect(ev[0].type).toBe('refused');
    expect(calls.llm).toBe(0);
    expect(calls.run).toEqual([]);
  });

  test('file with known parser + analyzer → parsed → tool_used', async () => {
    const { deps, calls } = fakeDeps([seriesCore, diveParser, diveTool]);
    const ev = await collect({ sessionId: 's5', message: 'my dive', input: { kind: 'file', filename: 'dive.csv', mime: 'text/csv', text: diveCsv } }, deps);
    const t = types(ev);
    expect(t.indexOf('parsed')).toBeGreaterThan(-1);
    expect(t.indexOf('parsed')).toBeLessThan(t.indexOf('tool_used'));
    expect(t).toContain('answer');
    const parsed = ev.find((e) => e.type === 'parsed');
    expect(parsed && parsed.type === 'parsed' ? [parsed.tool, parsed.stepIndex, parsed.summary.series] : null).toEqual(['garmin-dive-csv', 0, ['depth_m']]);
    const used = ev.find((e) => e.type === 'tool_used');
    expect(used && used.type === 'tool_used' ? used.stepIndex : -1).toBe(1);
    expect(calls.run).toEqual(['garmin-dive-csv', 'freediving-profile']);
    expect(ev.filter((e) => e.type === 'reused')).toHaveLength(2);
  });

  test('failed growth after confirm → fallback tool used', async () => {
    const { deps, calls } = fakeDeps([poseMetrics], { activity: 'kitesurfing' });
    const ev = await collect({ sessionId: 's6', message: 'check this', confirmGrow: true, input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    expect(calls.grow).toBe(1);
    const reused = ev.find((e) => e.type === 'reused');
    expect(reused && reused.type === 'reused' ? [reused.how, reused.tool] : null).toEqual(['fallback', 'pose-metrics']);
    expect(types(ev)).toContain('answer');
  });

  test('growth receives the landmarks as realInput for an analyzer step', async () => {
    const { deps } = fakeDeps([poseMetrics], { activity: 'kitesurfing' });
    const seen: unknown[] = [];
    deps.grow = async (args) => { seen.push(args.realInput); return { ok: false }; };
    await collect({ sessionId: 's6b', message: 'check this', confirmGrow: true, input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    expect(seen).toEqual([squat]);
  });

  test('gate healed the landmarks → tools analyze the smoothed copy', async () => {
    const { deps } = fakeDeps([poseMetrics, squatTool]);
    const HEALED = { ...(squat as Landmarks), frames: (squat as Landmarks).frames.slice(0, 3) };
    deps.validity.checkLandmarks = () => ({ ok: true, stats: { smoothed: true }, landmarks: HEALED });
    const seen: unknown[] = [];
    deps.runTool = async (_name, input) => { seen.push(input); return okResult; };
    const ev = await collect({ sessionId: 's8', message: 'squat', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    expect(seen).toEqual([HEALED]);
    expect(seen[0]).not.toBe(squat);
    expect(ev.some((e) => e.type === 'thinking' && e.text.includes('Smoothed'))).toBe(true);
  });

  test('gate ok without landmarks → tools analyze the raw landmarks', async () => {
    const { deps } = fakeDeps([poseMetrics, squatTool]);
    const seen: unknown[] = [];
    deps.runTool = async (_name, input) => { seen.push(input); return okResult; };
    const ev = await collect({ sessionId: 's9', message: 'squat', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(squat as Landmarks);
    expect(ev.some((e) => e.type === 'thinking' && e.text.includes('Smoothed'))).toBe(false);
  });

  test('two people in the frames, one chosen track → identified with a note, not rejected', async () => {
    const { deps, calls } = fakeDeps([poseMetrics, squatTool]);
    deps.classify = async () => { calls.classify++; return { value: { isHuman: true, numPeople: 2, activity: 'squat', isSport: true, environment: 'gym', intent: 'technique', mismatchWithHint: false, confidence: 0.9, reason: 'two people squatting' }, llm: llmResp('{}') }; };
    const ev = await collect({ sessionId: 's8', message: 'Analyze this.', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    const t = types(ev);
    expect(t).not.toContain('rejected');
    expect(t).toContain('tool_used');
    expect(t).toContain('answer');
    const id = ev.find((e) => e.type === 'identified');
    expect(id && id.type === 'identified' ? id.text : '').toContain('I can see 2 people in the frames and follow the one you chose.');
    expect(calls.run).toEqual(['squat-technique']);
  });

  test('usable:false → rejected not_a_sport, no answer', async () => {
    const { deps } = fakeDeps([poseMetrics, squatTool]);
    deps.runTool = async () => ({ metrics: {}, usable: false, warnings: ['no squat pattern'] });
    const ev = await collect({ sessionId: 's7', message: 'squat', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    const rej = ev.find((e) => e.type === 'rejected');
    expect(rej && rej.type === 'rejected' ? rej.reason : null).toBe('not_a_sport');
    expect(types(ev)).not.toContain('answer');
  });
});

describe('the examiner (second agent, rubric)', () => {
  const exam = (scores: Partial<Exam['scores']>, flags: Partial<Pick<Exam, 'dataTooPoor' | 'highRisk'>> = {}): Exam => ({
    identified: 'squat', confidence: 'high', novelty: 'known', evidence: ['kneeAngleMin 90'], understood: ['depth'], missing: ['bar path'],
    scores: { identification: 5, movement: 4, technique: 4, advice: 4, safety: 5, ...scores }, dataTooPoor: false, highRisk: false, reason: 'tied to metrics', ...flags,
  });
  const run = async (grades: Exam[]) => {
    const { deps, calls } = fakeDeps([poseMetrics, squatTool]);
    const seen: ExamArgs[] = [];
    deps.examine = async (a) => { seen.push(a); return { value: grades[Math.min(seen.length - 1, grades.length - 1)], llm: llmResp('{}') }; };
    const ev = await collect({ sessionId: `ex-${Math.random()}`, message: 'how is my squat', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    return { ev, calls, seen };
  };
  const rubric = (ev: AgentEvent[]) => ev.filter((e) => e.type === 'test_result') as Extract<AgentEvent, { type: 'test_result' }>[];

  test('ready → one rubric row that passes, then the advice', async () => {
    const { ev, seen } = await run([exam({})]);
    const r = rubric(ev);
    expect(r).toHaveLength(1);
    expect(r[0].pass).toBe(true);
    expect(r[0].summary.startsWith('rubric: sport 5 · movement 4 · technique 4 · advice 4 · safety 5 → ready')).toBe(true);
    expect(types(ev).indexOf('test_result')).toBeLessThan(types(ev).indexOf('answer'));
    expect(seen[0].advice).toBe('Nice squat. Keep the knees tracking over the toes.');
    expect(seen[0].tool?.name).toBe('squat-technique');
  });

  test('continue → the coach rewrites once from the notes; ready on the second exam', async () => {
    const { ev, calls, seen } = await run([exam({ advice: 3 }), exam({})]);
    expect(rubric(ev).map((r) => r.pass)).toEqual([false, true]);
    expect(seen).toHaveLength(2);
    expect(calls.llm).toBe(1 + 2); // classify + two drafts
    expect(ev.find((e) => e.type === 'answer')).toBeDefined();
  });

  test('continue twice → no advice, only what is still missing', async () => {
    const { ev } = await run([exam({ technique: 2 }), exam({ technique: 2 })]);
    const a = ev.find((e) => e.type === 'answer');
    expect(a && a.type === 'answer' ? a.text : '').toContain('I am not ready to coach this yet');
    expect(a && a.type === 'answer' ? a.text : '').toContain('bar path');
    expect(a && a.type === 'answer' ? a.text : '').not.toContain('Keep the knees');
  });

  test('safety ≤2 or a high-risk activity → advice blocked, asks for more data', async () => {
    for (const g of [exam({ safety: 2 }), exam({}, { highRisk: true })]) {
      const { ev } = await run([g]);
      expect(types(ev)).not.toContain('answer');
      const rej = ev.find((e) => e.type === 'rejected');
      expect(rej && rej.type === 'rejected' ? rej.text : '').toContain('holding my advice back');
    }
  });

  test('the examiner fails → the advice goes out ungraded, said so', async () => {
    const { deps } = fakeDeps([poseMetrics, squatTool]);
    deps.examine = async () => { throw new Error('HTTP 529'); };
    const ev = await collect({ sessionId: 'ex-fail', message: 'how is my squat', input: { kind: 'landmarks', landmarks: squat as Landmarks } }, deps);
    expect(types(ev)).toContain('answer');
    expect(ev.some((e) => e.type === 'thinking' && e.text.includes('ungraded'))).toBe(true);
  });
});
