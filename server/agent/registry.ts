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

const DECL_CAP = 12;
const SUMMARY_CAP = 120;
const TYPE_DECL = /^(export\s+)?(declare\s+)?(type|interface|enum|const\s+enum)\s+([A-Za-z_$][\w$]*)/;
const TYPE_LITERAL_BEFORE = new Set([':', '=', '|', '&', '<', ',', '(', '[', '?']);

/** A new top-level statement (or nothing) follows: a declaration that is balanced here is over. */
const topLevelNext = (next: string | undefined) => next === undefined || next.trim() === '' || /^[A-Za-z_$@/]/.test(next);

/**
 * Index of the last line of the top-level declaration starting at `start`. Tracks () and {} depth; strings and
 * comments are not parsed (no header in tools/ has them). type/interface/enum: until the braces close (or `;`).
 * function/const/let/class: the header up to the body opener — the first `{` at depth 0 not preceded by
 * `: = | & < , ( [ ?` — or, for `= {` values, until the value closes; a line ending in `;` at depth 0 also ends it.
 */
function declEnd(lines: string[], start: number): number {
  const isType = TYPE_DECL.test(lines[start]!);
  let paren = 0, brace = 0, braced = false, value = false, prev = '';
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (ch === '{') {
        if (!isType && paren === 0 && brace === 0) {
          if (prev === '=') value = true;
          else if (!TYPE_LITERAL_BEFORE.has(prev)) return i;
        }
        brace++; braced = true;
      } else if (ch === '}') brace--;
      if (ch.trim()) prev = ch;
    }
    if (paren > 0 || brace > 0) continue;
    if (line.trimEnd().endsWith(';') || ((isType || value) && braced) || topLevelNext(lines[i + 1])) return i;
  }
  return lines.length - 1;
}

const capDecl = (d: string[]) => (d.length > DECL_CAP ? [...d.slice(0, DECL_CAP - 1), '// …'] : d);

/**
 * Exported declarations of tools/<name>/index.ts for the growth prompt: whole function/const headers (multi-line
 * signatures and their return-type literals), whole interfaces/types/enums, then every non-exported top-level
 * type/interface whose name an emitted line mentions (one hop). ≤ 12 lines per declaration, ≤ 120 in total.
 */
export function apiSummary(name: string, root = REPO_ROOT): string {
  const p = join(root, 'tools', name, 'index.ts');
  if (!/^_?[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || !existsSync(p)) return '';
  const lines = readFileSync(p, 'utf8').split(/\r?\n/);
  const exported: string[] = [];
  const hidden: { name: string; decl: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const m = TYPE_DECL.exec(l);
    if (!l.startsWith('export ') && !(m && !m[1])) continue;
    const end = declEnd(lines, i);
    const decl = capDecl(lines.slice(i, end + 1));
    if (l.startsWith('export ')) exported.push(...decl); else hidden.push({ name: m![4]!, decl });
    i = end;
  }
  const shown = exported.join('\n');
  const refs = hidden.filter(h => new RegExp(`(?<![\\w$])${h.name.replace(/\$/g, '\\$')}(?![\\w$])`).test(shown))
    .flatMap(h => ['// not exported, shown for reference', ...h.decl]);
  return [...exported, ...refs].slice(0, SUMMARY_CAP).join('\n');
}
