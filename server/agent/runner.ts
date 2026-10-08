import { join } from 'node:path';
import type { Landmarks, Session, ToolResult } from '../../contracts/types';

const REPO_ROOT = join(import.meta.dir, '..', '..');

export class ToolRunError extends Error {
  constructor(public summary: string) { super(summary); this.name = 'ToolRunError'; }
}

export interface RunOpts { root?: string; timeoutMs?: number }
export type ToolInput = Landmarks | Session | { raw: string; filename: string };

/** Deliberately empty env: no API keys reach grown code. */
export function childEnv(): Record<string, string> {
  return { PATH: process.env.PATH ?? '' };
}

function tail(text: string): string {
  const s = text.trimEnd().split('\n').slice(-15).join('\n');
  return s.length > 1500 ? s.slice(-1500) : s;
}

async function spawn(cmd: string[], cwd: string, timeoutMs: number, stdin?: string) {
  const proc = Bun.spawn(cmd, { cwd, env: childEnv(), stdin: stdin === undefined ? 'ignore' : 'pipe', stdout: 'pipe', stderr: 'pipe' });
  if (stdin !== undefined) { proc.stdin!.write(stdin); proc.stdin!.end(); }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  clearTimeout(timer);
  return { stdout, stderr, code, timedOut };
}

export async function runToolTests(name: string, opts: RunOpts = {}): Promise<{ pass: boolean; summary: string }> {
  const { root = REPO_ROOT, timeoutMs = 60000 } = opts;
  const r = await spawn(['bun', 'test', `tools/${name}`], root, timeoutMs);
  if (r.timedOut) return { pass: false, summary: 'timeout' };
  // bun test reports to stderr; keep both
  return { pass: r.code === 0, summary: tail(r.stdout + '\n' + r.stderr) };
}

export async function runTool(name: string, input: ToolInput, opts: RunOpts = {}): Promise<ToolResult | Session> {
  const { root = REPO_ROOT, timeoutMs = 20000 } = opts;
  const r = await spawn(['bun', 'run', 'tools/_run.ts', name], root, timeoutMs, JSON.stringify(input));
  if (r.timedOut) throw new ToolRunError('timeout');
  if (r.code !== 0) throw new ToolRunError(tail(r.stderr || r.stdout) || `exit ${r.code}`);
  try { return JSON.parse(r.stdout); }
  catch { throw new ToolRunError('invalid JSON: ' + tail(r.stdout)); }
}
