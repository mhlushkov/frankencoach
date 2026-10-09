import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The coach's voice: a human-made organ that lives in the server, never a grown tool (tools/ stay compute-only).

export interface Voice {
  speak(text: string): Promise<{ audio: Uint8Array; cached: boolean; chars: number }>;
}

export interface VoiceOptions {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

const MAX_CHARS = 600;

/** Trim, collapse whitespace, cap at 600 chars: cut at the last sentence end before the cap, else at the last space. */
export function capText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_CHARS) return t;
  const head = t.slice(0, MAX_CHARS + 1);
  let end = -1;
  for (const m of head.matchAll(/[.!?…](?=\s|$)/g)) if (m.index! < MAX_CHARS) end = m.index! + 1;
  if (end > 0) return t.slice(0, end);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? t.slice(0, space) : t.slice(0, MAX_CHARS)).trim();
}

export function makeVoice(opts: VoiceOptions): Voice | undefined {
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) return undefined;
  const voiceId = opts.voiceId || 'JBFqnCBsd6RMkjVDRZzb';
  const modelId = opts.modelId || 'eleven_flash_v2_5';
  const cacheDir = opts.cacheDir || 'cache/voice';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const scrub = (s: string) => s.split(apiKey).join('[key]');

  return {
    async speak(raw) {
      const text = capText(raw);
      const hash = createHash('sha256').update(modelId + '|' + voiceId + '|' + text).digest('hex');
      const file = join(cacheDir, `${hash}.mp3`);
      if (existsSync(file)) return { audio: new Uint8Array(readFileSync(file)), cached: true, chars: text.length };

      const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(scrub(`elevenlabs HTTP ${res.status}: ${body.slice(0, 200)}`));
      }
      const audio = new Uint8Array(await res.arrayBuffer());
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, audio);
      return { audio, cached: false, chars: text.length };
    },
  };
}

export function voiceFromEnv(env: Record<string, string | undefined> = process.env): Voice | undefined {
  return makeVoice({ apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID, modelId: env.ELEVENLABS_MODEL });
}
