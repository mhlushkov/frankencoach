import type { AgentEvent, AnalyzeRequest, ToolManifest } from '../../../../contracts/types'
import happyGrowVideo from './fixtures/happy-grow-video.json'
import reusedVideo from './fixtures/reused-video.json'
import happyGrowTableChain from './fixtures/happy-grow-table-chain.json'
import rejectedNoHuman from './fixtures/rejected-no-human.json'
import rejectedMismatch from './fixtures/rejected-mismatch.json'
import rejectedBadTable from './fixtures/rejected-bad-table.json'
import missingCapability from './fixtures/missing-capability.json'
import refusedClearance from './fixtures/refused-clearance.json'
import toolsFixture from './fixtures/tools.json'

// VITE_STUB=1: replays canned AgentEvent sequences so ui/ can be built without the server.
export const FIXTURES = {
  'happy-grow-video': happyGrowVideo,
  'reused-video': reusedVideo,
  'happy-grow-table-chain': happyGrowTableChain,
  'rejected-no-human': rejectedNoHuman,
  'rejected-mismatch': rejectedMismatch,
  'rejected-bad-table': rejectedBadTable,
  'missing-capability': missingCapability,
  'refused-clearance': refusedClearance,
} as unknown as Record<FixtureName, AgentEvent[]>
export type FixtureName =
  | 'happy-grow-video' | 'reused-video' | 'happy-grow-table-chain' | 'rejected-no-human'
  | 'rejected-mismatch' | 'rejected-bad-table' | 'missing-capability' | 'refused-clearance'

let stubTools: ToolManifest[] = structuredClone(toolsFixture as ToolManifest[])

export function pickFixture(req: AnalyzeRequest): FixtureName {
  const hint = (req.sportHint ?? '').toLowerCase()
  const msg = req.message.toLowerCase()
  if (hint in FIXTURES) return hint as FixtureName
  if (/clearance|ready for|\b\d+\s*m\b/.test(msg)) return 'refused-clearance'
  if (hint === 'mismatch' || msg.includes('mismatch')) return 'rejected-mismatch'
  const input = req.input
  if (input.kind === 'file') {
    const rows = input.text.trim().split(/\r?\n/)
    const tabular = (rows.length >= 2 && /[,;\t]/.test(rows[0])) || /<(gpx|TrainingCenterDatabase)/i.test(input.text)
    if (!tabular) return 'rejected-bad-table'
    return 'happy-grow-table-chain'   // without confirmGrow stubEvents cuts it at missing_capability
  }
  if (input.kind === 'landmarks' && !input.landmarks.frames.some((f) => f.landmarks)) return 'rejected-no-human'
  if (/squat/.test(hint + ' ' + msg)) return 'reused-video'
  return req.confirmGrow ? 'happy-grow-video' : 'missing-capability'
}

export function stubEvents(req: AnalyzeRequest): AgentEvent[] {
  if (req.input.kind === 'none' && !/clearance|ready for|\b\d+\s*m\b/i.test(req.message))
    return [{ type: 'clarify', text: 'Send me a video or a watch export and tell me the sport.' }]
  const name = pickFixture(req)
  const evs = structuredClone(FIXTURES[name])
  if (name !== 'happy-grow-table-chain' || req.confirmGrow) return evs
  // One confirmation for the whole chain: estimate = sum over all missing steps.
  const planAt = evs.findIndex((e) => e.type === 'plan')
  const plan = evs[planAt] as Extract<AgentEvent, { type: 'plan' }>
  const first = plan.chain.findIndex((c) => c.missing)
  const step = plan.chain[first]
  const estimateUsd = plan.chain.filter((c) => c.missing).length * 0.35
  return [
    ...evs.slice(0, planAt + 1),
    {
      type: 'missing_capability', kind: step.step === 'parse' ? 'parser' : 'analyzer', activity: step.activity,
      inputType: step.inputType, estimateUsd, basedOn: ['series-core'], stepIndex: first,
      text: `I can't read this format or analyse it yet. Build a parser and an analyzer for ≈ $${estimateUsd.toFixed(2)}?`,
    },
  ]
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    if (signal?.aborted) return rej(new DOMException('aborted', 'AbortError'))
    const id = setTimeout(res, ms)
    signal?.addEventListener('abort', () => { clearTimeout(id); rej(new DOMException('aborted', 'AbortError')) }, { once: true })
  })

export async function stubAnalyze(
  req: AnalyzeRequest,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
  delay = { minMs: 300, maxMs: 800 },
): Promise<void> {
  for (const e of stubEvents(req)) {
    await sleep(delay.minMs + Math.random() * (delay.maxMs - delay.minMs), signal)
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (e.type === 'tool_installed') stubTools = [...stubTools.filter((t) => t.name !== e.manifest.name), e.manifest]
    onEvent(e)
  }
}

export const stubApi = {
  list: async (): Promise<ToolManifest[]> => structuredClone(stubTools),
  forget: async (name: string): Promise<boolean> => {
    const before = stubTools.length
    stubTools = stubTools.filter((t) => t.name !== name)
    return stubTools.length < before
  },
  health: async () => ({ ok: true, demoMode: true, budgetLeftUsd: 9.5, toolsCount: stubTools.length, startedAt: new Date().toISOString(), voice: false }),
  log: async (): Promise<unknown[]> => [],
  speak: async (_text: string): Promise<Blob> => { throw new Error('voice is off in stub mode') },
}
