import { describe, expect, test } from 'bun:test';
import { createApp, type AppDeps } from './index';

const deps: AppDeps = {
  toolsCount: () => 2,
  listTools: () => [],
  forget: () => true,
  clearCache: () => 0,
  demoMode: true,
  analyze: async function* () { yield { type: 'answer' as const, text: 'hi' }; },
};

describe('server', () => {
  test('/health ok', async () => {
    const app = createApp(deps);
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; toolsCount: number };
    expect(body.ok).toBe(true);
    expect(body.toolsCount).toBe(2);
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
    expect(await res.json()).toEqual({ tools: [] });
  });
});
