import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Series, Session } from '../../contracts/types';
import analyze, {
  durationSec, minMaxMean, parseCsvLoose, peaks, phases, resample, slope, toSeconds, zones,
} from './index';

// Committed A1 fixtures: data/synthetic/fixtures/*.csv + expected.json.
const FIX = join(import.meta.dir, '../../data/synthetic/fixtures');
const expected = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8'));
const csv = (name: string) => readFileSync(join(FIX, name), 'utf8');
const diveCsv = () => csv(expected.dive.file);

// depth_m from dive-garmin-like.csv as seconds-from-start (V-profile: 0 → 25 m → 0, 90 s).
function vProfile(): Series {
  const { header, rows } = parseCsvLoose(diveCsv());
  const ti = header.indexOf('timestamp');
  const di = header.indexOf('depth_m');
  const t0 = toSeconds(rows[0]![ti]!);
  return { t: rows.map((r) => toSeconds(r[ti]!) - t0), v: rows.map((r) => r[di] as number), unit: 'm' };
}

describe('series-core', () => {
  test('phases(V-profile depth) = 3 segments rising/flat/falling', () => {
    const p = phases(vProfile(), 0.1);
    expect(p.map((x) => x.kind)).toEqual(['rising', 'flat', 'falling']);
    expect(p[0]!.t0).toBe(0);
    expect(p[2]!.t1).toBe(expected.dive.totalSec);
  });

  test('slope of descent ≈ expected descentRateMps', () => {
    expect(slope(vProfile(), 0, 27)).toBeCloseTo(expected.dive.descentRateMps, 2);
  });

  test('parseCsvLoose on dive-garmin-like CSV', () => {
    const r = parseCsvLoose(diveCsv());
    expect(r.header).toEqual(['timestamp', 'depth_m', 'heart_rate_bpm', 'temp_c']);
    expect(r.rows.length).toBe(expected.dive.totalSec + 1);
    expect(typeof r.rows[0]![0]).toBe('string');
    expect(typeof r.rows[0]![1]).toBe('number');
  });

  test('parseCsvLoose on shopping-list.csv returns rows, does not throw', () => {
    const r = parseCsvLoose(csv('shopping-list.csv'));
    expect(r.header).toEqual(['item', 'qty']);
    expect(r.rows.slice(0, 2)).toEqual([['milk', 2], ['bread', 1]]);
    // quoted field with a delimiter inside (not covered by the fixture)
    expect(parseCsvLoose('item,qty\n"eggs, large",12\n').rows).toEqual([['eggs, large', 12]]);
  });

  test('parseCsvLoose on empty / semicolon input', () => {
    expect(parseCsvLoose(csv('empty.csv'))).toEqual({ header: [], rows: [] });
    expect(parseCsvLoose('')).toEqual({ header: [], rows: [] });
    expect(parseCsvLoose('a;b\n1;2').rows).toEqual([[1, 2]]);
  });

  test('toSeconds: mm:ss, hh:mm:ss, ISO, epoch, numeric', () => {
    expect(toSeconds('01:30')).toBe(90);
    expect(toSeconds('1:00:05')).toBe(3605);
    expect(toSeconds('2026-10-08T10:00:10Z') - toSeconds('2026-10-08T10:00:00Z')).toBe(10);
    expect(toSeconds(1_760_000_000_000)).toBe(1_760_000_000);
    expect(toSeconds('12.5')).toBe(12.5);
    expect(Number.isNaN(toSeconds('milk'))).toBe(true);
  });

  test('resample, minMaxMean, durationSec, zones, peaks', () => {
    const s: Series = { t: [0, 2, 4], v: [0, 2, 0] };
    const r = resample(s, 1);
    expect(r.t).toEqual([0, 1, 2, 3, 4]);
    expect(r.v).toEqual([0, 1, 2, 1, 0]);
    expect(minMaxMean(r)).toEqual({ min: 0, max: 2, mean: 0.8 });
    expect(durationSec(s)).toBe(4);
    expect(zones(r, [1])).toEqual([1, 3]); // time below 1, time at/above 1
    const pk = peaks({ t: [0, 1, 2, 3, 4, 5, 6], v: [0, 5, 0, 1, 0.8, 4, 0] }, 2);
    expect(pk.map((p) => p.t)).toEqual([1, 5]);
  });

  test('analyze: min/max/mean per series, usable on dive session', () => {
    const s: Session = { version: 1, source: 'synthetic-dive', durationSec: expected.dive.totalSec, series: { depth_m: vProfile() }, meta: {} };
    const r = analyze(s);
    expect(r.usable).toBe(true);
    expect(r.metrics.depth_m_max).toBe(expected.dive.maxDepthM);
    expect(r.metrics.seriesCount).toBe(1);
    expect(r.series?.depth_m).toBeDefined();
  });

  test('analyze: garbage / empty / null input → usable:false, no throw', () => {
    const empty: Session = { version: 1, source: 'x', durationSec: 0, series: {}, meta: {} };
    expect(analyze(empty).usable).toBe(false);
    const short: Session = { version: 1, source: 'x', durationSec: 3, series: { hr: { t: [0, 3], v: [1, 2] } }, meta: {} };
    expect(analyze(short).usable).toBe(false);
    expect(analyze(null as unknown as Session).usable).toBe(false);
  });
});
