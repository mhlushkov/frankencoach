// Who to watch: with one person (or none) there is nothing to ask; with several, ask until the member taps one.
export type ChooserState = 'none' | 'asking' | 'picked'

export function chooserState(peopleCount: number, picked: number | undefined): ChooserState {
  if (peopleCount < 2) return 'none'
  return picked === undefined ? 'asking' : 'picked'
}

export interface PickBox { id: number; x0: number; y0: number; x1: number; y1: number }

/** Pad a normalized box so a finger can hit it, clamped to the picture. */
export function padBox(b: PickBox, pad = 0.02): PickBox {
  return { id: b.id, x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad), x1: Math.min(1, b.x1 + pad), y1: Math.min(1, b.y1 + pad) }
}

/** The box under a normalized point; overlapping boxes → the smallest one (the person in front is usually framed tighter). */
export function boxAt(boxes: PickBox[], x: number, y: number): number | undefined {
  let best: PickBox | undefined
  for (const b of boxes) {
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
    if (!best || (b.x1 - b.x0) * (b.y1 - b.y0) < (best.x1 - best.x0) * (best.y1 - best.y0)) best = b
  }
  return best?.id
}
