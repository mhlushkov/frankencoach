import { describe, expect, test } from 'bun:test';
import type { Landmarks } from '../../contracts/types';
import squat from '../../data/synthetic/fixtures/squat.landmarks.json';
import garbage from '../../data/synthetic/fixtures/garbage.landmarks.json';
import expected from '../../data/synthetic/fixtures/expected.json';
import analyze from './index';

describe('_template-analyzer', () => {
  test('known value on synthetic squat', () => {
    const r = analyze(squat as Landmarks);
    expect(r.usable).toBe(true);
    expect(Math.abs((r.metrics.kneeAngleMin as number) - expected.squat.kneeAngleMin)).toBeLessThan(3);
    expect(r.metrics.reps).toBe(expected.squat.reps);
  });
  test('garbage input → usable:false', () => {
    expect(analyze(garbage as unknown as Landmarks).usable).toBe(false);
  });
  test('empty / null input does not throw', () => {
    expect(analyze(null as unknown as Landmarks).usable).toBe(false);
    expect(analyze({ frames: [] } as unknown as Landmarks).usable).toBe(false);
  });
});
