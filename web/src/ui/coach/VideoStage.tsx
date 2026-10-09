import { useEffect, useRef, type PointerEvent } from 'react'
import type { Landmarks, ToolResult } from '../../../../contracts/types'
import { BONES, frameLerp } from '../../core/pose/skeleton'
import { boxAt, padBox, type PickBox } from './chooser'

export interface VideoMedia { url: string; landmarks?: Landmarks }

interface Props {
  media: VideoMedia
  highlights?: ToolResult['highlights']
  /** Several people: numbered boxes instead of the skeleton, video paused at `seekTo`, a tap calls `onPickBox`. */
  boxes?: PickBox[]
  seekTo?: number
  onPickBox?: (id: number) => void
}

// object-fit: contain → the picture is letterboxed inside the element.
function fit(v: HTMLVideoElement) {
  const w = v.clientWidth, h = v.clientHeight
  const k = Math.min(w / v.videoWidth, h / v.videoHeight)
  const dw = v.videoWidth * k, dh = v.videoHeight * k
  return { w, h, dw, dh, ox: (w - dw) / 2, oy: (h - dh) / 2 }
}

// <video> with a skeleton canvas on top; joints flagged by the analyzer get a red ring + note.
export function VideoStage({ media, highlights, boxes, seekTo, onPickBox }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const hl = useRef(highlights)
  const lm = useRef(media.landmarks)
  const bx = useRef(boxes?.map((b) => padBox(b)))
  useEffect(() => { hl.current = highlights; lm.current = media.landmarks; bx.current = boxes?.map((b) => padBox(b)) })

  useEffect(() => {
    const v = video.current
    if (!v || seekTo === undefined) return
    const go = () => { v.pause(); v.currentTime = seekTo }
    if (v.readyState >= 1) go()
    else v.addEventListener('loadedmetadata', go, { once: true })
    return () => v.removeEventListener('loadedmetadata', go)
  }, [seekTo])

  useEffect(() => {
    const v = video.current, c = canvas.current
    if (!v || !c) return
    const learn = getComputedStyle(c).getPropertyValue('--fc-learn').trim() || '#ffb23e'
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const L = lm.current, B = bx.current
      const w = v.clientWidth, h = v.clientHeight
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
      const g = c.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, w, h)
      if (!v.videoWidth) return
      const { dw, dh, ox, oy } = fit(v)
      if (B) {
        g.font = '600 15px "Barlow Condensed", sans-serif'
        g.textBaseline = 'middle'
        for (const b of B) {
          const x = ox + b.x0 * dw, y = oy + b.y0 * dh
          g.strokeStyle = learn; g.lineWidth = 2
          g.strokeRect(x, y, (b.x1 - b.x0) * dw, (b.y1 - b.y0) * dh)
          const label = String(b.id), bw = g.measureText(label).width + 20, bh = 26
          g.fillStyle = '#0a0c0d'; g.fillRect(x, y, bw, bh)
          g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1)
          g.fillStyle = learn; g.fillText(label, x + 10, y + bh / 2 + 1)
        }
        return
      }
      if (!L) return
      const f = frameLerp(L, v.currentTime)
      if (!f?.landmarks) return
      const P = (i: number) => { const p = f.landmarks![i]; return p ? { x: ox + p.x * dw, y: oy + p.y * dh, vis: p.visibility } : null }
      g.lineCap = 'round'
      for (const [a, b] of BONES) {
        const pa = P(a), pb = P(b)
        if (!pa || !pb) continue
        g.strokeStyle = `rgba(228,231,229,${Math.max(0.15, Math.min(pa.vis, pb.vis))})`
        g.lineWidth = 2
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke()
      }
      for (let i = 0; i < f.landmarks.length; i++) {
        const p = P(i)
        if (!p || p.vis < 0.3) continue
        g.fillStyle = '#0a0c0d'; g.strokeStyle = '#e4e7e5'; g.lineWidth = 1.5
        g.beginPath(); g.arc(p.x, p.y, 3.5, 0, Math.PI * 2); g.fill(); g.stroke()
      }
      g.font = '600 13px Barlow, sans-serif'
      for (const H of hl.current ?? []) {
        if (Math.abs(H.frame / L.fps - v.currentTime) > 0.3) continue
        const pts = H.joints.map(P).filter((p): p is NonNullable<typeof p> => !!p)
        if (!pts.length) continue
        const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length, cy = pts.reduce((n, p) => n + p.y, 0) / pts.length
        g.strokeStyle = '#ff5a52'; g.lineWidth = 1.5
        g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.stroke()
        const tw = g.measureText(H.note).width + 20, tx = Math.min(cx + 24, w - tw - 4), ty = Math.max(4, cy - 40)
        g.fillStyle = '#0a0c0d'; g.fillRect(tx, ty, tw, 28); g.strokeRect(tx, ty, tw, 28)
        g.fillStyle = '#ff5a52'; g.fillText(H.note, tx + 10, ty + 18)
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  // Same letterbox math as the drawing, so a tap lands on the box it looks like it hits.
  function pick(e: PointerEvent<HTMLDivElement>) {
    const v = video.current, B = bx.current
    if (!v || !B || !v.videoWidth) return
    const r = v.getBoundingClientRect()
    const { dw, dh, ox, oy } = fit(v)
    const id = boxAt(B, (e.clientX - r.left - ox) / dw, (e.clientY - r.top - oy) / dh)
    if (id !== undefined) onPickBox?.(id)
  }

  return (
    <div className="stage">
      <video ref={video} src={media.url} controls={!boxes} playsInline muted />
      <canvas ref={canvas} />
      {boxes && <div role="group" aria-label="People in the video" style={{ position: 'absolute', inset: 0, cursor: 'pointer', touchAction: 'manipulation' }} onPointerUp={pick} />}
    </div>
  )
}
