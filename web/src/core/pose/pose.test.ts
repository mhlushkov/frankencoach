import { expect, test } from 'bun:test'
import { BONES, frameAt } from './skeleton'
import { sha256 } from './hash'
import { createLandmarkCache } from './cache'
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
