import type { Series, Session, ToolResult } from '../../contracts/types';

// Built-in, human-written time-series helpers. Agent-grown parsers/analyzers import these
// instead of re-implementing CSV parsing or basic statistics.

export type Segment = { kind: 'rising' | 'falling' | 'flat'; t0: number; t1: number };
export type Peak = { i: number; t: number; v: number; prominence: number };
export type Cell = string | number;

function clean(s: Series | null | undefined): Series {
  if (!s || !Array.isArray(s.t) || !Array.isArray(s.v)) return { t: [], v: [] };
  const n = Math.min(s.t.length, s.v.length);
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(s.t[i]) && Number.isFinite(s.v[i])) { t.push(s.t[i]!); v.push(s.v[i]!); }
  }
  return { t, v, unit: s.unit };
}

/** Linear interpolation onto a uniform grid of `hz` samples per second. */
export function resample(series: Series, hz: number): Series {
  const s = clean(series);
  if (s.t.length === 0 || !(hz > 0)) return { t: [], v: [], unit: s.unit };
  const t0 = s.t[0]!;
  const t1 = s.t[s.t.length - 1]!;
  const n = Math.floor((t1 - t0) * hz + 1e-9) + 1;
  const t: number[] = [];
  const v: number[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const tk = +(t0 + k / hz).toFixed(9);
    while (j < s.t.length - 2 && s.t[j + 1]! < tk) j++;
    const ta = s.t[j]!, tb = s.t[Math.min(j + 1, s.t.length - 1)]!;
    const va = s.v[j]!, vb = s.v[Math.min(j + 1, s.v.length - 1)]!;
    t.push(tk);
    v.push(tb === ta ? va : va + ((vb - va) * (tk - ta)) / (tb - ta));
  }
  return { t, v, unit: s.unit };
}

export function minMaxMean(series: Series | number[]): { min: number; max: number; mean: number } {
  const v = Array.isArray(series) ? series.filter(Number.isFinite) : clean(series).v;
  if (v.length === 0) return { min: NaN, max: NaN, mean: NaN };
  let min = Infinity, max = -Infinity, sum = 0;
  for (const x of v) { if (x < min) min = x; if (x > max) max = x; sum += x; }
  return { min, max, mean: sum / v.length };
}

/** Least-squares slope (units per second) of samples with t0 <= t <= t1. */
export function slope(series: Series, t0: number, t1: number): number {
  const s = clean(series);
  const xs: number[] = [], ys: number[] = [];
  s.t.forEach((t, i) => { if (t >= t0 && t <= t1) { xs.push(t); ys.push(s.v[i]!); } });
  if (xs.length < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i]! - my); den += (x - mx) ** 2; });
  return den === 0 ? NaN : num / den;
}

/** Local maxima whose prominence >= minProminence. */
export function peaks(series: Series, minProminence: number): Peak[] {
  const { t, v } = clean(series);
  const out: Peak[] = [];
  for (let i = 1; i < v.length - 1; i++) {
    if (!(v[i]! > v[i - 1]! && v[i]! >= v[i + 1]!)) continue;
    let leftMin = v[i]!;
    for (let j = i - 1; j >= 0 && v[j]! <= v[i]!; j--) leftMin = Math.min(leftMin, v[j]!);
    let rightMin = v[i]!;
    for (let j = i + 1; j < v.length && v[j]! <= v[i]!; j++) rightMin = Math.min(rightMin, v[j]!);
    const prominence = v[i]! - Math.max(leftMin, rightMin);
    if (prominence >= minProminence) out.push({ i, t: t[i]!, v: v[i]!, prominence });
  }
  return out;
}

