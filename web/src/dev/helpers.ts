import type { AgentEvent, AnalyzeInput, Landmarks, Series, ToolResult } from '../../../contracts/types'

// Pure helpers for the dev console (no DOM).
export const MAX_FILE_BYTES = 1_000_000

function asLandmarks(text: string): Landmarks | undefined {
  try {
    const j = JSON.parse(text)
    return j && j.version === 1 && Array.isArray(j.frames) && typeof j.fps === 'number' ? (j as Landmarks) : undefined
  } catch {
    return undefined
  }
}

// Text file → AnalyzeInput. A landmarks.json (e.g. from scripts/pose.py) becomes a landmarks input.
export function fileInput(filename: string, mime: string, text: string): { input?: AnalyzeInput; error?: string } {
  if (/\.json$/i.test(filename)) {
    const l = asLandmarks(text)
    if (l) return { input: { kind: 'landmarks', landmarks: l } }
  }
  if (text.length > MAX_FILE_BYTES) return { error: `${filename}: ${text.length} bytes > 1 MB limit` }
  return { input: { kind: 'file', filename, mime: mime || 'text/plain', text } }
}

const COLORS: Partial<Record<AgentEvent['type'], string>> = {
  error: '#c33', rejected: '#c33', refused: '#c33',
  answer: '#2a7', tool_installed: '#2a7', reused: '#2a7', parsed: '#2a7', tool_used: '#2a7',
  missing_capability: '#d80', clarify: '#d80',
  growing: '#36c', test_result: '#36c', authority_check: '#36c', plan: '#36c', identified: '#36c',
  cost: '#a3a',
}
export function eventColor(e: AgentEvent): string {
  if ((e.type === 'test_result' || e.type === 'authority_check') && !e.pass) return '#c33'
  return COLORS[e.type] ?? '#888'
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3))
export function metricRows(r: ToolResult): [string, string][] {
  return Object.entries(r.metrics).map(([k, v]) => [k, Array.isArray(v) ? v.map(fmt).join(', ') : fmt(v)])
}

export function seriesText(series: Record<string, Series> | undefined): string {
  if (!series) return ''
  return Object.entries(series)
    .map(([k, s]) => {
      const min = Math.min(...s.v)
      const max = Math.max(...s.v)
      const head = s.v.slice(0, 20).map(fmt).join(' ')
      return `${k}${s.unit ? ` (${s.unit})` : ''}: n=${s.v.length} t=[${fmt(s.t[0] ?? 0)}..${fmt(s.t.at(-1) ?? 0)}] min=${fmt(min)} max=${fmt(max)}\n  ${head}${s.v.length > 20 ? ' …' : ''}`
    })
    .join('\n')
}
