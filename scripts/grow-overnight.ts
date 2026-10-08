// Overnight growth: every data/landmarks/*.json and data/samples/* → POST /analyze with confirmGrow:true, one at a time.
// Usage: bun scripts/grow-overnight.ts   (FC_URL default http://localhost:3000; FC_HINTS = JSON file {filename: sport})
// It only reads the stream; the server's per-session budget decides what gets grown.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { AgentEvent, AnalyzeRequest, Landmarks } from '../contracts/types';
import { parseSse } from '../web/src/core/api/sse';

export const MAX_BYTES = 5 * 1024 * 1024;
const ROOT = join(import.meta.dir, '..');

export interface InputFile { path: string; name: string; kind: 'landmarks' | 'table' }

/** data/landmarks/*.json (landmarks) + data/samples/* (tables); skips dotfiles and anything over 5 MB. Sorted by name. */
export function discoverFiles(root = ROOT): InputFile[] {
  const out: InputFile[] = [];
  const scan = (dir: string, kind: InputFile['kind'], ok: (f: string) => boolean) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (f.startsWith('.') || !ok(f) || !statSync(p).isFile() || statSync(p).size > MAX_BYTES) continue;
      out.push({ path: p, name: f, kind });
    }
  };
  scan(join(root, 'data', 'landmarks'), 'landmarks', f => f.endsWith('.json'));
  scan(join(root, 'data', 'samples'), 'table', () => true);
  return out;
}

const MIME: Record<string, string> = {
  '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.gpx': 'application/gpx+xml', '.tcx': 'application/vnd.garmin.tcx+xml',
  '.fit': 'application/octet-stream', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain',
};
export const mimeFor = (name: string) => MIME[extname(name).toLowerCase()] ?? 'text/plain';

export function buildRequest(file: InputFile, text: string, opts: { hint?: string; now?: number } = {}): AnalyzeRequest {
  const input: AnalyzeRequest['input'] = file.kind === 'landmarks'
    ? { kind: 'landmarks', landmarks: JSON.parse(text) as Landmarks }
    : { kind: 'file', filename: file.name, mime: mimeFor(file.name), text };
  return {
    sessionId: `overnight-${file.name}-${opts.now ?? Date.now()}`,
    message: 'Analyze my technique',
    ...(opts.hint ? { sportHint: opts.hint } : {}),
    input,
    confirmGrow: true,
  };
}

export type Outcome =
  | { kind: 'reused'; how: string }
  | { kind: 'grown'; attempts: number; usd: number }
  | { kind: 'rejected'; reason: string }
  | { kind: 'refused' }
  | { kind: 'error'; msg: string }
  | { kind: 'none' };

export interface FileReport { file: string; activity: string; outcome: Outcome; totalUsd: number; grown: string[] }

/** Fold one request's events into a report. Error/rejected/refused win; then growth; then the last reuse. */
export function summarize(file: string, events: AgentEvent[]): FileReport {
  let activity = '-'; let totalUsd = 0; let growUsd = 0; let attempts = 0;
  let reused: string | undefined; let stop: Outcome | undefined;
  const grown: string[] = [];
  for (const e of events) {
    if (e.type === 'identified') activity = e.activity;
    else if (e.type === 'rejected') stop ??= { kind: 'rejected', reason: e.reason };
    else if (e.type === 'refused') stop ??= { kind: 'refused' };
    else if (e.type === 'error') stop ??= { kind: 'error', msg: e.text };
    else if (e.type === 'reused') reused = e.how === 'exact' ? 'exact' : e.how === 'synonym' ? 'sibling' : e.how;
    else if (e.type === 'tool_installed') { grown.push(e.manifest.name); attempts += e.manifest.attempts ?? 1; }
    else if (e.type === 'cost') { if (e.step === 'total') totalUsd = e.usd; else if (e.step === 'grow') growUsd += e.usd; }
  }
  if (totalUsd === 0) totalUsd = events.reduce((s, e) => s + (e.type === 'cost' && e.step !== 'total' ? e.usd : 0), 0);
  const outcome: Outcome = stop ?? (grown.length ? { kind: 'grown', attempts, usd: growUsd } : reused ? { kind: 'reused', how: reused } : { kind: 'none' });
  return { file, activity, outcome, totalUsd, grown };
}

const usd = (n: number) => `$${n.toFixed(4)}`;

export function formatOutcome(o: Outcome): string {
  switch (o.kind) {
    case 'reused': return `reused ${o.how}`;
    case 'grown': return `grown attempts=${o.attempts} ${usd(o.usd)}`;
    case 'rejected': return `rejected ${o.reason}`;
    case 'refused': return 'refused';
    case 'error': return `error ${o.msg}`;
    case 'none': return 'no tool used';
  }
}

export const formatLine = (r: FileReport) => `${r.file}  ${r.activity}  ${formatOutcome(r.outcome)}  ${usd(r.totalUsd)}`;

export function formatSummary(reports: FileReport[]): string {
  const rows = [['file', 'activity', 'outcome', 'usd'], ...reports.map(r => [r.file, r.activity, formatOutcome(r.outcome), usd(r.totalUsd)])];
  const w = rows[0]!.map((_, i) => Math.max(...rows.map(r => r[i]!.length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(w[i]!)).join('  ').trimEnd();
  const total = reports.reduce((s, r) => s + r.totalUsd, 0);
  const grown = reports.flatMap(r => r.grown);
  return [line(rows[0]!), w.map(n => '-'.repeat(n)).join('  '), ...rows.slice(1).map(line), '',
    `files: ${reports.length}  grown: ${grown.length}${grown.length ? ` (${grown.join(', ')})` : ''}  total: ${usd(total)}`].join('\n');
}

export async function runOne(baseUrl: string, req: AnalyzeRequest, fetchFn: typeof fetch = fetch): Promise<AgentEvent[]> {
  const res = await fetchFn(`${baseUrl.replace(/\/$/, '')}/analyze`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    return [{ type: 'error', text: `HTTP ${res.status} ${body.slice(0, 200)}`.trim() }];
  }
  const events: AgentEvent[] = [];
  for await (const e of parseSse(res.body)) events.push(e);
  return events;
}

export function loadHints(path: string | undefined): Record<string, string> {
  if (!path) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
}

export async function growOvernight(opts: { root?: string; baseUrl?: string; hints?: Record<string, string>; fetchFn?: typeof fetch; log?: (s: string) => void } = {}): Promise<FileReport[]> {
  const log = opts.log ?? console.log;
  const reports: FileReport[] = [];
  for (const f of discoverFiles(opts.root)) {   // sequential on purpose: one growth at a time
    let report: FileReport;
    try {
      const req = buildRequest(f, readFileSync(f.path, 'utf8'), { hint: opts.hints?.[f.name] });
      report = summarize(f.name, await runOne(opts.baseUrl ?? 'http://localhost:3000', req, opts.fetchFn));
    } catch (e) {
      report = { file: f.name, activity: '-', outcome: { kind: 'error', msg: (e as Error).message }, totalUsd: 0, grown: [] };
    }
    reports.push(report);
    log(formatLine(report));
  }
  return reports;
}

if (import.meta.main) {
  const baseUrl = process.env.FC_URL || 'http://localhost:3000';
  const hints = loadHints(process.env.FC_HINTS);
  console.log(`grow-overnight → ${baseUrl}${process.env.FC_HINTS ? `  hints: ${basename(process.env.FC_HINTS)}` : ''}`);
  const reports = await growOvernight({ baseUrl, hints });
  console.log('\n' + formatSummary(reports));
}
