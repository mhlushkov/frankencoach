import { describe, expect, test } from 'bun:test';
import sample from '../../data/synthetic/fixtures/dive-garmin-like.csv' with { type: 'text' };
import expected from '../../data/synthetic/fixtures/expected.json';
import parse, { ParseError } from './index';

describe('_template-parser', () => {
  test('known values on synthetic dive CSV', () => {
    const s = parse(sample, { filename: 'dive.csv' });
    expect(s.version).toBe(1);
    expect(Math.abs(s.durationSec - expected.dive.totalSec) / expected.dive.totalSec).toBeLessThan(0.05);
    const maxDepth = Math.max(...s.series.depth_m!.v);
    expect(Math.abs(maxDepth - expected.dive.maxDepthM) / expected.dive.maxDepthM).toBeLessThan(0.05);
    expect(s.series.heart_rate_bpm!.v.length).toBeGreaterThan(10);
  });
  test('garbage input → ParseError', () => {
    expect(() => parse('milk\neggs\nbread', { filename: 'list.txt' })).toThrow(ParseError);
  });
  test('empty / null input throws ParseError, not a crash', () => {
    expect(() => parse('', { filename: 'e.csv' })).toThrow(ParseError);
    expect(() => parse(null as unknown as string, { filename: 'n.csv' })).toThrow(ParseError);
  });
});
