import { useEffect, useRef, type ReactNode } from 'react'
import { metricRows, showReuse } from './format'
import type { AgentEvent, AppState, ChatMessage } from '../../../../contracts/types'
import { Frame } from '../lib/Frame'
import { sportName } from '../lib/text'

type Tone = 'ok' | 'fail' | 'learn' | 'info' | 'you'
const COL: Record<Tone, string> = { ok: 'var(--fc-alive)', fail: 'var(--fc-fail)', learn: 'var(--fc-learn)', info: 'var(--fc-human)', you: 'var(--color-text)' }
const BG: Partial<Record<Tone, string>> = { ok: 'var(--fc-alive-tint)', fail: 'var(--fc-fail-tint)', learn: 'var(--fc-learn-tint)' }


function Row({ tag, tone, live, pulse, dim, children }: { tag: string; tone: Tone; live?: boolean; pulse?: boolean; dim?: boolean; children?: ReactNode }) {
  return (
    <div className="ev" style={{ opacity: dim ? 0.6 : 1 }}>
      <div className="tag" style={{ color: COL[tone], borderColor: COL[tone], background: BG[tone], animation: pulse ? 'var(--fc-pulse)' : undefined }}>{tag}</div>
      <div className="ev-body">
        {children}
        {live && <div className="live-bar"><div style={{ background: COL[tone] }} /></div>}
      </div>
    </div>
  )
}

const label = (text: string, color?: string) => <div className="ev-label" style={color ? { color } : undefined}>{text}</div>
/** Listen per coach line; present only when the server has a voice. */
export interface Listen { playing: string | null; loading: string | null; onListen: (text: string) => void; onStop: () => void }
function ListenButton({ text, listen }: { text: string; listen: Listen }) {
  const playing = listen.playing === text
  const loading = !playing && listen.loading === text
  return (
    <button type="button" className="listen muted t14" aria-label={playing ? 'Stop reading' : 'Read this aloud'}
      onClick={() => (playing || loading ? listen.onStop() : listen.onListen(text))}>
      {playing ? 'Stop' : loading ? '…' : 'Listen'}
    </button>
  )
}
const bubble = (text: string, listen?: Listen) => <div className="coach-bubble"><span className="bubble-tip" />{text}{listen && <ListenButton text={text} listen={listen} />}</div>

function Metrics({ metrics, warnings }: { metrics: Record<string, number | number[]>; warnings?: string[] }) {
  const rows = metricRows(metrics)
  return (
    <>
      <div className="metrics">{rows.map(([k, v]) => <div key={k}><span className="muted t13">{k}</span><span className="h21">{v}</span></div>)}</div>
      {warnings?.map((w) => <div key={w} className="ev-label" style={{ color: 'var(--fc-fail)', fontSize: 14 }}>{w}</div>)}
    </>
  )
}

export type Choice = 'none' | 'declined' | 'learning'
interface Props {
  state: AppState
  choice: Choice
  working: boolean
  onLearn: () => void
  onDecline: () => void
  /** Several people in the clip and none picked yet: how many. Local UI, not an AppState message. */
  askPeople?: number
  listen?: Listen
}

