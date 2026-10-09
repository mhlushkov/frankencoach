import { describe, expect, test } from 'bun:test';
import { decide, ExamSchema, rubricSummary, type Scores } from './examiner';

const all = (n: number): Scores => ({ identification: n, movement: n, technique: n, advice: n, safety: n });
const x = (scores: Partial<Scores>, flags: { dataTooPoor?: boolean; highRisk?: boolean } = {}) =>
  ({ scores: { ...all(4), ...scores }, dataTooPoor: flags.dataTooPoor ?? false, highRisk: flags.highRisk ?? false });

describe('decide (the learning decision rules)', () => {
  test('ready: all ≥3, advice ≥4, safety ≥4', () => {
    expect(decide(x({ identification: 3, movement: 3, technique: 3 })).decision).toBe('ready');
    expect(decide(x({})).decision).toBe('ready');
  });
  test('safety ≤2 blocks, even with perfect advice', () => {
    expect(decide(x({ advice: 5, safety: 2 }))).toEqual({ decision: 'block', why: 'safety and confidence boundaries scored 2' });
  });
  test('identification ≤2 blocks', () => expect(decide(x({ identification: 2 })).decision).toBe('block'));
  test('poor data or high-risk activity blocks', () => {
    expect(decide(x({}, { dataTooPoor: true })).decision).toBe('block');
    expect(decide(x({ identification: 5, advice: 5, safety: 5 }, { highRisk: true })).decision).toBe('block');
  });
  test('continue: a dimension below 3, or advice / safety at 3', () => {
    expect(decide(x({ technique: 2 }))).toEqual({ decision: 'continue', why: 'technique below 3' });
    expect(decide(x({ advice: 3 })).decision).toBe('continue');
    expect(decide(x({ safety: 3 })).decision).toBe('continue');
  });
});

test('rubricSummary is one line the diary can parse', () => {
  expect(rubricSummary({ identification: 5, movement: 4, technique: 4, advice: 4, safety: 5 }, 'ready'))
    .toBe('rubric: sport 5 · movement 4 · technique 4 · advice 4 · safety 5 → ready');
});

test('ExamSchema rejects a score outside 1–5', () => {
  const ok = { identified: 'running', confidence: 'high', novelty: 'new', evidence: [], understood: [], missing: [], scores: all(4), dataTooPoor: false, highRisk: false, reason: 'r' };
  expect(ExamSchema.safeParse(ok).success).toBe(true);
  expect(ExamSchema.safeParse({ ...ok, scores: { ...all(4), advice: 6 } }).success).toBe(false);
});
