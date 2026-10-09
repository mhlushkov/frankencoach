import type { AgentEvent } from '../../../../contracts/types'
import { sportName } from '../lib/text'

// The learning diary: one honest line per growth step the server reports (write → rules → tests → trial → install).
// Pure, tested in diary.test.ts. The server already emits every one of these events; the diary only puts them in the member's words.

export type DiaryTone = 'ok' | 'learn'
export interface DiaryLine { tag: string; tone: DiaryTone; text: string; detail?: string }
export interface DiaryCtx { activity: string; input: 'file' | 'clip' }

const STAGES = new Set<AgentEvent['type']>(['growing', 'authority_check', 'test_result'])
/** A step that is still in progress until the next event arrives (gets the pulse while the request runs). */
export const isStage = (e: AgentEvent): boolean => STAGES.has(e.type)

const sport = (activity: string) => sportName(activity).toLowerCase()
/** The activity named inside a `growing` text ("Writing x (analyzer for running)…"), when the UI has nothing better. */
export const activityFrom = (text: string): string | undefined => /for ([^)]+)\)/.exec(text)?.[1]
const fmtDur = (sec: number) => (sec < 90 ? `${Math.round(sec)} s` : `${Math.round(sec / 60)} min`)

export function diaryLine(e: AgentEvent, ctx: DiaryCtx): DiaryLine | null {
  switch (e.type) {
    case 'growing': {
      if (e.attempt > 1) return { tag: 'Writing', tone: 'learn', text: `Attempt ${e.attempt}: rewriting it from what failed…` }
      const what = /\(parser/.test(e.text) ? 'a reader for this export format' : `a way to measure ${sport(ctx.activity)}`
      return { tag: 'Writing', tone: 'learn', text: `Writing ${what}…` }
    }
    case 'authority_check':
      return e.pass
        ? { tag: 'Rules', tone: 'ok', text: 'Checked: it stays inside my rules. No internet, no files, compute only.' }
        : { tag: 'Rules', tone: 'learn', text: `That draft broke my rules: ${e.text.replace(/^Authority violations: /, '').slice(0, 120)}. Nothing was written. Rewriting.` }
    case 'test_result':
      if (e.summary.startsWith('rubric:')) return exam(e.pass, e.attempt, e.summary)
      return e.summary.startsWith('real input:') ? trial(e.pass, e.summary, ctx) : ownTests(e.pass, e.summary)
    case 'tool_installed': {
      const m = e.manifest
      if (m.createdBy !== 'agent') return null
      const n = m.attempts ?? 1
      const detail = `Installed after ${n} ${n === 1 ? 'attempt' : 'attempts'} for $${(m.costUsd ?? 0).toFixed(2)}.${m.description ? ` ${m.description}` : ''}`
      return { tag: 'Learned', tone: 'ok', text: `I've learned ${sport(m.activity === '*' ? m.name : m.activity)}, for you and everyone else on FrankenCoach.`, detail }
    }
    default:
      return null
  }
}

/** The examiner's grade: "rubric: sport 5 · … → ready | why | reason" (server/agent/examiner.ts rubricSummary). */
function exam(pass: boolean, attempt: number, summary: string): DiaryLine {
  const [head, why, reason] = summary.split(' | ')
  const scores = head!.replace(/^rubric: /, '').replace(/ → \w+$/, '')
  const decision = / → (\w+)$/.exec(head!)?.[1]
  const detail = [scores, reason].filter(Boolean).join('. ')
  if (pass) return { tag: 'Exam', tone: 'ok', text: `A second agent examined what I learned: ready to coach${attempt > 1 ? ' after one rewrite' : ''}.`, detail }
  if (decision === 'block') return { tag: 'Exam', tone: 'learn', text: `A second agent examined what I learned and stopped my advice: ${why}.`, detail }
  return { tag: 'Exam', tone: 'learn', text: `A second agent examined what I learned: not ready yet, ${why}.`, detail }
}

function ownTests(pass: boolean, summary: string): DiaryLine {
  if (summary === 'timeout') return { tag: 'Tests', tone: 'learn', text: 'Its tests ran too long. Asking for a simpler tool.' }
  const p = Number(/(\d+) pass/.exec(summary)?.[1] ?? Number.NaN)
  const f = Number(/(\d+) fail/.exec(summary)?.[1] ?? 0)
  const total = Number.isNaN(p) ? undefined : p + f
  if (pass) return { tag: 'Tests', tone: 'ok', text: total ? `Its own tests pass, ${p} of ${total}.` : 'Its own tests pass.' }
  return { tag: 'Tests', tone: 'learn', text: total && f ? `${f} of its ${total} tests failed. Sending the output back for a fix.` : 'Its own tests failed. Sending the output back for a fix.' }
}

function trial(pass: boolean, summary: string, ctx: DiaryCtx): DiaryLine {
  const on = `Tried it on your ${ctx.input}:`
  if (pass) {
    const s = /session (\d+)s, series (.+)/.exec(summary)
    if (s) return { tag: 'Trial', tone: 'ok', text: `${on} it reads ${fmtDur(Number(s[1]))} and ${s[2]!.split(',').length} series.` }
    const m = /(\d+) metrics/.exec(summary)
    return { tag: 'Trial', tone: 'ok', text: `${on} it works${m ? `, ${m[1]} metrics` : ''}.` }
  }
  if (summary.includes('threw:')) return { tag: 'Trial', tone: 'learn', text: `${on} it crashed. Rewriting.` }
  if (summary.includes('usable:false')) return { tag: 'Trial', tone: 'learn', text: `${on} it said this isn't ${sport(ctx.activity)}. Too strict, rewriting.` }
  return { tag: 'Trial', tone: 'learn', text: `${on} it could not read it. Rewriting.` }
}
