import { describe, expect, test } from 'bun:test';
import type { Landmarks, Session } from '../../contracts/types';
import garbage from '../../data/synthetic/fixtures/garbage.landmarks.json';
import analyze from './index';

function run(): Session {
  const t = Array.from({ length: 61 }, (_, i) => i * 10);
  return {
    version: 1, source: 'synthetic', durationSec: 600,
    series: {
      speed_mps: { t, v: t.map(() => 3) },
      cadence_rpm: { t, v: t.map(() => 170) },
      heart_rate_bpm: { t, v: t.map((x) => 130 + x / 30) },
      elevation_m: { t, v: t.map((x) => (x < 300 ? x / 10 : 30 - (x - 300) / 20)) },
    },
    meta: {},
  };
}

describe('running-profile', () => {
  test('known values on synthetic run', () => {
    const r = analyze(run());
    expect(r.usable).toBe(true);
    expect(r.metrics.avgSpeedMps).toBe(3);
    expect(Math.abs((r.metrics.avgPaceMinPerKm as number) - 5.56)).toBeLessThan(0.05);
    expect(Math.abs((r.metrics.distanceKm as number) - 1.8)).toBeLessThan(0.05);
    expect(r.metrics.avgCadenceSpm).toBe(170);
    expect(Math.abs((r.metrics.elevationGainM as number) - 30)).toBeLessThan(0.5);
  });
  test('wrong series / landmarks input → usable:false', () => {
    expect(analyze(garbage as unknown as Landmarks).usable).toBe(false);
    const s: Session = { version: 1, source: 'x', durationSec: 10, series: { depth_m: { t: [0, 1, 2], v: [0, 5, 10] } }, meta: {} };
    expect(analyze(s).usable).toBe(false);
  });
  test('empty / null input does not throw', () => {
    expect(analyze(null as unknown as Session).usable).toBe(false);
    expect(analyze({} as unknown as Session).usable).toBe(false);
    expect(analyze({ series: {} } as unknown as Session).usable).toBe(false);
  });
});
