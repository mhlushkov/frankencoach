import { describe, expect, test } from 'bun:test';
import { renderLearned, replaceLearned } from './readme-learned';
import type { LearnedRow } from './pitch-learned';

const rows: LearnedRow[] = [
  { name: 'jump-rope-technique', sport: 'jump-rope', bornAt: '2026-10-08T22:07:43.891Z', attempts: 2, costUsd: 0.105 },
  { name: 'freediving-technique', sport: 'freediving', bornAt: '2026-10-08T23:30:35.433Z', attempts: 2, costUsd: 0.128 },
  { name: 'lat-pulldown-technique', sport: 'lat-pulldown', bornAt: '2026-10-08T23:34:58.199Z', attempts: 1, costUsd: 0.059 },
];
const at = new Date('2026-10-09T04:58:00.000Z');

describe('renderLearned', () => {
  test('3 rows render 3 table lines in the given order with Prague times', () => {
    const out = renderLearned(rows, at);
    const lines = out.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| sport'));
    expect(lines).toEqual([
      '| jump-rope | 00:07 | 2 | $0.105 |',
      '| freediving | 01:30 | 2 | $0.128 |',
      '| lat-pulldown | 01:34 | 1 | $0.059 |',
    ]);
    expect(out).toContain('human-made: 2 · agent-made: 3 · learning cost: $0.292 · generated at 06:58 Prague');
  });

  test('empty rows render "none yet"', () => {
    const out = renderLearned([], at);
    expect(out).toContain('none yet');
    expect(out).toContain('agent-made: 0 · learning cost: $0');
  });
});

describe('replaceLearned', () => {
  const readme = 'a\n<!-- learned:start -->\nold\n<!-- learned:end -->\nb\n';

  test('replaces the block and is idempotent', () => {
    const once = replaceLearned(readme, 'NEW');
    expect(once).toBe('a\n<!-- learned:start -->\nNEW\n<!-- learned:end -->\nb\n');
    expect(replaceLearned(once, 'NEW')).toBe(once);
  });

  test('missing marker throws', () => {
    expect(() => replaceLearned('a\n<!-- learned:start -->\nb\n', 'x')).toThrow(/learned:end/);
    expect(() => replaceLearned('a\n<!-- learned:end -->\n', 'x')).toThrow(/learned:start/);
  });
});
