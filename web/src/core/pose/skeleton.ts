import type { Frame, Landmarks } from '../../../../contracts/types'

// BlazePose 33-point bones for overlay drawing. Left = odd indices.
export const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 11], [0, 12],                 // head → shoulders
  [11, 12], [11, 23], [12, 24], [23, 24],   // torso
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],   // left arm + hand
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],   // right arm + hand
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],   // left leg + foot
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],   // right leg + foot
]

// Nearest frame to time t (seconds); frames are sorted by t.
export function frameAt(l: Landmarks, t: number): Frame | undefined {
  const f = l.frames
  if (!f.length) return undefined
  let lo = 0
  let hi = f.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (f[mid].t < t) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(f[lo - 1].t - t) <= Math.abs(f[lo].t - t)) return f[lo - 1]
  return f[lo]
}

// Smooth overlay: frames are sampled at ~10 fps but video plays at 30, so blend the two neighbouring frames by time
// (x, y, z linear; visibility = the weaker of the two). A null neighbour or t outside the clip → frameAt.
export function frameLerp(l: Landmarks, t: number): Frame | undefined {
  const f = l.frames
  if (f.length < 2 || !(t > f[0].t && t < f[f.length - 1].t)) return frameAt(l, t)
  let lo = 0
  let hi = f.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (f[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = f[lo], b = f[hi]
  if (t === a.t) return a
  if (!a.landmarks || !b.landmarks || b.t <= a.t) return frameAt(l, t)
  const k = (t - a.t) / (b.t - a.t)
  const bl = b.landmarks
  const n = Math.min(a.landmarks.length, bl.length)
  return {
    t,
    landmarks: a.landmarks.slice(0, n).map((p, i) => ({
      x: p.x + (bl[i].x - p.x) * k,
      y: p.y + (bl[i].y - p.y) * k,
      z: p.z + (bl[i].z - p.z) * k,
      visibility: Math.min(p.visibility, bl[i].visibility),
    })),
  }
}
