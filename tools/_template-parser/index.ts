// TEMPLATE parser (example for the growth prompt). raw text → Session; compute only; no fs/fetch/env.
import type { Session, Series } from '../../contracts/types';
import { parseCsvLoose, toSeconds } from '../series-core';

export class ParseError extends Error {}

/** header name → canonical series name (see contracts/types.ts Session.series). */
export const COLUMNS: Record<string, string> = { depth_m: 'depth_m', depth: 'depth_m', heart_rate_bpm: 'heart_rate_bpm', hr: 'heart_rate_bpm', temp_c: 'temp_c' };

export default function parse(raw: string, meta: { filename: string }): Session {
  const { header, rows } = parseCsvLoose(raw ?? '');
  const ti = header.findIndex(h => /^(time|timestamp|t)$/i.test(h.trim()));
  if (ti < 0 || rows.length < 2) throw new ParseError('expected a CSV with a time column and ≥2 rows');
  const t0 = toSeconds(rows[0]![ti]!);
  const series: Record<string, Series> = {};
  header.forEach((h, ci) => {
    const name = COLUMNS[h.trim().toLowerCase()];
    if (ci === ti || !name) return;
    const s: Series = { t: [], v: [] };
    for (const row of rows) {
      const t = toSeconds(row[ti]!) - t0, v = row[ci];
      if (Number.isFinite(t) && typeof v === 'number') { s.t.push(t); s.v.push(v); }
    }
    if (s.v.length) series[name] = s;
  });
  if (!Object.keys(series).length) throw new ParseError('no known numeric columns');
  const durationSec = Math.max(...Object.values(series).map(s => s.t[s.t.length - 1]!));
  return { version: 1, source: 'template-csv', durationSec, series, meta: { filename: meta?.filename ?? '' } };
}
