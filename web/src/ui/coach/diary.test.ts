import { expect, test } from 'bun:test'
import type { AgentEvent, ToolManifest } from '../../../../contracts/types'
import { activityFrom, diaryLine, isStage } from './diary'

const ctx = { activity: 'running', input: 'file' as const }
const ev = (e: Record<string, unknown>) => e as unknown as AgentEvent

test('growing: first attempt names what is being written, later attempts say rewriting', () => {
  expect(diaryLine(ev({ type: 'growing', name: 'running-profile', attempt: 1, text: 'Writing running-profile (analyzer for running)…' }), ctx)).toEqual({ tag: 'Writing', tone: 'learn', text: 'Writing a way to measure running…' })
  expect(diaryLine(ev({ type: 'growing', name: 'garmin-csv', attempt: 1, text: 'Writing garmin-csv (parser for running)…' }), ctx)?.text).toBe('Writing a reader for this export format…')
  expect(diaryLine(ev({ type: 'growing', name: 'x', attempt: 2, text: 'Attempt 2: fixing…' }), ctx)?.text).toBe('Attempt 2: rewriting it from what failed…')
})

test('authority check: pass is ok, a violation says nothing was written', () => {
  expect(diaryLine(ev({ type: 'authority_check', name: 'x', pass: true, text: 'compute-only' }), ctx)?.tone).toBe('ok')
  const bad = diaryLine(ev({ type: 'authority_check', name: 'x', pass: false, text: 'Authority violations: fetch( in index.ts' }), ctx)
  expect(bad).toEqual({ tag: 'Rules', tone: 'learn', text: 'That draft broke my rules: fetch( in index.ts. Nothing was written. Rewriting.' })
})

test('own tests: counts from the bun output, fail says the output goes back', () => {
  expect(diaryLine(ev({ type: 'test_result', name: 'x', attempt: 1, pass: true, summary: 'bun test v1\n 4 pass\n 0 fail\nRan 4 tests' }), ctx)?.text).toBe('Its own tests pass, 4 of 4.')
  expect(diaryLine(ev({ type: 'test_result', name: 'x', attempt: 1, pass: false, summary: ' 2 pass\n 1 fail' }), ctx)).toEqual({ tag: 'Tests', tone: 'learn', text: '1 of its 3 tests failed. Sending the output back for a fix.' })
  expect(diaryLine(ev({ type: 'test_result', name: 'x', attempt: 1, pass: false, summary: 'timeout' }), ctx)?.text).toBe('Its tests ran too long. Asking for a simpler tool.')
})

test('trial on the real input: parser reads minutes and series, analyzer works or is too strict', () => {
  expect(diaryLine(ev({ type: 'test_result', name: 'p', attempt: 1, pass: true, summary: 'real input: session 1500s, series speed_mps,cadence_rpm,heart_rate_bpm' }), ctx)?.text).toBe('Tried it on your file: it reads 25 min and 3 series.')
  expect(diaryLine(ev({ type: 'test_result', name: 'a', attempt: 1, pass: true, summary: 'real input: usable, 8 metrics' }), { activity: 'squat', input: 'clip' })?.text).toBe('Tried it on your clip: it works, 8 metrics.')
  expect(diaryLine(ev({ type: 'test_result', name: 'a', attempt: 1, pass: false, summary: 'real input: usable:false, warnings: no reps' }), { activity: 'squat', input: 'clip' })).toEqual({ tag: 'Trial', tone: 'learn', text: "Tried it on your clip: it said this isn't squat. Too strict, rewriting." })
  expect(diaryLine(ev({ type: 'test_result', name: 'a', attempt: 1, pass: false, summary: 'real input: threw: boom' }), ctx)?.text).toBe('Tried it on your file: it crashed. Rewriting.')
})

test('installed: agent tools get the learned line with attempts, cost and description; human tools nothing', () => {
  const m = { name: 'running-profile', activity: 'running', createdBy: 'agent', attempts: 2, costUsd: 0.0423, description: 'Pace drift, cadence and heart-rate zones.' } as unknown as ToolManifest
  expect(diaryLine(ev({ type: 'tool_installed', manifest: m }), ctx)).toEqual({
    tag: 'Learned', tone: 'ok',
    text: "I've learned running, for you and everyone else on FrankenCoach.",
    detail: 'Installed after 2 attempts for $0.04. Pace drift, cadence and heart-rate zones.',
  })
  expect(diaryLine(ev({ type: 'tool_installed', manifest: { ...m, createdBy: 'human' } }), ctx)).toBeNull()
})

test('other events are not diary lines; stages are growing, rules and tests', () => {
  expect(diaryLine(ev({ type: 'identified', activity: 'running', confidence: 0.9, text: '' }), ctx)).toBeNull()
  expect(isStage(ev({ type: 'growing' }))).toBe(true)
  expect(isStage(ev({ type: 'tool_installed' }))).toBe(false)
})

test('activityFrom reads the sport out of the growing text', () => {
  expect(activityFrom('Writing running-profile (analyzer for running)…')).toBe('running')
  expect(activityFrom('Attempt 2: fixing x from the test output…')).toBeUndefined()
})

test('exam: the second agent grade reads as ready, not ready, or stopped, with the scores as detail', () => {
  const tr = (pass: boolean, attempt: number, summary: string): AgentEvent => ({ type: 'test_result', name: 'running-profile', attempt, pass, summary })
  const ctx = { activity: 'running', input: 'file' as const }
  const ok = diaryLine(tr(true, 2, 'rubric: sport 5 · movement 4 · technique 4 · advice 4 · safety 5 → ready | every dimension is 3 or higher | tied to pace'), ctx)
  expect(ok).toEqual({ tag: 'Exam', tone: 'ok', text: 'A second agent examined what I learned: ready to coach after one rewrite.', detail: 'sport 5 · movement 4 · technique 4 · advice 4 · safety 5. tied to pace' })
  expect(diaryLine(tr(false, 1, 'rubric: sport 5 · movement 4 · technique 2 · advice 3 · safety 4 → continue | technique below 3 | r'), ctx)?.text)
    .toBe('A second agent examined what I learned: not ready yet, technique below 3.')
  expect(diaryLine(tr(false, 1, 'rubric: sport 5 · movement 4 · technique 4 · advice 4 · safety 2 → block | safety and confidence boundaries scored 2 | r'), ctx)?.text)
    .toBe('A second agent examined what I learned and stopped my advice: safety and confidence boundaries scored 2.')
})
