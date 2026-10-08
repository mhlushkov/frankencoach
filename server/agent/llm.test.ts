import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callLlm, LlmError, type LlmDeps } from './llm';
import { makeCache } from './cache';
import { usdFor, Budget, estimateGrowUsd, estimateSavedUsd } from './cost';
import pricing from '../../contracts/pricing.json';
import { appendLog, readLog } from './log';

function fakeClient(responses: any[]) {
  const calls: any[] = [];
  return {
    calls,
    messages: {
      create: async (body: any, opts: any) => {
        calls.push({ body, opts });
        const r = responses.shift();
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
}
const ok = (text: string) => ({
  content: [{ type: 'text', text }],
  usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 100 },
});
function apiErr(status: number) { return Object.assign(new Error(`http ${status}`), { status }); }
function deps(client: any, extra: Partial<LlmDeps> = {}): LlmDeps {
  return {
    client,
    modelFor: (t) => (t === 'strong' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'),
    pricing,
    cache: makeCache(mkdtempSync(join(tmpdir(), 'fc-cache-'))),
    sleep: async () => {},
    ...extra,
  };
}

test('maps fields and usd matches pricing', async () => {
  const c = fakeClient([ok('hello'), ]);
  const r = await callLlm({ tier: 'strong', system: 'sys', user: 'hi' }, deps(c));
  expect(r.text).toBe('hello');
  expect(r.model).toBe('claude-sonnet-5-5');
  expect(r.inputTokens).toBe(1000);
  expect(r.outputTokens).toBe(200);
  expect(r.cacheReadTokens).toBe(500);
  expect(r.cached).toBe(false);
  const p = pricing.models['claude-sonnet-5-5'];
  expect(r.usd).toBeCloseTo((1000 * p.inputPerM + 200 * p.outputPerM + 500 * p.cacheReadPerM + 100 * p.cacheWritePerM) / 1e6, 10);
  const { body, opts } = c.calls[0];
  expect(body.model).toBe('claude-sonnet-5-5');
  expect(body.max_tokens).toBe(4096);
  expect(body.system[0]).toEqual({ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } });
  expect(opts.timeout).toBe(120_000);
});

test('images become image blocks in order before text', async () => {
  const c = fakeClient([ok('x')]);
  await callLlm({ tier: 'cheap', system: 's', user: 'u', images: ['AAA', 'BBB'] }, deps(c));
  const content = c.calls[0].body.messages[0].content;
  expect(content.map((b: any) => b.type)).toEqual(['image', 'image', 'text']);
  expect(content[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'AAA' });
  expect(content[1].source.data).toBe('BBB');
  expect(content[2].text).toBe('u');
});

test('json: fenced response parsed, system gets json instruction', async () => {
  const c = fakeClient([ok('```json\n{"a":1}\n```')]);
  const r = await callLlm({ tier: 'cheap', system: 's', user: 'u', json: true }, deps(c));
  expect(r.json).toEqual({ a: 1 });
  expect(c.calls[0].body.system[0].text).toContain('Reply with a single JSON object only');
});

test('json: invalid JSON throws', async () => {
  const c = fakeClient([ok('not json')]);
  await expect(callLlm({ tier: 'cheap', system: 's', user: 'u', json: true }, deps(c))).rejects.toThrow();
});

test('429 once then success → one retry', async () => {
  const c = fakeClient([apiErr(429), ok('fine')]);
  const r = await callLlm({ tier: 'cheap', system: 's', user: 'u' }, deps(c));
  expect(r.text).toBe('fine');
  expect(c.calls.length).toBe(2);
});

test('500 → LlmError', async () => {
  const c = fakeClient([apiErr(500)]);
  const p = callLlm({ tier: 'cheap', system: 's', user: 'u' }, deps(c));
  await expect(p).rejects.toBeInstanceOf(LlmError);
  expect(c.calls.length).toBe(1);
});

test('cache hit → client not called, usd 0', async () => {
  const c = fakeClient([ok('first')]);
  const d = deps(c);
  const req = { tier: 'cheap' as const, system: 's', user: 'u', cacheKey: 'k1' };
  const a = await callLlm(req, d);
  const b = await callLlm(req, d);
  expect(c.calls.length).toBe(1);
  expect(b.text).toBe('first');
  expect(b.usd).toBe(0);
  expect(b.cached).toBe(true);
  expect(a.cached).toBe(false);
});

test('usdFor unknown model throws', () => {
  expect(() => usdFor('nope', { input_tokens: 1, output_tokens: 1 }, pricing)).toThrow(/pricing.json/);
});

test('Budget flips exceeded at the limit', () => {
  const b = new Budget(1);
  b.spend(0.6);
  expect(b.exceeded).toBe(false);
  expect(b.left).toBeCloseTo(0.4);
  b.spend(0.4);
  expect(b.exceeded).toBe(true);
});

test('estimateGrowUsd = (8000 in + 3000 out) × strong × 3', () => {
  const p = pricing.models['claude-sonnet-5-5'];
  const exp = ((8000 * p.inputPerM + 3000 * p.outputPerM) / 1e6) * 3;
  expect(estimateGrowUsd('parser', pricing, 'claude-sonnet-5-5')).toBeCloseTo(exp, 10);
  expect(estimateSavedUsd('analyzer', pricing, 'claude-sonnet-5-5')).toBeCloseTo(exp, 10);
});

test('cache clearByPrefix removes matching keys', () => {
  const cache = makeCache(mkdtempSync(join(tmpdir(), 'fc-cache-')));
  cache.set('abc1', { v: 1 });
  cache.set('xyz', { v: 2 });
  cache.clearByPrefix('abc');
  expect(cache.get("abc1") as unknown).toBeUndefined();
  expect(cache.get('xyz') as unknown).toEqual({ v: 2 });
});

test('appendLog writes jsonl, readLog returns latest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-log-'));
  appendLog({ ts: '2026-10-08T21:00:00Z', sessionId: 's', step: 'a' }, dir);
  appendLog({ ts: '2026-10-08T21:00:01Z', sessionId: 's', step: 'b', usd: 0.01 }, dir);
  const rows = readLog(1, dir);
  expect(rows.length).toBe(1);
  expect(rows[0].step).toBe('b');
});
