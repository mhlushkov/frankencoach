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

/** x scale (width/height) that makes normalized coords isotropic, so angles match pixel space; 1 if unknown. */
export function aspectK(l: Landmarks | null | undefined): number {
  const w = l?.width, h = l?.height;
  return typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 ? w / h : 1;
}
const sx = (p: Landmark, k: number): Landmark => (k === 1 ? p : { ...p, x: p.x * k });

/** Angle at b (degrees, 0..180) between rays b→a and b→c. */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Per-frame angle at b (pixel-aspect corrected); null when frame has no person or any point visibility < 0.3. */
export function angleSeries(l: Landmarks, a: number, b: number, c: number): Num[] {
  const k = aspectK(l);
  return frames(l).map(f => {
    const lm = f.landmarks;
    if (!lm) return null;
    const pa = lm[a], pb = lm[b], pc = lm[c];
    if (!pa || !pb || !pc || Math.min(pa.visibility, pb.visibility, pc.visibility) < MIN_VIS) return null;
    return angleDeg(sx(pa, k), sx(pb, k), sx(pc, k));
  });
}

const mid = (p: Landmark, q: Landmark) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/** Torso tilt from vertical (degrees): 0 = upright, 90 = horizontal. k = aspectK(landmarks). */
export function torsoAngleDeg(lm: Landmark[] | null, k = 1): number | null {
  if (!lm) return null;
  const pts = [lm[J.lShoulder], lm[J.rShoulder], lm[J.lHip], lm[J.rHip]];
  if (pts.some(p => !p || p.visibility < MIN_VIS)) return null;
  const s = mid(pts[0], pts[1]), h = mid(pts[2], pts[3]);
  const dx = (s.x - h.x) * k, dy = h.y - s.y;
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

// motionEnergy, jitter and hipY stay in normalized units on purpose: gate thresholds were tuned on them.
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

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
};
const median = (v: number[]) => quantile([...v].sort((a, b) => a - b), 0.5);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export interface RepCount {
  count: number; bottoms: number[]; tops: number[];
  partialStart: boolean; partialEnd: boolean; depthPerRep: number[];
}

/**
 * Reps in a joint-angle-like series (low = bottom of the rep). Robust to a stand-up or walk-in at either end:
 * thresholds come from the p5..p95 range, not min/max. Single nulls are interpolated, longer gaps split the series.
 * A rep = local minimum with prominence >= minProminence × (p95 − p5), >= minPeriodSec after the previous one.
 * A half rep at the start (series opens below the midline) or end (closes below it) is flagged, never counted.
 */
