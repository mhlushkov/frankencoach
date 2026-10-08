import { describe, expect, test } from 'bun:test';
import type { Frame, Landmark, Landmarks } from '../../contracts/types';
import analyze, {
  J, angleDeg, angleSeries, bboxSeries, countCycles, dominantHz, jitter, minMaxMean,
  motionEnergy, torsoAngleDeg, visibilityStats,
} from './index';

// A1 fixtures are not merged yet → build synthetic landmarks inline.
const FPS = 30;

function basePose(): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.1 + i * 0.02, z: 0, visibility: 0.9 }));
}

function mk(frames: Frame[], fps = FPS): Landmarks {
  return {
    version: 1, source: 'synthetic', videoHash: 'test', width: 640, height: 480,
    durationSec: frames.length / fps, fps, frames,
  };
}

// knee angle θ(t) = 135 + 45·cos(2π·0.5·t): 180 → 90 → 180, two squats in 4 s
function squat(): Landmarks {
  const frames: Frame[] = [];
  for (let i = 0; i < 4 * FPS; i++) {
    const t = i / FPS;
    const theta = ((135 + 45 * Math.cos(2 * Math.PI * 0.5 * t)) * Math.PI) / 180;
    const lm = basePose();
    for (const [hip, knee, ankle] of [[J.lHip, J.lKnee, J.lAnkle], [J.rHip, J.rKnee, J.rAnkle]]) {
      lm[knee] = { x: 0.5, y: 0.6, z: 0, visibility: 0.9 };
      lm[ankle] = { x: 0.5, y: 0.9, z: 0, visibility: 0.9 };
      lm[hip] = { x: 0.5 + 0.3 * Math.sin(theta), y: 0.6 + 0.3 * Math.cos(theta), z: 0, visibility: 0.9 };
    }
    frames.push({ t, landmarks: lm });
  }
  return mk(frames);
}

// ankles oscillate vertically at 1.2 Hz (fin kick), 10 s
function freedive(): Landmarks {
  const frames: Frame[] = [];
  for (let i = 0; i < 10 * FPS; i++) {
    const t = i / FPS;
    const lm = basePose();
    const dy = 0.05 * Math.sin(2 * Math.PI * 1.2 * t);
    lm[J.lAnkle] = { ...lm[J.lAnkle], y: 0.8 + dy };
    lm[J.rAnkle] = { ...lm[J.rAnkle], y: 0.8 - dy };
    frames.push({ t, landmarks: lm });
  }
  return mk(frames);
}

const still = () => mk(Array.from({ length: 60 }, (_, i) => ({ t: i / FPS, landmarks: basePose() })));
const noHuman = () => mk(Array.from({ length: 60 }, (_, i) => ({ t: i / FPS, landmarks: null })));

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
  test('knee angle min ≈ 90 ± 2', () => {
    const s = angleSeries(squat(), J.lHip, J.lKnee, J.lAnkle);
    expect(Math.abs(minMaxMean(s).min - 90)).toBeLessThanOrEqual(2);
  });
  test('countCycles = 2', () => {
    expect(countCycles(angleSeries(squat(), J.lHip, J.lKnee, J.lAnkle), 120)).toBe(2);
  });
});

describe('freedive', () => {
  test('dominantHz(ankle y) ≈ 1.2 ± 0.15', () => {
    const l = freedive();
    const y = l.frames.map(f => (f.landmarks ? f.landmarks[J.lAnkle].y : null));
    expect(Math.abs(dominantHz(y, l.fps) - 1.2)).toBeLessThanOrEqual(0.15);
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
    expect(Math.abs((r.metrics.kneeAngleMin as number) - 90)).toBeLessThanOrEqual(2);
    expect(r.series?.kneeAngle.v.length).toBeGreaterThan(0);
    expect(bboxSeries(squat()).length).toBe(squat().frames.length);
  });
});
