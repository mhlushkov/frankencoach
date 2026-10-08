import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Landmark, Landmarks } from '../../contracts/types';
import { jitter as rawJitter } from '../../tools/pose-metrics/index';
import thresholds from '../../contracts/gate-thresholds.json';
import { checkLandmarks, checkTable } from './validity';

const DIR = join(import.meta.dir, '../../data/synthetic/fixtures');
const lm = (name: string): Landmarks => JSON.parse(readFileSync(join(DIR, `${name}.landmarks.json`), 'utf8'));
const csv = (name: string) => readFileSync(join(DIR, name), 'utf8');

describe('checkLandmarks', () => {
  test.each([
    ['noHuman', 'no_human'],
    ['static', 'no_motion'],
    ['lowVisibility', 'low_confidence'],
  ])('%s → %s', (name, reason) => {
    const r = checkLandmarks(lm(name));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe(reason as typeof r.reason);
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.tips.length).toBeGreaterThan(0);
    expect(r.stats).toBeDefined();
  });

  test('jitter fixture (iid noise on a standing pose) heals: raw noise > max, smoothed noise ≤ max', () => {
    const r = checkLandmarks(lm('jitter'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stats.smoothed).toBe(true);
    expect(r.stats.boneNoiseCv).toBeLessThanOrEqual(thresholds.maxBoneNoiseCv);
  });

  test('garbage is rejected', () => {
    const r = checkLandmarks(lm('garbage'));
    expect(r.ok).toBe(false);
  });

  test.each(['squat', 'freedive', 'running'])('%s → ok with stats', (name) => {
    const r = checkLandmarks(lm(name));
    expect(r.ok).toBe(true);
    expect(r.stats.personFrameRatio).toBe(1);
    expect(r.stats.meanVisibility).toBeGreaterThan(0.5);
  });

  test('too long → too_long', () => {
    const l = lm('squat');
    const r = checkLandmarks({ ...l, durationSec: 120 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_long');
  });

  test('malformed input never throws', () => {
    const r = checkLandmarks({} as Landmarks);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_human');
  });
});

// Front-view squat: every limb's 2D length swings smoothly by up to 40% (foreshortening), 2 s per rep at 10 fps.
// Points sit in a body box of height `size` (normalized) centred at (cx, cy); `noise(i, k)` adds per-point offsets in body heights.
function frontSquat(o: { size?: number; cx?: number; cy?: number; seconds?: number; noise?: (i: number, k: number) => [number, number] } = {}): Landmarks {
  const { size = 0.8, cx = 0.5, cy = 0.5, seconds = 6, noise = () => [0, 0] } = o;
  const W = 1080, H = 1080, fps = 10, n = seconds * fps;
  const frames = Array.from({ length: n }, (_, i) => {
    const s = (1 - Math.cos((2 * Math.PI * i) / 20)) / 2;   // 0 standing → 1 bottom
    const k = 1 - 0.4 * s;                                   // projected length factor
    const hipY = 0.1 + 0.4 * 0.4 * s;                        // hips drop as the thigh foreshortens (body units, 0 = head top)
    const pts: [number, number][] = Array.from({ length: 33 }, () => [0, 0.05]);   // head/face cluster
    const set = (j: number, x: number, y: number) => { pts[j] = [x, y]; };
    for (const side of [-1, 1]) {
      const l = side < 0 ? 1 : 0;   // odd index = left
      const sx = 0.12 * side, shY = hipY - 0.3 * k + 0.05, kneeY = hipY + 0.4 * 0.6 * k + 0.25;
      set(12 - l, sx, shY); set(14 - l, sx + 0.1 * side, shY + 0.15 * k); set(16 - l, sx + 0.1 * side, shY + 0.3 * k);
      set(24 - l, 0.08 * side, hipY + 0.3); set(26 - l, 0.1 * side, kneeY); set(28 - l, 0.1 * side, kneeY + 0.22);
      for (const j of [18, 20, 22]) set(j - l, sx + 0.1 * side, shY + 0.32 * k);
      for (const j of [30, 32]) set(j - l, 0.1 * side, kneeY + 0.24);
    }
    const landmarks: Landmark[] = pts.map(([x, y], j) => {
      const [nx, ny] = noise(i, j);
      return { x: cx + (x + nx) * size, y: cy + (y - 0.5 + ny) * size, z: 0, visibility: 0.95 };
    });
    return { t: i / fps, landmarks };
  });
  return { version: 1, source: 'synthetic', videoHash: 'front-squat', width: W, height: H, durationSec: n / fps, fps, frames };
}

const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

describe('checkLandmarks: self-healing stability', () => {
  test('foreshortening is not noise: a front-view squat whose limbs swing by 40% passes', () => {
    const r = checkLandmarks(frontSquat());
    expect(r.stats.boneLengthCv).toBeGreaterThan(0.08);   // the old global-spread check would have rejected it
    expect(r.ok).toBe(true);
    expect(r.stats.smoothed).toBeUndefined();
  });

  test('the real gym squat passes without the smoothing retry', () => {
    const l: Landmarks = JSON.parse(readFileSync(join(import.meta.dir, '../../data/landmarks/squat-gym.json'), 'utf8'));
    const r = checkLandmarks(l);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stats.smoothed ?? false).toBe(false);
    expect(r.landmarks).toBeUndefined();
    expect(r.stats.boneLengthCv).toBeGreaterThan(0.08);
  });

  test('isolated one-frame glitches fail raw and pass after median smoothing', () => {
    const glitch = (i: number, k: number): [number, number] => (i % 4 === 1 && [13, 14, 25, 26].includes(k) ? [0.08, -0.06] : [0, 0]);
    const l = frontSquat({ noise: glitch });
    const r = checkLandmarks(l);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stats.smoothed).toBe(true);
    expect(r.landmarks).toBeDefined();
    expect(r.landmarks!.frames).toHaveLength(l.frames.length);
    expect(r.landmarks!.frames[5].landmarks![13].x).toBeCloseTo(l.frames[4].landmarks![13].x, 1);   // spike gone
    expect(r.stats.boneNoiseCv).toBeLessThanOrEqual(thresholds.maxBoneNoiseCv);
  });

  test('garbage still fails after smoothing (unstable once visibility is high)', () => {
    const g = lm('garbage');
    for (const f of g.frames) for (const p of f.landmarks ?? []) p.visibility = 1;
    const r = checkLandmarks(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unstable');
  });

  test('a far-away small person is not shakier than a close-up with the same relative noise', () => {
    const noise = (seed: number) => { const r = rng(seed); return (): [number, number] => [(r() - 0.5) * 0.004, (r() - 0.5) * 0.004]; };
    const close = frontSquat({ size: 0.9, noise: noise(3) });
    const far = frontSquat({ size: 0.2, cx: 0.7, cy: 0.6, noise: noise(3) });
    const rc = checkLandmarks(close), rf = checkLandmarks(far);
    expect(rc.ok).toBe(true);
    expect(rf.ok).toBe(true);
    expect(rf.stats.jitter).toBeCloseTo(rc.stats.jitter, 6);
    expect(rawJitter(close) / rawJitter(far)).toBeGreaterThan(4);   // the frame-relative metric would differ ×4.5
  });

  test('jitter is measured on confident points only', () => {
    const quiet = frontSquat(), shaky = frontSquat();
    for (const l of [quiet, shaky]) for (const f of l.frames) f.landmarks![0].visibility = 0.4;
    for (const [i, f] of shaky.frames.entries()) f.landmarks![0] = { x: i % 2, y: i % 2, z: 0, visibility: 0.4 };
    expect(checkLandmarks(shaky).stats.jitter).toBeCloseTo(checkLandmarks(quiet).stats.jitter, 9);
  });
});

describe('checkTable', () => {
  test.each(['shopping-list.csv', 'empty.csv', 'no-time.csv', 'one-row.csv'])('%s → bad_table', (name) => {
    const r = checkTable(csv(name));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('bad_table');
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.tips.length).toBeGreaterThan(0);
  });

  test('dive-garmin-like → ok with timeCol', () => {
    const r = checkTable(csv('dive-garmin-like.csv'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.timeCol).toBe('timestamp');
    expect(r.header).toEqual(['timestamp', 'depth_m', 'heart_rate_bpm', 'temp_c']);
    expect(r.rows.length).toBe(91);
    expect(r.numericCols).toEqual(['depth_m', 'heart_rate_bpm', 'temp_c']);
  });

  test.each([['ride-strava-like.csv', 'time'], ['run-apple-like.csv', 'Date']])('%s → ok, timeCol %s', (name, col) => {
    const r = checkTable(csv(name));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.timeCol).toBe(col);
  });

  test('non-monotonic time → bad_table', () => {
    const lines = ['time,hr', ...Array.from({ length: 12 }, (_, i) => `${i % 3},${100 + i}`)];
    const r = checkTable(lines.join('\n'));
    expect(r.ok).toBe(false);
  });
});