export function countReps(series: Num[], fps: number, opts: { minProminence?: number; minPeriodSec?: number } = {}): RepCount {
  const empty: RepCount = { count: 0, bottoms: [], tops: [], partialStart: false, partialEnd: false, depthPerRep: [] };
  if (!Array.isArray(series) || !series.length) return empty;
  const rate = fps > 0 ? fps : 30;
  const minProm = opts.minProminence ?? 0.5, minGap = (opts.minPeriodSec ?? 0.4) * rate;
  const raw: Num[] = series.map((x, i) => {
    if (finite(x)) return x;
    const a = series[i - 1], b = series[i + 1];
    return finite(a) && finite(b) ? (a + b) / 2 : null;
  });
  // segments of consecutive finite values: [start, end] inclusive
  const segs: [number, number][] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === null) continue;
    let j = i;
    while (j + 1 < raw.length && raw[j + 1] !== null) j++;
    segs.push([i, j]);
    i = j;
  }
  if (!segs.length) return empty;
  const sm: number[] = raw.map(() => NaN);
  for (const [s, e] of segs) for (let i = s; i <= e; i++) {
    let sum = 0, n = 0;
    for (let k = Math.max(s, i - 1); k <= Math.min(e, i + 1); k++) { sum += raw[k] as number; n++; }
    sm[i] = sum / n;
  }
  const sorted = sm.filter(Number.isFinite).sort((a, b) => a - b);
  const p5 = quantile(sorted, 0.05), range = quantile(sorted, 0.95) - p5;
  if (!(range > 0)) return empty;
  const thr = minProm * range, midline = p5 + 0.5 * range;
  const first = segs[0][0], last = segs[segs.length - 1][1];
  const partialStart = sm[first] < midline, partialEnd = sm[last] < midline;

  const bottoms: number[] = [];
  segs.forEach(([s, e], si) => {
    // half reps at the clip edges: before the first rise above the midline / after the last one
    let from = s, to = e;
    if (si === 0 && partialStart) { while (from <= e && sm[from] < midline) from++; }
    if (si === segs.length - 1 && partialEnd) { while (to >= s && sm[to] < midline) to--; }
    for (let i = Math.max(from, s + 1); i <= Math.min(to, e - 1); i++) {
      if (!(sm[i] <= sm[i - 1] && sm[i] < sm[i + 1])) continue;
      let lMax = sm[i], rMax = sm[i];
      for (let j = i - 1; j >= s && sm[j] >= sm[i]; j--) lMax = Math.max(lMax, sm[j]);
      for (let j = i + 1; j <= e && sm[j] >= sm[i]; j++) rMax = Math.max(rMax, sm[j]);
      if (Math.min(lMax, rMax) - sm[i] < thr) continue;
      const prev = bottoms[bottoms.length - 1];
      if (prev !== undefined && i - prev < minGap) { if (sm[i] < sm[prev]) bottoms[bottoms.length - 1] = i; continue; }
      bottoms.push(i);
    }
  });
  // tops: the highest point between consecutive bottoms, plus the lead-in and finish when they clear the midline
  const argmax = (a: number, b: number) => {
    let best = -1;
    for (let i = a; i <= b; i++) if (Number.isFinite(sm[i]) && (best < 0 || sm[i] > sm[best])) best = i;
    return best;
  };
  const tops: number[] = [];
  if (bottoms.length) {
    const lead = argmax(first, bottoms[0]);
    if (lead >= 0 && sm[lead] >= midline) tops.push(lead);
    for (let k = 1; k < bottoms.length; k++) { const t = argmax(bottoms[k - 1], bottoms[k]); if (t >= 0) tops.push(t); }
    const tail = argmax(bottoms[bottoms.length - 1], last);
    if (tail >= 0 && sm[tail] >= midline) tops.push(tail);
  }
  return {
    count: bottoms.length, bottoms, tops, partialStart, partialEnd,
    depthPerRep: bottoms.map(i => raw[i] as number),
  };
}

/** Torso-and-legs joints used to tell whether the athlete is inside the frame. */
const BODY = [J.lShoulder, J.rShoulder, J.lHip, J.rHip, J.lKnee, J.rKnee, J.lAnkle, J.rAnkle];

/** Frames where the camera cut the athlete off (a visible body joint or the bbox at/over a frame edge). */
export function coverage(l: Landmarks, margin = 0.01): {
  inFrameRatio: number; cutFrames: number[]; cutRanges: { fromSec: number; toSec: number }[];
} {
  const fs = frames(l);
  const boxes = bboxSeries(l);
  const fps = l && l.fps > 0 ? l.fps : 30;
  const out = (v: number) => v < margin || v > 1 - margin;
  let person = 0;
  const cutFrames: number[] = [];
  fs.forEach((f, i) => {
    const lm = f.landmarks;
    if (!lm) return;
    person++;
    const joint = BODY.some(j => lm[j] && lm[j].visibility >= 0.5 && (out(lm[j].x) || out(lm[j].y)));
    const b = boxes[i];
    const edge = !!b && (b.x <= margin || b.y <= margin || b.x + b.w >= 1 - margin || b.y + b.h >= 1 - margin);
    if (joint || edge) cutFrames.push(i);
  });
  const time = (i: number) => (fs[i] && finite(fs[i].t) ? fs[i].t : i / fps);
  const cutRanges: { fromSec: number; toSec: number }[] = [];
  for (let k = 0; k < cutFrames.length; k++) {
    let e = k;
    while (e + 1 < cutFrames.length && cutFrames[e + 1] === cutFrames[e] + 1) e++;
    // a range covers its last frame's duration
    cutRanges.push({ fromSec: time(cutFrames[k]), toSec: time(cutFrames[e]) + 1 / fps });
    k = e;
  }
  return { inFrameRatio: person ? (person - cutFrames.length) / person : 1, cutFrames, cutRanges };
}

