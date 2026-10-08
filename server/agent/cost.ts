import defaultPricing from '../../contracts/pricing.json';
import type { ToolKind } from '../../contracts/types';

export interface ModelPrice { inputPerM: number | null; outputPerM: number | null; cacheReadPerM: number | null; cacheWritePerM: number | null }
export interface Pricing { models: Record<string, ModelPrice> }
export interface Usage {
  input_tokens?: number | null; output_tokens?: number | null;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null;
}

const STRONG_DEFAULT = 'claude-sonnet-5-5';

function priceOf(model: string, pricing: Pricing): Required<{ [K in keyof ModelPrice]: number }> {
  const p = pricing.models[model];
  if (!p || Object.values(p).some((v) => v == null)) {
    throw new Error(`no price for model "${model}": fill contracts/pricing.json`);
  }
  return p as any;
}

export function usdFor(model: string, usage: Usage, pricing: Pricing = defaultPricing): number {
  const p = priceOf(model, pricing);
  return (
    (usage.input_tokens ?? 0) * p.inputPerM +
    (usage.output_tokens ?? 0) * p.outputPerM +
    (usage.cache_read_input_tokens ?? 0) * p.cacheReadPerM +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWritePerM
  ) / 1e6;
}

export class Budget {
  spent = 0;
  constructor(public limit: number) {}
  spend(usd: number) { this.spent += usd; }
  get left() { return Math.max(0, this.limit - this.spent); }
  get exceeded() { return this.spent >= this.limit - 1e-12; }
}

// (8000 in + 3000 out) × strong-tier prices × 3 attempts
export function estimateGrowUsd(_kind: ToolKind, pricing: Pricing = defaultPricing, model = process.env.MODEL_STRONG || STRONG_DEFAULT): number {
  return usdFor(model, { input_tokens: 8000, output_tokens: 3000 }, pricing) * 3;
}

export function estimateSavedUsd(kind: ToolKind, pricing: Pricing = defaultPricing, model?: string): number {
  return estimateGrowUsd(kind, pricing, model);
}
