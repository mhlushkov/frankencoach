// Refreshes the data block of the pitch deck (docs/pitch/index.html) from a tool registry.
// Usage: bun scripts/pitch-learned.ts [registryPath]   (default: this repo's tools/registry.json)
// Commits come from git, tests from `bun test` if it finishes under 60 s; otherwise the previous value is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const DECK = join(ROOT, 'docs', 'pitch', 'index.html');

export interface LearnedRow { name: string; sport: string; bornAt: string; attempts: number; costUsd: number }
export interface DeckData { tools: LearnedRow[]; commits: number; tests: number; generatedAt: string }

interface RegistryLike { tools?: { name: string; activity?: string; createdBy?: string; createdAt?: string; attempts?: number; costUsd?: number }[] }

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Agent-grown tools only (the human-made ones are createdBy "human", activity "*"), oldest first. */
export function learnedRows(registry: RegistryLike): LearnedRow[] {
  return (registry.tools ?? [])
    .filter(t => t.createdBy !== 'human' && t.activity !== '*')
    .map(t => ({ name: t.name, sport: t.activity ?? t.name, bornAt: t.createdAt ?? '', attempts: t.attempts ?? 1, costUsd: round3(t.costUsd ?? 0) }))
    .sort((a, b) => a.bornAt.localeCompare(b.bornAt));
}

export const totalCost = (rows: LearnedRow[]) => round3(rows.reduce((s, r) => s + r.costUsd, 0));

const BLOCK = /(<script id="learned" type="application\/json">)[\s\S]*?(<\/script>)/;

export function readBlock(html: string): Partial<DeckData> {
  const m = BLOCK.exec(html);
  try { return m ? JSON.parse(html.slice(m.index + m[1].length, m.index + m[0].length - m[2].length)) : {}; } catch { return {}; }
}

export function replaceBlock(html: string, data: DeckData): string {
  if (!BLOCK.test(html)) throw new Error('no <script id="learned"> block in the deck');
  return html.replace(BLOCK, (_, open, close) => `${open}\n${JSON.stringify(data, null, 2)}\n${close}`);
}

/** Pass count from a `bun test` summary, or null if anything failed or there is no summary. */
export function testsFromOutput(out: string): number | null {
  const pass = /(\d+) pass/.exec(out), fail = /(\d+) fail/.exec(out);
  if (!pass || !/Ran \d+ tests?/.test(out) || (fail && +fail[1] > 0)) return null;
  return +pass[1];
}

function countCommits(): number | null {
  const r = Bun.spawnSync(['git', 'rev-list', '--count', 'origin/main', '--since=2026-10-08 20:00'], { cwd: ROOT });
  const n = parseInt(r.stdout.toString().trim(), 10);
  return r.exitCode === 0 && Number.isFinite(n) ? n : null;
}

function countTests(): number | null {
  const r = Bun.spawnSync(['bun', 'test'], { cwd: ROOT, timeout: 60_000 });
  return r.exitCode === 0 ? testsFromOutput(r.stdout.toString() + r.stderr.toString()) : null;
}

if (import.meta.main) {
  const registryPath = process.argv[2] ?? join(ROOT, 'tools', 'registry.json');
  const rows = learnedRows(JSON.parse(readFileSync(registryPath, 'utf8')));
  const html = readFileSync(DECK, 'utf8');
  const prev = readBlock(html);
  const data: DeckData = {
    tools: rows,
    commits: countCommits() ?? prev.commits ?? 0,
    tests: countTests() ?? prev.tests ?? 0,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(DECK, replaceBlock(html, data));
  console.log(`deck: ${rows.length} learned (${rows.map(r => r.sport).join(', ')}), $${totalCost(rows)}, ${data.commits} commits, ${data.tests} tests`);
}
