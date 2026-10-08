// Browser only. ≤3 jpeg dataURLs (long side 256 px) at fractions of the duration, for the classifier.
export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve() }
    const fail = () => { cleanup(); reject(new Error('video seek failed')) }
    const cleanup = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail) }
    video.addEventListener('seeked', done)
    video.addEventListener('error', fail)
    video.currentTime = t
  })
}

export async function sampleFrames(video: HTMLVideoElement, at: number[] = [0.1, 0.5, 0.9], size = 256): Promise<string[]> {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h || !isFinite(video.duration)) return []
  const k = size / Math.max(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * k)
  canvas.height = Math.round(h * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  const out: string[] = []
  for (const f of at.slice(0, 3)) {
    await seek(video, Math.min(video.duration - 0.05, Math.max(0, f * video.duration)))
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    out.push(canvas.toDataURL('image/jpeg', 0.7))
  }
  return out
}
