import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LogEntry {
  ts: string; sessionId: string; step: string;
  model?: string; inputTokens?: number; outputTokens?: number; usd?: number; ms?: number; data?: unknown;
}

export function appendLog(entry: LogEntry, dir = 'log'): void {
  mkdirSync(dir, { recursive: true });
  const day = (entry.ts || new Date().toISOString()).slice(0, 10);
  appendFileSync(join(dir, `${day}.jsonl`), JSON.stringify(entry) + '\n');
}

/** Latest `limit` entries across all days, oldest first. */
export function readLog(limit = 100, dir = 'log'): LogEntry[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const out: LogEntry[] = [];
  for (let i = files.length - 1; i >= 0 && out.length < limit; i--) {
    const lines = readFileSync(join(dir, files[i]), 'utf8').split('\n').filter(Boolean);
    for (let j = lines.length - 1; j >= 0 && out.length < limit; j--) {
      try { out.push(JSON.parse(lines[j])); } catch {}
    }
  }
  return out.reverse();
}
