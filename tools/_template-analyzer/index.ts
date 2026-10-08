// TEMPLATE analyzer (example for the growth prompt). Compose existing tools; compute only; no fs/fetch/env.
import type { Landmark, Landmarks, ToolResult } from '../../contracts/types';
import { J, angleDeg, countCycles, jitter, minMaxMean, visibilityStats } from '../pose-metrics';

export const REP_THRESHOLD_DEG = 120;
const MIN_VIS = 0.3;

/** Knee angle per frame in pixel space (x*width, y*height): left side, right side when left is not visible. */
export function kneeSeries(l: Landmarks): (number | null)[] {
  const w = l.width || 1, h = l.height || 1;
  const px = (p: Landmark) => ({ ...p, x: p.x * w, y: p.y * h });
  const side = (lm: Landmark[], a: number, b: number, c: number) => {
    const pa = lm[a], pb = lm[b], pc = lm[c];
    if (!pa || !pb || !pc || Math.min(pa.visibility, pb.visibility, pc.visibility) < MIN_VIS) return null;
    return angleDeg(px(pa), px(pb), px(pc));
  };
  return l.frames.map(f => f.landmarks
    ? side(f.landmarks, J.lHip, J.lKnee, J.lAnkle) ?? side(f.landmarks, J.rHip, J.rKnee, J.rAnkle)
    : null);
}

export default function analyze(input: Landmarks): ToolResult {
  if (!input || !Array.isArray(input.frames) || input.frames.length === 0) {
    return { metrics: {}, warnings: ['no frames'], usable: false };
  }
  const { personFrameRatio } = visibilityStats(input);
  const knee = kneeSeries(input);
  const k = minMaxMean(knee);
  const reps = countCycles(knee, REP_THRESHOLD_DEG);
  const noise = jitter(input);
  const usable = personFrameRatio > 0.6 && noise < 0.02 && k.max - k.min > 20;
  const t: number[] = [], v: number[] = [];
  knee.forEach((x, i) => { if (x !== null) { t.push(input.frames[i]!.t); v.push(x); } });
  return {
    metrics: { kneeAngleMin: +k.min.toFixed(1), kneeAngleMax: +k.max.toFixed(1), reps, personFrameRatio, jitter: noise },
    series: { kneeAngle: { t, v, unit: 'deg' } },
    warnings: usable ? [] : ['movement pattern not found'],
    usable,
  };
}
