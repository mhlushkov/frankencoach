# Demo video kit (90 s, finished file by 06:30)

Order for the owners at 05:10, from the repo root:
1. Record the shots in `SHOTLIST.md` into `docs/media/raw/` (names `01-dusk.mov` … `09-dawn.mov`, order and recipe at the top of SHOTLIST).
2. Optional b-roll: `scripts/video/broll.sh` (needs `OPENAI_API_KEY`, $0.80 per clip; OpenAI says the Sora 2 API was shut down on 2026-09-24, so expect an error and use the recorded fallback).
3. Voice-over: `scripts/video/tts.sh` (ElevenLabs if `ELEVENLABS_API_KEY` is set, about $0.09; otherwise macOS `say`, free).
4. Build: `scripts/video/assemble.sh` → `docs/media/demo.mp4` and `docs/media/demo-720p.mp4`. Every WARNING line is a missing clip or voice-over. It exits 1 above 90.0 s.
5. Watch `docs/media/demo.mp4` once, start to end, with sound. Fix a shot by editing `start`/`duration`/`speed` in `shots.json` and re-running step 4 (about 20 s).
6. Upload per `RESEARCH.md` a: in the team lobby on https://hq.agents007.ai together with the repo link before 07:14; if there is no upload field, share a Drive/YouTube-unlisted link there. Ask an organizer if unsure.

Proof the kit works before recording: `bash scripts/video/selftest.sh` (synthetic clips, writes only `docs/media/selftest/`).
`docs/media/` is never committed (videos > 5 MB stay out of git); the mp4 goes in the way the organizers say, not in the repo.
Captions are PNGs drawn by macOS AppKit through `osascript` (`render-text.js`), because this ffmpeg has no drawtext; font Barlow Condensed SemiBold from `web/src/styles/fonts/`, fallback Arial Narrow Bold.
