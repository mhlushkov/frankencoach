import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function cacheKey(tier: string, system: string, user: string, images: string[] = []): string {
  return createHash('sha256').update(tier + system + user + images.join()).digest('hex');
}

export interface LlmCache {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  clearByPrefix(prefix: string): number;
}

const safe = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, '_');

export function makeCache(dir = 'cache/llm'): LlmCache {
  return {
    get(key) {
      const f = join(dir, `${safe(key)}.json`);
      if (!existsSync(f)) return undefined;
      try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return undefined; }
    },
    set(key, value) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${safe(key)}.json`), JSON.stringify(value));
    },
    clearByPrefix(prefix) {
      if (!existsSync(dir)) return 0;
      const p = safe(prefix);
      let n = 0;
      for (const f of readdirSync(dir)) {
        if (f.startsWith(p) && f.endsWith('.json')) { rmSync(join(dir, f)); n++; }
      }
      return n;
    },
  };
}
