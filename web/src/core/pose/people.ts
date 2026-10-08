// Pure multi-person tracking over raw MediaPipe poses (no DOM, no MediaPipe).
// One Landmarks per person, as the contract wants; the chooser data lives beside it.
import type { Landmark, Landmarks } from '../../../../contracts/types'

/** Every pose MediaPipe returned for one sampled frame (internal, not the contract). */
export interface Candidate { t: number; poses: Landmark[][] }

export interface TrackMeta {
  width: number; height: number; fps: number; durationSec: number; videoHash: string
  source?: Landmarks['source']
}

export interface Person { id: number; presence: number; meanBoxArea: number; landmarks: Landmarks }

export interface Box { x0: number; y0: number; x1: number; y1: number }

const BOX_VIS = 0.3
/** A candidate joins a track only when its anchor moved less than this × the track's last box height. */
const MATCH_FACTOR = 0.6
/** Tracks seen in fewer frames than this share are passers-by. */
const MIN_PRESENCE = 0.2

/** Box of the visible points (all points when none is visible), normalized coordinates. */
export function poseBox(pts: Landmark[]): Box {
  const vis = pts.filter((p) => p.visibility >= BOX_VIS)
  const use = vis.length ? vis : pts
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of use) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
  }
  return { x0, y0, x1, y1 }
}

// Midpoint of the hips (23, 24), else of the shoulders (11, 12), else the box centre.
function anchor(pts: Landmark[], box: Box): { x: number; y: number } {
  for (const [a, b] of [[23, 24], [11, 12]] as const) {
    const pa = pts[a], pb = pts[b]
    if (pa && pb && Math.min(pa.visibility, pb.visibility) >= BOX_VIS) return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
  }
  const pa = pts[23], pb = pts[24]
  if (pa && pb) return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
}

interface Track { poses: (Landmark[] | null)[]; last: { x: number; y: number }; lastH: number; areaSum: number; n: number }

/** Greedy nearest match frame to frame; each track becomes a Landmarks with null where it was absent. */
export function trackPeople(candidates: Candidate[], meta: TrackMeta): Person[] {
  const total = candidates.length
  const tracks: Track[] = []
  candidates.forEach((c, fi) => {
    const items = c.poses.map((pts) => {
      const box = poseBox(pts)
      return { pts, box, a: anchor(pts, box) }
    })
    const pairs: { ci: number; ti: number; d: number }[] = []
    items.forEach((it, ci) => tracks.forEach((tr, ti) => {
      const d = Math.hypot(it.a.x - tr.last.x, it.a.y - tr.last.y)
      if (d < MATCH_FACTOR * tr.lastH) pairs.push({ ci, ti, d })
    }))
    pairs.sort((p, q) => p.d - q.d)
    const usedC = new Set<number>(), usedT = new Set<number>()
    const assign = new Map<number, number>()
    for (const p of pairs) {
      if (usedC.has(p.ci) || usedT.has(p.ti)) continue
      usedC.add(p.ci); usedT.add(p.ti); assign.set(p.ci, p.ti)
    }
    items.forEach((it, ci) => {
      let tr = tracks[assign.get(ci) ?? -1]
      if (!tr) {
        tr = { poses: new Array(fi).fill(null), last: it.a, lastH: 0, areaSum: 0, n: 0 }
        tracks.push(tr)
      }
      tr.poses[fi] = it.pts
      tr.last = it.a
      tr.lastH = it.box.y1 - it.box.y0
      tr.areaSum += (it.box.x1 - it.box.x0) * (it.box.y1 - it.box.y0)
      tr.n++
    })
    for (const tr of tracks) if (tr.poses.length <= fi) tr.poses[fi] = null
  })
  const { source = 'mediapipe-pose-full', ...m } = meta
  return tracks
    .map((tr) => ({ presence: total ? tr.n / total : 0, meanBoxArea: tr.n ? tr.areaSum / tr.n : 0, tr }))
    .filter((p) => p.presence >= MIN_PRESENCE)
    .sort((a, b) => b.presence * b.meanBoxArea - a.presence * a.meanBoxArea)
    .map(({ presence, meanBoxArea, tr }, i) => ({
      id: i + 1,
      presence,
      meanBoxArea,
      landmarks: {
        version: 1 as const, source, videoHash: m.videoHash, width: m.width, height: m.height, durationSec: m.durationSec, fps: m.fps,
        frames: candidates.map((c, fi) => ({ t: c.t, landmarks: tr.poses[fi] ?? null })),
      },
    }))
}

export function pickMain(people: Person[]): Person | undefined {
  return people[0]
}

export function selectPerson(people: Person[], id: number): Landmarks | undefined {
  return people.find((p) => p.id === id)?.landmarks
}

/** The frame where the most people are present at once (ties: earliest), with each present person's box, for a numbered chooser. */
export function bestFrameFor(people: Person[]): { t: number; boxes: ({ id: number } & Box)[] } | undefined {
  const frames = people[0]?.landmarks.frames ?? []
  let best = -1, bestN = 0
  frames.forEach((_, i) => {
    const n = people.filter((p) => p.landmarks.frames[i]?.landmarks).length
    if (n > bestN) { bestN = n; best = i }
  })
  if (best < 0) return undefined
  const boxes = people.flatMap((p) => {
    const pts = p.landmarks.frames[best]?.landmarks
    return pts ? [{ id: p.id, ...poseBox(pts) }] : []
  })
  return { t: frames[best].t, boxes }
}
