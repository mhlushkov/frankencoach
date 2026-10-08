import { expect, test } from 'bun:test'
import { eventColor, fileInput, metricRows, seriesText, MAX_FILE_BYTES } from './helpers'
import type { Landmarks } from '../../../contracts/types'

const lm: Landmarks = { version: 1, source: 'synthetic', videoHash: 'h', width: 1, height: 1, durationSec: 1, fps: 10, frames: [{ t: 0, landmarks: null }] }

test('fileInput: text formats → file input; landmarks.json → landmarks input; too big → error', () => {
  const csv = fileInput('dive.csv', 'text/csv', 't,depth\n0,1')
  expect(csv.input).toEqual({ kind: 'file', filename: 'dive.csv', mime: 'text/csv', text: 't,depth\n0,1' })
  const l = fileInput('landmarks.json', 'application/json', JSON.stringify(lm))
  expect(l.input?.kind).toBe('landmarks')
  const other = fileInput('export.json', 'application/json', '{"a":1}')
  expect(other.input?.kind).toBe('file')
  expect(fileInput('x.gpx', '', 'x'.repeat(MAX_FILE_BYTES + 1)).error).toBeDefined()
})

test('eventColor: errors red, success green, unknown grey', () => {
  expect(eventColor({ type: 'error', text: 'x' })).toBe('#c33')
  expect(eventColor({ type: 'answer', text: 'x' })).toBe('#2a7')
  expect(eventColor({ type: 'thinking', text: 'x' })).toBe('#888')
})

test('metricRows flattens metrics; seriesText summarises series', () => {
  expect(metricRows({ usable: true, metrics: { a: 1.23456, b: [1, 2] } })).toEqual([['a', '1.235'], ['b', '1, 2']])
  expect(seriesText({ depth_m: { t: [0, 1, 2], v: [0, 5, 10], unit: 'm' } })).toContain('depth_m (m): n=3')
  expect(seriesText(undefined)).toBe('')
})