export function Conversation({ state, choice, working, onLearn, onDecline, askPeople, listen }: Props) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = box.current; if (el) setTimeout(() => { el.scrollTop = el.scrollHeight }, 30) }, [state.messages.length, state.events.length, choice, askPeople])

  // Past turns come from messages; the current request is rendered live from its events.
  let lastUser = -1
  state.messages.forEach((m, i) => { if (m.role === 'user') lastUser = i })
  const past: ChatMessage[] = state.messages.slice(0, lastUser + 1)
  const lastGrowing = state.events.reduce((n, e, i) => (e.type === 'growing' ? i : n), -1)
  const busy = working || state.status === 'analyzing' || state.status === 'extracting'

  const rows: ReactNode[] = []
  if (state.messages.length === 0 && state.events.length === 0) {
    rows.push(<Row key="hi" tag="Hi" tone="info">{label("Hi! I'm a coach that learns. Show me a video or a workout from your watch and I'll give you tips.")}</Row>)
  }
  past.forEach((m, i) => rows.push(m.role === 'user'
    ? <Row key={'m' + i} tag="You" tone="you"><div className="you-bubble">{m.text}</div></Row>
    : <Row key={'m' + i} tag="Coach" tone="ok" dim>{bubble(m.text, listen)}</Row>))

  state.events.forEach((e: AgentEvent, i) => {
    const key = 'e' + i
    switch (e.type) {
      case 'thinking':
        if (busy && i === state.events.length - 1) rows.push(<Row key={key} tag="Watching" tone="info" live>{label('Looking at what you sent…')}</Row>)
        break
      case 'identified':
        rows.push(<Row key={key} tag="Got it" tone="ok">{label(`This looks like ${sportName(e.activity).toLowerCase()}.`)}</Row>)
        break
      case 'reused':
        if (showReuse(state.events, i)) rows.push(<Row key={key} tag="Got it" tone="ok">{label(e.how === 'fallback' ? 'I can look at this in a general way.' : "I know this one, so I can help right away.")}</Row>)
        break
      case 'missing_capability':
        rows.push(
          <Row key={key} tag="Question" tone="learn">
            <div className="ask">
              <div style={{ fontSize: 16, lineHeight: 1.4 }}>{`I haven't learned ${sportName(e.activity).toLowerCase()} yet. Want me to learn it? Once I know it, every member can use it.`}</div>
              {state.pending === e && choice === 'none' && (
                <div className="row g8">
                  <button className="btn btn-primary" onClick={onLearn}>Yes, learn it</button>
                  <button className="btn btn-secondary" onClick={onDecline}>Not now</button>
                </div>
              )}
              {state.pending === e && choice === 'declined' && <div className="t14" style={{ color: 'var(--fc-human)' }}>No problem, nothing was learned.</div>}
              {(state.pending !== e || choice === 'learning') && <div className="t14" style={{ color: 'var(--fc-alive)' }}>✓ You said yes</div>}
            </div>
          </Row>,
        )
        break
      case 'growing': {
        const live = busy && i === lastGrowing
        rows.push(<Row key={key} tag="Learning" tone="learn" live={live} pulse={live}>{label(e.attempt > 1 ? `Learning ${sportName(state.pending?.activity ?? e.name).toLowerCase()}… My first try wasn't good enough, so I'm trying again.` : `Learning ${sportName(state.pending?.activity ?? e.name).toLowerCase()}…`)}</Row>)
        break
      }
      case 'tool_installed':
        if (e.manifest.createdBy === 'agent') rows.push(<Row key={key} tag="Learned" tone="ok">{label(`I've learned ${sportName(e.manifest.activity === '*' ? e.manifest.name : e.manifest.activity).toLowerCase()}, for you and everyone else on FrankenCoach.`)}</Row>)
        break
      case 'tool_used':
        if (Object.keys(e.result.metrics).length) rows.push(<Row key={key} tag="Your workout" tone="ok"><Metrics metrics={e.result.metrics} warnings={e.result.warnings} /></Row>)
        break
      case 'answer':
        rows.push(<Row key={key} tag="Coach" tone="ok">{bubble(e.text, listen)}</Row>)
        break
      case 'clarify':
        rows.push(<Row key={key} tag="Question" tone="learn">{label(e.text)}</Row>)
        break
      case 'rejected':
        rows.push(
          <Row key={key} tag="Sorry" tone="fail">
            <Frame className="reject">
              <span style={{ fontSize: 16, lineHeight: 1.45 }}>{e.text}</span>
              {e.tips.length > 0 && <><span className="muted t14">Try one of these instead:</span>
                <div className="col g5 t15" style={{ color: 'var(--color-text-2)' }}>{e.tips.map((t) => <span key={t}>→ {t}</span>)}</div></>}
            </Frame>
          </Row>,
        )
        break
      case 'refused':
        rows.push(<Row key={key} tag="Sorry" tone="fail">{label(e.text, '#ff8a83')}</Row>)
        break
      case 'error':
        rows.push(<Row key={key} tag="Sorry" tone="fail">{label("Something went wrong on my side. Please try again in a moment.", '#ff8a83')}</Row>)
        break
      default:
        break // plan, test_result, authority_check, parsed, cost: evidence for the dev console, not for members
    }
  })

  if (askPeople) rows.push(<Row key="people" tag="Question" tone="learn">{label(`I can see ${askPeople} people. Tap the one I should watch.`)}</Row>)

  return <div className="log" ref={box} aria-live="polite">{rows}</div>
}
