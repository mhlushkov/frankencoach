import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, Landmarks, Session, ToolManifest, ToolResult } from '../../contracts/types';
import { Budget } from './cost';
import type { LlmRequest, LlmResponse } from './llm';
import { find, install, list } from './registry';
import { runToolTests, type ToolInput } from './runner';
import { growTool, toolName, type GrowDeps } from './grow';

const FIX = join(import.meta.dir, '__fixtures__');
const REPO = join(import.meta.dir, '..', '..');
const fixture = (f: string) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const goodAnalyzer = fixture('llm-good-analyzer.json');
const badThenGood = fixture('llm-bad-then-good.json') as [unknown, unknown];
const goodParser = fixture('llm-good-parser.json');

let root: string;
function m(over: Partial<ToolManifest>): ToolManifest {
  return {
    name: 'x', kind: 'analyzer', activity: '*', inputType: 'landmarks', outputType: 'result', description: 'd',
    permissions: ['compute'], createdBy: 'human', createdAt: '2026-10-08T21:00:00.000Z', uses: 0, testStatus: 'pass', ...over,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fc-grow-'));
  mkdirSync(join(root, 'contracts'), { recursive: true });
  copyFileSync(join(REPO, 'contracts', 'types.ts'), join(root, 'contracts', 'types.ts'));
  install(m({ name: 'pose-metrics' }), root);
  install(m({ name: 'series-core', inputType: 'session' }), root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Fake strong model: replays canned JSON answers in order, records every request. */
function fakeLlm(answers: unknown[]) {
  const calls: LlmRequest[] = [];
  const llm = async (req: LlmRequest): Promise<LlmResponse> => {
    calls.push(req);
    const json = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { text: JSON.stringify(json), json, model: 'fake-strong', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, usd: 0.05, ms: 1, cached: false };
  };
  return { llm, calls };
}
/** Fake test runner: replays pass/fail results in order. */
function fakeRun(results: { pass: boolean; summary: string }[]) {
  const names: string[] = [];
  const run = async (name: string) => { names.push(name); return results[Math.min(names.length - 1, results.length - 1)]!; };
  return { run, names };
}
function deps(over: Partial<GrowDeps> & Pick<GrowDeps, 'llm' | 'run'>): GrowDeps & { events: AgentEvent[] } {
  const events: AgentEvent[] = [];
  return {
    root, budget: new Budget(1), emit: (e) => events.push(e), promptContext: () => '## FAKE CONTEXT',
    now: () => '2026-10-08T23:00:00.000Z', ...over, events,
  };
}
const analyzerArgs = { need: { kind: 'analyzer' as const, inputType: 'landmarks' as const, activity: 'freediving' }, evidence: { sampleStats: { fps: 10, frames: 60 } }, userMessage: 'how is my finning?' };
const parserArgs = { need: { kind: 'parser' as const, inputType: 'raw:garmin-dive-csv' as const, activity: 'freediving', formatId: 'garmin-dive-csv' }, evidence: { head30: 'timestamp,depth_m,heart_rate_bpm,temp_c\n0,0,70,24', filename: 'dive.csv' }, userMessage: 'analyze my dive' };
const types = (events: AgentEvent[]) => events.map((e) => e.type);

describe('toolName', () => {
  test('analyzer landmarks → <activity>-technique, session → <activity>-profile, parser → <formatId>', () => {
    expect(toolName(analyzerArgs.need)).toBe('freediving-technique');
    expect(toolName({ kind: 'analyzer', inputType: 'session', activity: 'freediving' })).toBe('freediving-profile');
    expect(toolName(parserArgs.need)).toBe('garmin-dive-csv');
    expect(toolName({ kind: 'parser', inputType: 'raw:strava-gpx', activity: 'cycling' })).toBe('strava-gpx');
  });
});

describe('growTool', () => {
  test('good analyzer → ok, files on disk, registry updated, events emitted, no cacheKey', async () => {
    const { llm, calls } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '3 pass' }]);
    const d = deps({ llm, run, stepIndex: 0 });
    const r = await growTool(analyzerArgs, d);

    expect(r.ok).toBe(true);
    const dir = join(root, 'tools', 'freediving-technique');
    expect(existsSync(join(dir, 'index.ts'))).toBe(true);
    expect(existsSync(join(dir, 'index.test.ts'))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as ToolManifest;
    expect(onDisk).toMatchObject({ name: 'freediving-technique', createdBy: 'agent', createdAt: '2026-10-08T23:00:00.000Z', model: 'fake-strong', attempts: 1, testStatus: 'pass', uses: 0, permissions: ['compute'] });
    expect(onDisk.costUsd).toBeCloseTo(0.05);
    expect(r.manifest).toEqual(onDisk);
    expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: 'freediving' }, root)?.name).toBe('freediving-technique');

    expect(types(d.events)).toEqual(['growing', 'cost', 'test_result', 'authority_check', 'tool_installed']);
    expect(d.events[0]).toMatchObject({ type: 'growing', name: 'freediving-technique', attempt: 1, stepIndex: 0 });
    expect(d.events[1]).toMatchObject({ type: 'cost', step: 'grow', model: 'fake-strong', usd: 0.05, sessionUsd: 0.05 });
    expect(d.events[2]).toMatchObject({ type: 'test_result', name: 'freediving-technique', attempt: 1, pass: true, stepIndex: 0 });
    expect(d.events[3]).toMatchObject({ type: 'authority_check', pass: true });
    expect(d.events[4]).toMatchObject({ type: 'tool_installed', manifest: onDisk, stepIndex: 0 });
    expect(d.budget.spent).toBeCloseTo(0.05);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tier: 'strong', json: true });
    expect(calls[0]!.cacheKey).toBeUndefined();
    expect(calls[0]!.system).toContain('usable');
    expect(calls[0]!.user).toContain('## FAKE CONTEXT');
    expect(calls[0]!.user).toContain('"fps": 10');
    expect(calls[0]!.user).toContain('how is my finning?');
  });

  test('good analyzer passes the REAL subprocess runner and the real (lazy-imported) promptContext', async () => {
    const { llm, calls } = fakeLlm([goodAnalyzer]);
    const d = deps({ llm, run: (name) => runToolTests(name, { root, timeoutMs: 30000 }), promptContext: undefined });
    const r = await growTool(analyzerArgs, d);
    expect(r.ok).toBe(true);
    expect(calls[0]!.user).toContain('## contracts/types.ts');
    expect(calls[0]!.user).toContain('export interface Landmarks');
    const tr = d.events.find((e) => e.type === 'test_result') as Extract<AgentEvent, { type: 'test_result' }>;
    expect(tr.pass).toBe(true);
    expect(tr.summary).toMatch(/pass/);
  }, 40000);

  test('bad-then-good → 2 attempts; runner summary fed into the second prompt; basedOn from imports', async () => {
    const { llm, calls } = fakeLlm(badThenGood);
    const { run } = fakeRun([{ pass: false, summary: 'error: expected false, received true\n1 fail' }, { pass: true, summary: '1 pass' }]);
    const d = deps({ llm, run });
    const r = await growTool(analyzerArgs, d);

    expect(r.ok).toBe(true);
    expect(r.manifest?.attempts).toBe(2);
    expect(r.manifest?.basedOn).toEqual(['pose-metrics']);
    expect(r.manifest?.costUsd).toBeCloseTo(0.1);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.user).toContain('expected false, received true');
    expect(calls[1]!.user).toMatch(/Fix the tool/);
    expect(types(d.events)).toEqual(['growing', 'cost', 'test_result', 'growing', 'cost', 'test_result', 'authority_check', 'tool_installed']);
    expect(d.events[2]).toMatchObject({ type: 'test_result', attempt: 1, pass: false });
    expect(d.events[5]).toMatchObject({ type: 'test_result', attempt: 2, pass: true });
    expect(readFileSync(join(root, 'tools', 'freediving-technique', 'index.ts'), 'utf8')).toContain('personFrameRatio > 0.6');
  });

  test('fetch( in source → authority fail, nothing written, violation fed back, ok:false after 3', async () => {
    const evil = { ...goodAnalyzer, files: { ...goodAnalyzer.files, 'index.ts': "export default function analyze(i: any) { fetch('http://x'); return { metrics: {}, usable: true }; }\n" } };
    const { llm, calls } = fakeLlm([evil]);
    const { run, names } = fakeRun([{ pass: true, summary: 'never' }]);
    const d = deps({ llm, run });
    const r = await growTool(analyzerArgs, d);

    expect(r.ok).toBe(false);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(false);
    expect(names).toHaveLength(0);
    expect(calls).toHaveLength(3);
    expect(calls[1]!.user).toContain("forbidden token 'fetch('");
    const auth = d.events.filter((e) => e.type === 'authority_check') as Extract<AgentEvent, { type: 'authority_check' }>[];
    expect(auth).toHaveLength(3);
    expect(auth.every((a) => !a.pass)).toBe(true);
    expect(auth[0]!.text).toContain('fetch(');
    expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: 'freediving' }, root)).toBeUndefined();
  });

  test('budget 0 → no llm call, ok:false', async () => {
    const { llm, calls } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '' }]);
    const d = deps({ llm, run, budget: new Budget(0) });
    const r = await growTool(analyzerArgs, d);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(false);
  });

  test('budget runs out between attempts → stop, folder moved to .failed', async () => {
    const { llm, calls } = fakeLlm(badThenGood);
    const { run } = fakeRun([{ pass: false, summary: 'boom' }]);
    const d = deps({ llm, run, budget: new Budget(0.05) });
    const r = await growTool(analyzerArgs, d);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(false);
    expect(readdirSync(join(root, 'tools', '.failed')).some((f) => f.startsWith('freediving-technique-'))).toBe(true);
  });

  test('3 test failures → folder moved to tools/.failed, registry untouched, ok:false', async () => {
    const { llm, calls } = fakeLlm([badThenGood[0]]);
    const { run } = fakeRun([{ pass: false, summary: '1 fail' }]);
    const d = deps({ llm, run });
    const r = await growTool(analyzerArgs, d);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(3);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(false);
    expect(readdirSync(join(root, 'tools', '.failed')).some((f) => f.startsWith('freediving-technique-'))).toBe(true);
    expect(list(root).map((t) => t.name).sort()).toEqual(['pose-metrics', 'series-core']);
    expect(d.events.filter((e) => e.type === 'test_result')).toHaveLength(3);
    expect(d.events.some((e) => e.type === 'tool_installed')).toBe(false);
  });

  test('good parser → outputType:session, name = formatId, basedOn series-core, head30 + filename in prompt', async () => {
    const { llm, calls } = fakeLlm([goodParser]);
    const { run } = fakeRun([{ pass: true, summary: '3 pass' }]);
    const d = deps({ llm, run });
    const r = await growTool(parserArgs, d);
    expect(r.ok).toBe(true);
    expect(r.manifest).toMatchObject({ name: 'garmin-dive-csv', kind: 'parser', inputType: 'raw:garmin-dive-csv', outputType: 'session', activity: 'freediving', basedOn: ['series-core'] });
    expect(find({ kind: 'parser', inputType: 'raw:garmin-dive-csv', activity: 'freediving' }, root)?.name).toBe('garmin-dive-csv');
    expect(calls[0]!.system).toContain('parseCsvLoose');
    expect(calls[0]!.user).toContain('timestamp,depth_m,heart_rate_bpm,temp_c');
    expect(calls[0]!.user).toContain('dive.csv');
  });

  test('idempotent: existing passing tool is returned without calling the model', async () => {
    const existing = m({ name: 'freediving-technique', activity: 'freediving', createdBy: 'agent', costUsd: 0.2 });
    install(existing, root);
    const { llm, calls } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '' }]);
    const d = deps({ llm, run });
    const r = await growTool(analyzerArgs, d);
    expect(r).toEqual({ ok: true, manifest: existing });
    expect(calls).toHaveLength(0);
    expect(d.events).toHaveLength(0);
  });

  test('model answer without files/manifest → counted as a failed attempt, nothing written', async () => {
    const { llm, calls } = fakeLlm([{ oops: true }]);
    const { run, names } = fakeRun([{ pass: true, summary: '' }]);
    const d = deps({ llm, run });
    const r = await growTool(analyzerArgs, d);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(3);
    expect(names).toHaveLength(0);
    expect(calls[1]!.user).toMatch(/index\.ts/);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(false);
  });

  test('appendLog is called once per installed tool with the real cost', async () => {
    const { llm } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '' }]);
    const logged: unknown[] = [];
    const d = deps({ llm, run, appendLog: (e) => logged.push(e), sessionId: 's1' });
    await growTool(analyzerArgs, d);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ sessionId: 's1', step: 'grow', usd: 0.05, model: 'fake-strong', data: { name: 'freediving-technique', attempts: 1 } });
  });
});

