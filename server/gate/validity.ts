import type { Landmarks } from '../../contracts/types';
import thresholds from '../../contracts/gate-thresholds.json';
import { jitter, motionEnergy, visibilityStats } from '../../tools/pose-metrics/index';
import { parseCsvLoose, toSeconds, type Cell } from '../../tools/series-core/index';

// ---------- landmarks ----------
export type LandmarkReason = 'no_human' | 'no_motion' | 'unstable' | 'low_confidence' | 'too_long';
export interface LandmarkStats {
  frames: number; durationSec: number;
  personFrameRatio: number; meanVisibility: number;
  motionEnergy: number;   // pose-metrics: mean per-frame displacement
  motionRange: number;    // largest x/y range of any visible landmark over the clip (compared to minMotionEnergy)
  jitter: number;         // pose-metrics jitter
  boneLengthCv: number;   // median coefficient of variation of limb lengths: noise breaks the skeleton, real motion does not
}
export type LandmarkCheck =
  | { ok: true; stats: LandmarkStats }
  | { ok: false; reason: LandmarkReason; text: string; tips: string[]; stats: LandmarkStats };

const MIN_VIS = 0.3;
const MAX_BONE_CV = 0.08;
const BONES = [[11, 23], [12, 24], [23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [13, 15], [12, 14], [14, 16]];

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

function boneLengthCv(l: Landmarks): number {
  const w = l.width > 0 ? l.width : 1, h = l.height > 0 ? l.height : 1;
  const cvs: number[] = [];
  for (const [a, b] of BONES) {
    const v: number[] = [];
    for (const f of l.frames) {
      const m = f.landmarks;
      if (!m || !m[a] || !m[b] || m[a].visibility < MIN_VIS || m[b].visibility < MIN_VIS) continue;
      v.push(Math.hypot((m[a].x - m[b].x) * w, (m[a].y - m[b].y) * h));
    }
    if (v.length < 3) continue;
    const mu = v.reduce((s, x) => s + x, 0) / v.length;
    if (mu <= 0) continue;
    cvs.push(Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length) / mu);
  }
  if (!cvs.length) return 0;
  cvs.sort((x, y) => x - y);
  return cvs[Math.floor(cvs.length / 2)];
}

function landmarkStats(l: Landmarks): LandmarkStats {
  const n = l.frames.length;
  const { personFrameRatio, meanVisibility } = visibilityStats(l);
  return {
    frames: n,
    durationSec: l.durationSec > 0 ? l.durationSec : n / (l.fps > 0 ? l.fps : thresholds.sampleFps),
    personFrameRatio, meanVisibility,
    motionEnergy: motionEnergy(l), motionRange: motionRange(l), jitter: jitter(l), boneLengthCv: boneLengthCv(l),
  };
}

/** Zero-cost sanity check of extracted landmarks. Never throws. */
export function checkLandmarks(l: Landmarks): LandmarkCheck {
  const safe: Landmarks = l && Array.isArray(l.frames) ? l : { ...(l ?? {}), frames: [] } as Landmarks;
  const stats = landmarkStats(safe);
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
  if (stats.jitter > t.maxJitter || stats.boneLengthCv > MAX_BONE_CV)
    return reject('unstable', 'The detected skeleton is shaking too much to measure reliably.',
      ['Put the camera on a tripod or a stable surface.', 'Avoid zooming or panning while filming.', 'Make sure only one person is in the frame.']);
  if (stats.motionRange < t.minMotionEnergy)
    return reject('no_motion', 'I can see a person, but they barely move in this clip.',
      ['Record while you are actually performing the exercise.', 'Include at least one full repetition or stroke.']);
  return { ok: true, stats };
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
