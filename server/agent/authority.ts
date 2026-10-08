// Authority wall: static checks every grown tool must pass before install.
// Deliberately conservative — over-blocking (false refusals) is acceptable; under-blocking is not.
import { z } from 'zod';
import authorityJson from '../../contracts/authority.json';
import type { ToolManifest } from '../../contracts/types';

export type Authority = typeof authorityJson;
export interface Check { pass: boolean; errors: string[] }

export function loadAuthority(): Authority {
  return authorityJson;
}

const NAME_RE = /^(_template-)?[a-z0-9]+(-[a-z0-9]+)*$/;

const ToolManifestSchema = z.object({
  name: z.string(),
  kind: z.enum(['parser', 'analyzer']),
  activity: z.string().min(1),
  inputType: z.union([z.literal('landmarks'), z.literal('session'), z.string().regex(/^raw:[a-z0-9-]+$/)]),
  outputType: z.enum(['session', 'result']),
  description: z.string(),
  permissions: z.array(z.string()),
  createdBy: z.enum(['human', 'agent']),
  createdAt: z.string(),
  model: z.string().optional(),
  costUsd: z.number().optional(),
  attempts: z.number().optional(),
  basedOn: z.array(z.string()).optional(),
  uses: z.number(),
  testStatus: z.enum(['pass', 'fail']),
});

const result = (errors: string[]): Check => ({ pass: errors.length === 0, errors });

export function checkManifest(m: unknown, auth: Authority = loadAuthority()): Check {
  const parsed = ToolManifestSchema.safeParse(m);
  if (!parsed.success) return result(parsed.error.issues.map(i => `manifest.${i.path.join('.')}: ${i.message}`));
  const errors: string[] = [];
  const mf = parsed.data;
  for (const p of mf.permissions)
    if (!auth.allowedPermissions.includes(p)) errors.push(`permission '${p}' not allowed`);
  if (mf.name.includes('..') || mf.name.includes('/') || mf.name.includes('\\')) errors.push(`name '${mf.name}' contains a path`);
  else if (!NAME_RE.test(mf.name)) errors.push(`name '${mf.name}' is not kebab-case`);
  return result(errors);
}

// Not in authority.json but equally dangerous; scanned in addition to forbiddenSourceTokens.
const EXTRA_TOKENS = ['require(', 'globalThis[', 'Bun.$', 'WebSocket', 'XMLHttpRequest'];

const IMPORT_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,       // import x from '…' / export … from '…'
  /\bimport\s*['"]([^'"]+)['"]/g,     // side-effect import '…'
];

function importAllowed(spec: string, registryNames: string[]): boolean {
  if (spec === 'bun:test' || spec === '../../contracts/types') return true;
  if (spec.startsWith('../../data/')) return !spec.slice('../../data/'.length).split('/').includes('..');
  if (spec.startsWith('./')) return !spec.split('/').includes('..');   // own folder, e.g. './index'
  const m = /^\.\.\/([^/]+)(\/.*)?$/.exec(spec);
  if (!m) return false;
  if (m[2] && m[2].split('/').includes('..')) return false;
  return registryNames.includes(m[1]!) || m[1]!.startsWith('_template-');
}

export function scanSource(code: string, registryNames: string[], auth: Authority = loadAuthority()): Check {
  const errors: string[] = [];
  for (const tok of [...auth.forbiddenSourceTokens, ...EXTRA_TOKENS])
    if (code.includes(tok)) errors.push(`forbidden token '${tok}'`);
  for (const re of IMPORT_RES)
    for (const m of code.matchAll(re))
      if (!importAllowed(m[1]!, registryNames)) errors.push(`import '${m[1]}' not allowed`);
  return result(errors);
}

export function checkPath(target: string, name: string): Check {
  const norm = target.replace(/\\/g, '/');
  const prefix = `tools/${name}/`;
  if (norm.split('/').includes('..')) return result([`path '${target}' contains '..'`]);
  if (!norm.startsWith(prefix) || norm.length === prefix.length) return result([`path '${target}' outside ${prefix}`]);
  return result([]);
}

// Narrow on purpose: "no knee pain today" must pass; readiness/clearance/diagnosis and rule-bending must not.
const INTENT_RE =
  /am i ready|clear me|готов(ий|а) до|допуск|diagnos|діагноз|ignore (the )?rules|change (your )?(rules|authority)|дай собі|grant yourself/i;

export function checkIntent(message: string): { allowed: boolean; reason?: string } {
  const m = INTENT_RE.exec(message);
  return m ? { allowed: false, reason: `refused: '${m[0]}'` } : { allowed: true };
}

export function checkAll(args: {
  manifest: unknown; files: Record<string, string>; name: string; registryNames: string[];
}): Check {
  const auth = loadAuthority();
  const errors = [...checkManifest(args.manifest, auth).errors];
  const mName = (args.manifest as Partial<ToolManifest> | null)?.name;
  if (mName !== args.name) errors.push(`manifest.name '${mName}' != '${args.name}'`);
  for (const [file, code] of Object.entries(args.files)) {
    errors.push(...checkPath(`tools/${args.name}/${file}`, args.name).errors);
    if (/\.(ts|js|mjs|tsx)$/.test(file))
      errors.push(...scanSource(code, args.registryNames, auth).errors.map(e => `${file}: ${e}`));
  }
  return result(errors);
}
