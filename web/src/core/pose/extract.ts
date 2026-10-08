// Browser only (DOM + MediaPipe). Pure tests must not import this module.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Frame, Landmarks } from '../../../../contracts/types'
import { sampleFrames, seek } from './frames'
import { sha256 } from './hash'
import { landmarkCache } from './cache'

export interface ExtractOptions { fps?: number; maxSec?: number; onProgress?: (p: number) => void; signal?: AbortSignal }

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

export async function extractFromVideo(video: HTMLVideoElement, videoHash: string, opts: ExtractOptions = {}): Promise<Landmarks> {
  const { fps = 10, maxSec = 60, onProgress, signal } = opts
  const pose = await getLandmarker()
  const duration = Math.min(video.duration, maxSec)
  const step = 1 / fps
  const frames: Frame[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    await seek(video, Math.min(t, video.duration - 0.001))
    const r = pose.detectForVideo(video, Math.round(t * 1000))
    const p = r.landmarks[0]
    frames.push({
      t: Math.round(t * 1000) / 1000,
      landmarks: p ? p.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 0 })) : null,
    })
    onProgress?.(Math.min(1, t / duration))
  }
  onProgress?.(1)
  return {
    version: 1, source: 'mediapipe-pose-full', videoHash,
    width: video.videoWidth, height: video.videoHeight, durationSec: duration, fps, frames,
  }
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