/** Mean visibility of hip, knee and ankle per side over person frames; the far leg is usually much lower. */
export function legVisibility(l: Landmarks): { left: number; right: number; better: 'left' | 'right' } {
  let left = 0, right = 0, n = 0;
  for (const f of frames(l)) {
    const lm = f.landmarks;
    if (!lm) continue;
    const v = (j: number) => (lm[j] && finite(lm[j].visibility) ? lm[j].visibility : 0);
    left += (v(J.lHip) + v(J.lKnee) + v(J.lAnkle)) / 3;
    right += (v(J.rHip) + v(J.rKnee) + v(J.rAnkle)) / 3;
    n++;
  }
  if (!n) return { left: 0, right: 0, better: 'left' };
  left /= n; right /= n;
  return { left, right, better: right > left ? 'right' : 'left' };
}

/**
 * Where the camera stood. Sagittal angles (knee flexion, hip hinge, torso lean) are only trustworthy in a side
 * view; front, back and oblique views foreshorten them in 2D, so treat them as rough estimates there.
 * Face visibility cannot tell front from back (MediaPipe reports the face as visible from behind too). MediaPipe's
 * "left" is the athlete's left, so the athlete faces the camera when x(left shoulder) > x(right shoulder).
 */
export function viewpoint(l: Landmarks): {
  view: 'front' | 'back' | 'left' | 'right' | 'oblique'; nearSide: 'left' | 'right' | null; confidence: number;
} {
  const k = aspectK(l);
  const sh: number[] = [], hip: number[] = [], torso: number[] = [], dxSh: number[] = [], dzSh: number[] = [], ear: number[] = [];
  for (const f of frames(l)) {
    const lm = f.landmarks;
    if (!lm) continue;
    const ls = lm[J.lShoulder], rs = lm[J.rShoulder], lh = lm[J.lHip], rh = lm[J.rHip];
    if (!ls || !rs || !lh || !rh) continue;
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot((a.x - b.x) * k, a.y - b.y);
    sh.push(dist(ls, rs)); hip.push(dist(lh, rh)); torso.push(dist(mid(ls, rs), mid(lh, rh)));
    dxSh.push(ls.x - rs.x); dzSh.push(ls.z - rs.z);
    if (lm[7] && lm[8]) ear.push(lm[7].visibility - lm[8].visibility);
  }
  const t = median(torso);
  if (!sh.length || !(t > 0)) return { view: 'oblique', nearSide: null, confidence: 0 };
  const ratio = Math.max(median(sh), median(hip)) / t;
  const dz = median(dzSh), dEar = ear.length ? median(ear) : 0;
  // z(lSh) − z(rSh) < 0: the left shoulder is nearer the camera; when z is flat, the better-seen ear is the near one
  const nearSide: 'left' | 'right' = dz < 0 ? 'left' : dz > 0 ? 'right' : dEar >= 0 ? 'left' : 'right';
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (ratio <= 0.3) return { view: nearSide, nearSide, confidence: clamp((0.3 - ratio) / 0.3) };
  if (ratio >= 0.6) return { view: median(dxSh) > 0 ? 'front' : 'back', nearSide: null, confidence: clamp((ratio - 0.6) / 0.4) };
  // Oblique: the same x(lSh) − x(rSh) sign says front-oblique (> 0) or back-oblique (< 0); the return type has no
  // field for it, so callers that care can check it themselves.
  return { view: 'oblique', nearSide, confidence: clamp(Math.min(ratio - 0.3, 0.6 - ratio) / 0.15) };
}

export default function analyze(l: Landmarks): ToolResult {
  const fs = frames(l);
  if (!fs.length) return { metrics: { personFrameRatio: 0 }, warnings: ['no frames'], usable: false };
  const fps = l.fps > 0 ? l.fps : 30;
  const { personFrameRatio, meanVisibility } = visibilityStats(l);
  const rKnee = angleSeries(l, J.rHip, J.rKnee, J.rAnkle);
  const knee = angleSeries(l, J.lHip, J.lKnee, J.lAnkle).map((v, i) => v ?? rKnee[i]);
  const k = minMaxMean(knee);
  const ak = aspectK(l);
  const torso = fs.map(f => torsoAngleDeg(f.landmarks, ak));
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
