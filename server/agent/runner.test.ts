import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runToolTests, runTool, ToolRunError } from './runner';

const FIX = join(import.meta.dir, '__fixtures__');
const REPO = join(import.meta.dir, '..', '..');
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fc-runner-'));
  mkdirSync(join(root, 'tools'));
  copyFileSync(join(REPO, 'tools', '_run.ts'), join(root, 'tools', '_run.ts'));
  for (const name of ['tool-pass', 'tool-fail']) {
    mkdirSync(join(root, 'tools', name));
    copyFileSync(join(FIX, name, 'index.ts'), join(root, 'tools', name, 'index.ts'));
    copyFileSync(join(FIX, name, 'index.testcase.ts'), join(root, 'tools', name, 'index.test.ts'));
  }
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test('runToolTests: passing tool', async () => {
  const r = await runToolTests('tool-pass', { root, timeoutMs: 30000 });
  expect(r.pass).toBe(true);
  expect(r.summary.length).toBeLessThanOrEqual(1500);
});

test('runToolTests: failing tool → summary contains (fail)', async () => {
  const r = await runToolTests('tool-fail', { root, timeoutMs: 30000 });
  expect(r.pass).toBe(false);
  expect(r.summary).toContain('(fail)');
  expect(r.summary.length).toBeLessThanOrEqual(1500);
});

test('runToolTests: timeout 1 ms', async () => {
  const r = await runToolTests('tool-pass', { root, timeoutMs: 1 });
  expect(r.pass).toBe(false);
  expect(r.summary).toBe('timeout');
});

test('runTool: echo tool returns parsed JSON', async () => {
  const input = { raw: 'a,b\n1,2', filename: 'x.csv' };
  const out = (await runTool('tool-pass', input, { root })) as any;
  expect(out.usable).toBe(true);
  // parser-shaped input is passed as (raw, {filename}) → echo gets raw string
  expect(out.echo).toBe('a,b\n1,2');
  const lm = { version: 1, frames: [] } as any;
  const out2 = (await runTool('tool-pass', lm, { root })) as any;
  expect(out2.echo).toEqual(lm);
});

test('runTool: throwing tool → ToolRunError', async () => {
  const p = runTool('tool-fail', { version: 1 } as any, { root });
  await expect(p).rejects.toBeInstanceOf(ToolRunError);
  await expect(runTool('tool-fail', { version: 1 } as any, { root })).rejects.toThrow(/boom/);
});

test('runTool: timeout → ToolRunError', async () => {
  await expect(runTool('tool-pass', { version: 1 } as any, { root, timeoutMs: 1 })).rejects.toThrow(/timeout/);
});

test('subprocess env is empty (no API keys)', async () => {
  const { childEnv } = await import('./runner');
  expect(Object.keys(childEnv())).toEqual(['PATH']);
});
