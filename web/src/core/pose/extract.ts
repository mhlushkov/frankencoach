// Browser only (DOM + MediaPipe). Pure tests must not import this module.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Frame, Landmarks } from '../../../../contracts/types'
import { sampleFrames, seek } from './frames'
import { sha256 } from './hash'
import { landmarkCache } from './cache'
import { betterPass, mapFromCrop, needsSecondPass, personCropBox, type CropBox } from './crop'

export interface ExtractOptions {
  fps?: number; maxSec?: number; onProgress?: (p: number) => void; signal?: AbortSignal
  /** Re-extract once at 20 fps on a crop around the person when the first pass looks bad (default true). */
  secondPass?: boolean
}

const SECOND_PASS_FPS = 20
// VIDEO mode needs strictly increasing timestamps across every call on the shared landmarker.
let lastTs = 0

let landmarker: Promise<PoseLandmarker> | undefined

function getLandmarker(): Promise<PoseLandmarker> {
  landmarker ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/pose_landmarker_full.task', delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
    try {
      return await make('GPU')
    } catch {
      return await make('CPU')
    }
  })().catch((e) => {
    landmarker = undefined
    throw e
  })
  return landmarker
}

export async function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = URL.createObjectURL(file)
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('cannot decode video'))
  })
  return video
}

async function extractPass(video: HTMLVideoElement, videoHash: string, opts: ExtractOptions, crop?: CropBox): Promise<Landmarks> {
  const { fps = 10, maxSec = 60, onProgress, signal } = opts
  const pose = await getLandmarker()
  const duration = Math.min(video.duration, maxSec)
  const step = 1 / fps
  const frames: Frame[] = []
  const W = video.videoWidth, H = video.videoHeight
  // crop → integer pixel rect; the box used to map back is the one actually drawn
  const rect = crop && {
    sx: Math.floor(crop.x0 * W), sy: Math.floor(crop.y0 * H),
    sw: Math.max(1, Math.ceil(crop.x1 * W) - Math.floor(crop.x0 * W)), sh: Math.max(1, Math.ceil(crop.y1 * H) - Math.floor(crop.y0 * H)),
  }
  let canvas: HTMLCanvasElement | undefined
  let ctx: CanvasRenderingContext2D | null = null
  if (rect) {
    canvas = document.createElement('canvas')
    canvas.width = rect.sw
    canvas.height = rect.sh
    ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d canvas unavailable')
  }
  const base = lastTs + 1000
  for (let t = 0; t <= duration + 1e-6; t += step) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    await seek(video, Math.min(t, video.duration - 0.001))
    if (ctx && rect) ctx.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh)
    lastTs = base + Math.round(t * 1000)
    const r = pose.detectForVideo(canvas ?? video, lastTs)
    const p = r.landmarks[0]
    frames.push({
      t: Math.round(t * 1000) / 1000,
      landmarks: p ? p.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 0 })) : null,
    })
    onProgress?.(Math.min(1, t / duration))
  }
  onProgress?.(1)
  const l: Landmarks = { version: 1, source: 'mediapipe-pose-full', videoHash, width: W, height: H, durationSec: duration, fps, frames }
  if (!rect) return l
  const drawn = { x0: rect.sx / W, y0: rect.sy / H, x1: (rect.sx + rect.sw) / W, y1: (rect.sy + rect.sh) / H }
  return mapFromCrop(l, drawn, { width: W, height: H })
}

export async function extractFromVideo(video: HTMLVideoElement, videoHash: string, opts: ExtractOptions = {}): Promise<Landmarks> {
  const first = await extractPass(video, videoHash, opts)
  if (opts.secondPass === false || !needsSecondPass(first)) return first
  const box = personCropBox(first, 0.25)
  if (!box) return first
  const second = await extractPass(video, videoHash, { ...opts, fps: SECOND_PASS_FPS }, box)
  return betterPass(first, second)
}

export async function extractLandmarks(file: Blob, opts: ExtractOptions = {}): Promise<Landmarks> {
  return (await prepareVideo(file, opts)).landmarks
}

// One call for the UI: hash → cache hit or extract → 3 classifier frames. Frames go to AppState and are reused on confirmGrow.
export async function prepareVideo(
  file: Blob,
  opts: ExtractOptions = {},
): Promise<{ landmarks: Landmarks; frames: string[]; hash: string; cached: boolean }> {
  const hash = await sha256(file)
  const video = await loadVideo(file)
  try {
    const hit = landmarkCache.get(hash)
    const landmarks = hit ?? (await extractFromVideo(video, hash, opts))
    if (!hit) landmarkCache.set(hash, landmarks)
    else opts.onProgress?.(1)
    const frames = await sampleFrames(video)
    return { landmarks, frames, hash, cached: !!hit }
  } finally {
    URL.revokeObjectURL(video.src)
  }
}
