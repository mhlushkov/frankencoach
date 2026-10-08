import type { Landmark, Landmarks, ToolResult } from '../../contracts/types';

// BlazePose indices (left = odd)
export const J = {
  nose: 0,
  lShoulder: 11, rShoulder: 12,
  lElbow: 13, rElbow: 14,
  lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24,
  lKnee: 25, rKnee: 26,
  lAnkle: 27, rAnkle: 28,
} as const;

const MIN_VIS = 0.3;
type Num = number | null;

const frames = (l: Landmarks | null | undefined) => (l && Array.isArray(l.frames) ? l.frames : []);

/** Angle at b (degrees, 0..180) between rays b→a and b→c. */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Per-frame angle at b; null when frame has no person or any point visibility < 0.3. */
export function angleSeries(l: Landmarks, a: number, b: number, c: number): Num[] {
  return frames(l).map(f => {
    const lm = f.landmarks;
    if (!lm) return null;
    const pa = lm[a], pb = lm[b], pc = lm[c];
    if (!pa || !pb || !pc || Math.min(pa.visibility, pb.visibility, pc.visibility) < MIN_VIS) return null;
    return angleDeg(pa, pb, pc);
  });
}

const mid = (p: Landmark, q: Landmark) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/** Torso tilt from vertical (degrees): 0 = upright, 90 = horizontal. */
export function torsoAngleDeg(lm: Landmark[] | null): number | null {
  if (!lm) return null;
  const pts = [lm[J.lShoulder], lm[J.rShoulder], lm[J.lHip], lm[J.rHip]];
  if (pts.some(p => !p || p.visibility < MIN_VIS)) return null;
  const s = mid(pts[0], pts[1]), h = mid(pts[2], pts[3]);
  const dx = s.x - h.x, dy = h.y - s.y;
  if (dx === 0 && dy === 0) return null;
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

export function visibilityStats(l: Landmarks): { personFrameRatio: number; meanVisibility: number } {
  const fs = frames(l);
  if (fs.length === 0) return { personFrameRatio: 0, meanVisibility: 0 };
  let person = 0, visSum = 0, visN = 0;
  for (const f of fs) {
    if (!f.landmarks) continue;
    person++;
    for (const p of f.landmarks) { visSum += p.visibility; visN++; }
  }
  return { personFrameRatio: person / fs.length, meanVisibility: visN ? visSum / visN : 0 };
}

/** Per-step mean displacement of visible landmarks between consecutive person frames. */
function displacements(l: Landmarks): number[] {
  const fs = frames(l);
  const out: number[] = [];
  for (let i = 1; i < fs.length; i++) {
    const a = fs[i - 1].landmarks, b = fs[i].landmarks;
    if (!a || !b) continue;
    let sum = 0, n = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      if (a[k].visibility < MIN_VIS || b[k].visibility < MIN_VIS) continue;
      sum += Math.hypot(b[k].x - a[k].x, b[k].y - a[k].y);
      n++;
    }
    if (n) out.push(sum / n);
  }
  return out;
}

/** Mean per-frame landmark displacement (normalized units). */
export function motionEnergy(l: Landmarks): number {
  const d = displacements(l);
  return d.length ? d.reduce((s, x) => s + x, 0) / d.length : 0;
}

/** Mean absolute change of displacement between steps (high-frequency noise). */
export function jitter(l: Landmarks): number {
  const d = displacements(l);
  if (d.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < d.length; i++) s += Math.abs(d[i] - d[i - 1]);
  return s / (d.length - 1);
}

export function bboxSeries(l: Landmarks): ({ x: number; y: number; w: number; h: number } | null)[] {
  return frames(l).map(f => {
    const vis = (f.landmarks ?? []).filter(p => p.visibility >= MIN_VIS);
    if (!vis.length) return null;
    const xs = vis.map(p => p.x), ys = vis.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  });
}

/** Dominant frequency (Hz) via autocorrelation: first peak after the ACF drops below 0. */
export function dominantHz(series: Num[], fps: number): number {
  const v = series.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 4 || !(fps > 0)) return 0;
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const d = v.map(x => x - m);
  const r0 = d.reduce((s, x) => s + x * x, 0);
  if (r0 === 0) return 0;
  const maxLag = Math.floor(v.length / 2);
  const acf = [1];
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < d.length; i++) s += d[i] * d[i + lag];
    acf.push(s / r0);
  }
  let lag = 1;
  while (lag < acf.length && acf[lag] > 0) lag++;
  let best = -1, bestV = -Infinity;
  for (; lag < acf.length; lag++) if (acf[lag] > bestV) { bestV = acf[lag]; best = lag; }
  if (best <= 0 || bestV <= 0) return 0;
  // parabolic refinement
  let p = best;
  if (best > 0 && best < acf.length - 1) {
    const y0 = acf[best - 1], y1 = acf[best], y2 = acf[best + 1];
    const den = y0 - 2 * y1 + y2;
    if (den !== 0) p = best + (0.5 * (y0 - y2)) / den;
  }
  return fps / p;
}

export function minMaxMean(series: Num[]): { min: number; max: number; mean: number } {
  const v = series.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!v.length) return { min: 0, max: 0, mean: 0 };
  let min = Infinity, max = -Infinity, s = 0;
  for (const x of v) { if (x < min) min = x; if (x > max) max = x; s += x; }
  return { min, max, mean: s / v.length };
}

/** Number of times the series drops from ≥ threshold to < threshold (nulls skipped). */
export function countCycles(series: Num[], threshold: number): number {
  let above: boolean | null = null, n = 0;
  for (const x of series) {
    if (x === null || !Number.isFinite(x)) continue;
    const a = x >= threshold;
    if (above === true && !a) n++;
    above = a;
  }
  return n;
}

export default function analyze(l: Landmarks): ToolResult {
  const fs = frames(l);
  if (!fs.length) return { metrics: { personFrameRatio: 0 }, warnings: ['no frames'], usable: false };
  const fps = l.fps > 0 ? l.fps : 30;
  const { personFrameRatio, meanVisibility } = visibilityStats(l);
  const rKnee = angleSeries(l, J.rHip, J.rKnee, J.rAnkle);
  const knee = angleSeries(l, J.lHip, J.lKnee, J.lAnkle).map((v, i) => v ?? rKnee[i]);
  const k = minMaxMean(knee);
  const torso = fs.map(f => torsoAngleDeg(f.landmarks));
  const hipY = fs.map(f => (f.landmarks ? (f.landmarks[J.lHip].y + f.landmarks[J.rHip].y) / 2 : null));
  const t = fs.map((f, i) => (Number.isFinite(f.t) ? f.t : i / fps));
  const toSeries = (s: Num[], unit?: string) => {
    const tt: number[] = [], vv: number[] = [];
    s.forEach((v, i) => { if (v !== null) { tt.push(t[i]); vv.push(v); } });
    return { t: tt, v: vv, unit };
  };
  const usable = personFrameRatio > 0.6;
  return {
    metrics: {
      personFrameRatio, meanVisibility,
      durationSec: l.durationSec || fs.length / fps,
      motionEnergy: motionEnergy(l), jitter: jitter(l),
      kneeAngleMin: k.min, kneeAngleMax: k.max, kneeAngleMean: k.mean,
      torsoAngleMean: minMaxMean(torso).mean,
      dominantHz: dominantHz(hipY, fps),
    },
    series: { kneeAngle: toSeries(knee, 'deg'), torsoAngle: toSeries(torso, 'deg'), hipY: toSeries(hipY) },
    warnings: usable ? [] : ['person visible in too few frames'],
    usable,
  };
}
