import type { Series } from '../../../../contracts/types'
import { tickLabel } from './format'

const NAMES: Record<string, string> = {
  depth_m: 'how deep you went', heart_rate_bpm: 'your heart rate', speed_mps: 'your speed',
  cadence_rpm: 'your cadence', elevation_m: 'elevation', power_w: 'your power', temp_c: 'temperature',
}
const UNIT_LABEL = (u: string | undefined, k: string) => u ?? (k.endsWith('_m') ? 'm' : k.endsWith('_bpm') ? 'bpm' : k.endsWith('_w') ? 'W' : '')
const W = 752, H = 480, X0 = 52, X1 = 730, Y0 = 20, Y1 = 428

function clock(sec: number): string {
  if (sec < 1) return 'start'
  if (sec < 60) return `${Math.round(sec)} sec`
  const m = sec / 60
  return Number.isInteger(m) ? `${m} min` : `${m.toFixed(1)} min`
}
const pretty = (k: string) => NAMES[k] ?? k.replace(/_(m|bpm|mps|rpm|w|c)$/, '').replace(/_/g, ' ')

export function Chart({ series }: { series: Record<string, Series> }) {
  const keys = Object.keys(series).filter((k) => series[k]!.t.length > 1).slice(0, 3)
  if (!keys.length) return null
  const tMax = Math.max(...keys.map((k) => series[k]!.t[series[k]!.t.length - 1]!)) || 1
  const sx = (t: number) => X0 + (t / tMax) * (X1 - X0)
  const range = (k: string) => { const v = series[k]!.v; return [Math.min(...v), Math.max(...v)] as const }

  const line = (k: string) => {
    const s = series[k]!
    const [lo, hi] = range(k)
    const span = hi - lo || 1
    // Depth grows downward, so the dive reads as a V-shape.
    const y = (v: number) => (k === 'depth_m' ? Y0 + ((v - lo) / span) * (Y1 - Y0) : Y1 - ((v - lo) / span) * (Y1 - Y0))
    return s.t.map((t, i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)} ${y(s.v[i]!).toFixed(1)}`).join(' ')
  }
  const main = keys[0]!
  const [lo, hi] = range(main)
  const ticks = [0, 1, 2, 3].map((i) => {
    const f = i / 3
    const v = main === 'depth_m' ? lo + f * (hi - lo) : hi - f * (hi - lo)
    return { y: Y0 + f * (Y1 - Y0), label: tickLabel(v, (hi - lo) / 3, UNIT_LABEL(series[main]!.unit, main)) }
  })
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: sx(f * tMax), label: clock(f * tMax) }))

  return (
    <>
      <div className="chart-legend">
        {keys.map((k, i) => (
          <span key={k}><i style={i === 0 ? { width: 16, height: 2, background: '#e4e7e5' } : { width: 16, borderTop: `1.5px dashed ${i === 1 ? '#8b9296' : '#ffb23e'}` }} />{pretty(k)}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" className="chart-svg" fill="none" role="img" aria-label={`Chart of ${keys.map(pretty).join(', ')}`}>
        <g stroke="rgba(228,231,229,.08)">{ticks.map((t) => <line key={t.y} x1={X0} y1={t.y} x2={X1} y2={t.y} />)}<line x1={X0} y1={Y1} x2={X1} y2={Y1} /></g>
        <g fontFamily="Barlow, sans-serif" fontSize="17" fill="#8b9296">
          {ticks.map((t) => <text key={t.y} x={0} y={t.y + 5}>{t.label}</text>)}
          {xt.map((t, i) => <text key={i} x={t.x} y={462} textAnchor={i === 0 ? 'start' : i === xt.length - 1 ? 'end' : 'middle'}>{t.label}</text>)}
        </g>
        {keys.map((k, i) => <path key={k} d={line(k)} stroke={i === 0 ? '#e4e7e5' : i === 1 ? '#8b9296' : '#ffb23e'} strokeWidth={i === 0 ? 2 : 1.5} strokeDasharray={i === 0 ? undefined : '4 4'} />)}
      </svg>
    </>
  )
}
