// Reuse: canonical activity names, sibling tool for the growth prompt, prompt context, saved $.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolInputType, ToolKind, ToolManifest } from '../../contracts/types';
import { REPO_ROOT, apiSummary, knownActivities, list } from './registry';

type Need = { kind: ToolKind; inputType: ToolInputType };

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

function synonyms(root: string): Record<string, string[]> {
  const p = join(root, 'contracts', 'activities.json');
  if (!existsSync(p)) return {};
  return (JSON.parse(readFileSync(p, 'utf8')) as { canonical?: Record<string, string[]> }).canonical ?? {};
}

/** activities.json + registry → canonical name. Unknown → kebab-cased, how:'new'. */
export function canonicalize(activity: string, root = REPO_ROOT): { canonical: string; how: 'exact' | 'synonym' | 'new' } {
  const a = norm(activity);
  if (knownActivities(root).includes(a)) return { canonical: a, how: 'exact' };
  for (const [canonical, syns] of Object.entries(synonyms(root)))
    if (syns.some(s => norm(s) === a)) return { canonical, how: 'synonym' };
  return { canonical: a, how: 'new' };
}

/** Newest passing tool with same kind+inputType (parsers: any raw:*); never a '*' tool; else _template-<kind>. */
export function pickSibling(need: Need, root = REPO_ROOT): ToolManifest | undefined {
  const same = (t: ToolManifest) => need.kind === 'parser' ? t.inputType.startsWith('raw:') : t.inputType === need.inputType;
  const hit = list(root)
    .filter(t => t.testStatus === 'pass' && t.kind === need.kind && t.activity !== '*' && !t.name.startsWith('_') && same(t))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (hit) return hit;
  const p = join(root, 'tools', `_template-${need.kind}`, 'manifest.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) as ToolManifest : undefined;
}

const read = (p: string) => existsSync(p) ? readFileSync(p, 'utf8') : '';

/** contracts/types.ts + sibling index.ts/index.test.ts + apiSummary of pose-metrics and series-core only. */
export function promptContext(need: Need, root = REPO_ROOT): string {
  const parts = ['## contracts/types.ts', read(join(root, 'contracts', 'types.ts'))];
  const sib = pickSibling(need, root);
  if (sib) {
    const dir = join(root, 'tools', sib.name);
    parts.push(`## Example tool: tools/${sib.name}/index.ts`, read(join(dir, 'index.ts')));
    parts.push(`## Example tool test: tools/${sib.name}/index.test.ts`, read(join(dir, 'index.test.ts')));
  }
  for (const name of ['pose-metrics', 'series-core'])
    parts.push(`## API of ../${name} (import from '../${name}')`, apiSummary(name, root));
  return parts.join('\n\n');
}

/** Real growth price of the reused tool; never the estimate. */
export function savedUsdFor(m: ToolManifest, _pricing: unknown): number {
  return m.costUsd ?? 0;
}
