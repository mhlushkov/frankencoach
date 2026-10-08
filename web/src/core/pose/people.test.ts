import { expect, test } from 'bun:test'
import { bestFrameFor, pickMain, selectPerson, trackPeople, type Candidate } from './people'
import type { Landmark } from '../../../../contracts/types'

const meta = { width: 1280, height: 720, fps: 10, durationSec: 4, videoHash: 'h' }

// 33-point body standing at horizontal centre cx, `h` tall, feet at y = 0.9.
function body(cx: number, h = 0.5, vis = 0.9): Landmark[] {
  const top = 0.9 - h
  return Array.from({ length: 33 }, (_, i) => {
    const side = i % 2 ? -1 : 1
    const y = i === 0 ? top : i < 23 ? top + h * 0.25 : i < 25 ? top + h * 0.55 : top + h
    return { x: cx + (i === 0 ? 0 : side * 0.04), y, z: 0, visibility: vis }
  })
}

const times = (n: number) => Array.from({ length: n }, (_, i) => Math.round(i * 0.1 * 1000) / 1000)

test('two people walking towards each other and crossing keep their ids', () => {
  const n = 40
  // A walks 0.2 → 0.8, B walks 0.8 → 0.2: per-frame step 0.015, far below 0.6 × 0.5 height
  const xa = (i: number) => 0.2 + (0.6 * i) / (n - 1)
  const xb = (i: number) => 0.8 - (0.6 * i) / (n - 1)
  // A is taller (closer to the camera) → bigger box → ranked first; MediaPipe order flips half-way
  const cands: Candidate[] = times(n).map((t, i) => ({
    t, poses: i < n / 2 ? [body(xa(i), 0.6), body(xb(i), 0.4)] : [body(xb(i), 0.4), body(xa(i), 0.6)],
  }))
  const people = trackPeople(cands, meta)
  expect(people.map((p) => p.id)).toEqual([1, 2])
  expect(people.map((p) => p.presence)).toEqual([1, 1])
  const [a, b] = people
  expect(a.meanBoxArea).toBeGreaterThan(b.meanBoxArea)
  // A's hips go monotonically right, B's left: no swap at the crossing
  const ax = a.landmarks.frames.map((f) => f.landmarks![23].x)
  const bx = b.landmarks.frames.map((f) => f.landmarks![23].x)
  for (let i = 1; i < n; i++) {
    expect(ax[i]).toBeGreaterThan(ax[i - 1])
    expect(bx[i - 1]).toBeGreaterThan(bx[i])
  }
  expect(pickMain(people)).toBe(a)
  expect(selectPerson(people, 2)).toBe(b.landmarks)
  expect(selectPerson(people, 9)).toBeUndefined()
  const { frames: _f, ...head } = a.landmarks
  expect(head).toEqual({ version: 1, source: 'mediapipe-pose-full', videoHash: 'h', width: 1280, height: 720, fps: 10, durationSec: 4 })
})

test('a passer-by present in 10% of the frames is dropped', () => {
  const cands: Candidate[] = times(30).map((t, i) => ({ t, poses: i >= 10 && i < 13 ? [body(0.3), body(0.85, 0.3)] : [body(0.3)] }))
  const people = trackPeople(cands, meta)
  expect(people).toHaveLength(1)
  expect(people[0].presence).toBe(1)
})

test('one person → one track whose landmarks deep-equal the frames as extracted', () => {
  const cands: Candidate[] = times(20).map((t, i) => ({ t, poses: i === 5 ? [] : [body(0.4 + i * 0.005)] }))
  const people = trackPeople(cands, meta)
  expect(people).toHaveLength(1)
  expect(people[0].id).toBe(1)
  expect(people[0].presence).toBe(19 / 20)
  expect(people[0].landmarks.frames).toEqual(cands.map((c) => ({ t: c.t, landmarks: c.poses[0] ?? null })))
})

test('nobody in the clip → no people, no best frame', () => {
  const people = trackPeople(times(5).map((t) => ({ t, poses: [] })), meta)
  expect(people).toEqual([])
  expect(pickMain(people)).toBeUndefined()
  expect(bestFrameFor(people)).toBeUndefined()
})

test('bestFrameFor picks the earliest frame where both are present, with their boxes', () => {
  // B only appears from frame 4 on
  const cands: Candidate[] = times(10).map((t, i) => ({ t, poses: i < 4 ? [body(0.3, 0.6)] : [body(0.3, 0.6), body(0.7, 0.4)] }))
  const people = trackPeople(cands, meta)
  expect(people).toHaveLength(2)
  const best = bestFrameFor(people)!
  expect(best.t).toBe(0.4)
  expect(best.boxes.map((b) => b.id)).toEqual([1, 2])
  const [b1, b2] = best.boxes
  expect(0.3).toBeGreaterThan(b1.x0); expect(b1.x1).toBeGreaterThan(0.3)
  expect(0.7).toBeGreaterThan(b2.x0); expect(b2.x1).toBeGreaterThan(0.7)
  expect(Math.round((b1.y1 - b1.y0) * 1e6) / 1e6).toBe(0.6)
})
