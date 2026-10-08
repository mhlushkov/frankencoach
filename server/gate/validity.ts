import type { Landmark, Landmarks } from '../../contracts/types';
import thresholds from '../../contracts/gate-thresholds.json';
import { motionEnergy, visibilityStats } from '../../tools/pose-metrics/index';
import { parseCsvLoose, toSeconds, type Cell } from '../../tools/series-core/index';
import { medianSmooth } from './smooth';

// ---------- landmarks ----------
export type LandmarkReason = 'no_human' | 'no_motion' | 'unstable' | 'low_confidence' | 'too_long';
export interface LandmarkStats {
  frames: number; durationSec: number;
  personFrameRatio: number; meanVisibility: number;
  motionEnergy: number;   // pose-metrics: mean per-frame displacement
  motionRange: number;    // largest x/y range of any visible landmark over the clip (compared to minMotionEnergy)
  jitter: number;         // mean |Δ displacement| of confident points, in person-heights (scale-free)
  boneLengthCv: number;   // median CV of 2D limb lengths over the whole clip: includes real foreshortening, reported only
  boneNoiseCv: number;    // median over bones of RMS(length − 3-frame median) / mean length: frame-to-frame noise only
  smoothed?: boolean;     // true when the raw series was unstable and the 3-frame median-smoothed one passed
}
export type LandmarkCheck =
  | { ok: true; stats: LandmarkStats; landmarks?: Landmarks }
  | { ok: false; reason: LandmarkReason; text: string; tips: string[]; stats: LandmarkStats };

const MIN_VIS = 0.3;    // motion range: any plausibly visible point
const CONF_VIS = 0.5;   // jitter and bones: confident points only
const BONES = [[11, 23], [12, 24], [23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [13, 15], [12, 14], [14, 16]];

const dims = (l: Landmarks) => ({ w: l.width > 0 ? l.width : 1, h: l.height > 0 ? l.height : 1 });

function motionRange(l: Landmarks): number {
  let best = 0;
  for (let k = 0; k < 33; k++) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of l.frames) {
      const p = f.landmarks?.[k];
      if (!p || p.visibility < MIN_VIS) continue;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    if (maxX >= minX) best = Math.max(best, maxX - minX, maxY - minY);
  }
  return best;
}

/** Person size in pixels: the bounding-box height of confident points (0 when < 2 points). */
function personHeightPx(m: Landmark[], h: number): number {
  let lo = Infinity, hi = -Infinity, n = 0;
  for (const p of m) {
    if (!p || p.visibility < CONF_VIS) continue;
    lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); n++;
  }
  return n >= 2 ? (hi - lo) * h : 0;
}

/** Like pose-metrics jitter, but on confident points and in units of the person's height in that frame. */
export function scaledJitter(l: Landmarks): number {
  const { w, h } = dims(l);
  const d: number[] = [];
  for (let i = 1; i < l.frames.length; i++) {
    const a = l.frames[i - 1].landmarks, b = l.frames[i].landmarks;
    if (!a || !b) continue;
    const size = personHeightPx(b, h);
    if (size <= 0) continue;
    let sum = 0, n = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      if (!a[k] || !b[k] || a[k].visibility < CONF_VIS || b[k].visibility < CONF_VIS) continue;
      sum += Math.hypot((b[k].x - a[k].x) * w, (b[k].y - a[k].y) * h);
      n++;
    }
    if (n) d.push(sum / n / size);
  }
  if (d.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < d.length; i++) s += Math.abs(d[i] - d[i - 1]);
  return s / (d.length - 1);
}

/** Per bone: 2D pixel length per frame, null when either end is not confident. */
function boneSeries(l: Landmarks): (number | null)[][] {
  const { w, h } = dims(l);
  return BONES.map(([a, b]) => l.frames.map(f => {
    const m = f.landmarks;
    if (!m || !m[a] || !m[b] || m[a].visibility < CONF_VIS || m[b].visibility < CONF_VIS) return null;
    return Math.hypot((m[a].x - m[b].x) * w, (m[a].y - m[b].y) * h);
  }));
}

const medianOf = (v: number[]) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Median over bones of the whole-clip CV of 2D lengths (real foreshortening counts as spread). */
export function boneLengthCv(l: Landmarks): number {
  const cvs: number[] = [];
  for (const s of boneSeries(l)) {
    const v = s.filter((x): x is number => x !== null);
    if (v.length < 3) continue;
    const mu = v.reduce((a, x) => a + x, 0) / v.length;
    if (mu <= 0) continue;
    cvs.push(Math.sqrt(v.reduce((a, x) => a + (x - mu) ** 2, 0) / v.length) / mu);
  }
  return medianOf(cvs);
}

/** Median over bones of RMS(length − centered 3-frame median of length) / mean length: high-frequency noise only. */
export function boneNoiseCv(l: Landmarks): number {
  const cvs: number[] = [];
  for (const s of boneSeries(l)) {
    const v = s.filter((x): x is number => x !== null);
    const mu = v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0;
    if (mu <= 0) continue;
    let sq = 0, n = 0;
    for (let i = 1; i + 1 < s.length; i++) {
      const p = s[i - 1], c = s[i], q = s[i + 1];
      if (p === null || c === null || q === null) continue;
      sq += (c - medianOf([p, c, q])) ** 2; n++;
    }
    if (n >= 3) cvs.push(Math.sqrt(sq / n) / mu);
  }
  return medianOf(cvs);
}

