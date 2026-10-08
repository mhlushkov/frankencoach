// Browser only (DOM + MediaPipe). Pure tests must not import this module.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Landmarks } from '../../../../contracts/types'
import { sampleFrames, seek } from './frames'
import { sha256 } from './hash'
import { poseCache } from './cache'
import { betterPass, mapFromCrop, needsSecondPass, personCropBox, type CropBox } from './crop'
import { pickMain, trackPeople, type Candidate, type Person } from './people'

export interface ExtractOptions {
  fps?: number; maxSec?: number; onProgress?: (p: number) => void; signal?: AbortSignal
  /** Re-extract once at 20 fps on a crop around the person when the first pass looks bad (default true). */
  secondPass?: boolean
}

const SECOND_PASS_FPS = 20
// Up to 3 people per frame (court, lane): people.ts follows each one so two bodies never mix in one time series.
const NUM_POSES = 3
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
        numPoses: NUM_POSES,
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

interface Pass { candidates: Candidate[]; meta: { width: number; height: number; fps: number; durationSec: number; videoHash: string } }

async function extractPass(video: HTMLVideoElement, videoHash: string, opts: ExtractOptions, crop?: CropBox): Promise<Pass> {
  const { fps = 10, maxSec = 60, onProgress, signal } = opts
  const pose = await getLandmarker()
  const duration = Math.min(video.duration, maxSec)
  const step = 1 / fps
  const candidates: Candidate[] = []
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
    candidates.push({
      t: Math.round(t * 1000) / 1000,
      poses: r.landmarks.map((p) => p.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 0 }))),
    })
    onProgress?.(Math.min(1, t / duration))
  }
  onProgress?.(1)
  const meta = { width: W, height: H, fps, durationSec: duration, videoHash }
  if (!rect) return { candidates, meta }
  const drawn = { x0: rect.sx / W, y0: rect.sy / H, x1: (rect.sx + rect.sw) / W, y1: (rect.sy + rect.sh) / H }
  // mapFromCrop works on one Landmarks; wrap each pose as a one-frame clip to reuse its formulas
  const back = (pts: Candidate['poses'][number]) =>
    mapFromCrop({ version: 1, source: 'mediapipe-pose-full', ...meta, frames: [{ t: 0, landmarks: pts }] }, drawn, meta).frames[0].landmarks!
  return { candidates: candidates.map((c) => ({ t: c.t, poses: c.poses.map(back) })), meta }
}

/** All-null Landmarks for a clip where nobody was found (today's "no person" output). */
function nobody({ candidates, meta }: Pass): Landmarks {
  return { version: 1, source: 'mediapipe-pose-full', ...meta, frames: candidates.map((c) => ({ t: c.t, landmarks: null })) }
}

/** Every tracked person, sorted main first; `landmarks` is the main one (all-null frames when nobody was found). */
export async function extractPeople(video: HTMLVideoElement, videoHash: string, opts: ExtractOptions = {}): Promise<{ landmarks: Landmarks; people: Person[] }> {
  const pass = await extractPass(video, videoHash, opts)
  const people = trackPeople(pass.candidates, pass.meta)
  const main = pickMain(people)
  if (!main) return { landmarks: nobody(pass), people }
  // The crop is the union box of one body over the clip. With several people it would either cut someone out
  // or cover the whole court and gain nothing, and a 20 fps re-track could renumber them; so only for a single person.
  if (people.length !== 1 || opts.secondPass === false || !needsSecondPass(main.landmarks)) return { landmarks: main.landmarks, people }
  const box = personCropBox(main.landmarks, 0.25)
  if (!box) return { landmarks: main.landmarks, people }
  const pass2 = await extractPass(video, videoHash, { ...opts, fps: SECOND_PASS_FPS }, box)
  const second = pickMain(trackPeople(pass2.candidates, pass2.meta))
  if (!second || betterPass(main.landmarks, second.landmarks) === main.landmarks) return { landmarks: main.landmarks, people }
  return { landmarks: second.landmarks, people: [second] }
}

export async function extractFromVideo(video: HTMLVideoElement, videoHash: string, opts: ExtractOptions = {}): Promise<Landmarks> {
  return (await extractPeople(video, videoHash, opts)).landmarks
}

export async function extractLandmarks(file: Blob, opts: ExtractOptions = {}): Promise<Landmarks> {
  return (await prepareVideo(file, opts)).landmarks
}

// One call for the UI: hash → cache hit or extract → 3 classifier frames. Frames go to AppState and are reused on confirmGrow.
export async function prepareVideo(
  file: Blob,
  opts: ExtractOptions = {},
): Promise<{ landmarks: Landmarks; frames: string[]; people: Person[]; hash: string; cached: boolean }> {
  const hash = await sha256(file)
  const video = await loadVideo(file)
  try {
    const hit = poseCache.get(hash)
    const hitMain = hit && (pickMain(hit.people)?.landmarks ?? hit.none)
    let landmarks: Landmarks, people: Person[]
    if (hit && hitMain) {
      ({ landmarks, people } = { landmarks: hitMain, people: hit.people })
      opts.onProgress?.(1)
    } else {
      ({ landmarks, people } = await extractPeople(video, hash, opts))
      // the main person is people[0]; store its Landmarks once
      poseCache.set(hash, people.length ? { people } : { people, none: landmarks })
    }
    const frames = await sampleFrames(video)
    console.info(`[pose] ${people.length} ${people.length === 1 ? 'person' : 'people'} in the clip`, people.map((p) => ({ id: p.id, presence: p.presence })))
    return { landmarks, frames, people, hash, cached: !!hitMain }
  } finally {
    URL.revokeObjectURL(video.src)
  }
}
