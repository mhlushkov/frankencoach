// Calibration table for the landmark gate: bun server/gate/smoke.ts data/landmarks/*.json data/synthetic/fixtures/*.landmarks.json
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Landmarks } from '../../contracts/types';
import { boneNoiseCv, checkLandmarks, scaledJitter } from './validity';
import { medianSmooth } from './smooth';

const f3 = (x: number) => x.toFixed(3);

export function smokeRow(name: string, l: Landmarks): string[] {
  const r = checkLandmarks(l);
  const s = r.stats;
  const sm = Array.isArray(l?.frames) ? medianSmooth(l, 3) : l;
  const raw = r.ok && r.stats.smoothed ? undefined : s;   // stats of a healed clip are already the smoothed ones
  return [
    name, r.ok ? (s.smoothed ? 'ok (smoothed)' : 'ok') : 'reject', r.ok ? '' : r.reason,
    String(s.frames), String(l?.fps ?? ''), f3(s.personFrameRatio), f3(s.meanVisibility), f3(s.motionRange),
    f3(raw?.jitter ?? scaledJitter(l)), f3(scaledJitter(sm)), f3(s.boneLengthCv),
    f3(raw?.boneNoiseCv ?? boneNoiseCv(l)), f3(boneNoiseCv(sm)),
  ];
}

export const SMOKE_HEADER = ['file', 'verdict', 'reason', 'frames', 'fps', 'person', 'vis', 'motion', 'jitter raw', 'jitter sm', 'bone CV', 'noise raw', 'noise sm'];

if (import.meta.main) {
  const rows = process.argv.slice(2).map(p => smokeRow(basename(p), JSON.parse(readFileSync(p, 'utf8'))));
  const line = (c: string[]) => `| ${c.join(' | ')} |`;
  console.log([line(SMOKE_HEADER), line(SMOKE_HEADER.map(() => '---')), ...rows.map(line)].join('\n'));
}
