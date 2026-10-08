import { expect, test } from 'bun:test'
import { initialState, reducer, selectors } from './state'
import type { Action, AgentEvent, AnalyzeRequest, AppState, Landmarks, ToolManifest } from '../../../contracts/types'

const lm: Landmarks = { version: 1, source: 'synthetic', videoHash: 'h', width: 1, height: 1, durationSec: 1, fps: 10, frames: [] }
const req: AnalyzeRequest = { sessionId: 's', message: 'how is my dive?', input: { kind: 'landmarks', landmarks: lm, frames: ['data:a'] } }
const manifest: ToolManifest = {
  name: 'freediving-technique', kind: 'analyzer', activity: 'freediving', inputType: 'landmarks', outputType: 'result',
  description: 'd', permissions: ['compute'], createdBy: 'agent', createdAt: '2026-10-08T00:00:00Z', costUsd: 0.4, uses: 0, testStatus: 'pass',
}

const run = (actions: Action[], s: AppState = initialState) => actions.reduce(reducer, s)
const ev = (event: AgentEvent): Action => ({ type: 'event', event })

test('inputReady → send → analyzing with user message and lastRequest', () => {
  const s = run([
    { type: 'inputReady', input: req.input, inputName: 'dive.mp4', frames: ['data:a'] },
    { type: 'send', request: req },
  ])
  expect(s.status).toBe('analyzing')
  expect(s.messages).toHaveLength(1)
  expect(s.messages[0].role).toBe('user')
  expect(s.lastRequest).toEqual(req)
  expect(s.frames).toEqual(['data:a'])
})

test('extractProgress sets extracting', () => {
  const s = run([{ type: 'extractProgress', value: 0.5 }])
  expect(s.status).toBe('extracting')
  expect(s.extractProgress).toBe(0.5)
})

test('every event is appended exactly once', () => {
  const s = run([{ type: 'send', request: req }, ev({ type: 'thinking', text: 't' }), ev({ type: 'identified', activity: 'freediving', confidence: 0.9, text: 'i' })])
  expect(s.events).toHaveLength(2)
})

test('missing_capability → awaiting_confirm, confirmRequest reuses frames and sets confirmGrow', () => {
  const s = run([
    { type: 'inputReady', input: { kind: 'landmarks', landmarks: lm }, inputName: 'dive.mp4', frames: ['data:a', 'data:b'] },
    { type: 'send', request: { ...req, input: { kind: 'landmarks', landmarks: lm } } },
    ev({ type: 'plan', chain: [{ step: 'analyze', inputType: 'landmarks', activity: 'freediving', missing: true }] }),
    ev({ type: 'missing_capability', kind: 'analyzer', activity: 'freediving', inputType: 'landmarks', estimateUsd: 0.4, text: 'grow?', stepIndex: 0 }),
    { type: 'requestDone' },
  ])
  expect(s.status).toBe('awaiting_confirm')
  expect(s.pending?.estimateUsd).toBe(0.4)
  const r = selectors.confirmRequest(s)!
  expect(r.confirmGrow).toBe(true)
  expect(r.input.kind === 'landmarks' && r.input.frames).toEqual(['data:a', 'data:b'])
})

test('grow flow: tool_installed upserts tools and fills chain; tool_used/answer/cost', () => {
  const s = run([
    { type: 'toolsLoaded', tools: [] },
    { type: 'send', request: { ...req, confirmGrow: true } },
    ev({ type: 'plan', chain: [{ step: 'analyze', inputType: 'landmarks', activity: 'freediving', missing: true }] }),
    ev({ type: 'tool_installed', manifest, stepIndex: 0 }),
    ev({ type: 'tool_used', name: manifest.name, result: { metrics: { x: 1 }, usable: true }, stepIndex: 0 }),
    ev({ type: 'answer', text: 'nice dive' }),
    ev({ type: 'cost', step: 'grow', inputTokens: 1, outputTokens: 1, usd: 0.3, sessionUsd: 0.3 }),
    ev({ type: 'cost', step: 'total', inputTokens: 1, outputTokens: 1, usd: 0.35, sessionUsd: 0.35 }),
    { type: 'requestDone' },
  ])
  expect(s.tools.map((t) => t.name)).toEqual(['freediving-technique'])
  expect(s.chain?.[0]).toEqual({ step: 'analyze', inputType: 'landmarks', activity: 'freediving', missing: false, tool: 'freediving-technique' })
  expect(s.result?.usable).toBe(true)
  expect(s.messages.at(-1)).toEqual({ role: 'coach', text: 'nice dive', ts: s.messages.at(-1)!.ts })
  expect(s.sessionUsd).toBe(0.35)
  expect(s.lastRequestUsd).toBe(0.35)
  expect(s.status).toBe('done')
})

test('reused adds savedUsd; parsed stores session', () => {
  const s = run([
    { type: 'send', request: req },
    ev({ type: 'plan', chain: [{ step: 'parse', inputType: 'raw:garmin-dive-csv', activity: 'freediving', missing: false, tool: 'garmin-dive-csv' }] }),
    ev({ type: 'reused', tool: 'garmin-dive-csv', how: 'exact', savedUsd: 0.25, text: 'r', stepIndex: 0 }),
    ev({ type: 'parsed', tool: 'garmin-dive-csv', session: { version: 1, source: 'garmin-dive-csv', durationSec: 10, series: {}, meta: {} }, summary: { durationSec: 10, series: [] }, stepIndex: 0 }),
  ])
  expect(s.savedUsd).toBe(0.25)
  expect(s.session?.durationSec).toBe(10)
})

test('rejected / refused / clarify end in done with a coach message; error → error', () => {
  for (const e of [
    { type: 'rejected', reason: 'no_human', text: 'no one', tips: [] },
    { type: 'refused', text: 'no' },
    { type: 'clarify', text: 'which sport?' },
  ] as AgentEvent[]) {
    const s = run([{ type: 'send', request: req }, ev(e), { type: 'requestDone' }])
    expect(s.status).toBe('done')
    expect(s.messages.at(-1)?.role).toBe('coach')
  }
  const s = run([{ type: 'send', request: req }, ev({ type: 'error', text: 'boom' }), { type: 'requestDone' }])
  expect(s.status).toBe('error')
  expect(s.error).toBe('boom')
})

test('requestFailed and reset', () => {
  const s = run([{ type: 'toolsLoaded', tools: [manifest] }, { type: 'send', request: req }, { type: 'requestFailed', error: 'net' }])
  expect(s.status).toBe('error')
  const r = reducer(s, { type: 'reset' })
  expect(r.status).toBe('idle')
  expect(r.messages).toHaveLength(0)
  expect(r.tools).toHaveLength(1)
})

test('selectors.isBusy / canSend', () => {
  expect(selectors.canSend(initialState)).toBe(true)
  const s = run([{ type: 'send', request: req }])
  expect(selectors.isBusy(s)).toBe(true)
  expect(selectors.canSend(s)).toBe(false)
})
