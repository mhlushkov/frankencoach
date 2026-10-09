import { describe, expect, test } from 'bun:test';
import { createApp, type AppDeps } from './index';
import type { LogEntry } from './agent/log';
import type { Voice } from './voice';

const deps: AppDeps = {
  toolsCount: () => 2,
  listTools: () => [],
  forget: () => true,
  clearCache: () => 0,
  demoMode: true,
  budgetLeftUsd: () => 0.75,
  analyze: async function* () { yield { type: 'answer' as const, text: 'hi' }; },
};

describe('server', () => {
  test('/health ok', async () => {
    const app = createApp(deps);
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; toolsCount: number; budgetLeftUsd: number; startedAt: string; demoMode: boolean };
    expect(body.ok).toBe(true);
    expect(body.toolsCount).toBe(2);
    expect(body.budgetLeftUsd).toBe(0.75);
    expect(body.demoMode).toBe(true);
    expect(typeof body.startedAt).toBe('string');
  });

  test('/tools returns a bare ToolManifest[] per contracts/events.md', async () => {
    const app = createApp(deps);
    const res = await app.fetch(new Request('http://localhost/tools'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  test('/analyze streams SSE events', async () => {
    const app = createApp(deps);
    const res = await app.fetch(new Request('http://localhost/analyze', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's', message: 'hi', input: { kind: 'none' } }),
    }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: {"type":"answer","text":"hi"}');
  });

  test('/tools lists', async () => {
    const res = await createApp(deps).fetch(new Request('http://localhost/tools'));
    expect(await res.json()).toEqual([]);
  });

  const speakReq = (body: unknown) => new Request('http://localhost/speak', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const fakeVoice = (cached = false): Voice => ({
    speak: async (text) => ({ audio: new Uint8Array([9, 8, 7]), cached, chars: text.length }),
  });

  test('/speak: 501 when the voice is off', async () => {
    const res = await createApp(deps).fetch(speakReq({ text: 'Hello.' }));
    expect(res.status).toBe(501);
    expect(((await res.json()) as { error: string }).error).toContain('ELEVENLABS_API_KEY');
  });

  test('/speak: 400 without text', async () => {
    const app = createApp({ ...deps, voice: fakeVoice(), log: () => {} });
    expect((await app.fetch(speakReq({}))).status).toBe(400);
    const res = await app.fetch(speakReq({ text: '  ' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'text required' });
    expect((await app.fetch(speakReq({ text: 42 }))).status).toBe(400);
  });

  test('/speak: 200 audio/mpeg with the bytes, cache header and a log line', async () => {
    const logs: LogEntry[] = [];
    const app = createApp({ ...deps, voice: fakeVoice(true), log: (e) => logs.push(e) });
    const res = await app.fetch(speakReq({ text: 'Keep your back straight.' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('x-voice-cached')).toBe('1');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-expose-headers')).toBe('x-voice-cached');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([9, 8, 7]);
    expect(logs.length).toBe(1);
    expect(logs[0].step).toBe('speak');
    expect(logs[0].data).toEqual({ chars: 24, cached: true, head: 'Keep your back straight.' });
  });

  test('/speak: 502 when the voice fails', async () => {
    const voice: Voice = { speak: async () => { throw new Error('elevenlabs HTTP 401: nope'); } };
    const res = await createApp({ ...deps, voice, log: () => {} }).fetch(speakReq({ text: 'Hello.' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'elevenlabs HTTP 401: nope' });
  });

  test('/health reports the voice', async () => {
    const off = await (await createApp(deps).fetch(new Request('http://localhost/health'))).json() as { voice: boolean };
    expect(off.voice).toBe(false);
    const on = await (await createApp({ ...deps, voice: fakeVoice() }).fetch(new Request('http://localhost/health'))).json() as { voice: boolean };
    expect(on.voice).toBe(true);
  });
});
