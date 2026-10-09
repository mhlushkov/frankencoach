// Parser for Garmin-style running CSV exports. Compute only.
import type { Session, Series } from '../../contracts/types';
import { parseCsvLoose, toSeconds } from '../series-core';

export class ParseError extends Error {}

const COLUMNS: Record<string, string> = {
 speed_mps: 'speed_mps',
 heart_rate_bpm: 'heart_rate_bpm',
 cadence_spm: 'cadence_rpm',
 altitude_m: 'elevation_m',
 distance_m: 'distance_m',
};

const UNITS: Record<string, string> = {
 speed_mps: 'm/s',
 heart_rate_bpm: 'bpm',
 cadence_rpm: 'rpm',
 elevation_m: 'm',
 distance_m: 'm',
};

export default function parse(raw: string, meta: { filename: string }): Session {
 if (typeof raw !== 'string' || !raw.trim()) throw new Error('ParseError: empty input');
 const { header, rows } = parseCsvLoose(raw);
 if (!header || header.length < 2) throw new Error('ParseError: no header');
 const h = header.map(x => String(x).trim().toLowerCase());
 const ti = h.findIndex(x => x === 'timestamp' || x === 'elapsed_s' || x === 'time' || x === 't');
 if (ti < 0) throw new Error('ParseError: no time column');
 const known = h.filter(x => x in COLUMNS);
 if (!known.length) throw new Error('ParseError: header does not match garmin running format');
 if (!rows || rows.length < 2) throw new Error('ParseError: fewer than 2 data rows');

 const tsIdx = h.indexOf('timestamp');
 const elIdx = h.indexOf('elapsed_s');
 const useIdx = tsIdx >= 0 ? tsIdx : elIdx >= 0 ? elIdx : ti;
 const first = rows[0]![useIdx];
 if (first === undefined) throw new Error('ParseError: missing time value');
 const t0 = toSeconds(first as string | number);
 if (!Number.isFinite(t0)) throw new Error('ParseError: bad time value');

 const series: Record<string, Series> = {};
 h.forEach((name, ci) => {
 const canon = COLUMNS[name];
 if (!canon) return;
 const s: Series = { t: [], v: [], unit: UNITS[canon] };
 let last = -Infinity;
 for (const row of rows) {
 const tv = row[useIdx];
 if (tv === undefined) continue;
 const t = toSeconds(tv as string | number) - t0;
 const v = row[ci];
 if (Number.isFinite(t) && t >= last && typeof v === 'number' && Number.isFinite(v)) {
 s.t.push(t);
 s.v.push(v);
 last = t;
 }
 }
 if (s.v.length) series[canon] = s;
 });
 if (!Object.keys(series).length) throw new Error('ParseError: no numeric series found');

 const durationSec = Math.max(...Object.values(series).map(s => s.t[s.t.length - 1]!));
 const formatSignature = header.map(x => String(x).trim()).sort().join(',');
 return {
 version: 1,
 source: 'garmin-running-csv',
 activityHint: 'running',
 durationSec,
 series,
 meta: { filename: meta?.filename ?? '', formatSignature },
 };
}
