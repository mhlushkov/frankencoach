import { describe, expect, test } from 'bun:test';
import type { Landmark, Landmarks } from '../../contracts/types';
import {
  expectedFreedive, expectedRunning, expectedSquat,
  makeFreedive, makeGarbage, makeJitter, makeLowVisibility, makeNoHuman, makeRunning, makeSquat, makeStatic,
  pose,
} from './make-fixtures';

const W = 1920, H = 1080;
// angle at b (degrees), in pixel space
function angle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = [(a.x - b.x) * W, (a.y - b.y) * H], v2 = [(c.x - b.x) * W, (c.y - b.y) * H];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
const knee = (lm: Landmark[]) => angle(lm[24], lm[26], lm[28]);
function localMinima(xs: number[]): number {
  let n = 0;
  for (let i = 1; i < xs.length - 1; i++) if (xs[i] < xs[i - 1] && xs[i] <= xs[i + 1]) n++;
  return n;
}
function checkShape(l: Landmarks) {
  expect(l.version).toBe(1);
  expect(l.source).toBe('synthetic');
  expect(l.fps).toBe(10);
  expect(l.width).toBe(W);
  expect(l.height).toBe(H);
  expect(l.frames.length).toBe(Math.round(l.durationSec * l.fps));
  for (const f of l.frames) if (f.landmarks) expect(f.landmarks.length).toBe(33);
}

describe('pose model', () => {
  test('33 points with exact knee angle', () => {
    const lm = pose({ hipY: 0.6, kneeAngleDeg: 120, torsoAngleDeg: 0, facing: 'right' });
    expect(lm.length).toBe(33);
    expect(knee(lm)).toBeCloseTo(120, 3);
    expect(angle(lm[23], lm[25], lm[27])).toBeCloseTo(120, 3);
  });
});

describe('landmark fixtures', () => {
  const all = { squat: makeSquat(), freedive: makeFreedive(), running: makeRunning(), static: makeStatic(),
    garbage: makeGarbage(), noHuman: makeNoHuman(), jitter: makeJitter(), lowVisibility: makeLowVisibility() };

  test('every frame has 33 points', () => { for (const l of Object.values(all)) checkShape(l); });

  test('squat: knee min 90, 2 reps', () => {
    const k = all.squat.frames.map((f) => knee(f.landmarks!));
    expect(Math.min(...k)).toBeCloseTo(expectedSquat.kneeAngleMin, 1);
    expect(localMinima(k)).toBe(expectedSquat.reps);
  });

  test('freedive: horizontal body, knee mean 170, kick 1.2 Hz', () => {
    const fr = all.freedive.frames.map((f) => f.landmarks!);
    const k = fr.map(knee);
    expect(k.reduce((a, b) => a + b, 0) / k.length).toBeCloseTo(expectedFreedive.kneeAngleMean, 1);
    const lm = fr[0];
    expect(Math.abs(lm[12].y - lm[24].y) * H).toBeLessThan(Math.abs(lm[12].x - lm[24].x) * W * 0.3);
    const ay = fr.map((l) => l[28].y);
    const mean = ay.reduce((a, b) => a + b, 0) / ay.length;
    let crossings = 0;
    for (let i = 1; i < ay.length; i++) if ((ay[i - 1] - mean) * (ay[i] - mean) < 0) crossings++;
    const hz = crossings / 2 / all.freedive.durationSec;
    expect(Math.abs(hz - expectedFreedive.kickHz)).toBeLessThan(0.2);
    expect((Math.max(...ay) - Math.min(...ay)) / 2).toBeCloseTo(0.08, 2);
  });

  test('running: legs move in antiphase', () => {
    const fr = all.running.frames.map((f) => f.landmarks!);
    const dx = fr.map((l) => l[27].x - l[28].x);
    expect(Math.max(...dx)).toBeGreaterThan(0.02);
    expect(Math.min(...dx)).toBeLessThan(-0.02);
    expect(expectedRunning.strideHz).toBe(2.5);
  });

  test('noHuman: all null', () => { expect(all.noHuman.frames.every((f) => f.landmarks === null)).toBe(true); });

  test('static: zero motion', () => {
    const first = all.static.frames[0].landmarks!;
    for (const f of all.static.frames) f.landmarks!.forEach((p, i) => { expect(p.x).toBe(first[i].x); expect(p.y).toBe(first[i].y); });
  });

  test('jitter: moves noisily; lowVisibility: low visibility', () => {
    const a = all.jitter.frames[0].landmarks!, b = all.jitter.frames[1].landmarks!;
    expect(Math.abs(a[0].x - b[0].x) + Math.abs(a[0].y - b[0].y)).toBeGreaterThan(0.001);
    for (const f of all.lowVisibility.frames) for (const p of f.landmarks!) expect(p.visibility).toBeLessThan(0.5);
  });

  test('deterministic', () => {
    expect(JSON.stringify(makeGarbage())).toBe(JSON.stringify(all.garbage));
    expect(JSON.stringify(makeJitter())).toBe(JSON.stringify(all.jitter));
  });
});
