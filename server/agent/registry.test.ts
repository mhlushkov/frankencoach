import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolManifest } from '../../contracts/types';
import {
  apiSummary, bumpUses, find, findFallback, forget, install, knownActivities, list, readRegistry, setAttempts, syncFromDisk,
} from './registry';

let root: string;

function m(over: Partial<ToolManifest>): ToolManifest {
  return {
    name: 'x', kind: 'analyzer', activity: '*', inputType: 'landmarks', outputType: 'result', description: 'd',
    permissions: ['compute'], createdBy: 'human', createdAt: '2026-10-08T21:00:00.000Z', uses: 0, testStatus: 'pass', ...over,
  };
}
function writeTool(man: ToolManifest, src = 'export default function analyze() {}\n') {
  const dir = join(root, 'tools', man.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(man));
  writeFileSync(join(dir, 'index.ts'), src);
}
const poseMetrics = m({ name: 'pose-metrics' });
const seriesCore = m({ name: 'series-core', inputType: 'session' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fc-reg-'));
  mkdirSync(join(root, 'contracts'), { recursive: true });
  writeFileSync(join(root, 'contracts', 'activities.json'), JSON.stringify({ canonical: { squat: ['squats'], freediving: ['apnea'] } }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('registry', () => {
  test('missing registry.json reads as empty', () => {
    expect(readRegistry(root)).toEqual({ version: 1, tools: [] });
    expect(list(root)).toEqual([]);
  });

  test('find never returns an activity:* tool; findFallback does', () => {
    install(poseMetrics, root);
    install(seriesCore, root);
    expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: 'freediving' }, root)).toBeUndefined();
    expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: '*' }, root)).toBeUndefined();
    expect(findFallback({ kind: 'analyzer', inputType: 'landmarks' }, root)?.name).toBe('pose-metrics');
    expect(findFallback({ kind: 'analyzer', inputType: 'session' }, root)?.name).toBe('series-core');
  });

  test('find exact activity match; ignores failing tools', () => {
    install(poseMetrics, root);
    install(m({ name: 'squat-form', activity: 'squat', createdBy: 'agent' }), root);
    install(m({ name: 'dive-bad', activity: 'freediving', testStatus: 'fail' }), root);
    expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: 'squat' }, root)?.name).toBe('squat-form');
    expect(find({ kind: 'analyzer', inputType: 'session', activity: 'squat' }, root)).toBeUndefined();
    expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: 'freediving' }, root)).toBeUndefined();
  });

  test('parsers match on raw:<formatId>', () => {
    install(m({ name: 'garmin-dive-csv-parser', kind: 'parser', inputType: 'raw:garmin-dive-csv', outputType: 'session', activity: 'freediving' }), root);
    expect(find({ kind: 'parser', inputType: 'raw:garmin-dive-csv', activity: 'freediving' }, root)?.name).toBe('garmin-dive-csv-parser');
    expect(find({ kind: 'parser', inputType: 'raw:strava-gpx', activity: 'freediving' }, root)).toBeUndefined();
  });

  test('install upserts; bumpUses and setAttempts persist', () => {
    install(poseMetrics, root);
    install({ ...poseMetrics, description: 'new' }, root);
    expect(list(root)).toHaveLength(1);
    expect(list(root)[0]!.description).toBe('new');
    bumpUses('pose-metrics', root);
    bumpUses('pose-metrics', root);
    setAttempts('pose-metrics', 2, root);
    const t = readRegistry(root).tools[0]!;
    expect(t.uses).toBe(2);
    expect(t.attempts).toBe(2);
  });

  test('install rejects invalid manifests', () => {
    expect(() => install(m({ name: '../evil' }), root)).toThrow();
    expect(() => install({ ...poseMetrics, permissions: ['network' as 'compute'] }, root)).toThrow();
  });

  test('forget moves folder to tools/.forgotten and removes from registry', () => {
    const t = m({ name: 'squat-form', activity: 'squat' });
    writeTool(t);
    install(t, root);
    expect(forget('squat-form', root)).toBe(true);
    expect(list(root)).toEqual([]);
    expect(existsSync(join(root, 'tools', 'squat-form'))).toBe(false);
    const moved = readdirSync(join(root, 'tools', '.forgotten'));
    expect(moved).toHaveLength(1);
    expect(moved[0]!.startsWith('squat-form-')).toBe(true);
    expect(forget('squat-form', root)).toBe(false);
  });

  test('syncFromDisk upserts passing tools, skips _ and . folders and failing ones', () => {
    writeTool(poseMetrics);
    writeTool(seriesCore);
    writeTool(m({ name: '_template-analyzer', activity: 'template' }));
    writeTool(m({ name: 'broken', activity: 'squat', testStatus: 'fail' }));
    mkdirSync(join(root, 'tools', '.forgotten', 'old-1'), { recursive: true });
    mkdirSync(join(root, 'tools', 'no-manifest'), { recursive: true });
    writeFileSync(join(root, 'tools', 'registry.json'), JSON.stringify({ version: 1, tools: [] }));
    expect(syncFromDisk(root)).toBe(2);
    expect(list(root).map(t => t.name).sort()).toEqual(['pose-metrics', 'series-core']);
    expect(syncFromDisk(root)).toBe(2);
    expect(list(root)).toHaveLength(2);
  });

  test('knownActivities = registry ∪ activities.json, unique, no *', () => {
    install(poseMetrics, root);
    install(m({ name: 'squat-form', activity: 'squat' }), root);
    install(m({ name: 'kettlebell', activity: 'kettlebell-swing' }), root);
    expect(knownActivities(root).sort()).toEqual(['freediving', 'kettlebell-swing', 'squat']);
  });

  test('apiSummary returns exported declarations only, ≤ 120 lines', () => {
    const src = ['import x from "y";', 'export const A = 1;', 'const hidden = 2;', 'export function f(a: number): number {', '  return a;', '}',
      ...Array.from({ length: 150 }, (_, i) => `export const k${i} = ${i};`)].join('\n');
    writeTool(poseMetrics, src);
    const s = apiSummary('pose-metrics', root);
    const lines = s.split('\n');
    expect(lines[0]).toBe('export const A = 1;');
    expect(lines[1]).toBe('export function f(a: number): number {');
    expect(s).not.toContain('hidden');
    expect(s).not.toContain('return a');
    expect(lines.length).toBe(120);
    expect(apiSummary('nope', root)).toBe('');
  });

  test('apiSummary: whole headers, whole type declarations, referenced private types, caps', () => {
    const big = ['export interface Big {', ...Array.from({ length: 28 }, (_, i) => `  f${i}: number;`), '}'];
    const src = [
      "import type { Landmarks } from '../../contracts/types';",
      'type Secret = string;',
      'type Unit = { v: number };',
      'export const f = (a: number): { x: number } => {',
      '  return { x: a };',
      '};',
      'export function g(a: number): Promise<Array<{ x: number }>> {',
      '  return Promise.resolve([{ x: a }]);',
      '}',
      'export const CFG = {',
      '  a: 1,',
      '};',
      'export type Pair = { a: number; b: number };',
      ...big,
      'export function h(',
      '  u: Unit,',
      '): number {',
      '  return u.v;',
      '}',
    ].join('\n');
    writeTool(poseMetrics, src);
    const lines = apiSummary('pose-metrics', root).split('\n');
    const at = (l: string) => lines.indexOf(l);
    expect(at('export const f = (a: number): { x: number } => {')).toBe(0);
    expect(lines[1]).toBe('export function g(a: number): Promise<Array<{ x: number }>> {');
    expect(lines.slice(2, 5)).toEqual(['export const CFG = {', '  a: 1,', '};']);
    expect(lines[5]).toBe('export type Pair = { a: number; b: number };');
    expect(lines.slice(6, 18)).toEqual(['export interface Big {', ...Array.from({ length: 10 }, (_, i) => `  f${i}: number;`), '// …']);
    expect(lines.slice(18, 21)).toEqual(['export function h(', '  u: Unit,', '): number {']);
    expect(lines.slice(21)).toEqual(['// not exported, shown for reference', 'type Unit = { v: number };']);
    expect(lines.join('\n')).not.toContain('Secret');
    expect(lines.join('\n')).not.toContain('return');
  });

  test('apiSummary on the real pose-metrics shows whole signatures and the types they name', () => {
    const repo = join(import.meta.dir, '..', '..');
    const s = apiSummary('pose-metrics', repo);
    const lines = s.split('\n');
    const cut = lines.findIndex(l => l.includes('cutRanges: { fromSec: number; toSec: number }[]'));
    expect(cut).toBeGreaterThan(0);
    expect(lines[cut - 1]).toBe('export function coverage(l: Landmarks, margin = 0.01): {');
    expect(lines[cut + 1]).toBe('} {');
    expect(s).toContain('partialStart: boolean');
    expect(s).toContain("view: 'front' | 'back' | 'left' | 'right' | 'oblique'");
    const ref = lines.indexOf('// not exported, shown for reference');
    expect(ref).toBeGreaterThan(0);
    expect(lines[ref + 1]).toBe('type Num = number | null;');
    expect(lines).toContain("export function legVisibility(l: Landmarks): { left: number; right: number; better: 'left' | 'right' } {");
    expect(s).not.toContain('let left = 0');
    expect(lines.length).toBeLessThanOrEqual(120);
  });

  test('real repo: syncFromDisk picks up human tools; templates stay out', () => {
    const repo = join(import.meta.dir, '..', '..');
    const tmp = mkdtempSync(join(tmpdir(), 'fc-reg-real-'));
    try {
      for (const name of ['pose-metrics', 'series-core', '_template-analyzer', '_template-parser']) {
        const dir = join(tmp, 'tools', name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'manifest.json'), readFileSync(join(repo, 'tools', name, 'manifest.json'), 'utf8'));
      }
      expect(syncFromDisk(tmp)).toBe(2);
      expect(findFallback({ kind: 'analyzer', inputType: 'landmarks' }, tmp)?.name).toBe('pose-metrics');
      expect(find({ kind: 'analyzer', inputType: 'landmarks', activity: 'freediving' }, tmp)).toBeUndefined();
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});
