import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, AnalyzeRequest, ToolManifest } from '../contracts/types';
import { buildRequest, discoverFiles, formatLine, formatOutcome, formatSummary, growOvernight, MAX_BYTES, summarize } from './grow-overnight';

const LM = { version: 1, source: 'synthetic', videoHash: 'h', width: 1920, height: 1080, durationSec: 1, fps: 10, frames: [{ t: 0, landmarks: null }] };
const CSV = 'timestamp,depth_m\n0,0\n1,2\n';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fc-overnight-'));
  mkdirSync(join(root, 'data', 'landmarks'), { recursive: true });
  mkdirSync(join(root, 'data', 'samples'), { recursive: true });
  writeFileSync(join(root, 'data', 'landmarks', '.gitkeep'), '');
  writeFileSync(join(root, 'data', 'landmarks', 'squat.json'), JSON.stringify(LM));
  writeFileSync(join(root, 'data', 'landmarks', 'notes.txt'), 'not landmarks');
  writeFileSync(join(root, 'data', 'landmarks', 'huge.json'), Buffer.alloc(MAX_BYTES + 1, 32));
  writeFileSync(join(root, 'data', 'samples', '.gitkeep'), '');
  writeFileSync(join(root, 'data', 'samples', 'dive.csv'), CSV);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const sse = (events: AgentEvent[]) => new Response(
  new ReadableStream({ start(c) { const enc = new TextEncoder(); c.enqueue(enc.encode(': ping\n\n')); for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); c.close(); } }),
  { headers: { 'content-type': 'text/event-stream' } });

const cost = (step: 'grow' | 'total' | 'classify', usd: number): AgentEvent => ({ type: 'cost', step, inputTokens: 0, outputTokens: 0, usd, sessionUsd: usd });
const manifest = (name: string, attempts: number) => ({ name, attempts } as ToolManifest);

describe('discoverFiles', () => {
  test('landmarks *.json + every sample, skipping dotfiles and > 5 MB', () => {
    expect(discoverFiles(root).map(f => [f.name, f.kind])).toEqual([['squat.json', 'landmarks'], ['dive.csv', 'table']]);
  });
});

describe('buildRequest', () => {
  test('landmarks file → kind landmarks, hint, confirmGrow', () => {
    const r = buildRequest({ path: '', name: 'squat.json', kind: 'landmarks' }, JSON.stringify(LM), { hint: 'squat', now: 42 });
    expect(r).toEqual({ sessionId: 'overnight-squat.json-42', message: 'Analyze my technique', sportHint: 'squat', input: { kind: 'landmarks', landmarks: LM as any }, confirmGrow: true });
  });
  test('csv file → kind file with mime and text, no sportHint without a hint', () => {
    const r = buildRequest({ path: '', name: 'dive.csv', kind: 'table' }, CSV, { now: 7 });
    expect(r).toEqual({ sessionId: 'overnight-dive.csv-7', message: 'Analyze my technique', input: { kind: 'file', filename: 'dive.csv', mime: 'text/csv', text: CSV }, confirmGrow: true });
    expect('sportHint' in r).toBe(false);
  });
});

describe('summarize + formatLine', () => {
  const id: AgentEvent = { type: 'identified', activity: 'squat', confidence: 0.9, text: '' };
  test('reused exact', () => {
    const r = summarize('a.json', [id, { type: 'reused', tool: 'squat-technique', how: 'exact', savedUsd: 0.1, text: '' }, cost('total', 0.002)]);
    expect(formatLine(r)).toBe('a.json  squat  reused exact  $0.0020');
  });
  test('reused sibling (synonym)', () => {
    expect(formatOutcome(summarize('a', [{ type: 'reused', tool: 't', how: 'synonym', savedUsd: 0, text: '' }]).outcome)).toBe('reused sibling');
  });
  test('grown: attempts and grow $ summed over the chain', () => {
    const r = summarize('dive.csv', [{ ...id, activity: 'freediving' },
      { type: 'tool_installed', manifest: manifest('garmin-dive-csv', 1) }, cost('grow', 0.05),
      { type: 'tool_installed', manifest: manifest('freediving-profile', 2) }, cost('grow', 0.07), cost('total', 0.13)]);
    expect(formatLine(r)).toBe('dive.csv  freediving  grown attempts=3 $0.1200  $0.1300');
    expect(r.grown).toEqual(['garmin-dive-csv', 'freediving-profile']);
  });
  test('rejected / refused / error', () => {
    expect(formatLine(summarize('g.json', [{ type: 'rejected', reason: 'no_human', text: '', tips: [] }]))).toBe('g.json  -  rejected no_human  $0.0000');
    expect(formatOutcome(summarize('x', [{ type: 'refused', text: 'no' }]).outcome)).toBe('refused');
    expect(formatOutcome(summarize('x', [id, { type: 'error', text: 'Session budget of $1.00 is used up.' }]).outcome)).toBe('error Session budget of $1.00 is used up.');
  });
  test('summary table totals $', () => {
    const s = formatSummary([summarize('a', [cost('total', 0.1)]), summarize('b', [cost('classify', 0.05)])]);
    expect(s).toContain('files: 2  grown: 0  total: $0.1500');
  });
});

describe('growOvernight with a fake fetch', () => {
  test('one request per file, in order, continues after an error', async () => {
    const seen: AnalyzeRequest[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      expect(url).toBe('http://fc.test/analyze');
      const req = JSON.parse(String(init.body)) as AnalyzeRequest;
      seen.push(req);
      if (req.input.kind === 'landmarks') return new Response('boom', { status: 500 });
      return sse([{ type: 'identified', activity: 'freediving', confidence: 1, text: '' }, { type: 'reused', tool: 't', how: 'exact', savedUsd: 0, text: '' }, cost('total', 0.01)]);
    }) as unknown as typeof fetch;
    const lines: string[] = [];
    const reports = await growOvernight({ root, baseUrl: 'http://fc.test/', hints: { 'dive.csv': 'freediving' }, fetchFn, log: s => lines.push(s) });
    expect(seen.map(r => r.input.kind)).toEqual(['landmarks', 'file']);
    expect(seen[1]!.sportHint).toBe('freediving');
    expect(seen.every(r => r.confirmGrow === true)).toBe(true);
    expect(lines).toEqual(['squat.json  -  error HTTP 500 boom  $0.0000', 'dive.csv  freediving  reused exact  $0.0100']);
    expect(reports).toHaveLength(2);
  });
});
