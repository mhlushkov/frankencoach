import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { callLlm, type LlmDeps, type LlmResponse } from '../agent/llm';

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const ClassificationSchema = z.object({
  isHuman: z.boolean(),
  numPeople: z.number().int().min(0),
  activity: kebab,
  isSport: z.boolean(),
  environment: z.string(),
  intent: z.string(),
  mismatchWithHint: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export interface ClassifyArgs {
  message: string; sportHint?: string;
  frames?: string[];                     // dataURL jpeg (≤3)
  stats?: Record<string, unknown>;
  knownActivities: string[];
}

const PROMPT = readFileSync(join(import.meta.dir, '../agent/prompts/classify-input.md'), 'utf8');

export async function classifyInput(args: ClassifyArgs, deps: LlmDeps): Promise<{ value: Classification; llm: LlmResponse }> {
  const user = [
    `KNOWN activities: ${JSON.stringify(args.knownActivities)}`,
    `Sport hint: ${args.sportHint ?? '(none)'}`,
    `Motion stats: ${JSON.stringify(args.stats ?? {})}`,
    `User message: ${args.message}`,
  ].join('\n');
  const images = (args.frames ?? []).slice(0, 3).map((f) => f.replace(/^data:[^,]*,/, ''));
  const llm = await callLlm({ tier: 'cheap', system: PROMPT, user, json: true, images, maxTokens: 200 }, deps);
  return { value: ClassificationSchema.parse(llm.json), llm };
}