/** Split into rising/falling/flat segments by per-interval rate vs eps (units/s). Dive: descent/bottom/ascent. */
export function phases(series: Series, eps: number): Segment[] {
  const { t, v } = clean(series);
  const segs: Segment[] = [];
  for (let i = 0; i < t.length - 1; i++) {
    const dt = t[i + 1]! - t[i]!;
    if (dt <= 0) continue;
    const rate = (v[i + 1]! - v[i]!) / dt;
    const kind: Segment['kind'] = rate > eps ? 'rising' : rate < -eps ? 'falling' : 'flat';
    const last = segs[segs.length - 1];
    if (last && last.kind === kind) last.t1 = t[i + 1]!;
    else segs.push({ kind, t0: t[i]!, t1: t[i + 1]! });
  }
  // absorb one-interval blips sandwiched between segments of the same kind
  for (let i = 1; i < segs.length - 1; i++) {
    const a = segs[i - 1]!, b = segs[i]!, c = segs[i + 1]!;
    if (a.kind === c.kind && b.t1 - b.t0 < Math.min(a.t1 - a.t0, c.t1 - c.t0) / 4) {
      a.t1 = c.t1;
      segs.splice(i, 2);
      i--;
    }
  }
  return segs;
}

export function durationSec(x: Series | Session): number {
  if (!x) return 0;
  if ('series' in x) {
    let lo = Infinity, hi = -Infinity;
    for (const s of Object.values(x.series ?? {})) {
      const c = clean(s);
      if (c.t.length) { lo = Math.min(lo, c.t[0]!); hi = Math.max(hi, c.t[c.t.length - 1]!); }
    }
    return hi > lo ? hi - lo : 0;
  }
  const c = clean(x);
  return c.t.length ? c.t[c.t.length - 1]! - c.t[0]! : 0;
}

/** Seconds spent in each zone; edges ascending, result length = edges.length + 1. Interval counted by its start value. */
export function zones(series: Series, edges: number[]): number[] {
  const { t, v } = clean(series);
  const out = new Array(edges.length + 1).fill(0) as number[];
  for (let i = 0; i < t.length - 1; i++) {
    let z = 0;
    while (z < edges.length && v[i]! >= edges[z]!) z++;
    out[z]! += t[i + 1]! - t[i]!;
  }
  return out;
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function toCell(s: string): Cell {
  if (s !== '' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Tolerant CSV: BOM, \r\n, , ; or tab, quoted fields, numeric cells → number. Never throws; the gate decides garbage. */
export function parseCsvLoose(text: string): { header: string[]; rows: Cell[][] } {
  if (typeof text !== 'string') return { header: [], rows: [] };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };
  const first = lines[0]!;
  const delim = [',', ';', '\t'].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
  const header = splitLine(first, delim);
  const rows = lines.slice(1).map((l) => splitLine(l, delim).map(toCell));
  return { header, rows };
}

/** ISO date → epoch s; 'mm:ss' / 'hh:mm:ss' → s; numeric (ms epoch auto-detected) → s. Unparseable → NaN. */
export function toSeconds(x: string | number): number {
  if (typeof x === 'number') return x > 1e11 ? x / 1000 : x;
  if (typeof x !== 'string') return NaN;
  const s = x.trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return toSeconds(Number(s));
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) return s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? NaN : ms / 1000;
  }
  return NaN;
}

/** Generic fallback analyzer: min/max/mean per series. */
export default function analyze(s: Session): ToolResult {
  if (!s || typeof s !== 'object' || !s.series || typeof s.series !== 'object') {
    return { metrics: { seriesCount: 0, durationSec: 0 }, usable: false, warnings: ['no session'] };
  }
  const metrics: ToolResult['metrics'] = {};
  const series: Record<string, Series> = {};
  for (const [name, raw] of Object.entries(s.series)) {
    const c = clean(raw);
    if (c.v.length === 0) continue;
    const m = minMaxMean(c);
    metrics[`${name}_min`] = m.min;
    metrics[`${name}_max`] = m.max;
    metrics[`${name}_mean`] = +m.mean.toFixed(4);
    series[name] = c;
  }
  const seriesCount = Object.keys(series).length;
  const dur = durationSec(s);
  metrics.seriesCount = seriesCount;
  metrics.durationSec = dur;
  const usable = seriesCount > 0 && dur > 5;
  return { metrics, series, usable, ...(usable ? {} : { warnings: ['no usable series (need ≥1 series longer than 5 s)'] }) };
}