describe('growTool acceptance on the real input', () => {
  const landmarks: Landmarks = { version: 1, source: 'synthetic', videoHash: 'h', width: 1, height: 1, durationSec: 1, fps: 1, frames: [] };
  /** Fake acceptance runner: replays results (or throws Error values) in order, records every call. */
  function fakeReal(results: (ToolResult | Session | Error)[]) {
    const calls: { name: string; input: ToolInput }[] = [];
    const runReal = async (name: string, input: ToolInput) => {
      calls.push({ name, input });
      const r = results[Math.min(calls.length - 1, results.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    };
    return { runReal, calls };
  }
  const realArgs = { ...analyzerArgs, realInput: landmarks };
  const testResults = (events: AgentEvent[]) => events.filter((e) => e.type === 'test_result') as Extract<AgentEvent, { type: 'test_result' }>[];

  test('(a) usable:false on attempt 1 → feedback with the warning, attempt 2 accepted → installed with attempts:2', async () => {
    const { llm, calls } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '3 pass' }]);
    const { runReal, calls: real } = fakeReal([
      { metrics: {}, usable: false, warnings: ['jump rope pattern not found (no regular vertical jumping)'] },
      { metrics: { jumps: 40, cadenceHz: 2.1 }, usable: true },
    ]);
    const d = deps({ llm, run, runReal });
    const r = await growTool(realArgs, d);

    expect(r.ok).toBe(true);
    expect(r.manifest?.attempts).toBe(2);
    expect(r.manifest?.costUsd).toBeCloseTo(0.1);
    expect(real).toHaveLength(2);
    expect(real[0]).toEqual({ name: 'freediving-technique', input: landmarks });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.user).toContain('Acceptance on the real input failed');
    expect(calls[1]!.user).toContain('jump rope pattern not found (no regular vertical jumping)');
    expect(calls[1]!.user).toContain('This input IS freediving');
    expect(calls[1]!.user).toContain('"fps": 10');
    const tr = testResults(d.events);
    expect(tr.map((t) => [t.attempt, t.pass])).toEqual([[1, true], [1, false], [2, true], [2, true]]);
    expect(tr[1]!.summary).toStartWith('real input:');
    expect(tr[1]!.summary).toContain('jump rope pattern not found');
    expect(tr[3]!.summary).toBe('real input: usable, 2 metrics');
    expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: 'freediving' }, root)?.name).toBe('freediving-technique');
  });

  test('(b) accepted first time → installed, one passing "real input" test_result', async () => {
    const { llm } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '3 pass' }]);
    const { runReal } = fakeReal([{ metrics: { a: 1, b: 2, c: 3 }, usable: true }]);
    const d = deps({ llm, run, runReal });
    const r = await growTool(realArgs, d);

    expect(r.ok).toBe(true);
    expect(r.manifest?.attempts).toBe(1);
    expect(types(d.events)).toEqual(['growing', 'cost', 'test_result', 'test_result', 'authority_check', 'tool_installed']);
    const real = testResults(d.events).filter((t) => t.summary.startsWith('real input'));
    expect(real).toHaveLength(1);
    expect(real[0]).toMatchObject({ pass: true, attempt: 1, summary: 'real input: usable, 3 metrics' });
  });

  test('(c) runReal throws → failed attempt, error message in the feedback; budget spent → ok:false', async () => {
    const { llm, calls } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '3 pass' }]);
    const { runReal, calls: real } = fakeReal([new Error('timeout')]);
    const d = deps({ llm, run, runReal });
    const r = await growTool(realArgs, d);

    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(3);
    expect(real).toHaveLength(3);
    expect(calls[1]!.user).toContain('Acceptance on the real input failed');
    expect(calls[1]!.user).toContain('threw: timeout');
    const failed = testResults(d.events).filter((t) => !t.pass);
    expect(failed).toHaveLength(3);
    expect(failed[0]!.summary).toBe('real input: threw: timeout');
    expect(d.events.some((e) => e.type === 'tool_installed')).toBe(false);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(false);
    expect(list(root).map((t) => t.name).sort()).toEqual(['pose-metrics', 'series-core']);
  });

  test('(d) no realInput → runReal never called, events unchanged', async () => {
    const { llm } = fakeLlm([goodAnalyzer]);
    const { run } = fakeRun([{ pass: true, summary: '3 pass' }]);
    const { runReal, calls: real } = fakeReal([{ metrics: {}, usable: false }]);
    const d = deps({ llm, run, runReal });
    const r = await growTool(analyzerArgs, d);
    expect(r.ok).toBe(true);
    expect(real).toHaveLength(0);
    expect(types(d.events)).toEqual(['growing', 'cost', 'test_result', 'authority_check', 'tool_installed']);
  });

  test('parser: empty session rejected with head30 in the feedback; non-empty session accepted', async () => {
    const { llm, calls } = fakeLlm([goodParser]);
    const { run } = fakeRun([{ pass: true, summary: '3 pass' }]);
    const raw = { raw: 'timestamp,depth_m\n0,0', filename: 'dive.csv' };
    const { runReal, calls: real } = fakeReal([
      { version: 1, source: 'garmin-dive-csv', durationSec: 0, series: {}, meta: {} },
      { version: 1, source: 'garmin-dive-csv', durationSec: 90, series: { depth_m: { t: [0], v: [0] }, heart_rate_bpm: { t: [0], v: [70] } }, meta: {} },
    ]);
    const d = deps({ llm, run, runReal });
    const r = await growTool({ ...parserArgs, realInput: raw }, d);

    expect(r.ok).toBe(true);
    expect(r.manifest?.attempts).toBe(2);
    expect(real[0]!.input).toEqual(raw);
    expect(calls[1]!.user).toContain('Acceptance on the real input failed');
    expect(calls[1]!.user).toContain('timestamp,depth_m,heart_rate_bpm,temp_c');
    const tr = testResults(d.events).filter((t) => t.summary.startsWith('real input'));
    expect(tr.map((t) => t.pass)).toEqual([false, true]);
    expect(tr[1]!.summary).toBe('real input: session 90s, series depth_m,heart_rate_bpm');
  });
});
