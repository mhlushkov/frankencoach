import type { AgentEvent, AnalyzeRequest, ToolManifest } from '../../../../contracts/types'
import { parseSse } from './sse'
import { stubAnalyze, stubApi } from './stub'

// HTTP per contracts/events.md; Vite proxies /api → server (strips the prefix).
const BASE = '/api'
const STUB = import.meta.env.VITE_STUB === '1'

export interface Health { ok: boolean; demoMode: boolean; budgetLeftUsd: number; toolsCount: number; startedAt: string }

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function analyze(req: AnalyzeRequest, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  if (STUB) return stubAnalyze(req, onEvent, signal)
  const res = await fetch(BASE + '/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(req),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`/analyze: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim())
  for await (const e of parseSse(res.body)) onEvent(e)
}

export const getTools = (): Promise<ToolManifest[]> => (STUB ? stubApi.list() : json('/tools'))

export const getLog = (limit = 200): Promise<unknown[]> => (STUB ? stubApi.log() : json(`/log?limit=${limit}`))

export const forget = (name: string): Promise<boolean> =>
  STUB
    ? stubApi.forget(name)
    : json<{ ok?: boolean }>('/forget', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then((r) => r.ok !== false)

export const health = (): Promise<Health> => (STUB ? stubApi.health() : json('/health'))

export const isStub = STUB
