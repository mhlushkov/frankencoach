import { expect, test } from 'bun:test'
import type { AgentEvent } from '../../../../contracts/types'
import { fmtMetric, humanKey, metricRows, showReuse, tickLabel } from './format'

test('humanKey splits snake and camel case the same way', () => {
  expect(humanKey('avg_pace_min_per_km')).toBe('Avg pace min per km')
  expect(humanKey('avgPaceMinPerKm')).toBe('Avg pace min per km')
  expect(humanKey('hrZoneSec')).toBe('Hr zone sec')
})

test('fmtMetric: integers plain, floats with two decimals', () => {
  expect(fmtMetric(170)).toBe('170')
  expect(fmtMetric(3.0166)).toBe('3.02')
})

test('metricRows keeps finite scalars in order and drops arrays and NaN', () => {
  expect(metricRows({ avgSpeedMps: 3.02, hrZoneSec: [0, 120, 600], maxHrBpm: 163, bad: Number.NaN })).toEqual([
    ['Avg speed mps', '3.02'],
    ['Max hr bpm', '163'],
  ])
})

test('tickLabel picks decimals from the tick step so ticks never repeat', () => {
  expect(tickLabel(3.2, 0.47, 'm/s')).toBe('3.2 m/s')
  expect(tickLabel(26.7, 13.3, 'm')).toBe('27 m')
  expect(tickLabel(0.05, 0.03, '')).toBe('0.05')
})

const ev = (type: AgentEvent['type']) => ({ type }) as AgentEvent

test('showReuse: one row per request, reset by the next identified/thinking', () => {
  const events = [ev('thinking'), ev('identified'), ev('plan'), ev('reused'), ev('reused'), ev('parsed'), ev('thinking'), ev('identified'), ev('reused')]
  expect(events.map((_, i) => showReuse(events, i))).toEqual([false, false, false, true, false, false, false, false, true])
})

test('showReuse: a reused event with no request start before it still shows once', () => {
  const events = [ev('reused'), ev('reused')]
  expect(showReuse(events, 0)).toBe(true)
  expect(showReuse(events, 1)).toBe(false)
})
