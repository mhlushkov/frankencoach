import { useRef, useState, type DragEvent } from 'react'
import type { AppState } from '../../../../contracts/types'
import { Frame } from '../lib/Frame'
import { Chart } from './Chart'
import { VideoStage, type VideoMedia } from './VideoStage'

export type Media = ({ kind: 'video' } & VideoMedia | { kind: 'table'; text: string }) & { name: string }

const REJECT_TITLE: Record<string, string> = {
  no_human: "I can't see a person in this", no_motion: 'Nothing is moving in this one', not_a_sport: "This doesn't look like a workout",
  mismatch: "This doesn't match the sport you named", low_confidence: "I'm not sure what this is", bad_table: "I can't read this file",
}

interface Props { state: AppState; media: Media | null; fileError: string; onFile: (f: File) => void }

export function Workout({ state, media, fileError, onFile }: Props) {
  const pick = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const rejected = state.events.find((e) => e.type === 'rejected')
  const series = state.result?.series ?? state.session?.series
  const showDrop = !rejected && !media
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }

  let body
  if (rejected) {
    body = (
      <Frame className="stage-card center-col" style={{ borderColor: 'rgba(255,90,82,.45)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff5a52" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
        <span className="h30">{REJECT_TITLE[rejected.reason] ?? "I can't use this one"}</span>
        {media && <span className="muted" style={{ fontSize: 16 }}>{media.name}</span>}
      </Frame>
    )
  } else if (media?.kind === 'video') {
    body = <Frame className="stage-card video"><span className="stage-tag">[ {media.name} ]</span><VideoStage media={media} highlights={state.result?.highlights} /></Frame>
  } else if (series) {
    body = <Frame className="stage-card chart"><Chart series={series} /></Frame>
  } else if (media?.kind === 'table') {
    body = <Frame className="stage-card table-prev"><span className="stage-tag">[ {media.name} ]</span><pre>{media.text.split('\n').slice(0, 12).join('\n')}</pre></Frame>
  } else {
    body = (
      <Frame className={`stage-card center-col grid-bg ${over ? 'over' : ''}`} style={{ margin: 6 }}>
        <div className="drop-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e4e7e5" strokeWidth="1.5"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg></div>
        <div className="col g8 center">
          <span className="h38">Show me your workout</span>
          <span className="muted drop-line">Any sport. I'll figure out what you're doing and give you tips. If it's new to me, I'll learn it.</span>
        </div>
        <div className="row g10 t15" style={{ color: 'var(--color-text-2)' }}><span className="pill">A video of you moving</span><span className="pill">A workout from your watch</span></div>
        <Frame className="btn-frame"><button className="btn btn-primary" style={{ fontSize: 16, padding: '10px 22px' }} onClick={() => pick.current?.click()}>Choose a file</button></Frame>
        {fileError && <span role="alert" className="t14" style={{ color: 'var(--fc-fail)' }}>{fileError}</span>}
      </Frame>
    )
  }

  return (
    <div className="workout" onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <input ref={pick} type="file" hidden accept="video/*,.csv,.json,.gpx,.tcx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <div className="flex1 minh0 col">{body}</div>
      {state.status === 'extracting' && (
        <div className="col g8" style={{ margin: '0 6px' }}>
          <div className="row t14 muted"><span style={{ color: 'var(--color-text)' }}>Watching how you move…</span><span className="push">{Math.round((state.extractProgress ?? 0) * 100)}%</span></div>
          <div className="prog"><div style={{ width: `${(state.extractProgress ?? 0) * 100}%` }} /></div>
        </div>
      )}
      {!showDrop && (
        <button className="again" onClick={() => pick.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
          <span>Drop another video or watch workout here</span>
        </button>
      )}
      {!showDrop && fileError && <span role="alert" className="t14" style={{ color: 'var(--fc-fail)', margin: '0 6px' }}>{fileError}</span>}
    </div>
  )
}
