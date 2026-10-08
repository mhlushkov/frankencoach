// Offline forget (no server): same logic as POST /forget — registry.forget + cache.clearByPrefix.
// Usage: bun scripts/forget.ts <name> [<name> ...]   (FC_ROOT overrides the repo root, for tests)
//
// cache/llm note: keys are sha256(tier+system+user+images) (server/agent/cache.ts cacheKey) and growth
// calls are never cached (grow.ts), so no cache file name contains a tool name. clearByPrefix(name)
// is still called to mirror the /forget route, but it normally clears 0 entries.
import { join } from 'node:path';
import { forget, REPO_ROOT } from '../server/agent/registry';
import { makeCache } from '../server/agent/cache';

export interface ForgetOutcome { name: string; found: boolean; cacheCleared: number }

export function forgetTools(names: string[], root = REPO_ROOT): ForgetOutcome[] {
  const cache = makeCache(join(root, 'cache', 'llm'));
  return names.map(name => {
    const found = forget(name, root);
    const cacheCleared = found ? cache.clearByPrefix(name) : 0;
    return { name, found, cacheCleared };
  });
}

if (import.meta.main) {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('usage: bun scripts/forget.ts <name> [<name> ...]');
    process.exit(2);
  }
  const out = forgetTools(names, process.env.FC_ROOT || REPO_ROOT);
  for (const o of out) console.log(o.found ? `forgot: ${o.name}` : `not found: ${o.name}`);
  process.exit(out.every(o => o.found) ? 0 : 1);
}
