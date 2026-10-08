import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Landmarks } from '../../contracts/types';
import { checkLandmarks, checkTable } from './validity';

const DIR = join(import.meta.dir, '../../data/synthetic/fixtures');
const lm = (name: string): Landmarks => JSON.parse(readFileSync(join(DIR, `${name}.landmarks.json`), 'utf8'));
const csv = (name: string) => readFileSync(join(DIR, name), 'utf8');

describe('checkLandmarks', () => {
  test.each([
    ['noHuman', 'no_human'],
    ['static', 'no_motion'],
    ['jitter', 'unstable'],
    ['lowVisibility', 'low_confidence'],
  ])('%s → %s', (name, reason) => {
    const r = checkLandmarks(lm(name));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe(reason as typeof r.reason);
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.tips.length).toBeGreaterThan(0);
    expect(r.stats).toBeDefined();
  });

  test('garbage is rejected', () => {
    const r = checkLandmarks(lm('garbage'));
    expect(r.ok).toBe(false);
  });

  test.each(['squat', 'freedive', 'running'])('%s → ok with stats', (name) => {
    const r = checkLandmarks(lm(name));
    expect(r.ok).toBe(true);
    expect(r.stats.personFrameRatio).toBe(1);
    expect(r.stats.meanVisibility).toBeGreaterThan(0.5);
  });

  test('too long → too_long', () => {
    const l = lm('squat');
    const r = checkLandmarks({ ...l, durationSec: 120 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_long');
  });

  test('malformed input never throws', () => {
    const r = checkLandmarks({} as Landmarks);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_human');
  });
});

describe('checkTable', () => {
  test.each(['shopping-list.csv', 'empty.csv', 'no-time.csv', 'one-row.csv'])('%s → bad_table', (name) => {
    const r = checkTable(csv(name));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('bad_table');
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.tips.length).toBeGreaterThan(0);
  });

  test('dive-garmin-like → ok with timeCol', () => {
    const r = checkTable(csv('dive-garmin-like.csv'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.timeCol).toBe('timestamp');
    expect(r.header).toEqual(['timestamp', 'depth_m', 'heart_rate_bpm', 'temp_c']);
    expect(r.rows.length).toBe(91);
    expect(r.numericCols).toEqual(['depth_m', 'heart_rate_bpm', 'temp_c']);
  });

  test.each([['ride-strava-like.csv', 'time'], ['run-apple-like.csv', 'Date']])('%s → ok, timeCol %s', (name, col) => {
    const r = checkTable(csv(name));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.timeCol).toBe(col);
  });

  test('non-monotonic time → bad_table', () => {
    const lines = ['time,hr', ...Array.from({ length: 12 }, (_, i) => `${i % 3},${100 + i}`)];
    const r = checkTable(lines.join('\n'));
    expect(r.ok).toBe(false);
  });
});
