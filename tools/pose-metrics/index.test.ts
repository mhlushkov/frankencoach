import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, Landmark, Landmarks } from '../../contracts/types';
import gymJson from '../../data/landmarks/squat-gym.json';
import analyze, {
  J, angleDeg, angleSeries, bboxSeries, countCycles, countReps, coverage, dominantHz, jitter, legVisibility,
  minMaxMean, motionEnergy, torsoAngleDeg, viewpoint, visibilityStats,
} from './index';

// Committed A1 fixtures: data/synthetic/fixtures/*.landmarks.json + expected.json.
const FIX = join(import.meta.dir, '../../data/synthetic/fixtures');
const expected = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf8'));
const load = (name: string): Landmarks => JSON.parse(readFileSync(join(FIX, `${name}.landmarks.json`), 'utf8'));

const squat = () => load('squat');
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

// Real clip: 133 frames at 10 fps, filmed from behind at a 3/4 angle, left side nearer; 5 squats + a half one at the
// start, final stand-up at 10 s, camera pans and cuts the athlete at the right edge from 6.2 s to 9.4 s.
const gym = gymJson as unknown as Landmarks;
function gymKnee(): (number | null)[] {
  const a = angleSeries(gym, J.lHip, J.lKnee, J.lAnkle), b = angleSeries(gym, J.rHip, J.rKnee, J.rAnkle);
  return a.map((x, i) => {
    const y = b[i];
    if (x !== null && Number.isFinite(x) && y !== null && Number.isFinite(y)) return (x + y) / 2;
    return x !== null && Number.isFinite(x) ? x : y !== null && Number.isFinite(y) ? y : null;
  });
}
// Clean sine knee angle: 120 ± 30 deg, `troughs` full periods starting at the top.
function sine(troughs: number, fps = 10, period = 2, phase = 0): number[] {
  const n = Math.round(troughs * period * fps);
  return Array.from({ length: n + 1 }, (_, i) => 120 + 30 * Math.cos((2 * Math.PI * i) / (period * fps) + phase));
}

describe('countReps', () => {
  test('squat-gym: 5 reps, half rep at the start not counted, final stand-up and the 12 s dip ignored', () => {
    const r = countReps(gymKnee(), 10);
    expect(r.count).toBe(5);
    expect(r.partialStart).toBe(true);
    expect(r.partialEnd).toBe(false);
    expect(r.bottoms.length).toBe(5);
    [1.8, 3.6, 5.1, 6.9, 8.8].forEach((t, i) => expect(Math.abs(r.bottoms[i] / 10 - t)).toBeLessThanOrEqual(0.3));
    expect(r.depthPerRep.length).toBe(5);
  });
  test('clean sine with 6 troughs -> 6', () => {
    const r = countReps(sine(6), 10);
    expect(r.count).toBe(6);
    expect(r.partialStart).toBe(false);
    expect(r.partialEnd).toBe(false);
    r.depthPerRep.forEach(d => expect(d).toBeLessThan(95));
  });
  test('a final stand-up twice as tall does not merge reps', () => {
    const s = sine(6);
    const hump = Array.from({ length: 21 }, (_, i) => 150 + 60 * Math.sin((Math.PI * i) / 20));
    expect(countReps([...s, ...hump], 10).count).toBe(6);
  });
  test('starting at a trough -> partialStart and one fewer', () => {
    const r = countReps(sine(6, 10, 2, Math.PI), 10);
    expect(r.partialStart).toBe(true);
    expect(r.count).toBe(5);
  });
  test('ending at a trough -> partialEnd, not counted', () => {
    const s = sine(6);
    const r = countReps(s.slice(0, s.length - 10), 10);
    expect(r.partialEnd).toBe(true);
    expect(r.count).toBe(5);
  });
  test('single nulls are interpolated, long gaps split the series', () => {
    const s: (number | null)[] = sine(6);
    s[15] = null; s[35] = null;
    expect(countReps(s, 10).count).toBe(6);
  });
  test('empty / null input does not throw', () => {
    expect(countReps([], 10).count).toBe(0);
    expect(countReps([null, null, null], 10).bottoms).toEqual([]);
    expect(countReps(null as unknown as number[], 0).count).toBe(0);
  });
});

describe('coverage', () => {
  test('squat-gym: cut by the right edge from ~6.2 s to ~9.4 s', () => {
    const c = coverage(gym);
    const overlap = c.cutRanges.reduce((s, r) => s + Math.max(0, Math.min(r.toSec, 9.4) - Math.max(r.fromSec, 6.2)), 0);
    expect(overlap).toBeGreaterThanOrEqual(2.5);
    c.cutRanges.forEach(r => expect(r.fromSec).toBeGreaterThanOrEqual(5));
    expect(c.inFrameRatio).toBeGreaterThan(0.6);
    expect(c.inFrameRatio).toBeLessThan(0.85);
  });
  test('synthetic squat stays in frame', () => {
    const c = coverage(squat());
    expect(c.inFrameRatio).toBe(1);
    expect(c.cutRanges).toEqual([]);
    expect(c.cutFrames).toEqual([]);
  });
  test('empty / no person -> ratio 1, nothing cut', () => {
    expect(coverage(mk([])).inFrameRatio).toBe(1);
    expect(coverage(noHuman()).cutRanges).toEqual([]);
    expect(coverage(null as unknown as Landmarks).inFrameRatio).toBe(1);
  });
});

describe('legVisibility', () => {
  test('squat-gym: left leg is the near, well-seen one', () => {
    const v = legVisibility(gym);
    expect(v.better).toBe('left');
    expect(v.right).toBeLessThan(0.75);
    expect(v.left).toBeGreaterThan(0.75);
  });
  test('empty does not throw', () => {
    expect(legVisibility(mk([]))).toEqual({ left: 0, right: 0, better: 'left' });
  });
});

describe('viewpoint', () => {
  test('squat-gym: from behind / oblique, left side nearer', () => {
    const v = viewpoint(gym);
    expect(['back', 'oblique']).toContain(v.view);
    expect(v.nearSide).toBe('left');
    expect(v.confidence).toBeGreaterThan(0);
  });
  test('synthetic squat is a pure side view', () => {
    const v = viewpoint(squat());
    expect(['left', 'right']).toContain(v.view);
    expect(v.nearSide).toBe(v.view as 'left' | 'right');
  });
  test('front vs back from shoulder x order', () => {
    const pose = (front: boolean): Landmark[] => {
      const lm = basePose();
      const set = (j: number, x: number, y: number) => { lm[j] = { ...lm[j], x, y }; };
      set(J.lShoulder, front ? 0.6 : 0.4, 0.3); set(J.rShoulder, front ? 0.4 : 0.6, 0.3);
      set(J.lHip, front ? 0.57 : 0.43, 0.6); set(J.rHip, front ? 0.43 : 0.57, 0.6);
      return lm;
    };
    const fr = (front: boolean) => mk(Array.from({ length: 5 }, (_, i) => ({ t: i / 30, landmarks: pose(front) })));
    expect(viewpoint(fr(true)).view).toBe('front');
    expect(viewpoint(fr(false)).view).toBe('back');
  });
  test('empty does not throw', () => {
    const v = viewpoint(mk([]));
    expect(v.confidence).toBe(0);
    expect(v.nearSide).toBeNull();
  });
});
