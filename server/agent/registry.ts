// Tool registry: tools/registry.json is the source of truth for find/reuse; tools/<name>/manifest.json mirrors it on disk.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ToolInputType, ToolKind, ToolManifest } from '../../contracts/types';

export const REPO_ROOT = join(import.meta.dir, '..', '..');

export interface Registry { version: 1; tools: ToolManifest[] }

const ManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'name must be kebab-case'),
  kind: z.enum(['parser', 'analyzer']),
  activity: z.string().min(1),
  inputType: z.string().regex(/^(landmarks|session|raw:[a-z0-9-]+)$/),
  outputType: z.enum(['session', 'result']),
  description: z.string(),
  permissions: z.array(z.literal('compute')),
  createdBy: z.enum(['human', 'agent']),
  createdAt: z.string(),
  model: z.string().optional(),
  costUsd: z.number().optional(),
  attempts: z.number().optional(),
  basedOn: z.array(z.string()).optional(),
  uses: z.number(),
  testStatus: z.enum(['pass', 'fail']),
});

const regPath = (root: string) => join(root, 'tools', 'registry.json');

export function readRegistry(root = REPO_ROOT): Registry {
  const p = regPath(root);
  if (!existsSync(p)) return { version: 1, tools: [] };
  const r = JSON.parse(readFileSync(p, 'utf8')) as Partial<Registry>;
  return { version: 1, tools: Array.isArray(r.tools) ? r.tools : [] };
}

function writeRegistry(r: Registry, root: string): void {
  mkdirSync(join(root, 'tools'), { recursive: true });
  writeFileSync(regPath(root), JSON.stringify(r, null, 2) + '\n');
}

function update(name: string, root: string, fn: (t: ToolManifest) => void): void {
  const r = readRegistry(root);
  const t = r.tools.find(x => x.name === name);
  if (!t) return;
  fn(t);
  writeRegistry(r, root);
}

export function list(root = REPO_ROOT): ToolManifest[] {
  return readRegistry(root).tools;
}

/** EXACT activity match (parsers: exact `raw:<formatId>`); never returns an activity:'*' tool. Newest wins. */
export function find(q: { kind: ToolKind; inputType: ToolInputType; activity: string }, root = REPO_ROOT): ToolManifest | undefined {
  const hits = list(root).filter(t =>
    t.testStatus === 'pass' && t.kind === q.kind && t.inputType === q.inputType && t.activity !== '*' &&
    (q.kind === 'parser' || t.activity === q.activity));
  return hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** The generic activity:'*' tool (pose-metrics / series-core); used only when growth was rejected or failed. */
export function findFallback(q: { kind: ToolKind; inputType: ToolInputType }, root = REPO_ROOT): ToolManifest | undefined {
  return list(root).find(t => t.testStatus === 'pass' && t.kind === q.kind && t.inputType === q.inputType && t.activity === '*');
}

/** Validate and upsert by name. */
export function install(m: ToolManifest, root = REPO_ROOT): ToolManifest {
  const parsed = ManifestSchema.parse(m) as ToolManifest;
  const r = readRegistry(root);
  const i = r.tools.findIndex(t => t.name === parsed.name);
  if (i >= 0) r.tools[i] = parsed; else r.tools.push(parsed);
  writeRegistry(r, root);
  return parsed;
}

/** Move tools/<name> → tools/.forgotten/<name>-<ts> and drop it from the registry. */
export function forget(name: string, root = REPO_ROOT): boolean {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return false;
  const r = readRegistry(root);
  const inReg = r.tools.some(t => t.name === name);
  const dir = join(root, 'tools', name);
  const onDisk = existsSync(dir);
  if (!inReg && !onDisk) return false;
  if (onDisk) {
    const dest = join(root, 'tools', '.forgotten');
    mkdirSync(dest, { recursive: true });
    renameSync(dir, join(dest, `${name}-${Date.now()}`));
  }
  if (inReg) writeRegistry({ version: 1, tools: r.tools.filter(t => t.name !== name) }, root);
  return true;
}

export function bumpUses(name: string, root = REPO_ROOT): void {
  update(name, root, t => { t.uses = (t.uses ?? 0) + 1; });
}

export function setAttempts(name: string, n: number, root = REPO_ROOT): void {
  update(name, root, t => { t.attempts = n; });
}

/** On startup: every tools/<name>/manifest.json with testStatus=pass → upsert. Ignores '_' and '.' folders. Keeps registry `uses`. */
export function syncFromDisk(root = REPO_ROOT): number {
  const toolsDir = join(root, 'tools');
  if (!existsSync(toolsDir)) return 0;
  const r = readRegistry(root);
  let n = 0;
  for (const e of readdirSync(toolsDir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const p = join(toolsDir, e.name, 'manifest.json');
    if (!existsSync(p)) continue;
    let m: ToolManifest;
    try {
      m = ManifestSchema.parse(JSON.parse(readFileSync(p, 'utf8'))) as ToolManifest;
    } catch { continue; }
    if (m.testStatus !== 'pass' || m.name !== e.name) continue;
    const i = r.tools.findIndex(t => t.name === m.name);
    if (i >= 0) r.tools[i] = { ...m, uses: Math.max(m.uses, r.tools[i]!.uses ?? 0) }; else r.tools.push(m);
    n++;
  }
  writeRegistry(r, root);
  return n;
}

/** Unique activities from registry ∪ contracts/activities.json (no '*'). */
export function knownActivities(root = REPO_ROOT): string[] {
  const set = new Set<string>();
  const p = join(root, 'contracts', 'activities.json');
  if (existsSync(p)) {
    const a = JSON.parse(readFileSync(p, 'utf8')) as { canonical?: Record<string, string[]> };
    for (const k of Object.keys(a.canonical ?? {})) set.add(k);
  }
  for (const t of list(root)) if (t.activity !== '*') set.add(t.activity);
  return [...set];
}

/** `export` lines of tools/<name>/index.ts (≤ 60) — for the growth prompt. */
export function apiSummary(name: string, root = REPO_ROOT): string {
  const p = join(root, 'tools', name, 'index.ts');
  if (!/^_?[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || !existsSync(p)) return '';
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.startsWith('export ')).slice(0, 60).join('\n');
}
