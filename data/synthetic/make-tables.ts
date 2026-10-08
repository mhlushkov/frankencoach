// Synthetic watch/app exports (CSV text) with known values. Run: bun data/synthetic/make-tables.ts
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const sin = (t: number, period: number) => Math.sin((2 * Math.PI * t) / period);
const lines = (header: string, rows: (string | number)[][]) => [header, ...rows.map((x) => x.join(','))].join('\n') + '\n';
const T0 = Date.UTC(2026, 9, 8, 9, 0, 0);

// ---------- dive: V-profile to 25 m, 1 Hz, 90 s ----------
export const expectedDive = { maxDepthM: 25, descentRateMps: 0.9, bottomTimeSec: 5, totalSec: 90 };
function diveDepth(t: number): number {
  const { maxDepthM: D, descentRateMps: v, bottomTimeSec: b, totalSec: T } = expectedDive;
  const tDown = D / v, tUp = tDown + b;
  if (t <= tDown) return v * t;
  if (t <= tUp) return D;
  return (D * (T - t)) / (T - tUp);
}
export function makeDiveCsv(): string {
  const rows = [];
  for (let t = 0; t <= expectedDive.totalSec; t++) {
    const d = r(diveDepth(t), 2);
    rows.push([new Date(T0 + t * 1000).toISOString(), d, Math.round(75 - (20 * d) / 25), r(22 - (6 * d) / 25, 1)]);
  }
  return lines('timestamp,depth_m,heart_rate_bpm,temp_c', rows);
}

// ---------- ride: 10 min, 1 Hz ----------
function rideRows() {
  const rows: number[][] = [];
  for (let t = 0; t <= 600; t++) {
    rows.push([t, r(8 + 1.5 * sin(t, 120) + 0.5 * sin(t, 37), 2), Math.round(85 + 6 * sin(t, 90)),
      r(200 + 15 * sin(t, 600), 1), Math.round(140 + 10 * sin(t, 300))]);
  }
  return rows;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const expectedRide = (() => {
  const rows = rideRows();
  return { avgSpeedMps: r(mean(rows.map((x) => x[1])), 3), avgCadence: r(mean(rows.map((x) => x[2])), 3), totalSec: 600 };
})();
export function makeRideCsv(): string {
  return lines('time,speed_mps,cadence_rpm,elevation_m,heart_rate_bpm', rideRows());
}

// ---------- run: Apple-like, non-canonical column names, every 5 s, 10 min ----------
function runRows() {
  const rows: { date: string; paceSec: number; hr: number }[] = [];
  for (let t = 0; t <= 600; t += 5) {
    const date = new Date(T0 + t * 1000).toISOString().replace('T', ' ').slice(0, 19);
    rows.push({ date, paceSec: Math.round(312 + 15 * sin(t, 200)), hr: Math.round(150 + 8 * sin(t, 240)) });
  }
  return rows;
}
export const expectedRun = (() => {
  const rows = runRows();
  return { avgPaceMinPerKm: r(mean(rows.map((x) => x.paceSec)) / 60, 3), avgHr: r(mean(rows.map((x) => x.hr)), 3), totalSec: 600 };
})();
export function makeRunCsv(): string {
  const pace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return lines('Date,Pace(min/km),HR', runRows().map((x) => [x.date, pace(x.paceSec), x.hr]));
}

// ---------- garbage ----------
export const garbageTables: Record<string, string> = {
  'shopping-list.csv': lines('item,qty', [['milk', 2], ['bread', 1], ['eggs', 12], ['apples', 6], ['coffee', 1], ['cheese', 1]]),
  'empty.csv': '',
  'no-time.csv': lines('depth_m,heart_rate_bpm', Array.from({ length: 20 }, (_, i) => [r(i * 1.2, 1), 75 - i])),
  'one-row.csv': lines('timestamp,depth_m,heart_rate_bpm,temp_c', [[new Date(T0).toISOString(), 0, 75, 22]]),
};

export const tableFixtures: Record<string, () => string> = {
  'dive-garmin-like.csv': makeDiveCsv,
  'ride-strava-like.csv': makeRideCsv,
  'run-apple-like.csv': makeRunCsv,
  ...Object.fromEntries(Object.entries(garbageTables).map(([k, v]) => [k, () => v])),
};

if (import.meta.main) await (await import('./make-fixtures.ts')).writeAll();
