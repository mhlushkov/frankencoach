import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LlmDeps } from '../agent/llm';
import { makeCache } from '../agent/cache';
import pricing from '../../contracts/pricing.json';
import { classifyInput } from './classify';
import { sniffFormat } from './sniff';

function fakeDeps(text: string) {
  const calls: any[] = [];
  const deps: LlmDeps = {
    client: {
      messages: {
        create: async (body: any) => {
          calls.push(body);
          return { content: [{ type: 'text', text }], usage: { input_tokens: 300, output_tokens: 80 } };
        },
      },
    },
    modelFor: (t) => (t === 'strong' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'),
    pricing,
    cache: makeCache(mkdtempSync(join(tmpdir(), 'fc-gate2-'))),
    sleep: async () => {},
  };
  return { deps, calls };
}

const goodClassify = {
  isHuman: true, numPeople: 1, activity: 'freediving', isSport: true, environment: 'pool',
  intent: 'technique feedback', mismatchWithHint: false, confidence: 0.9, reason: 'swimmer underwater',
};

test('classifyInput: valid JSON parses, cheap tier, json, ≤200 tokens, frames sent as base64', async () => {
  const { deps, calls } = fakeDeps(JSON.stringify(goodClassify));
  const out = await classifyInput({
    message: 'how is my dive?', sportHint: 'freediving',
    frames: ['data:image/jpeg;base64,AAAA'], stats: { durationSec: 12 },
    knownActivities: ['freediving', 'squat'],
  }, deps);
  expect(out.value).toEqual(goodClassify);
  expect(out.llm.model).toBe('claude-haiku-5-5');
  expect(calls[0].max_tokens).toBeLessThanOrEqual(200);
  expect(calls[0].messages[0].content[0].source.data).toBe('AAAA');
  const user = calls[0].messages[0].content.at(-1).text;
  expect(user).toContain('freediving');
  expect(user).toContain('squat');
  expect(calls[0].system[0].text).toContain('KNOWN');
});

test('classifyInput: invalid JSON throws', async () => {
  const { deps } = fakeDeps('not json at all');
  await expect(classifyInput({ message: 'x', knownActivities: [] }, deps)).rejects.toThrow();
});

test('classifyInput: schema violation throws (bad activity name, missing field)', async () => {
  const bad1 = fakeDeps(JSON.stringify({ ...goodClassify, activity: 'Free Diving' }));
  await expect(classifyInput({ message: 'x', knownActivities: [] }, bad1.deps)).rejects.toThrow();
  const { confidence, ...missing } = goodClassify;
  const bad2 = fakeDeps(JSON.stringify(missing));
  await expect(classifyInput({ message: 'x', knownActivities: [] }, bad2.deps)).rejects.toThrow();
});

const goodSniff = {
  formatId: 'garmin-dive-csv', activity: 'freediving', isSportData: true, timeColumn: 'time',
  columns: [{ name: 'time', meaning: 'elapsed time', unit: 's' }, { name: 'depth', meaning: 'depth', unit: 'm' }],
  confidence: 0.8,
};

test('sniffFormat: valid JSON parses, cheap tier, known formats in prompt', async () => {
  const { deps, calls } = fakeDeps('```json\n' + JSON.stringify(goodSniff) + '\n```');
  const out = await sniffFormat({
    filename: 'dive.csv', head30: 'time,depth\n0,0\n1,1.2', header: 'time,depth',
    knownFormats: ['garmin-dive-csv', 'strava-gpx'],
  }, deps);
  expect(out.value).toEqual(goodSniff);
  expect(out.llm.model).toBe('claude-haiku-5-5');
  const user = calls[0].messages[0].content.at(-1).text;
  expect(user).toContain('strava-gpx');
  expect(user).toContain('dive.csv');
});

test('sniffFormat: timeColumn may be null', async () => {
  const { deps } = fakeDeps(JSON.stringify({ ...goodSniff, timeColumn: null }));
  const out = await sniffFormat({ filename: 'a.txt', head30: 'x', header: 'x', knownFormats: [] }, deps);
  expect(out.value.timeColumn).toBeNull();
});

test('sniffFormat: invalid JSON / schema throws', async () => {
  const a = fakeDeps('{oops');
  await expect(sniffFormat({ filename: 'a', head30: '', header: '', knownFormats: [] }, a.deps)).rejects.toThrow();
  const b = fakeDeps(JSON.stringify({ ...goodSniff, formatId: 'Garmin CSV' }));
  await expect(sniffFormat({ filename: 'a', head30: '', header: '', knownFormats: [] }, b.deps)).rejects.toThrow();
});
