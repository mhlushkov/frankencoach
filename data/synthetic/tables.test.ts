import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectedDive, expectedRide, expectedRun, garbageTables, makeDiveCsv, makeRideCsv, makeRunCsv } from './make-tables';
import { buildExpected, FIXTURES_DIR, landmarkFixtures } from './make-fixtures';

const rows = (csv: string) => csv.trim().split('\n').map((l) => l.split(','));

describe('table fixtures', () => {
  test('dive: header, 1 Hz, 90 s, V-profile to 25 m', () => {
    const r = rows(makeDiveCsv());
    expect(r[0]).toEqual(['timestamp', 'depth_m', 'heart_rate_bpm', 'temp_c']);
    expect(r.length - 1).toBe(91);
    const depth = r.slice(1).map((x) => Number(x[1]));
    expect(Math.max(...depth)).toBe(expectedDive.maxDepthM);
    expect(depth[0]).toBe(0);
    expect(depth[depth.length - 1]).toBe(0);
    expect(depth[10]).toBeCloseTo(expectedDive.descentRateMps * 10, 1);
    expect(depth.filter((d) => d === 25).length).toBe(expectedDive.bottomTimeSec);
    expect(expectedDive.totalSec).toBe(90);
  });

  test('ride: columns and averages match expected', () => {
    const r = rows(makeRideCsv());
    expect(r[0]).toEqual(['time', 'speed_mps', 'cadence_rpm', 'elevation_m', 'heart_rate_bpm']);
    const body = r.slice(1);
    expect(Number(body[body.length - 1][0])).toBe(600);
    const avg = (i: number) => body.reduce((a, x) => a + Number(x[i]), 0) / body.length;
    expect(avg(1)).toBeCloseTo(expectedRide.avgSpeedMps, 2);
    expect(avg(2)).toBeCloseTo(expectedRide.avgCadence, 2);
  });

  test('run: non-canonical column names', () => {
    const r = rows(makeRunCsv());
    expect(r[0]).toEqual(['Date', 'Pace(min/km)', 'HR']);
    expect(r[1][1]).toMatch(/^\d+:\d\d$/);
    expect(expectedRun.totalSec).toBe(600);
  });

  test('every good CSV has header + >= 10 rows', () => {
    for (const csv of [makeDiveCsv(), makeRideCsv(), makeRunCsv()]) expect(rows(csv).length).toBeGreaterThanOrEqual(11);
  });

  test('garbage tables', () => {
    expect(garbageTables['empty.csv']).toBe('');
    expect(rows(garbageTables['shopping-list.csv'])[0]).toEqual(['item', 'qty']);
    expect(rows(garbageTables['one-row.csv']).length).toBe(2);
    const nt = rows(garbageTables['no-time.csv']);
    expect(nt[0].some((h) => /time|date/i.test(h))).toBe(false);
  });
});

describe('committed fixtures', () => {
  test('expected.json valid and up to date', () => {
    const p = join(FIXTURES_DIR, 'expected.json');
    expect(existsSync(p)).toBe(true);
    const e = JSON.parse(readFileSync(p, 'utf8'));
    expect(e).toEqual(JSON.parse(JSON.stringify(buildExpected())));
    for (const k of ['squat', 'freedive', 'running', 'dive', 'ride', 'run']) expect(e[k]).toBeDefined();
  });

  test('all fixture files exist and match generators', () => {
    for (const [name, make] of Object.entries(landmarkFixtures)) {
      expect(readFileSync(join(FIXTURES_DIR, `${name}.landmarks.json`), 'utf8')).toBe(JSON.stringify(make()));
    }
    expect(readFileSync(join(FIXTURES_DIR, 'dive-garmin-like.csv'), 'utf8')).toBe(makeDiveCsv());
    expect(readFileSync(join(FIXTURES_DIR, 'ride-strava-like.csv'), 'utf8')).toBe(makeRideCsv());
    expect(readFileSync(join(FIXTURES_DIR, 'run-apple-like.csv'), 'utf8')).toBe(makeRunCsv());
    for (const [name, csv] of Object.entries(garbageTables)) expect(readFileSync(join(FIXTURES_DIR, name), 'utf8')).toBe(csv);
  });
});
