// Pure helpers for the cropped second extraction pass (no DOM, no MediaPipe).
import type { Landmarks } from '../../../../contracts/types'

/** Normalized (0..1) rectangle in full-frame coordinates. */
export interface CropBox { x0: number; y0: number; x1: number; y1: number }

const BOX_VIS = 0.3

/** Same formulas as the server gate (pose-metrics visibilityStats). */
export function landmarkQuality(l: Landmarks): { personFrameRatio: number; meanVisibility: number } {
  if (!l.frames.length) return { personFrameRatio: 0, meanVisibility: 0 }
  let person = 0, visSum = 0, visN = 0
  for (const f of l.frames) {
    if (!f.landmarks) continue
    person++
    for (const p of f.landmarks) { visSum += p.visibility; visN++ }
  }
  return { personFrameRatio: person / l.frames.length, meanVisibility: visN ? visSum / visN : 0 }
}

export function needsSecondPass(l: Landmarks): boolean {
  const q = landmarkQuality(l)
  return q.personFrameRatio < 0.6 || q.meanVisibility < 0.5
}

/** Union bounding box of the detected person over the clip, padded by `pad` of its size on each side, clamped to the frame.
 * Undefined when no person was detected (nothing to crop to). */
export function personCropBox(l: Landmarks, pad = 0.25): CropBox | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const f of l.frames) {
    if (!f.landmarks) continue
    const pts = f.landmarks.some((p) => p.visibility >= BOX_VIS) ? f.landmarks.filter((p) => p.visibility >= BOX_VIS) : f.landmarks
    for (const p of pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
    }
  }
  if (!(x1 >= x0 && y1 >= y0)) return undefined
  const px = (x1 - x0) * pad, py = (y1 - y0) * pad
  const c = (v: number) => Math.min(1, Math.max(0, v))
  const box = { x0: c(x0 - px), y0: c(y0 - py), x1: c(x1 + px), y1: c(y1 + py) }
  return box.x1 - box.x0 > 0 && box.y1 - box.y0 > 0 ? box : undefined
}

/** Landmarks detected on the cropped image → full-frame normalized coordinates (z scales with the crop width, like x). */
export function mapFromCrop(l: Landmarks, box: CropBox, full: { width: number; height: number }): Landmarks {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0
  return {
    ...l,
    width: full.width,
    height: full.height,
    frames: l.frames.map((f) => ({
      t: f.t,
      landmarks: f.landmarks
        ? f.landmarks.map((p) => ({ x: box.x0 + p.x * bw, y: box.y0 + p.y * bh, z: p.z * bw, visibility: p.visibility }))
        : null,
    })),
  }
}

/** Keep the pass with the higher mean visibility (ties keep the first). */
export function betterPass(a: Landmarks, b: Landmarks): Landmarks {
  return landmarkQuality(b).meanVisibility > landmarkQuality(a).meanVisibility ? b : a
}
