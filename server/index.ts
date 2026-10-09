import type { AgentEvent, AnalyzeRequest, ToolManifest } from '../contracts/types';
import authority from '../contracts/authority.json';
import { appendLog, type LogEntry } from './agent/log';
import type { Budget } from './agent/cost';
import { voiceFromEnv, type Voice } from './voice';

export interface AppDeps {
  analyze(req: AnalyzeRequest): AsyncGenerator<AgentEvent>;
  listTools(): ToolManifest[];
  toolsCount(): number;
  forget(name: string): boolean;
  clearCache(prefix: string): number;
  demoMode: boolean;
  /** USD left in the most recent session budget (contracts/events.md GET /health). */
  budgetLeftUsd?: () => number;
  heartbeatMs?: number;
  /** ElevenLabs text-to-speech; undefined = voice off (no ELEVENLABS_API_KEY). */
  voice?: Voice;
  /** Defaults to appendLog; tests pass a recorder so they never write log/. */
  log?: (entry: LogEntry) => void;
}

const ORIGIN = 'http://localhost:5173';
const CORS: Record<string, string> = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-expose-headers': 'x-voice-cached',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

export function createApp(deps: AppDeps) {
  const startedAt = new Date().toISOString();
  return {
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (url.pathname === '/health') return json({ ok: true, demoMode: deps.demoMode, budgetLeftUsd: deps.budgetLeftUsd?.() ?? 0, toolsCount: deps.toolsCount(), startedAt, voice: !!deps.voice });
      if (url.pathname === '/tools' && req.method === 'GET') return json(deps.listTools());
      if (url.pathname === '/forget' && req.method === 'POST') {
        if (!deps.demoMode) return json({ error: 'forget is only available in DEMO_MODE' }, 403);
        const body = await req.json().catch(() => ({})) as { name?: string };
        if (!body.name) return json({ error: 'name required' }, 400);
        const ok = deps.forget(body.name);
        const cleared = deps.clearCache(body.name);
        return json({ ok, cleared });
      }
      if (url.pathname === '/speak' && req.method === 'POST') {
        const body = await req.json().catch(() => ({})) as { text?: unknown };
        if (typeof body?.text !== 'string' || !body.text.trim()) return json({ error: 'text required' }, 400);
        if (!deps.voice) return json({ error: 'voice is off: set ELEVENLABS_API_KEY and restart the server' }, 501);
        let out: Awaited<ReturnType<Voice['speak']>>;
        try { out = await deps.voice.speak(body.text); } catch (e) { return json({ error: (e as Error).message }, 502); }
        (deps.log ?? appendLog)({ ts: new Date().toISOString(), sessionId: 'server', step: 'speak', data: { chars: out.chars, cached: out.cached, head: body.text.trim().slice(0, 60) } });
        return new Response(out.audio, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg', 'x-voice-cached': out.cached ? '1' : '0', 'cache-control': 'no-store', ...CORS },
        });
      }
      if (url.pathname === '/analyze' && req.method === 'POST') {
        let body: AnalyzeRequest;
        try { body = await req.json() as AnalyzeRequest; } catch { return json({ error: 'invalid JSON' }, 400); }
        if (!body || typeof body.sessionId !== 'string' || typeof body.message !== 'string' || !body.input?.kind) return json({ error: 'sessionId, message, input required' }, 400);
        return sse(deps.analyze(body), deps.heartbeatMs ?? 15000);
      }
      return json({ error: 'not found' }, 404);
    },
  };
}

function sse(gen: AsyncGenerator<AgentEvent>, heartbeatMs: number): Response {
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (s: string) => { try { ctrl.enqueue(enc.encode(s)); } catch {} };
      timer = setInterval(() => send(': ping\n\n'), heartbeatMs);
      try {
        for await (const e of gen) send(`data: ${JSON.stringify(e)}\n\n`);
      } catch (e) {
        send(`data: ${JSON.stringify({ type: 'error', text: (e as Error).message } satisfies AgentEvent)}\n\n`);
      } finally {
        clearInterval(timer);
        try { ctrl.close(); } catch {}
      }
    },
    cancel() { clearInterval(timer); gen.return(undefined).catch(() => {}); },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', ...CORS },
  });
}

