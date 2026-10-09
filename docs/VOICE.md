# The coach speaks (ElevenLabs)

Every coach message can be played aloud: tap **Listen** under a coach bubble, or switch **Read aloud: on** in the
coach header and new coach messages are read automatically, in order, hands free. History already on screen is not read.
With no key the server reports `voice: false` on `/health` and the screen looks exactly as before.

Variables in `.env`:
- `ELEVENLABS_API_KEY`: empty means voice off.
- `ELEVENLABS_VOICE_ID`: default `JBFqnCBsd6RMkjVDRZzb`, a calm premade voice.
- `ELEVENLABS_MODEL`: default `eleven_flash_v2_5`, the lowest latency.

`bun dev` (`bun --watch`) does not watch `.env`: stop the server and start it again after editing it.

Audio is cached in `cache/voice/<sha256>.mp3`, keyed by model, voice and text. A repeated line plays from disk and costs nothing.

Cost: `eleven_flash_v2_5` uses 0.5 credit per character, so a 300-character tip is about 150 credits. Text is capped at 600 characters.

Smoke test (server running with a key):

    curl -s -X POST localhost:3000/speak -H 'content-type: application/json' -d '{"text":"I can count reps, not judge depth."}' -o /tmp/t.mp3 && afplay /tmp/t.mp3

Grown tools cannot call the voice (the authority scan forbids network in tools/); the voice is human-made and lives in the server (`server/voice.ts`, `POST /speak`).
