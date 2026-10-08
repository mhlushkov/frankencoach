// Synthetic BlazePose landmark fixtures with known values. Run: bun data/synthetic/make-fixtures.ts (writes everything)
// Geometry is exact in PIXEL space (x*width, y*height): compute angles there, not on raw normalized coords.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, Landmark, Landmarks } from '../../contracts/types';
import { expectedDive, expectedRide, expectedRun, tableFixtures } from './make-tables';

export const FIXTURES_DIR = join(import.meta.dir, 'fixtures');
const W = 1920, H = 1080, FPS = 10;
const LEN = { torso: 300, thigh: 230, shin: 220, upperArm: 160, forearm: 140, head: 90 };
const rad = (d: number) => (d * Math.PI) / 180;

export interface Leg { thighAngleDeg: number; kneeAngleDeg: number }
export interface PoseParams {
  hipY: number; kneeAngleDeg: number; torsoAngleDeg: number; facing: 'left' | 'right';
  hipX?: number;
  thighAngleDeg?: number;   // from straight down, + = forward; default (180-knee)/2 (squat-like, foot under hip)
  armAngleDeg?: number;     // from straight down, + = forward
  leftLeg?: Leg; leftArmAngleDeg?: number;   // overrides for the left side (running)
  visibility?: number;
}

/** Body model → 33 BlazePose points. Angles (deg): torso from vertical-up toward facing; limbs from straight-down toward facing. */
export function pose(p: PoseParams): Landmark[] {
  const f = p.facing === 'right' ? 1 : -1;
  const dir = (deg: number): [number, number] => [f * Math.sin(rad(deg)), Math.cos(rad(deg))];
  const add = (a: number[], d: [number, number], k: number): [number, number] => [a[0] + d[0] * k, a[1] + d[1] * k];
  const hip: [number, number] = [(p.hipX ?? 0.5) * W, p.hipY * H];
  const torsoDir = dir(180 - p.torsoAngleDeg), fwd = dir(90 - p.torsoAngleDeg);
  const shoulder = add(hip, torsoDir, LEN.torso);

  const leg = (l: Leg) => {
    const shinDeg = l.thighAngleDeg - (180 - l.kneeAngleDeg);
    const knee = add(hip, dir(l.thighAngleDeg), LEN.thigh), ankle = add(knee, dir(shinDeg), LEN.shin);
    const foot = dir(shinDeg + 90);
    return { knee, ankle, heel: add(ankle, foot, -15), toe: add(ankle, foot, 50) };
  };
  const arm = (deg: number) => {
    const elbow = add(shoulder, dir(deg), LEN.upperArm), wrist = add(elbow, dir(deg), LEN.forearm);
    return { elbow, wrist, pinky: add(wrist, dir(deg + 15), 25), index: add(wrist, dir(deg), 30), thumb: add(wrist, dir(deg - 20), 20) };
  };
  const rightLeg = leg({ thighAngleDeg: p.thighAngleDeg ?? (180 - p.kneeAngleDeg) / 2, kneeAngleDeg: p.kneeAngleDeg });
  const leftLeg = p.leftLeg ? leg(p.leftLeg) : rightLeg;
  const rightArm = arm(p.armAngleDeg ?? 0), leftArm = arm(p.leftArmAngleDeg ?? p.armAngleDeg ?? 0);

  const nose = add(add(shoulder, torsoDir, LEN.head), fwd, 20);
  const head = (back: number, up: number) => add(add(nose, fwd, -back), torsoDir, up);
  // left (odd) side is the right side shifted by a constant offset → angles identical when legs/arms match
  const OFF: [number, number] = [-f * 10, -4];
  const L = (pt: [number, number]): [number, number] => [pt[0] + OFF[0], pt[1] + OFF[1]];
  const pts: [number, number][] = [
    nose,
    L(head(8, 10)), L(head(10, 12)), L(head(14, 10)),   // 1-3 left eye inner/eye/outer
    head(8, 10), head(10, 12), head(14, 10),            // 4-6 right eye
    L(head(30, 5)), head(30, 5),                        // 7-8 ears
    L(head(4, -15)), head(4, -15),                      // 9-10 mouth
    L(shoulder), shoulder,                              // 11-12
    L(leftArm.elbow), rightArm.elbow,                   // 13-14
    L(leftArm.wrist), rightArm.wrist,                   // 15-16
    L(leftArm.pinky), rightArm.pinky,                   // 17-18
    L(leftArm.index), rightArm.index,                   // 19-20
    L(leftArm.thumb), rightArm.thumb,                   // 21-22
    L(hip), hip,                                        // 23-24
    L(leftLeg.knee), rightLeg.knee,                     // 25-26
    L(leftLeg.ankle), rightLeg.ankle,                   // 27-28
    L(leftLeg.heel), rightLeg.heel,                     // 29-30
    L(leftLeg.toe), rightLeg.toe,                       // 31-32
  ];
  const vis = p.visibility ?? 0.95;
  return pts.map(([x, y], i) => {
    const left = i > 0 && i % 2 === 1;
    return { x: x / W, y: y / H, z: left ? -0.05 : 0.05, visibility: left ? vis - 0.1 : vis };
  });
}

