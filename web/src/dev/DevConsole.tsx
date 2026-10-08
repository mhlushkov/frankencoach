// Track A owns web/src/dev/**. Debug page at ?dev=1: no design, everything visible.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { AgentEvent, AnalyzeRequest, Landmarks } from '../../../contracts/types'
import { initialState, reducer, selectors } from '../core/state'
import { analyze, forget, getTools, isStub } from '../core/api/client'
import { FIXTURES } from '../core/api/stub'
import { BONES, frameAt } from '../core/pose/skeleton'
import { eventColor, fileInput, metricRows, seriesText } from './helpers'

const SESSION_ID = `dev-${Math.random().toString(36).slice(2, 10)}`
const box: React.CSSProperties = { border: '1px solid #ccc', padding: 8, margin: '8px 0' }

function Skeleton({ landmarks, videoUrl }: { landmarks?: Landmarks; videoUrl?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvas.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx || !landmarks) return
      ctx.clearRect(0, 0, c.width, c.height)
      const f = frameAt(landmarks, video.current?.currentTime ?? 0)
      const p = f?.landmarks
      if (!p) return
      ctx.strokeStyle = '#0f0'
      ctx.lineWidth = 2
      for (const [a, b] of BONES) {
        if (!p[a] || !p[b] || p[a].visibility < 0.3 || p[b].visibility < 0.3) continue
        ctx.beginPath()
        ctx.moveTo(p[a].x * c.width, p[a].y * c.height)
        ctx.lineTo(p[b].x * c.width, p[b].y * c.height)
        ctx.stroke()
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [landmarks])
  if (!landmarks) return null
  const w = 360
  const h = Math.round((w * (landmarks.height || 9)) / (landmarks.width || 16))
  return (
    <div style={{ position: 'relative', width: w, height: h, background: '#111' }}>
      {videoUrl && <video ref={video} src={videoUrl} controls muted width={w} height={h} style={{ position: 'absolute' }} />}
      <canvas ref={canvas} width={w} height={h} style={{ position: 'absolute', pointerEvents: 'none' }} />
    </div>
  )
}

