import type { AgentEvent } from '../../../../contracts/types'

// Pure helpers for what the coach screen prints; tested in format.test.ts.

/** Unit words the grown tools put in metric keys → the symbol a member reads. */
const UNIT_WORD: Record<string, string> = { sec: 's', secs: 's', mps: 'm/s', pct: '%', hr: 'HR', per: '/', kph: 'km/h', deg: '°' }

/** Metric key → label a member reads: 'avg_pace_min_per_km' and 'avgPaceMinPerKm' both → 'Avg pace min/km'; 'hr_drift_bpm_per_min' → 'HR drift bpm/min'. */
export function humanKey(k: string): string {
  const words = k.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase().split(/\s+/)
  const s = words.map((w) => UNIT_WORD[w] ?? w).join(' ').replace(/ \/ /g, '/')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** One number for the grid: integers as they are, everything else with two decimals. */
export const fmtMetric = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2))

/** Grid rows: finite scalar metrics only. Arrays (zone buckets, per-rep lists) are series, not a number a member reads. */
export function metricRows(metrics: Record<string, number | number[]>): [string, string][] {
  return Object.entries(metrics).flatMap(([k, v]) =>
    typeof v === 'number' && Number.isFinite(v) ? [[humanKey(k), fmtMetric(v)] as [string, string]] : [],
  )
}

/** Axis tick with enough decimals that neighbouring ticks never read the same: 3.7, 3.2, 2.8 m/s, not 3, 3, 3. */
export function tickLabel(v: number, step: number, unit: string): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  return `${v.toFixed(decimals)} ${unit}`.trim()
}

/**
 * A file chain reuses two tools (parser, analyzer) and the server reports each one; the member reads one line per request.
 * True for the first 'reused' event since the request started ('thinking' or 'identified'); false for the rest,
 * and false when this request installed a tool: "I know this one" right under "I've learned it" would contradict the diary.
 */
export function showReuse(events: AgentEvent[], i: number): boolean {
  if (events[i]?.type !== 'reused') return false
  for (let j = i - 1; j >= 0; j--) {
    const t = events[j]!.type
    if (t === 'reused' || t === 'tool_installed') return false
    if (t === 'thinking' || t === 'identified') return true
  }
  return true
}
