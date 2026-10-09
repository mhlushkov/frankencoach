// Refreshes the "Learned overnight" table in README.md from a tool registry.
// Usage: bun scripts/readme-learned.ts [registryPath]   (default: this repo's tools/registry.json)
// Rewrites only the text between <!-- learned:start --> and <!-- learned:end -->.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { learnedRows, totalCost, type LearnedRow } from './pitch-learned';

const ROOT = join(import.meta.dir, '..');
const README = join(ROOT, 'README.md');
const START = '<!-- learned:start -->';
const END = '<!-- learned:end -->';

const prague = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

/** Markdown table (sport, born HH:MM Prague, attempts, cost) plus the footer line. Rows keep their order (learnedRows sorts by birth). */
export function renderLearned(rows: LearnedRow[], generatedAt: Date): string {
  const lines = ['| sport | born (Prague) | attempts | cost |', '|---|---|---|---|'];
  if (rows.length === 0) lines.push('| none yet | | | |');
  for (const r of rows) lines.push(`| ${r.sport} | ${r.bornAt ? prague(new Date(r.bornAt)) : '?'} | ${r.attempts} | $${r.costUsd} |`);
  lines.push('', `human-made: 2 · agent-made: ${rows.length} · learning cost: $${totalCost(rows)} · generated at ${prague(generatedAt)} Prague`);
  return lines.join('\n');
}

/** Replaces everything between the two markers with `block`. Throws if a marker is missing. */
export function replaceLearned(readme: string, block: string): string {
  const s = readme.indexOf(START), e = readme.indexOf(END);
  if (s < 0) throw new Error(`README.md has no ${START} marker`);
  if (e < 0 || e < s) throw new Error(`README.md has no ${END} marker after ${START}`);
  return `${readme.slice(0, s + START.length)}\n${block}\n${readme.slice(e)}`;
}

if (import.meta.main) {
  const registryPath = process.argv[2] ?? join(ROOT, 'tools', 'registry.json');
  const rows = learnedRows(JSON.parse(readFileSync(registryPath, 'utf8')));
  writeFileSync(README, replaceLearned(readFileSync(README, 'utf8'), renderLearned(rows, new Date())));
  console.log(`README: ${rows.length} learned (${rows.map(r => r.sport).join(', ')}), $${totalCost(rows)}`);
}