function landmarkStats(l: Landmarks): LandmarkStats {
  const n = l.frames.length;
  const { personFrameRatio, meanVisibility } = visibilityStats(l);
  return {
    frames: n,
    durationSec: l.durationSec > 0 ? l.durationSec : n / (l.fps > 0 ? l.fps : thresholds.sampleFps),
    personFrameRatio, meanVisibility,
    motionEnergy: motionEnergy(l), motionRange: motionRange(l),
    jitter: scaledJitter(l), boneLengthCv: boneLengthCv(l), boneNoiseCv: boneNoiseCv(l),
  };
}

const stable = (s: Pick<LandmarkStats, 'jitter' | 'boneNoiseCv'>) =>
  s.jitter <= thresholds.maxJitter && s.boneNoiseCv <= thresholds.maxBoneNoiseCv;

/** Zero-cost sanity check of extracted landmarks. Never throws. When only stability fails, retries once on a
 * 3-frame median-smoothed copy; on success `landmarks` carries that copy and `stats.smoothed` is true. */
export function checkLandmarks(l: Landmarks): LandmarkCheck {
  const safe: Landmarks = l && Array.isArray(l.frames) ? l : { ...(l ?? {}), frames: [] } as Landmarks;
  let stats = landmarkStats(safe);
  const reject = (reason: LandmarkReason, text: string, tips: string[]): LandmarkCheck => ({ ok: false, reason, text, tips, stats });
  const t = thresholds;

  if (stats.frames === 0 || stats.personFrameRatio < t.minPersonFrameRatio)
    return reject('no_human', `I could not find a person in most of the video (${Math.round(stats.personFrameRatio * 100)}% of frames).`,
      ['Make sure your whole body is in the frame.', 'Film in good light, against a plain background.', 'Keep the camera 2–4 m away from you.']);
  if (stats.durationSec > t.maxDurationSec)
    return reject('too_long', `The clip is ${Math.round(stats.durationSec)} s long; the limit is ${t.maxDurationSec} s.`,
      [`Trim the video to the key ${t.maxDurationSec} seconds.`, 'One set or one attempt per clip works best.']);
  if (stats.meanVisibility < t.minMeanVisibility)
    return reject('low_confidence', `Body points are detected with low confidence (${Math.round(stats.meanVisibility * 100)}%).`,
      ['Improve the lighting.', 'Avoid baggy clothes and anything covering your limbs.', 'Film from the side, with your full body visible.']);
  let healed: Landmarks | undefined;
  if (!stable(stats)) {
    const sm = medianSmooth(safe, 3);
    const smStats = { ...stats, jitter: scaledJitter(sm), boneNoiseCv: boneNoiseCv(sm), boneLengthCv: boneLengthCv(sm), motionEnergy: motionEnergy(sm), motionRange: motionRange(sm) };
    if (!stable(smStats))
      return reject('unstable', 'The detected skeleton is shaking too much to measure reliably.',
        ['Put the camera on a tripod or a stable surface.', 'Avoid zooming or panning while filming.', 'Make sure only one person is in the frame.']);
    healed = sm;
    stats = { ...smStats, smoothed: true };
  }
  if (stats.motionRange < t.minMotionEnergy)
    return reject('no_motion', 'I can see a person, but they barely move in this clip.',
      ['Record while you are actually performing the exercise.', 'Include at least one full repetition or stroke.']);
  return healed ? { ok: true, stats, landmarks: healed } : { ok: true, stats };
}

// ---------- tables ----------
export type TableCheck =
  | { ok: true; header: string[]; rows: Cell[][]; numericCols: string[]; timeCol?: string }
  | { ok: false; reason: 'bad_table'; text: string; tips: string[] };

const TIME_NAME = /(^t$|time|date|elapsed|^sec|seconds)/i;
const TABLE_TIPS = [
  'Export the activity as CSV from your watch or app (e.g. Garmin Connect, Strava).',
  'The file needs a header row, a time column and at least one numeric column.',
];

const isNum = (c: Cell | undefined) => typeof c === 'number' && Number.isFinite(c);

function findTimeCol(header: string[], rows: Cell[][], monotonic: boolean): number {
  for (let j = 0; j < header.length; j++) {
    if (!TIME_NAME.test(header[j])) continue;
    const s = rows.map(r => (r[j] === undefined ? NaN : toSeconds(r[j] as string | number)));
    if (s.some(x => !Number.isFinite(x))) continue;
    if (monotonic && s.some((x, i) => i > 0 && x <= s[i - 1])) continue;
    return j;
  }
  return -1;
}

/** Zero-cost sanity check of an uploaded table. Never throws. */
export function checkTable(text: string): TableCheck {
  const t = thresholds.table;
  const bad = (msg: string): TableCheck => ({ ok: false, reason: 'bad_table', text: msg, tips: TABLE_TIPS });
  const { header, rows } = parseCsvLoose(text);
  if (header.length === 0) return bad('The file is empty.');
  if (rows.length < t.minRows) return bad(`The table has only ${rows.length} data row(s); I need at least ${t.minRows}.`);

  const ti = findTimeCol(header, rows, t.requireMonotonicTime);
  const numericCols = header.filter((_, j) => j !== ti && rows.filter(r => isNum(r[j])).length >= 0.8 * rows.length);
  if (numericCols.length < t.minNumericCols) return bad('The table has no numeric measurement columns (depth, heart rate, speed…).');
  if (ti < 0) return bad('I could not find a time column with increasing values, so this does not look like an activity recording.');
  return { ok: true, header, rows, numericCols, timeCol: header[ti] };
}
