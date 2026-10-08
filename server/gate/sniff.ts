import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { callLlm, type LlmDeps, type LlmResponse } from '../agent/llm';

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const SniffSchema = z.object({
  formatId: kebab,
  activity: kebab,
  isSportData: z.boolean(),
  timeColumn: z.string().nullable(),
  columns: z.array(z.object({ name: z.string(), meaning: z.string(), unit: z.string() })),
  confidence: z.number().min(0).max(1),
});
export type Sniff = z.infer<typeof SniffSchema>;

export interface SniffArgs { filename: string; head30: string; header: string; knownFormats: string[] }

const PROMPT = readFileSync(join(import.meta.dir, '../agent/prompts/sniff-format.md'), 'utf8');

export async function sniffFormat(args: SniffArgs, deps: LlmDeps): Promise<{ value: Sniff; llm: LlmResponse }> {
  const user = [
    `KNOWN formats: ${JSON.stringify(args.knownFormats)}`,
    `Filename: ${args.filename}`,
    `Header: ${args.header}`,
    `First 30 lines:\n${args.head30}`,
  ].join('\n');
  const llm = await callLlm({ tier: 'cheap', system: PROMPT, user, json: true, maxTokens: 600 }, deps);
  return { value: SniffSchema.parse(llm.json), llm };
}
