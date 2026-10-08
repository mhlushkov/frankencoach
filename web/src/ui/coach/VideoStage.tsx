import { useEffect, useRef } from 'react'
import type { Landmarks, ToolResult } from '../../../../contracts/types'
import { BONES, frameAt } from '../../core/pose/skeleton'

export interface VideoMedia { url: string; landmarks?: Landmarks }

// <video> with a skeleton canvas on top; joints flagged by the analyzer get a red ring + note.
export function VideoStage({ media, highlights }: { media: VideoMedia; highlights?: ToolResult['highlights'] }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const hl = useRef(highlights)
  const lm = useRef(media.landmarks)
  useEffect(() => { hl.current = highlights; lm.current = media.landmarks })

  useEffect(() => {
    const v = video.current, c = canvas.current
    if (!v || !c) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const L = lm.current
      const w = v.clientWidth, h = v.clientHeight
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
      const g = c.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, w, h)
      if (!L || !v.videoWidth) return
      // object-fit: contain → the picture is letterboxed inside the element.
      const k = Math.min(w / v.videoWidth, h / v.videoHeight)
      const dw = v.videoWidth * k, dh = v.videoHeight * k, ox = (w - dw) / 2, oy = (h - dh) / 2
      const f = frameAt(L, v.currentTime)
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

  return (
    <div className="stage">
      <video ref={video} src={media.url} controls playsInline muted />
      <canvas ref={canvas} />
    </div>
  )
}
