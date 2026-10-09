// running-profile: session analyzer for running. Compute only.
import type { Landmarks, Series, Session, ToolResult } from '../../contracts/types';
import { minMaxMean, slope, zones } from '../series-core';

const HR_EDGES = [0, 120, 140, 160, 180, 300];

function clean(s: Series | undefined): Series | null {
  if (!s || !Array.isArray(s.t) || !Array.isArray(s.v)) return null;
  const n = Math.min(s.t.length, s.v.length);
  const t: number[] = [], v: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = s.t[i], b = s.v[i];
    if (typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b)) { t.push(a); v.push(b); }
  }
  return t.length >= 2 ? { t, v, unit: s.unit } : null;
}

const r = (x: number, d = 2) => +x.toFixed(d);

export default function analyze(input: Landmarks | Session): ToolResult {
  const fail = (w: string): ToolResult => ({ metrics: {}, warnings: [w], usable: false });
  const s = input as Session;
  if (!s || typeof s !== 'object' || !s.series || typeof s.series !== 'object') {
    return fail('no session series found');
  }
  const speed = clean(s.series.speed_mps);
  if (!speed) return fail('speed series is missing, so this does not look like a run');

  const sp = minMaxMean(speed);
  // running speeds: roughly 1.5..8 m/s on average
  if (!(sp.mean >= 1.2 && sp.mean <= 9)) {
    return fail('average speed is outside the normal running range, so I could not treat this as a run');
  }

  const metrics: Record<string, number | number[]> = {};
  const warnings: string[] = [];
  const out: Record<string, Series> = {};

  const dur = speed.t[speed.t.length - 1]! - speed.t[0]!;
  const distanceKm = sp.mean * dur / 1000;
  metrics.avgSpeedMps = r(sp.mean);
  metrics.maxSpeedMps = r(sp.max);
  metrics.avgPaceMinPerKm = r(1000 / sp.mean / 60);
  metrics.distanceKm = r(distanceKm);
  const sd = Math.sqrt(speed.v.reduce((a, x) => a + (x - sp.mean) ** 2, 0) / speed.v.length);
  metrics.speedVariabilityPct = r(sp.mean > 0 ? (sd / sp.mean) * 100 : 0, 1);
  out.speed = { t: speed.t, v: speed.v, unit: 'm/s' };

  const cad = clean(s.series.cadence_rpm);
  if (cad) {
    const c = minMaxMean(cad);
    metrics.avgCadenceSpm = r(c.mean, 1);
    metrics.maxCadenceSpm = r(c.max, 1);
    out.cadence = { t: cad.t, v: cad.v, unit: 'spm' };
    if (c.mean < 150) warnings.push('cadence is low, shorter quicker steps may reduce impact');
  } else {
    warnings.push('no cadence series, so cadence was not analyzed');
  }

  const hr = clean(s.series.heart_rate_bpm);
  if (hr) {
    const h = minMaxMean(hr);
    metrics.avgHeartRateBpm = r(h.mean, 1);
    metrics.maxHeartRateBpm = r(h.max, 0);
    metrics.hrDriftBpmPerMin = r(slope(hr, hr.t[0]!, hr.t[hr.t.length - 1]!) * 60, 2);
    metrics.hrZoneShare = zones(hr, HR_EDGES).map(x => r(x, 3));
    out.heartRate = { t: hr.t, v: hr.v, unit: 'bpm' };
  } else {
    warnings.push('no heart rate series, so zones were not computed');
  }

  const ele = clean(s.series.elevation_m);
  if (ele) {
    let gain = 0, loss = 0;
    for (let i = 1; i < ele.v.length; i++) {
      const d = ele.v[i]! - ele.v[i - 1]!;
      if (d > 0) gain += d; else loss -= d;
    }
    metrics.elevationGainM = r(gain, 1);
    metrics.elevationLossM = r(loss, 1);
    out.elevation = { t: ele.t, v: ele.v, unit: 'm' };
  }

  return { metrics, series: out, warnings, usable: true };
}
