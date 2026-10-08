import Anthropic from '@anthropic-ai/sdk';
import defaultPricing from '../../contracts/pricing.json';
import { usdFor, type Pricing } from './cost';
import { makeCache, type LlmCache } from './cache';

export type Tier = 'strong' | 'cheap';
export interface LlmRequest {
  tier: Tier; system: string; user: string; json?: boolean;
  images?: string[];   // base64 JPEG, ≤3
  maxTokens?: number; cacheKey?: string;
}
export interface LlmResponse {
  text: string; json?: any; model: string;
  inputTokens: number; outputTokens: number; cacheReadTokens: number;
  usd: number; ms: number; cached: boolean;
}
export interface LlmClient { messages: { create(body: any, opts?: any): Promise<any> } }
export interface LlmDeps {
  client: LlmClient; modelFor(tier: Tier): string; pricing: Pricing; cache: LlmCache;
  sleep?: (ms: number) => Promise<void>;
}

export class LlmError extends Error {
  constructor(public status: number | undefined, message: string) { super(message); this.name = 'LlmError'; }
}

const JSON_RULE = 'Reply with a single JSON object only. No prose, no markdown fences.';

export function makeDeps(env: Record<string, string | undefined> = process.env): LlmDeps {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — copy env.example to .env and add your key');
  const strong = env.MODEL_STRONG || 'claude-sonnet-5-5';
  const cheap = env.MODEL_CHEAP || 'claude-haiku-5-5';
  return {
    client: new Anthropic({ apiKey }) as unknown as LlmClient,
    modelFor: (t) => (t === 'strong' ? strong : cheap),
    pricing: defaultPricing,
    cache: makeCache(),
  };
}

export function parseJson(text: string): any {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1];
  try { return JSON.parse(s); } catch (e) {
    throw new LlmError(undefined, `invalid JSON from model: ${(e as Error).message}`);
  }
}

export async function callLlm(req: LlmRequest, deps: LlmDeps): Promise<LlmResponse> {
  if (req.cacheKey) {
    const hit = deps.cache.get<LlmResponse>(req.cacheKey);
    if (hit) return { ...hit, usd: 0, ms: 0, cached: true };
  }
  const model = deps.modelFor(req.tier);
  const system = req.json ? `${req.system}\n\n${JSON_RULE}` : req.system;
  const images = (req.images ?? []).slice(0, 3);
  const body = {
    model,
    max_tokens: req.maxTokens ?? 4096,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        ...images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
        { type: 'text', text: req.user },
      ],
    }],
  };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const t0 = Date.now();
  let res: any;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await deps.client.messages.create(body, { timeout: 120_000 });
      break;
    } catch (e: any) {
      const status: number | undefined = e?.status;
      if ((status === 429 || status === 529) && attempt === 0) { await sleep(2000); continue; }
      throw new LlmError(status, e?.message ?? String(e));
    }
  }
  const text = (res.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const u = res.usage ?? {};
  const out: LlmResponse = {
    text, model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    usd: usdFor(model, u, deps.pricing),
    ms: Date.now() - t0,
    cached: false,
  };
  if (req.json) out.json = parseJson(text);
  if (req.cacheKey) deps.cache.set(req.cacheKey, out);
  return out;
}