/** Wires the real modules (A3 registry, A7 validity, A9 reuse, A10 grow). Imported lazily so tests never need them. */
export async function makeRealDeps(): Promise<AppDeps> {
  const load = async (p: string) => {
    try { return await import(p); } catch (e) { throw new Error(`server/index.ts: cannot load ${p} — is that task merged? (${(e as Error).message})`); }
  };
  const [registry, validity, reuse, grow, llmMod, costMod, cacheMod, runnerMod, authMod, classifyMod, sniffMod, examinerMod] = await Promise.all([
    load('./agent/registry'), load('./gate/validity'), load('./agent/reuse'), load('./agent/grow'),
    load('./agent/llm'), load('./agent/cost'), load('./agent/cache'), load('./agent/runner'), load('./agent/authority'),
    load('./gate/classify'), load('./gate/sniff'), load('./agent/examiner'),
  ]);
  const { analyze } = await import('./agent/loop');
  const llmDeps = llmMod.makeDeps();
  const root = process.cwd();
  const norm = (r: any) => (r?.ok === true || r?.status === 'ok' ? { ...r, ok: true } : { ...r, ok: false, tips: r?.tips ?? [] });
  const demoMode = process.env.DEMO_MODE === '1';
  const budgetLimitUsd = Number(process.env.SESSION_BUDGET_USD || authority.sessionBudgetUsdDefault);
  const budgets = new Map<string, Budget>();
  return {
    demoMode,
    voice: voiceFromEnv(),
    budgetLeftUsd: () => { const last = [...budgets.values()].at(-1); return last ? last.left : budgetLimitUsd; },
    toolsCount: () => registry.list(root).length,
    listTools: () => registry.list(root),
    forget: (name) => registry.forget(name, root),
    clearCache: (prefix) => llmDeps.cache.clearByPrefix(prefix),
    analyze: (req) => analyze(req, {
      registry: {
        find: (q) => registry.find(q, root),
        findFallback: (q) => registry.findFallback(q, root),
        bumpUses: (n) => registry.bumpUses(n, root),
        list: () => registry.list(root),
        knownActivities: () => registry.knownActivities(root),
      },
      validity: { checkLandmarks: (l) => norm(validity.checkLandmarks(l)), checkTable: (t) => norm(validity.checkTable(t)) },
      classify: (a) => classifyMod.classifyInput(a, llmDeps),
      sniff: (a) => sniffMod.sniffFormat(a, llmDeps),
      canonicalize: (a) => reuse.canonicalize(a, root),
      grow: (args, ctx) => grow.growTool(args, {
        llm: (r: any) => llmMod.callLlm(r, llmDeps), run: (name: string) => runnerMod.runToolTests(name, { root, timeoutMs: authority.testTimeoutMs }),
        runReal: (name: string, input: any) => runnerMod.runTool(name, input, { root }),
        root, emit: ctx.emit, budget: ctx.budget, stepIndex: ctx.stepIndex,
      }),
      runTool: (name, input) => runnerMod.runTool(name, input, { root }),
      llm: (r) => llmMod.callLlm(r, llmDeps),
      examine: process.env.EXAMINER === '0' ? undefined : (a) => examinerMod.examine(a, llmDeps),
      checkIntent: authMod.checkIntent,
      estimateGrowUsd: (k) => costMod.estimateGrowUsd(k),
      budgetLimitUsd,
      budgets,
      maxToolsPerSession: authority.maxToolsPerSession,
      autoConfirm: process.env.DEMO_AUTOCONFIRM === '1',
      appendLog,
    }),
  };
}

if (import.meta.main) {
  const deps = await makeRealDeps();
  const registryPath = './agent/registry';
  const registry = await import(registryPath);
  const toolsCount: number = registry.syncFromDisk(process.cwd());
  appendLog({ ts: new Date().toISOString(), sessionId: 'server', step: 'startup', data: { toolsCount } });
  const port = Number(process.env.PORT || 3000);
  const app = createApp(deps);
  Bun.serve({ port, fetch: app.fetch, idleTimeout: 255 });
  console.log(`frankencoach server on http://localhost:${port} — tools: ${toolsCount}`);
}
