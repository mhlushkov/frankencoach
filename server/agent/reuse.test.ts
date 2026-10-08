import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolManifest } from '../../contracts/types';
import { install } from './registry';
import { canonicalize, pickSibling, promptContext, savedUsdFor } from './reuse';

let root: string;

function m(over: Partial<ToolManifest>): ToolManifest {
  return {
    name: 'x', kind: 'analyzer', activity: '*', inputType: 'landmarks', outputType: 'result', description: 'd',
    permissions: ['compute'], createdBy: 'agent', createdAt: '2026-10-08T21:00:00.000Z', uses: 0, testStatus: 'pass', ...over,
  };
}
function writeTool(man: ToolManifest, tag = man.name) {
  const dir = join(root, 'tools', man.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(man));
  writeFileSync(join(dir, 'index.ts'), `export function helper_${tag.replace(/[-_]/g, '')}() {}\nfunction body() {\n  return 'SRC_${tag}';\n}\n`);
  writeFileSync(join(dir, 'index.test.ts'), `// TEST_${tag}\n`);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fc-reuse-'));
  mkdirSync(join(root, 'contracts'), { recursive: true });
  writeFileSync(join(root, 'contracts', 'activities.json'), JSON.stringify({ canonical: { freediving: ['freedive', 'apnea'], squat: ['squats'] } }));
  writeFileSync(join(root, 'contracts', 'types.ts'), '// CONTRACT_TYPES\nexport interface Session {}\n');
  writeTool(m({ name: 'pose-metrics', createdBy: 'human' }));
  writeTool(m({ name: 'series-core', inputType: 'session', createdBy: 'human' }));
  writeTool(m({ name: '_template-analyzer', activity: 'template', createdBy: 'human' }));
  writeTool(m({ name: '_template-parser', kind: 'parser', activity: 'template', inputType: 'raw:template-csv', outputType: 'session', createdBy: 'human' }));
  install(m({ name: 'pose-metrics', createdBy: 'human' }), root);
  install(m({ name: 'series-core', inputType: 'session', createdBy: 'human' }), root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('canonicalize', () => {
  test('synonym from activities.json', () => {
    expect(canonicalize('freedive', root)).toEqual({ canonical: 'freediving', how: 'synonym' });
    expect(canonicalize('  Apnea ', root)).toEqual({ canonical: 'freediving', how: 'synonym' });
  });
  test('exact canonical name', () => {
    expect(canonicalize('squat', root)).toEqual({ canonical: 'squat', how: 'exact' });
  });
  test('activity known only from the registry is exact', () => {
    install(m({ name: 'kite-technique', activity: 'kitesurfing' }), root);
    expect(canonicalize('kitesurfing', root)).toEqual({ canonical: 'kitesurfing', how: 'exact' });
  });
  test('unknown → new, kebab-cased', () => {
    expect(canonicalize('kitesurfing', root)).toEqual({ canonical: 'kitesurfing', how: 'new' });
    expect(canonicalize('Pole Vault', root)).toEqual({ canonical: 'pole-vault', how: 'new' });
  });
});

describe('pickSibling', () => {
  test('newest passing tool with same kind+inputType', () => {
    install(m({ name: 'squat-technique', activity: 'squat', createdAt: '2026-10-08T21:10:00.000Z' }), root);
    install(m({ name: 'running-technique', activity: 'running', createdAt: '2026-10-08T21:30:00.000Z' }), root);
    install(m({ name: 'broken-technique', activity: 'jump', createdAt: '2026-10-08T22:00:00.000Z', testStatus: 'fail' }), root);
    install(m({ name: 'dive-profile', activity: 'freediving', inputType: 'session', createdAt: '2026-10-08T23:00:00.000Z' }), root);
    expect(pickSibling({ kind: 'analyzer', inputType: 'landmarks' }, root)?.name).toBe('running-technique');
  });
  test('never picks the * fallbacks; falls back to the template', () => {
    expect(pickSibling({ kind: 'analyzer', inputType: 'landmarks' }, root)?.name).toBe('_template-analyzer');
    expect(pickSibling({ kind: 'analyzer', inputType: 'session' }, root)?.name).toBe('_template-analyzer');
    expect(pickSibling({ kind: 'parser', inputType: 'raw:garmin-dive-csv' }, root)?.name).toBe('_template-parser');
  });
  test('parsers: any raw:* parser is a sibling', () => {
    install(m({ name: 'strava-csv', kind: 'parser', activity: 'cycling', inputType: 'raw:strava-csv', outputType: 'session' }), root);
    expect(pickSibling({ kind: 'parser', inputType: 'raw:garmin-dive-csv' }, root)?.name).toBe('strava-csv');
  });
});

describe('promptContext', () => {
  test('contains types, sibling source + test, api summaries; not other tools', () => {
    install(m({ name: 'squat-technique', activity: 'squat', createdAt: '2026-10-08T21:10:00.000Z' }), root);
    install(m({ name: 'running-technique', activity: 'running', createdAt: '2026-10-08T21:30:00.000Z' }), root);
    writeTool(m({ name: 'squat-technique' }));
    writeTool(m({ name: 'running-technique' }));
    const ctx = promptContext({ kind: 'analyzer', inputType: 'landmarks' }, root);
    expect(ctx).toContain('CONTRACT_TYPES');
    expect(ctx).toContain('SRC_running-technique');
    expect(ctx).toContain('TEST_running-technique');
    expect(ctx).toContain('helper_posemetrics');
    expect(ctx).toContain('helper_seriescore');
    expect(ctx).not.toContain('SRC_pose-metrics');
    expect(ctx).not.toContain('SRC_squat-technique');
    expect(ctx).not.toContain('TEST_squat-technique');
    expect(ctx).not.toContain('expected.json');
  });
  test('uses the template when no sibling exists', () => {
    const ctx = promptContext({ kind: 'parser', inputType: 'raw:garmin-dive-csv' }, root);
    expect(ctx).toContain('SRC__template-parser');
    expect(ctx).toContain('TEST__template-parser');
  });
});

describe('savedUsdFor', () => {
  test('real growth price or 0', () => {
    expect(savedUsdFor(m({ costUsd: 0.42 }), {})).toBe(0.42);
    expect(savedUsdFor(m({}), {})).toBe(0);
  });
});
