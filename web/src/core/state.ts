import type { Action, AgentEvent, AnalyzeRequest, AppState, ChainStep, ChatMessage } from '../../../contracts/types'

// Pure: no DOM, no fetch. ui/ and dev/ only render AppState and dispatch Action.
export const initialState: AppState = {
  status: 'idle',
  messages: [],
  events: [],
  tools: [],
  sessionUsd: 0,
  lastRequestUsd: 0,
  savedUsd: 0,
}

const coach = (text: string): ChatMessage => ({ role: 'coach', text, ts: Date.now() })

function patchStep(chain: ChainStep[] | undefined, i: number | undefined, tool: string): ChainStep[] | undefined {
  if (!chain || i === undefined || !chain[i]) return chain
  return chain.map((s, j) => (j === i ? { ...s, tool, missing: false } : s))
}

// The single place where AgentEvents change state; each type handled once.
function applyEvent(s: AppState, e: AgentEvent): AppState {
  s = { ...s, events: [...s.events, e] }
  switch (e.type) {
    case 'thinking':
    case 'identified':
    case 'growing':
    case 'test_result':
    case 'authority_check':
      return s
    case 'rejected':
    case 'clarify':
    case 'refused':
      return { ...s, status: 'done', messages: [...s.messages, coach(e.text)] }
    case 'plan':
      return { ...s, chain: e.chain }
    case 'reused':
      return { ...s, savedUsd: s.savedUsd + e.savedUsd, chain: patchStep(s.chain, e.stepIndex, e.tool) }
    case 'missing_capability':
      return { ...s, status: 'awaiting_confirm', pending: e }
    case 'tool_installed':
      return {
        ...s,
        tools: [...s.tools.filter((t) => t.name !== e.manifest.name), e.manifest],
        chain: patchStep(s.chain, e.stepIndex, e.manifest.name),
      }
    case 'parsed':
      return { ...s, session: e.session }
    case 'tool_used':
      return { ...s, result: e.result }
    case 'answer':
      return { ...s, messages: [...s.messages, coach(e.text)] }
    case 'cost':
      return {
        ...s,
        sessionUsd: e.sessionUsd,
        lastRequestUsd: e.step === 'total' ? e.usd : s.lastRequestUsd + e.usd,
      }
    case 'error':
      return { ...s, status: 'error', error: e.text }
    default: {
      const never: never = e
      return never
    }
  }
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'inputReady':
      return {
        ...s,
        status: 'ready',
        input: a.input,
        inputName: a.inputName,
        frames: a.frames,
        extractProgress: undefined,
        error: undefined,
      }
    case 'extractProgress':
      return { ...s, status: 'extracting', extractProgress: a.value }
    case 'send':
      return {
        ...s,
        status: 'analyzing',
        messages: [...s.messages, { role: 'user', text: a.request.message, ts: Date.now() }],
        events: [],
        lastRequest: a.request,
        chain: undefined,
        pending: undefined,
        result: undefined,
        session: undefined,
        error: undefined,
        lastRequestUsd: 0,
      }
    case 'event':
      return applyEvent(s, a.event)
    case 'requestDone':
      return s.status === 'analyzing' ? { ...s, status: 'done' } : s
    case 'requestFailed':
      return { ...s, status: 'error', error: a.error }
    case 'toolsLoaded':
      return { ...s, tools: a.tools }
    case 'reset':
      return { ...initialState, tools: s.tools, sessionUsd: s.sessionUsd, savedUsd: s.savedUsd }
    default: {
      const never: never = a
      return never
    }
  }
}

export const selectors = {
  isBusy: (s: AppState) => s.status === 'analyzing' || s.status === 'extracting',
  canSend: (s: AppState) => s.status !== 'analyzing' && s.status !== 'extracting',
  // Retry after missing_capability: same request, confirmGrow, frames from state (never resampled → server cache hit).
  confirmRequest(s: AppState): AnalyzeRequest | undefined {
    const r = s.lastRequest
    if (!r) return undefined
    const input = r.input.kind === 'landmarks' && s.frames ? { ...r.input, frames: s.frames } : r.input
    return { ...r, input, confirmGrow: true }
  },
  lastAnswer: (s: AppState) => [...s.events].reverse().find((e) => e.type === 'answer')?.text,
  costEvents: (s: AppState) => s.events.filter((e): e is Extract<AgentEvent, { type: 'cost' }> => e.type === 'cost'),
}
