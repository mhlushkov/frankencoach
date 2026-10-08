import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, Landmark, Landmarks } from '../../contracts/types';
import analyze, {
  J, angleDeg, angleSeries, bboxSeries, countCycles, dominantHz, jitter, minMaxMean,
  motionEnergy, torsoAngleDeg, visibilityStats,
} from './index';

// Committed A1 fixtures: data/synthetic/fixtures/*.landmarks.json + expected.json.
const FIX = join(import.meta.dir, '../../data/synthetic/fixtures');
const expected = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8'));
const load = (name: string): Landmarks => JSON.parse(readFileSync(join(FIX, `${name}.landmarks.json`), 'utf8'));

// expected.json angles are exact in pixel space (x*width, y*height); pose-metrics measures in
// normalized coords, so stretch x by the aspect ratio to make normalized angles == pixel angles.
function pixelAspect(l: Landmarks): Landmarks {
  const k = l.width / l.height;
  return { ...l, frames: l.frames.map((f) => ({ ...f, landmarks: f.landmarks?.map((p) => ({ ...p, x: p.x * k })) ?? null })) };
}
const squat = () => pixelAspect(load('squat'));
const freedive = () => load('freedive');
const still = () => load('static');
const noHuman = () => load('noHuman');

// Unit-level helpers for single-frame geometry checks only.
function basePose(): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.1 + i * 0.02, z: 0, visibility: 0.9 }));
}
function mk(frames: Frame[], fps = 30): Landmarks {
  return { version: 1, source: 'synthetic', videoHash: 'test', width: 640, height: 480, durationSec: frames.length / fps, fps, frames };
}

describe('geometry', () => {
  test('angleDeg right angle', () => {
    const p = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 });
    expect(angleDeg(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90, 5);
    expect(angleDeg(p(1, 0), p(0, 0), p(-1, 0))).toBeCloseTo(180, 5);
  });

  test('angleSeries null on missing frame or low visibility', () => {
    const lm = basePose();
    const low = basePose();
    low[J.lKnee] = { ...low[J.lKnee], visibility: 0.1 };
    const s = angleSeries(mk([{ t: 0, landmarks: lm }, { t: 1, landmarks: null }, { t: 2, landmarks: low }]), J.lHip, J.lKnee, J.lAnkle);
    expect(s[0]).not.toBeNull();
    expect(s[1]).toBeNull();
    expect(s[2]).toBeNull();
  });

  test('torsoAngleDeg vertical torso ≈ 0', () => {
    const lm = basePose();
    lm[J.lShoulder] = { ...lm[J.lShoulder], x: 0.5, y: 0.3 };
    lm[J.rShoulder] = { ...lm[J.rShoulder], x: 0.5, y: 0.3 };
    lm[J.lHip] = { ...lm[J.lHip], x: 0.5, y: 0.6 };
    lm[J.rHip] = { ...lm[J.rHip], x: 0.5, y: 0.6 };
    expect(torsoAngleDeg(lm)).toBeCloseTo(0, 5);
  });
});

describe('squat', () => {
  test('knee angle min ≈ expected ± 2', () => {
    const s = angleSeries(squat(), J.lHip, J.lKnee, J.lAnkle);
    expect(Math.abs(minMaxMean(s).min - expected.squat.kneeAngleMin)).toBeLessThanOrEqual(2);
  });
  test('countCycles = expected reps', () => {
    expect(countCycles(angleSeries(squat(), J.lHip, J.lKnee, J.lAnkle), 120)).toBe(expected.squat.reps);
  });
});

describe('freedive', () => {
  test('dominantHz(ankle y) ≈ expected kickHz ± 0.15', () => {
    const l = freedive();
    const y = l.frames.map(f => (f.landmarks ? f.landmarks[J.lAnkle].y : null));
    expect(Math.abs(dominantHz(y, l.fps) - expected.freedive.kickHz)).toBeLessThanOrEqual(0.15);
  });
});

describe('static / noHuman / garbage', () => {
  test('static motion < 0.001', () => {
    expect(motionEnergy(still())).toBeLessThan(0.001);
    expect(jitter(still())).toBeLessThan(0.001);
  });
  test('noHuman personFrameRatio = 0, usable false', () => {
    expect(visibilityStats(noHuman()).personFrameRatio).toBe(0);
    const r = analyze(noHuman());
    expect(r.metrics.personFrameRatio).toBe(0);
    expect(r.usable).toBe(false);
  });
  test('empty / null input does not throw', () => {
    expect(analyze(mk([])).usable).toBe(false);
    expect(analyze(null as unknown as Landmarks).usable).toBe(false);
    expect(dominantHz([], 30)).toBe(0);
    expect(countCycles([], 1)).toBe(0);
    expect(minMaxMean([null]).mean).toBe(0);
  });
});

describe('analyze', () => {
  test('squat is usable with generic metrics + series', () => {
    const r = analyze(squat());
    expect(r.usable).toBe(true);
    expect(r.metrics.personFrameRatio).toBe(1);
    expect(Math.abs((r.metrics.kneeAngleMin as number) - expected.squat.kneeAngleMin)).toBeLessThanOrEqual(2);
    expect(r.series?.kneeAngle.v.length).toBeGreaterThan(0);
    expect(bboxSeries(squat()).length).toBe(squat().frames.length);
  });
});
