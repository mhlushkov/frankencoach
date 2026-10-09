import { useEffect, useRef, useState } from 'react'
import type { AnalyzeInput, AnalyzeRequest, Landmarks } from '../../../../contracts/types'
import { analyze, forget } from '../../core/api/client'
import { prepareVideo } from '../../core/pose/extract'
import { bestFrameFor, selectPerson, type Person } from '../../core/pose/people'
import { selectors } from '../../core/state'
import { Header } from '../Header'
import { useUi } from '../UiContext'
import { addChat, bodySummary, dayLabel, useAccount, type User } from '../lib/account'
import { chooserState } from './chooser'
import { Conversation, type Choice } from './Conversation'
import { HowItWorks, useHowItWorks } from './HowItWorks'
import { sportName } from '../lib/text'
import { SportsFooter } from './SportsFooter'
import { Workout, type Media, type Picker } from './Workout'

const TEXT_EXT = /\.(csv|json|gpx|tcx|txt)$/i

function sessionId(): string {
  try {
    let id = sessionStorage.getItem('fc.sid')
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('fc.sid', id) }
    return id
  } catch { return 'tab-' + Math.random().toString(36).slice(2) }
}

export function CoachScreen({ user }: { user: User }) {
  const { state, dispatch, health } = useUi()
  const { myChats } = useAccount()
  const [media, setMedia] = useState<Media | null>(null)
  const [fileError, setFileError] = useState('')
  const [choice, setChoice] = useState<Choice>('none')
  const [working, setWorking] = useState(false)
  const [text, setText] = useState('')
  const [sport, setSport] = useState('')
  // Several people in the clip: local UI state until the member taps one (like `choice`, never in AppState).
  const [crowd, setCrowd] = useState<{ people: Person[]; frames: string[]; name: string; seekTo: number; boxes: Picker['boxes'] } | null>(null)
  const [picked, setPicked] = useState<{ picked: number; of: number } | undefined>()
  const fileSeq = useRef(0)
  const ac = useRef<AbortController | null>(null)
  const latest = useRef(state)
  useEffect(() => { latest.current = state })
  useEffect(() => () => { ac.current?.abort() }, [])
  // Revoke the blob URL only when it actually changes (new file / new chat). Keying this on `media` revoked it the
  // moment extraction attached `landmarks` (same url, new object), so playback froze a few seconds in.
  const videoUrl = media?.kind === 'video' ? media.url : undefined
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  const busy = working || !selectors.canSend(state)
  const showHow = useHowItWorks(state.messages.length)

  const asking = chooserState(crowd?.people.length ?? 0, picked?.picked) === 'asking'

  function applyLandmarks(landmarks: Landmarks, frames: string[], name: string) {
    setMedia((m) => (m?.kind === 'video' ? { ...m, landmarks } : m))
    dispatch({ type: 'inputReady', input: { kind: 'landmarks', landmarks, frames }, inputName: name, frames })
  }

  function pickPerson(id: number) {
    if (!crowd) return
    const landmarks = selectPerson(crowd.people, id)
    if (!landmarks) return
    setPicked({ picked: id, of: crowd.people.length })
    applyLandmarks(landmarks, crowd.frames, crowd.name)
  }

  async function onFile(file: File) {
    const seq = ++fileSeq.current
    setFileError(''); setCrowd(null); setPicked(undefined)
    if (file.type.startsWith('video/')) {
      setMedia({ kind: 'video', url: URL.createObjectURL(file), name: file.name })
      dispatch({ type: 'extractProgress', value: 0 })
      try {
        const { landmarks, frames, people } = await prepareVideo(file, { onProgress: (value) => dispatch({ type: 'extractProgress', value }) })
        if (seq !== fileSeq.current) return
        const best = people.length > 1 ? bestFrameFor(people) : undefined
        if (best) setCrowd({ people, frames, name: file.name, seekTo: best.t, boxes: best.boxes })
        else applyLandmarks(landmarks, frames, file.name)
      } catch (err) {
        if (seq !== fileSeq.current) return
        console.error('video extraction failed', err)
        setMedia(null)
        dispatch({ type: 'reset' })
        setFileError("I couldn't read that video. Try another one where your whole body is visible.")
      }
    } else if (TEXT_EXT.test(file.name)) {
      if (file.size > 1_000_000) return setFileError('That file is too big. I can read workout files up to 1 MB.')
      const body = await file.text()
      setMedia({ kind: 'table', name: file.name, text: body })
      dispatch({ type: 'inputReady', input: { kind: 'file', filename: file.name, mime: file.type || 'text/plain', text: body }, inputName: file.name })
    } else {
      setFileError('I can use a video, or a workout file (csv, json, gpx, tcx, txt).')
    }
  }

  function logChat(message: string) {
    const act = [...latest.current.events].reverse().find((e) => e.type === 'identified')
    addChat(user.id, message, act && act.type === 'identified' ? sportName(act.activity) : 'Workout')
  }

  async function run(req: AnalyzeRequest, afterLearn: boolean) {
    ac.current?.abort()
    const c = (ac.current = new AbortController())
    setWorking(true)
    try {
      await analyze(req, (event) => dispatch({ type: 'event', event }), c.signal)
      dispatch({ type: 'requestDone' })
      if (afterLearn || latest.current.status !== 'awaiting_confirm') logChat(req.message)
    } catch (err) {
      if (!c.signal.aborted) dispatch({ type: 'requestFailed', error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (ac.current === c) setWorking(false)
    }
  }

  function send() {
    const message = text.trim() || (state.input ? 'Analyze this.' : '')
    if (!message || busy) return
    let input: AnalyzeInput = state.input ?? { kind: 'none' }
    if (input.kind === 'landmarks' && state.frames) input = { ...input, frames: state.frames }
    const request: AnalyzeRequest = { sessionId: sessionId(), message, sportHint: sport.trim() || undefined, input }
    setText(''); setChoice('none')
    dispatch({ type: 'send', request })
    void run(request, false)
  }

  function learn() {
    const req = selectors.confirmRequest(state)
    if (!req) return
    setChoice('learning')
    void run(req, true)
  }
  function decline() { setChoice('declined'); if (state.lastRequest) logChat(state.lastRequest.message) }
  function newChat() { fileSeq.current++; setCrowd(null); setPicked(undefined); ac.current?.abort(); setWorking(false); setMedia(null); setFileError(''); setChoice('none'); setText(''); dispatch({ type: 'reset' }) }

  // header status for both panels
  const rejected = state.events.some((e) => e.type === 'rejected')
  const growing = busy && state.events.some((e) => e.type === 'growing')
  let status = { label: 'WAITING', color: 'var(--fc-human)', live: 'ready when you are' }
  if (asking) status = { label: 'QUESTION', color: 'var(--fc-learn)', live: 'waiting for your answer' }
  else if (state.status === 'extracting') status = { label: 'WATCHING', color: 'var(--color-text)', live: 'watching your video' }
  else if (rejected) status = { label: "CAN'T USE", color: 'var(--fc-fail)', live: "can't use this one" }
  else if (state.status === 'error') status = { label: 'ERROR', color: 'var(--fc-fail)', live: 'something went wrong' }
  else if (growing) status = { label: 'LEARNING', color: 'var(--fc-learn)', live: 'learning something new' }
  else if (state.status === 'awaiting_confirm' && choice === 'none') status = { label: 'QUESTION', color: 'var(--fc-learn)', live: 'waiting for your answer' }
  else if (busy) status = { label: 'WATCHING', color: 'var(--color-text)', live: 'looking at your workout' }
  else if (state.status === 'done') status = { label: 'DONE', color: 'var(--fc-alive)', live: "here's my advice" }
  else if (state.status === 'ready') status = { label: 'READY', color: 'var(--fc-alive)', live: 'ready when you are' }

  const groups: { label: string; items: typeof myChats }[] = []
  for (const c of myChats) {
    const label = dayLabel(c.ts)
    const g = groups[groups.length - 1]
    if (g && g.label === label) g.items.push(c)
    else groups.push({ label, items: [c] })
  }
  const learningSport = growing ? state.pending?.activity : undefined

  return (
    <div className="col fill">
      <Header user={user} tagline="the coach that learns any sport you show it" />
      <main className="coach-grid">
        <aside className="history">
          <div style={{ padding: '16px 16px 10px' }}>
            <button className="btn btn-secondary new-chat" onClick={newChat}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>New chat
            </button>
          </div>
          <div className="history-list">
            {groups.length === 0 && <span className="muted t14" style={{ padding: '10px 8px', lineHeight: 1.45 }}>Your chats will show up here.</span>}
            {groups.map((g) => (
              <div key={g.label} className="col g2">
                <span className="group-label">{g.label}</span>
                {g.items.map((c) => <div className="hist-item" key={c.id}><span className="ellipsis">{c.title}</span><span className="muted t12">{c.sport}</span></div>)}
              </div>
            ))}
          </div>
          <div className="about">
            <div className="col g4"><span className="zone small">ABOUT YOU</span><span className="t14">{bodySummary(user.body)}</span></div>
            <div className="row g14 t14"><a href="#/body">Edit profile</a><a href="#/account">Account &amp; plan</a></div>
          </div>
        </aside>

        <section className="left">
          <div className="row g12" style={{ height: 24 }}>
            <span className="zone">YOUR WORKOUT</span>
            <span className="muted t15 ellipsis">{media?.name ?? ''}</span>
            <span className="badge push nowrap" style={{ color: status.color, borderColor: status.color }}>{status.label}</span>
          </div>
          <Workout state={state} media={media} fileError={fileError} onFile={(f) => void onFile(f)}
            picker={asking && crowd ? { boxes: crowd.boxes, seekTo: crowd.seekTo, onPick: pickPerson } : undefined} watching={picked} />
        </section>

        <section className="right">
          <div className="right-head">
            <span className="zone">YOUR COACH</span>
            <span className="live-dot" style={{ background: status.color }} />
            <span className="muted t14">{status.live}</span>
          </div>
          {showHow && <HowItWorks />}
          <Conversation state={state} choice={choice} working={working} onLearn={learn} onDecline={decline} askPeople={asking ? crowd?.people.length : undefined} />
          <div className="composer">
            <textarea className="input" aria-label="Ask your coach" disabled={asking} placeholder="Ask your coach…" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            <div className="row g12">
              <input className="input" aria-label="Sport" disabled={asking} placeholder="Sport (optional)" style={{ width: 180, minHeight: 34, height: 34, fontSize: 14 }} value={sport} onChange={(e) => setSport(e.target.value)} />
              <div className="blueprint push btn-frame"><i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
                <button className="btn btn-primary" style={{ minWidth: 96 }} disabled={busy || (!text.trim() && !state.input)} onClick={send}>Send</button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SportsFooter tools={state.tools} learning={learningSport} onForget={health?.demoMode ? (n) => { void forget(n) } : undefined} />
    </div>
  )
}