export function DevConsole() {
  const [s, dispatch] = useReducer(reducer, initialState)
  const [message, setMessage] = useState('Analyse my technique')
  const [hint, setHint] = useState('')
  const [videoUrl, setVideoUrl] = useState<string>()
  const [note, setNote] = useState('')
  const abort = useRef<AbortController | null>(null)

  const loadTools = useCallback(() => {
    getTools().then((t) => dispatch({ type: 'toolsLoaded', tools: t })).catch((e) => setNote(`tools: ${e}`))
  }, [])
  useEffect(loadTools, [loadTools])

  async function onFile(file: File | undefined) {
    if (!file) return
    setNote('')
    if (file.type.startsWith('video/')) {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      setVideoUrl(URL.createObjectURL(file))
      dispatch({ type: 'extractProgress', value: 0 })
      try {
        const { prepareVideo } = await import('../core/pose/extract')
        const r = await prepareVideo(file, { onProgress: (v) => dispatch({ type: 'extractProgress', value: v }) })
        dispatch({ type: 'inputReady', input: { kind: 'landmarks', landmarks: r.landmarks }, inputName: file.name, frames: r.frames })
        setNote(r.cached ? `landmarks from cache (${r.hash.slice(0, 8)})` : `extracted ${r.landmarks.frames.length} frames`)
      } catch (e) {
        dispatch({ type: 'requestFailed', error: `pose: ${e}` })
      }
      return
    }
    setVideoUrl(undefined)
    const r = fileInput(file.name, file.type, await file.text())
    if (r.error || !r.input) return dispatch({ type: 'requestFailed', error: r.error ?? 'bad file' })
    dispatch({ type: 'inputReady', input: r.input, inputName: file.name })
  }

  async function run(req: AnalyzeRequest) {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    dispatch({ type: 'send', request: req })
    try {
      await analyze(req, (event: AgentEvent) => dispatch({ type: 'event', event }), ctl.signal)
      dispatch({ type: 'requestDone' })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') dispatch({ type: 'requestFailed', error: String(e) })
    }
    loadTools()
  }

  const send = () =>
    run({
      sessionId: SESSION_ID, message, sportHint: hint || undefined,
      input: s.input ? (s.input.kind === 'landmarks' && s.frames ? { ...s.input, frames: s.frames } : s.input) : { kind: 'none' },
    })
  const confirm = () => { const r = selectors.confirmRequest(s); if (r) run(r) }

  function downloadLandmarks() {
    if (s.input?.kind !== 'landmarks') return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(s.input.landmarks)], { type: 'application/json' }))
    a.download = `${(s.inputName ?? 'landmarks').replace(/\.[^.]+$/, '')}.landmarks.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const landmarks = s.input?.kind === 'landmarks' ? s.input.landmarks : undefined
  const series = s.result?.series ?? s.session?.series

  return (
    <main style={{ fontFamily: 'monospace', fontSize: 13, padding: 16, maxWidth: 1100 }}>
      <h3 style={{ margin: 0 }}>
        FrankenCoach dev {isStub && '[STUB]'} · status={s.status} · $session={s.sessionUsd.toFixed(4)} · $last={s.lastRequestUsd.toFixed(4)} · $saved={s.savedUsd.toFixed(2)}
      </h3>

      <div style={box}>
        <input type="file" accept="video/*,.csv,.json,.gpx,.tcx,.txt,.fit" onChange={(e) => onFile(e.target.files?.[0])} />
        {s.extractProgress !== undefined && <progress value={s.extractProgress} max={1} style={{ marginLeft: 8 }} />}
        {' '}{s.inputName && <b>{s.inputName} ({s.input?.kind})</b>} {note}
        {landmarks && <button onClick={downloadLandmarks} style={{ marginLeft: 8 }}>Download landmarks.json</button>}
        {s.input && <button onClick={() => { dispatch({ type: 'reset' }); setVideoUrl(undefined) }} style={{ marginLeft: 8 }}>Clear</button>}
        <Skeleton landmarks={landmarks} videoUrl={videoUrl} />
      </div>

      <div style={box}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} style={{ width: '100%' }} />
        <input list="hints" placeholder="sportHint" value={hint} onChange={(e) => setHint(e.target.value)} />
        <datalist id="hints">
          {['squat', 'freediving', 'running', 'cycling', ...(isStub ? Object.keys(FIXTURES) : [])].map((h) => <option key={h} value={h} />)}
        </datalist>
        <button onClick={send} disabled={!selectors.canSend(s)} style={{ marginLeft: 8 }}>Send</button>
        {s.status === 'analyzing' && <button onClick={() => abort.current?.abort()} style={{ marginLeft: 8 }}>Stop</button>}
        {s.error && <div style={{ color: '#c33' }}>error: {s.error}</div>}
      </div>

      {s.pending && s.status === 'awaiting_confirm' && (
        <div style={{ ...box, borderColor: '#d80' }}>
          {s.pending.text} (≈ ${s.pending.estimateUsd.toFixed(2)}, {s.pending.kind} {s.pending.activity} {s.pending.inputType})
          <button onClick={confirm} style={{ marginLeft: 8 }}>Confirm</button>
        </div>
      )}

      {s.chain && (
        <div style={box}>
          chain: {s.chain.map((c, i) => <span key={i}>[{c.step} {c.inputType} → {c.tool ?? (c.missing ? 'MISSING' : '?')}] </span>)}
        </div>
      )}

      <div style={box}>
        {s.messages.map((m, i) => <div key={i}><b>{m.role}:</b> {m.text}</div>)}
      </div>

      {s.result && (
        <div style={box}>
          <b>metrics</b> usable={String(s.result.usable)}
          <table><tbody>{metricRows(s.result).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          {s.result.warnings?.map((w, i) => <div key={i} style={{ color: '#d80' }}>⚠ {w}</div>)}
          {s.result.highlights?.map((h, i) => <div key={i}>frame {h.frame} joints {h.joints.join(',')}: {h.note}</div>)}
        </div>
      )}
      {series && <pre style={box}>{seriesText(series)}</pre>}

      <div style={box}>
        <b>events ({s.events.length})</b>
        {s.events.map((e, i) => (
          <div key={i} style={{ color: eventColor(e), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(e.type === 'parsed' ? { ...e, session: { ...e.session, series: Object.keys(e.session.series) } } : e)}
          </div>
        ))}
      </div>

      <div style={box}>
        <b>/tools ({s.tools.length})</b> <button onClick={loadTools}>reload</button>
        <table><tbody>
          {s.tools.map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td><td>{t.kind}</td><td>{t.activity}</td><td>{t.inputType}</td><td>{t.createdBy}</td>
              <td>uses={t.uses}</td><td>{t.costUsd !== undefined ? `$${t.costUsd.toFixed(2)}` : ''}</td><td>{t.testStatus}</td>
              <td>{t.createdBy === 'agent' && <button onClick={() => forget(t.name).then(loadTools)}>Forget</button>}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </main>
  )
}
