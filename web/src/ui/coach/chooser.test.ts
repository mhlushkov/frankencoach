import { expect, test } from 'bun:test'
import { boxAt, chooserState, padBox } from './chooser'

test('one person or nobody: nothing to ask', () => {
  expect(chooserState(0, undefined)).toBe('none')
  expect(chooserState(1, undefined)).toBe('none')
  expect(chooserState(1, 1)).toBe('none')
})

test('several people: ask until one is picked', () => {
  expect(chooserState(2, undefined)).toBe('asking')
  expect(chooserState(3, undefined)).toBe('asking')
  expect(chooserState(2, 2)).toBe('picked')
  expect(chooserState(3, 1)).toBe('picked')
})

test('a tap picks the box under it, the smaller one when they overlap', () => {
  const boxes = [{ id: 1, x0: 0.1, y0: 0.1, x1: 0.6, y1: 0.9 }, { id: 2, x0: 0.5, y0: 0.3, x1: 0.7, y1: 0.8 }]
  expect(boxAt(boxes, 0.2, 0.5)).toBe(1)
  expect(boxAt(boxes, 0.55, 0.5)).toBe(2)
  expect(boxAt(boxes, 0.65, 0.5)).toBe(2)
  expect(boxAt(boxes, 0.9, 0.5)).toBeUndefined()
})

test('padding stays inside the picture', () => {
  expect(padBox({ id: 1, x0: 0.01, y0: 0.5, x1: 0.99, y1: 0.6 }, 0.02)).toEqual({ id: 1, x0: 0, y0: 0.48, x1: 1, y1: 0.62 })
})
