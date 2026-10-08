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
