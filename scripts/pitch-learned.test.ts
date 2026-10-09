import { describe, expect, test } from 'bun:test';
import { learnedRows, replaceBlock, totalCost, testsFromOutput } from './pitch-learned';

const human = (name: string) => ({ name, kind: 'analyzer', activity: '*', createdBy: 'human', createdAt: '2026-10-08T21:00:00.000Z' });
const grown = (name: string, activity: string, createdAt: string, attempts: number, costUsd: number) =>
  ({ name, kind: 'analyzer', activity, createdBy: 'agent', createdAt, attempts, costUsd });

const registry = {
  version: 1,
  tools: [
    human('series-core'),
    grown('lat-pulldown-technique', 'lat-pulldown', '2026-10-08T23:34:58.199Z', 1, 0.0585824),
    human('pose-metrics'),
    grown('jump-rope-technique', 'jump-rope', '2026-10-08T22:07:43.891Z', 2, 0.105052),
    grown('freediving-technique', 'freediving', '2026-10-08T23:30:35.433Z', 2, 0.1283604),
  ],
};

describe('learnedRows', () => {
  test('drops the two human-made tools and sorts by bornAt', () => {
    const rows = learnedRows(registry);
    expect(rows.map(r => r.sport)).toEqual(['jump-rope', 'freediving', 'lat-pulldown']);
    expect(rows[0]).toEqual({ name: 'jump-rope-technique', sport: 'jump-rope', bornAt: '2026-10-08T22:07:43.891Z', attempts: 2, costUsd: 0.105 });
  });

  test('cost summed to 3 decimals', () => {
    expect(totalCost(learnedRows(registry))).toBe(0.292);
  });

  test('missing attempts or cost become 1 and 0', () => {
    const rows = learnedRows({ tools: [{ name: 'x', activity: 'rowing', createdBy: 'agent', createdAt: '2026-10-09T01:00:00.000Z' }] });
    expect(rows).toEqual([{ name: 'x', sport: 'rowing', bornAt: '2026-10-09T01:00:00.000Z', attempts: 1, costUsd: 0 }]);
  });
});

describe('replaceBlock', () => {
  test('rewrites only the learned JSON block', () => {
    const html = '<head><script id="learned" type="application/json">\n{"old":1}\n</script><script>x()</script></head>';
    const out = replaceBlock(html, { tools: [], commits: 1, tests: 2, generatedAt: 'now' });
    expect(out).toContain('"commits": 1');
    expect(out).not.toContain('"old"');
    expect(out).toContain('<script>x()</script>');
  });

  test('throws when the block is missing', () => {
    expect(() => replaceBlock('<html></html>', { tools: [], commits: 0, tests: 0, generatedAt: '' })).toThrow();
  });
});

describe('testsFromOutput', () => {
  test('reads the pass count when nothing failed', () => {
    expect(testsFromOutput(' 264 pass\n 0 fail\n 612 expect() calls\nRan 264 tests across 41 files. [3.10s]\n')).toBe(264);
  });
  test('null when something failed or the summary is missing', () => {
    expect(testsFromOutput(' 263 pass\n 1 fail\nRan 264 tests across 41 files.')).toBeNull();
    expect(testsFromOutput('error: crashed')).toBeNull();
  });
});
