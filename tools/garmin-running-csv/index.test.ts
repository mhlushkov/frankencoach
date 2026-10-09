import { describe, expect, test } from 'bun:test';
import garbage from '../../data/synthetic/fixtures/shopping-list.csv' with { type: 'text' };
import parse from './index';

const lines = ['timestamp,elapsed_s,distance_m,speed_mps,pace_min_km,heart_rate_bpm,cadence_spm,altitude_m'];
for (let i = 0; i < 30; i++) {
 const ss = String(i).padStart(2, '0');
 lines.push(`2026-10-07T07:12:${ss}Z,${i},${(i * 2.8).toFixed(1)},${(2.7 + (i % 3) * 0.05).toFixed(2)},6.00,${80 + i},${168 + (i % 3)},${(212 + i * 0.01).toFixed(2)}`);
}
const sample = lines.join('\n');

describe('garmin-running-csv', () => {
 test('parses sample with known values', () => {
 const s = parse(sample, { filename: 'run.csv' });
 expect(s.version).toBe(1);
 expect(s.source).toBe('garmin-running-csv');
 expect(s.durationSec).toBeGreaterThan(5);
 expect(s.series.heart_rate_bpm).toBeDefined();
 expect(s.series.speed_mps).toBeDefined();
 expect(s.series.cadence_rpm).toBeDefined();
 expect(s.series.elevation_m).toBeDefined();
 expect(s.series.heart_rate_bpm!.t[0]).toBe(0);
 expect(Math.min(...s.series.heart_rate_bpm!.v)).toBe(80);
 expect(Math.max(...s.series.heart_rate_bpm!.v)).toBe(109);
 expect(typeof s.meta.formatSignature).toBe('string');
 });
 test('garbage input throws ParseError', () => {
 expect(() => parse(garbage, { filename: 'shopping-list.csv' })).toThrow(/ParseError/);
 });
 test('empty string throws ParseError', () => {
 expect(() => parse('', { filename: 'e.csv' })).toThrow(/ParseError/);
 });
});
