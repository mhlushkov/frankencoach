import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ToolManifest, ToolResult } from '../../contracts/types';
import { callLlm, type LlmDeps, type LlmResponse } from './llm';

// The examiner: a second agent (the strong model, a different prompt, no shared context) grades the coach's
// understanding of an activity on a 1–5 rubric after it learned or reused a tool. The decision is not the model's:
// decide() applies the rules in code, so the examiner can score but cannot wave advice through.

const score = z.number().int().min(1).max(5);
export const ExamSchema = z.object({
  identified: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  novelty: z.enum(['known', 'partially known', 'new']),
  evidence: z.array(z.string()).max(6),
  understood: z.array(z.string()).max(6),
  missing: z.array(z.string()).max(6),
  scores: z.object({ identification: score, movement: score, technique: score, advice: score, safety: score }),
  dataTooPoor: z.boolean(),
  highRisk: z.boolean(),
  reason: z.string(),
});
export type Exam = z.infer<typeof ExamSchema>;
export type Scores = Exam['scores'];
export type Decision = 'ready' | 'continue' | 'block';

export interface ExamArgs {
  message: string; input: 'clip' | 'file'; activity: string; confidence: number;
  tool?: Pick<ToolManifest, 'name' | 'description' | 'createdBy' | 'attempts'>; justLearned: boolean;
  metrics: ToolResult['metrics']; warnings: string[]; advice: string;
}

const PROMPT = readFileSync(join(import.meta.dir, 'prompts/examiner.md'), 'utf8');

export async function examine(args: ExamArgs, deps: LlmDeps): Promise<{ value: Exam; llm: LlmResponse }> {
  const llm = await callLlm({ tier: 'strong', system: PROMPT, user: JSON.stringify(args), json: true, maxTokens: 900 }, deps);
  return { value: ExamSchema.parse(llm.json), llm };
}

/** The learning decision rules, in order: block beats continue beats ready. */
export function decide(x: Pick<Exam, 'scores' | 'dataTooPoor' | 'highRisk'>): { decision: Decision; why: string } {
  const s = x.scores;
  if (s.safety <= 2) return { decision: 'block', why: `safety and confidence boundaries scored ${s.safety}` };
  if (s.identification <= 2) return { decision: 'block', why: `the activity is not identified well enough (${s.identification})` };
  if (x.dataTooPoor) return { decision: 'block', why: 'the upload is too poor to observe the movement' };
  if (x.highRisk) return { decision: 'block', why: 'this activity carries a real injury or safety risk' };
  const low = (Object.entries(s) as [keyof Scores, number][]).filter(([, v]) => v < 3).map(([k]) => k);
  if (low.length) return { decision: 'continue', why: `${low.join(', ')} below 3` };
  if (s.advice < 4) return { decision: 'continue', why: `coaching advice scored ${s.advice}, it needs 4` };
  if (s.safety < 4) return { decision: 'continue', why: `safety and confidence scored ${s.safety}, it needs 4` };
  return { decision: 'ready', why: 'every dimension is 3 or higher, advice and safety are 4 or higher' };
}

const SHORT: Record<keyof Scores, string> = { identification: 'sport', movement: 'movement', technique: 'technique', advice: 'advice', safety: 'safety' };
/** "rubric: sport 5 · movement 4 · technique 4 · advice 4 · safety 5 → ready" (the diary parses this). */
export function rubricSummary(s: Scores, d: Decision): string {
  return `rubric: ${(Object.keys(SHORT) as (keyof Scores)[]).map((k) => `${SHORT[k]} ${s[k]}`).join(' · ')} → ${d}`;
}
