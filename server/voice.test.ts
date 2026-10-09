import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capText, makeVoice } from './voice';

const KEY = 'sk_test_secret_key_123';

function fakeFetch(status = 200, body: BodyInit = new Uint8Array([1, 2, 3])) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('capText', () => {
  test('short text unchanged', () => {
    expect(capText('I can count reps.')).toBe('I can count reps.');
  });

  test('whitespace collapsed and trimmed', () => {
    expect(capText('  Keep   your\n\nback\tstraight.  ')).toBe('Keep your back straight.');
  });

  test('700 characters cut at a sentence end at or below 600', () => {
    const sentence = 'Keep your chest up and push through the heels. '; // 48 chars
    const long = sentence.repeat(15).slice(0, 700);
    const out = capText(long);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith('.')).toBe(true);
    expect(long.startsWith(out)).toBe(true);
  });

  test('no sentence end: cut at the last space', () => {
    const out = capText('word '.repeat(200));
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith('word')).toBe(true);
  });
});

describe('makeVoice', () => {
  test('no key: voice off', () => {
    expect(makeVoice({})).toBeUndefined();
    expect(makeVoice({ apiKey: '' })).toBeUndefined();
  });

  test('speaks, caches, and serves the second call from disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-voice-'));
    const f = fakeFetch();
    const voice = makeVoice({ apiKey: KEY, cacheDir: dir, fetchImpl: f.impl })!;
    const text = 'I can count reps, not judge depth.';

    const first = await voice.speak(text);
    expect(first.cached).toBe(false);
    expect(first.chars).toBe(text.length);
    expect([...first.audio]).toEqual([1, 2, 3]);
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128');
    const headers = f.calls[0].init?.headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe(KEY);
    expect(headers.accept).toBe('audio/mpeg');
    expect(JSON.parse(String(f.calls[0].init?.body))).toEqual({
      text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^[0-9a-f]{64}\.mp3$/);

    const second = await voice.speak(text);
    expect(second.cached).toBe(true);
    expect([...second.audio]).toEqual([1, 2, 3]);
    expect(f.calls.length).toBe(1);
  });

  test('HTTP error: message has the status, never the key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-voice-'));
    const f = fakeFetch(401, `{"detail":"invalid api key ${KEY}"}`);
    const voice = makeVoice({ apiKey: KEY, cacheDir: dir, fetchImpl: f.impl })!;
    let err: Error | undefined;
    try { await voice.speak('Hello.'); } catch (e) { err = e as Error; }
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('HTTP 401');
    expect(err!.message).not.toContain(KEY);
    expect(existsSync(dir) ? readdirSync(dir).length : 0).toBe(0);
  });
});