function wrap(name: string, durationSec: number, frame: (t: number, i: number) => Landmark[] | null): Landmarks {
  const frames: Frame[] = [];
  for (let i = 0; i < Math.round(durationSec * FPS); i++) frames.push({ t: i / FPS, landmarks: frame(i / FPS, i) });
  return { version: 1, source: 'synthetic', videoHash: `synthetic-${name}`, width: W, height: H, durationSec, fps: FPS, frames };
}

function rng(seed: number) {   // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- squat ----------
export const expectedSquat = { kneeAngleMin: 90, reps: 2 };
export function makeSquat({ durationSec = 4, minKneeAngle = 90, reps = 2, visibility = 0.95 } = {}): Landmarks {
  const GROUND = 0.9 * H, period = durationSec / reps;
  return wrap('squat', durationSec, (t) => {
    const k = 180 - ((180 - minKneeAngle) * (1 - Math.cos((2 * Math.PI * t) / period))) / 2;
    const a = rad((180 - k) / 2);   // thigh forward, shin back → ankle stays on the ground under the knee line
    const hipY = (GROUND - (LEN.thigh + LEN.shin) * Math.cos(a)) / H;
    const hipX = 0.5 - ((LEN.thigh - LEN.shin) * Math.sin(a)) / W;
    return pose({ hipY, hipX, kneeAngleDeg: k, torsoAngleDeg: 0.6 * (180 - k) / 2, facing: 'right', armAngleDeg: 90 * (1 - k / 180) * 2, visibility });
  });
}

// ---------- freedive: horizontal prone body, straight-ish legs kicking ----------
export const expectedFreedive = { kickHz: 1.2, kneeAngleMean: 170 };
export function makeFreedive({ durationSec = 6, kickHz = 1.2, kickAmplitude = 0.08 } = {}): Landmarks {
  const knee = expectedFreedive.kneeAngleMean;
  // leg vector hip→ankle at thigh=-90°: amplitude of ankle y for a leg rotation of ±A is R·cosφ·sinA
  const shin = rad(-90 - (180 - knee));
  const vx = -LEN.thigh + LEN.shin * Math.sin(shin), vy = LEN.shin * Math.cos(shin);
  const R = Math.hypot(vx, vy), cosPhi = Math.abs(vx) / R;
  const A = Math.asin((kickAmplitude * H) / (R * cosPhi)) * (180 / Math.PI);
  return wrap('freedive', durationSec, (t) => pose({
    hipY: 0.5, hipX: 0.35, kneeAngleDeg: knee, torsoAngleDeg: 90, facing: 'right', armAngleDeg: 90,
    thighAngleDeg: -90 + A * Math.sin(2 * Math.PI * kickHz * t),
  }));
}

// ---------- running (treadmill: hips stay in place) ----------
export const expectedRunning = { strideHz: 2.5 };
export function makeRunning({ durationSec = 4, strideHz = 2.5 } = {}): Landmarks {
  return wrap('running', durationSec, (t) => {
    const ph = 2 * Math.PI * strideHz * t + 0.3;
    const legAt = (p: number): Leg => ({ thighAngleDeg: 30 * Math.sin(p), kneeAngleDeg: 140 + 30 * Math.cos(p) });
    const right = legAt(ph), left = legAt(ph + Math.PI);
    return pose({
      hipY: 0.5 + 0.01 * Math.cos(2 * ph), kneeAngleDeg: right.kneeAngleDeg, thighAngleDeg: right.thighAngleDeg,
      torsoAngleDeg: 10, facing: 'right', leftLeg: left, armAngleDeg: -0.8 * right.thighAngleDeg, leftArmAngleDeg: -0.8 * left.thighAngleDeg,
    });
  });
}

// ---------- negatives / gate cases ----------
const standing = () => pose({ hipY: 0.9 - (LEN.thigh + LEN.shin) / H, kneeAngleDeg: 180, torsoAngleDeg: 0, facing: 'right' });
export const makeStatic = ({ durationSec = 4 } = {}) => wrap('static', durationSec, () => standing());
export const makeNoHuman = ({ durationSec = 4 } = {}) => wrap('noHuman', durationSec, () => null);
export function makeGarbage({ durationSec = 4, seed = 7 } = {}): Landmarks {
  const rand = rng(seed);
  return wrap('garbage', durationSec, () => Array.from({ length: 33 }, () => ({ x: rand(), y: rand(), z: rand() - 0.5, visibility: rand() })));
}
export function makeJitter({ durationSec = 4, seed = 11, noise = 0.03 } = {}): Landmarks {
  const rand = rng(seed), base = standing();
  return wrap('jitter', durationSec, () => base.map((p) => ({ ...p, x: p.x + (rand() - 0.5) * 2 * noise, y: p.y + (rand() - 0.5) * 2 * noise })));
}
export function makeLowVisibility({ durationSec = 4 } = {}): Landmarks {
  return { ...makeSquat({ durationSec, visibility: 0.35 }), videoHash: 'synthetic-lowVisibility' };
}

export const landmarkFixtures: Record<string, () => Landmarks> = {
  squat: () => makeSquat(), freedive: () => makeFreedive(), running: () => makeRunning(), static: () => makeStatic(),
  garbage: () => makeGarbage(), noHuman: () => makeNoHuman(), jitter: () => makeJitter(), lowVisibility: () => makeLowVisibility(),
};

export function buildExpected() {
  return {
    notes: 'Known values of synthetic fixtures. Landmark angles are exact in pixel space (x*width, y*height). Table values: compare with ~5% tolerance.',
    squat: { file: 'squat.landmarks.json', ...expectedSquat },
    freedive: { file: 'freedive.landmarks.json', ...expectedFreedive, kickAmplitude: 0.08 },
    running: { file: 'running.landmarks.json', ...expectedRunning },
    dive: { file: 'dive-garmin-like.csv', ...expectedDive },
    ride: { file: 'ride-strava-like.csv', ...expectedRide },
    run: { file: 'run-apple-like.csv', ...expectedRun },
    negatives: {
      'static.landmarks.json': 'no_motion', 'noHuman.landmarks.json': 'no_human', 'garbage.landmarks.json': 'no_human or low_confidence',
      'jitter.landmarks.json': 'low_confidence', 'lowVisibility.landmarks.json': 'low_confidence',
      'shopping-list.csv': 'bad_table', 'empty.csv': 'bad_table', 'no-time.csv': 'bad_table', 'one-row.csv': 'bad_table',
    },
  };
}

export function writeAll(dir = FIXTURES_DIR) {
  mkdirSync(dir, { recursive: true });
  for (const [name, make] of Object.entries(landmarkFixtures)) writeFileSync(join(dir, `${name}.landmarks.json`), JSON.stringify(make()));
  for (const [name, make] of Object.entries(tableFixtures)) writeFileSync(join(dir, name), make());
  writeFileSync(join(dir, 'expected.json'), JSON.stringify(buildExpected(), null, 2) + '\n');
}

if (import.meta.main) writeAll();
