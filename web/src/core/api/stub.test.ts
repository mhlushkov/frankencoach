import { expect, test } from 'bun:test'
import { FIXTURES, pickFixture, stubAnalyze, stubEvents } from './stub'
import { initialState, reducer } from '../state'
import type { AgentEvent, AnalyzeRequest, Landmarks } from '../../../../contracts/types'

const person = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))
const lm = (empty = false): Landmarks => ({
  version: 1, source: 'synthetic', videoHash: 'h', width: 1, height: 1, durationSec: 1, fps: 10,
  frames: [{ t: 0, landmarks: empty ? null : person }, { t: 0.1, landmarks: empty ? null : person }],
})
const video = (message: string, extra: Partial<AnalyzeRequest> = {}): AnalyzeRequest =>
  ({ sessionId: 's', message, input: { kind: 'landmarks', landmarks: lm() }, ...extra })
const file = (text: string, extra: Partial<AnalyzeRequest> = {}): AnalyzeRequest =>
  ({ sessionId: 's', message: 'my dive', input: { kind: 'file', filename: 'dive.csv', mime: 'text/csv', text }, ...extra })

const KNOWN = new Set(['thinking', 'rejected', 'clarify', 'identified', 'plan', 'reused', 'missing_capability', 'growing', 'test_result',
  'authority_check', 'tool_installed', 'parsed', 'tool_used', 'answer', 'refused', 'cost', 'error'])

test('all 8 fixtures exist and contain only contract event types', () => {
  expect(Object.keys(FIXTURES).sort()).toEqual([
    'happy-grow-table-chain', 'happy-grow-video', 'missing-capability', 'refused-clearance',
    'rejected-bad-table', 'rejected-mismatch', 'rejected-no-human', 'reused-video',
  ])
  for (const evs of Object.values(FIXTURES)) for (const e of evs) expect(KNOWN.has(e.type)).toBe(true)
})

test('pickFixture routes by message / sportHint / input.kind', () => {
  expect(pickFixture(video('am I ready for 40 m?'))).toBe('refused-clearance')
  expect(pickFixture(video('check my squat'))).toBe('reused-video')
  expect(pickFixture(video('how was my dive', { sportHint: 'freediving' }))).toBe('missing-capability')
  expect(pickFixture(video('how was my dive', { confirmGrow: true }))).toBe('happy-grow-video')
  expect(pickFixture(video('swim', { sportHint: 'mismatch' }))).toBe('rejected-mismatch')
  expect(pickFixture({ ...video('x'), input: { kind: 'landmarks', landmarks: lm(true) } })).toBe('rejected-no-human')
  expect(pickFixture(file('hello world'))).toBe('rejected-bad-table')
  expect(pickFixture(file('time,depth\n0,0\n1,2', { confirmGrow: true }))).toBe('happy-grow-table-chain')
  expect(pickFixture(video('x', { sportHint: 'rejected-bad-table' }))).toBe('rejected-bad-table')
})

test('table without confirmGrow stops at a missing_capability summing all missing steps', () => {
  const evs = stubEvents(file('time,depth\n0,0\n1,2'))
  const last = evs.at(-1)!
  expect(last.type).toBe('missing_capability')
  if (last.type === 'missing_capability') expect(last.estimateUsd).toBeGreaterThan(0.5)
})

test('stubAnalyze replays events through the reducer to a coherent state', async () => {
  const got: AgentEvent[] = []
  await stubAnalyze(file('time,depth\n0,0\n1,2', { confirmGrow: true }), (e) => got.push(e), undefined, { minMs: 0, maxMs: 0 })
  const s = got.reduce((st, event) => reducer(st, { type: 'event', event }), reducer(initialState, { type: 'send', request: file('x') }))
  expect(s.session?.source).toBe('garmin-dive-csv')
  expect(s.result?.usable).toBe(true)
  expect(s.chain?.every((c) => !c.missing)).toBe(true)
  expect(s.tools.map((t) => t.name)).toEqual(['garmin-dive-csv', 'freediving-profile'])
})

test('stubAnalyze honours abort', async () => {
  const ac = new AbortController()
  const got: AgentEvent[] = []
  const p = stubAnalyze(video('x', { confirmGrow: true }), (e) => { got.push(e); ac.abort() }, ac.signal, { minMs: 0, maxMs: 0 })
  await p.catch(() => {})
  expect(got).toHaveLength(1)
})
