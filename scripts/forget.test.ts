import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forgetTools } from './forget';

const manifest = (name: string, createdBy: 'human' | 'agent') => ({
  name, kind: 'analyzer', activity: createdBy === 'human' ? '*' : 'freediving', inputType: 'landmarks', outputType: 'result',
  description: name, permissions: ['compute'], createdBy, createdAt: '2026-10-09T00:00:00.000Z', uses: 0, testStatus: 'pass',
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fc-forget-'));
  for (const [n, by] of [['pose-metrics', 'human'], ['freediving-technique', 'agent'], ['squat-technique', 'agent']] as const) {
    mkdirSync(join(root, 'tools', n), { recursive: true });
    writeFileSync(join(root, 'tools', n, 'manifest.json'), JSON.stringify(manifest(n, by)));
    writeFileSync(join(root, 'tools', n, 'index.ts'), 'export default () => ({ metrics: {}, usable: true });\n');
  }
  writeFileSync(join(root, 'tools', 'registry.json'), JSON.stringify({ version: 1, tools: [
    manifest('pose-metrics', 'human'), manifest('freediving-technique', 'agent'), manifest('squat-technique', 'agent'),
  ] }));
  mkdirSync(join(root, 'cache', 'llm'), { recursive: true });
  writeFileSync(join(root, 'cache', 'llm', 'a'.repeat(64) + '.json'), '{}');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const names = () => (JSON.parse(readFileSync(join(root, 'tools', 'registry.json'), 'utf8')).tools as { name: string }[]).map(t => t.name);

describe('forgetTools', () => {
  test('moves the dir to tools/.forgotten and drops it from the registry', () => {
    const out = forgetTools(['freediving-technique'], root);
    expect(out).toEqual([{ name: 'freediving-technique', found: true, cacheCleared: 0 }]);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(false);
    const moved = readdirSync(join(root, 'tools', '.forgotten'));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatch(/^freediving-technique-\d+$/);
    expect(existsSync(join(root, 'tools', '.forgotten', moved[0]!, 'manifest.json'))).toBe(true);
    expect(names()).toEqual(['pose-metrics', 'squat-technique']);
    expect(existsSync(join(root, 'cache', 'llm', 'a'.repeat(64) + '.json'))).toBe(true);   // hashed keys are untouched
  });

  test('reports not-found and leaves everything else alone', () => {
    const out = forgetTools(['no-such-tool', 'squat-technique'], root);
    expect(out.map(o => o.found)).toEqual([false, true]);
    expect(names()).toEqual(['pose-metrics', 'freediving-technique']);
    expect(existsSync(join(root, 'tools', 'freediving-technique'))).toBe(true);
  });

  test('rejects names that are not kebab-case', () => {
    expect(forgetTools(['../registry.json'], root)[0]!.found).toBe(false);
    expect(names()).toHaveLength(3);
  });

  test('CLI prints one line per tool and exits 1 on not-found', async () => {
    const p = Bun.spawn(['bun', join(import.meta.dir, 'forget.ts'), 'squat-technique', 'nope'], { env: { ...process.env, FC_ROOT: root }, stdout: 'pipe' });
    const text = await new Response(p.stdout).text();
    expect(await p.exited).toBe(1);
    expect(text.trim().split('\n')).toEqual(['forgot: squat-technique', 'not found: nope']);
  });
});
