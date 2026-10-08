import { expect, test } from 'bun:test'
import { BONES, frameAt } from './skeleton'
import { sha256 } from './hash'
import { createLandmarkCache } from './cache'
import { betterPass, landmarkQuality, mapFromCrop, needsSecondPass, personCropBox } from './crop'
import type { Landmarks } from '../../../../contracts/types'

const lm: Landmarks = {
  version: 1, source: 'synthetic', videoHash: 'h', width: 1, height: 1, durationSec: 0.3, fps: 10,
  frames: [0, 0.1, 0.2, 0.3].map((t) => ({ t, landmarks: null })),
}

test('BONES are valid BlazePose index pairs', () => {
  expect(BONES.length).toBeGreaterThan(10)
  for (const [a, b] of BONES) {
    expect(a >= 0 && a < 33 && b >= 0 && b < 33).toBe(true)
  }
})

test('frameAt picks the nearest frame and clamps', () => {
  expect(frameAt(lm, 0.14)?.t).toBe(0.1)
  expect(frameAt(lm, 0.16)?.t).toBe(0.2)
  expect(frameAt(lm, -1)?.t).toBe(0)
  expect(frameAt(lm, 99)?.t).toBe(0.3)
  expect(frameAt({ ...lm, frames: [] }, 1)).toBeUndefined()
})

test('sha256 of a blob is hex', async () => {
  expect(await sha256(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('cache round-trips and falls back to memory when storage throws', () => {
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') }, removeItem: () => {} }
  const c = createLandmarkCache(broken)
  expect(c.get('x')).toBeUndefined()
  c.set('x', lm)
  expect(c.get('x')?.fps).toBe(10)
  const mem = new Map<string, string>()
  const c2 = createLandmarkCache({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) })
  c2.set('y', lm)
  expect([...mem.keys()]).toEqual(['fc:lm:y'])
  expect(c2.get('y')?.frames).toHaveLength(4)
})

const r6 = (v: number) => Math.round(v * 1e6) / 1e6

const person = (pts: [number, number, number][]): Landmarks => ({
  version: 1, source: 'synthetic', videoHash: 'h', width: 1280, height: 720, durationSec: 0.2, fps: 10,
  frames: [
    { t: 0, landmarks: pts.map(([x, y, visibility]) => ({ x, y, z: 0.1, visibility })) },
    { t: 0.1, landmarks: null },
  ],
})

test('second pass triggers on low person ratio or low visibility, same formulas as the gate', () => {
  expect(landmarkQuality(person([[0.5, 0.5, 0.9], [0.6, 0.6, 0.7]]))).toEqual({ personFrameRatio: 0.5, meanVisibility: 0.8 })
  expect(needsSecondPass(person([[0.5, 0.5, 0.9]]))).toBe(true)   // half the frames have no person
  const full = person([[0.5, 0.5, 0.4]])
  full.frames[1] = { t: 0.1, landmarks: full.frames[0].landmarks }
  expect(needsSecondPass(full)).toBe(true)                          // visibility 0.4
  full.frames.forEach((f) => f.landmarks!.forEach((p) => (p.visibility = 0.9)))
  expect(needsSecondPass(full)).toBe(false)
})

test('crop box = union of the person, padded 25% and clamped to the frame', () => {
  const b = personCropBox(person([[0.4, 0.2, 0.9], [0.6, 0.6, 0.9], [0.99, 0.99, 0.1]]))!   // low-visibility outlier ignored
  expect(r6(b.x0)).toBe(0.35); expect(r6(b.x1)).toBe(0.65)
  expect(r6(b.y0)).toBe(0.1); expect(r6(b.y1)).toBe(0.7)
  const edge = personCropBox(person([[0.0, 0.0, 0.9], [0.9, 0.95, 0.9]]))!
  expect(edge).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 })
  expect(personCropBox({ ...lm })).toBeUndefined()
})

test('cropped landmarks map back to full-frame normalized coordinates', () => {
  const box = { x0: 0.25, y0: 0.1, x1: 0.75, y1: 0.5 }
  const inCrop = person([[0, 0, 0.9], [1, 1, 0.8], [0.5, 0.25, 0.7]])
  const m = mapFromCrop({ ...inCrop, width: 640, height: 288 }, box, { width: 1280, height: 720 })
  expect(m.width).toBe(1280)
  expect(m.height).toBe(720)
  const p = m.frames[0].landmarks!
  expect([p[0].x, p[0].y]).toEqual([0.25, 0.1])
  expect([p[1].x, p[1].y]).toEqual([0.75, 0.5])
  expect(r6(p[2].x)).toBe(0.5); expect(r6(p[2].y)).toBe(0.2)
  expect(r6(p[2].z)).toBe(0.05)           // z scales with the crop width, like x
  expect(p[2].visibility).toBe(0.7)
  expect(m.frames[1].landmarks).toBe(null)
  expect(m.frames.map((f) => f.t)).toEqual([0, 0.1])
})

test('the pass with higher mean visibility wins', () => {
  const a = person([[0.5, 0.5, 0.4]]), b = person([[0.5, 0.5, 0.6]])
  expect(betterPass(a, b)).toBe(b)
  expect(betterPass(b, a)).toBe(b)
  expect(betterPass(a, a)).toBe(a)
})
