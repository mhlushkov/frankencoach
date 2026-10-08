import { describe, expect, test } from 'bun:test';
import type { Landmark, Landmarks } from '../../contracts/types';
import { medianSmooth } from './smooth';

const pt = (x: number, visibility = 1): Landmark => ({ x, y: x * 2, z: -x, visibility });
const clip = (xs: (number | null)[], vis: number[] = []): Landmarks => ({
  version: 1, source: 'synthetic', videoHash: 'h', width: 100, height: 100, durationSec: xs.length / 10, fps: 10,
  frames: xs.map((x, i) => ({ t: i / 10, landmarks: x === null ? null : [pt(x, vis[i] ?? 1), pt(x + 1, vis[i] ?? 1)] })),
});
const xs = (l: Landmarks, k = 0) => l.frames.map(f => f.landmarks?.[k].x ?? null);

describe('medianSmooth', () => {
  test('removes a one-frame spike on every axis', () => {
    const s = medianSmooth(clip([0, 0, 5, 0, 0]));
    expect(xs(s)).toEqual([0, 0, 0, 0, 0]);
    expect(s.frames[2].landmarks![0]).toEqual({ x: 0, y: 0, z: -0, visibility: 1 });
    expect(xs(s, 1)).toEqual([1, 1, 1, 1, 1]);
  });

  test('keeps a monotonic ramp and metadata', () => {
    const l = clip([0, 1, 2, 3, 4]);
    const s = medianSmooth(l);
    expect(xs(s)).toEqual([0.5, 1, 2, 3, 3.5]);   // edges: the window shrinks to 2 frames → their mean
    expect(s.fps).toBe(10);
    expect(s.frames.map(f => f.t)).toEqual(l.frames.map(f => f.t));
    expect(xs(l)).toEqual([0, 1, 2, 3, 4]);         // input untouched
  });

  test('null frames stay null and are skipped by neighbours', () => {
    const s = medianSmooth(clip([0, null, 9, 2, 2]));
    expect(s.frames[1].landmarks).toBeNull();
    expect(xs(s)).toEqual([0, null, 5.5, 2, 2]);
  });

  test('visibility is the minimum of the window', () => {
    const s = medianSmooth(clip([0, 0, 0, 0], [1, 0.2, 1, 1]));
    expect(s.frames.map(f => f.landmarks![0].visibility)).toEqual([0.2, 0.2, 0.2, 1]);
  });

  test('wider odd window; even window throws', () => {
    expect(xs(medianSmooth(clip([0, 0, 0, 7, 8, 0, 0, 0]), 5))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(xs(medianSmooth(clip([0, 0, 7, 8, 0]), 1))).toEqual([0, 0, 7, 8, 0]);
    expect(() => medianSmooth(clip([0]), 2)).toThrow();
    expect(() => medianSmooth(clip([0]), 0)).toThrow();
  });
});
