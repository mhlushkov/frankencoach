# Demo video: research (D2, 2026-10-09 ~02:30, time-boxed to 15 min)

All prices are list prices found tonight; several come from third-party trackers, marked as such. Check the vendor page before spending.

## a. What the organizers say about the video

| Source | Exact line | Login |
|---|---|---|
| https://agents007.ai/hackathon01/ | "Sunrise. Code freeze." / "Submit the codebase and a two-minute demo video." | no |
| https://agents007.ai/hackathon01/ | "When the sun rises, the code dies. No extensions, no mercy." | no |
| https://agents007.ai/hackathon01/ | "Prepare your story while the jury reviews every project." (08:00 breakfast item) | no |
| https://agents007.ai/hackathon01/ | "Presentations and the award ceremony will be recorded and might be streamed publicly." | no |
| https://agents007.ai/hackathon01/ | the only AI-media line is in the Frankenstein brief: "Give it eyes, hands or a voice with ElevenLabs." (a capability idea, not a video rule) | no |
| https://luma.com/agents007-hackathon01 | "7:14 The sun rises. The code dies. Submissions: codebase + 2-minute demo video" | no |
| https://agents007.ai | "Plan at sunset, build through the night, demo to a jury and a live audience when the sun comes up." | no |
| https://hq.agents007.ai | "Code freeze · Fri 9 Oct, 07:14"; "Sign in with your Luma email, find your team in the lobby, and everything for the night is here." | **yes** (Luma email + password); not read |

Not found on any public page: file format, resolution, where to upload, and any rule on AI-generated footage or voices.

Assumptions we make:
- Length: **90 s or less.** The public pages say 2 minutes; the organizers told us 90 s at 01:36 and the website the owners saw says 90 s. 90 s satisfies both.
- Format: MP4, H.264 + AAC, 1920x1080, 30 fps (plays everywhere). A 720p copy for slow uploads.
- Upload: through the team lobby on https://hq.agents007.ai (login), together with the repo link, before 07:14. If the lobby has no upload field, put the mp4 on a shareable link (Google Drive / YouTube unlisted) and paste the link there. Ask an organizer at 05:10 if unclear.
- AI media: no rule found, so it is allowed; we still label it. Any AI-generated clip carries the caption text "AI-generated" in its shot, and the narration never presents it as the product.

## b. AI video generation reachable tonight from a Mac

| Provider | Access | One 8-s 16:9 clip | Typical wait | 1080p | Limits that matter here | Free tier | Hackathon credits |
|---|---|---|---|---|---|---|---|
| OpenAI Sora 2 (`/v1/videos`) | API key | sora-2 720p $0.10/s = **$0.80**; sora-2-pro 720p $0.30/s = $2.40; pro 1080p $0.70/s = $5.60 (third-party trackers) | "a single render may take several minutes" | pro only | "Real people—including public figures—cannot be generated"; "Input images with faces of humans are currently rejected"; under-18 suitable; no copyrighted music | no | **yes (OpenAI)** |
| Google Veo 3.1 (Gemini API) | API key | $0.40/s = $3.20; Fast $0.10–0.12/s = ~$0.90; Lite $0.05–0.08/s = ~$0.60 (tracker) | 1–6 min | yes | people allowed with policy limits; no free tier on the API | no | no |
| Runway Gen-4 / 4.5 | API key ($0.01/credit) | Gen-4 Turbo $0.05/s = $0.40 (needs a start image); Gen-4.5 $0.12/s = $0.96 | 1–3 min | Gen-4 720p | image-to-video for Gen-4 | no | no |
| Kling | API key, prepaid packages from $700 | ~$0.08–0.42/s (tracker) | 2–10 min | yes | prepaid only | no | no |
| Luma Ray2 | API key | 5 s 720p $0.70, 1080p $0.85; Ray2 Flash $0.24 per 5 s | ~1–2 min | yes | pay per use | no | no |
| Pika | API by sales contact / $10 per month club | not published | n/a | n/a | no self-serve price | no | no |

**Important:** OpenAI's video guide (https://developers.openai.com/api/docs/guides/video-generation) now states: "The Sora 2 models and Videos API were shut down on September 24, 2026 and are no longer available." `scripts/video/broll.sh` still implements create → poll → download exactly as specified, but expect an error response; it then prints the error and exits without touching anything. The kit does not need b-roll: shots 01 and 09 fall back to a screen recording (`alt` in `shots.json`).

Sources: https://benchlm.ai/media-pricing/sora , https://www.eesel.ai/blog/sora-2-in-the-api-pricing , https://benchlm.ai/media-pricing/veo , https://unifically.com/blogs/runway-gen-4 , https://www.costbench.com/software/ai-media-apis/kling-api/ , https://lumalabs.ai/api/pricing , https://www.costbench.com/software/ai-media-apis/pika-api/

## c. Voice-over

| Option | Model / voice | Price | Notes |
|---|---|---|---|
| ElevenLabs API (organizer credits) | `eleven_multilingual_v2`; narrator default voice id `JBFqnCBsd6RMkjVDRZzb` ("George", premade), coach default `21m00Tcm4TlvDq8ikWAM` ("Rachel", premade) | $0.10 per 1 000 characters (Flash v2.5: $0.05) | our ~900 characters cost about **$0.09**; a few seconds per line |
| macOS `say` | narrator Samantha (en_US), coach Daniel (en_GB), rate 170 wpm | free, offline | robotic but clear; no account |

Recommendation: ElevenLabs `eleven_multilingual_v2` if the owner sets `ELEVENLABS_API_KEY` (credits exist, the brief itself names ElevenLabs). Fallback: `say`, chosen automatically when the key is missing. Default voice ids were taken from ElevenLabs docs/examples; if the account lacks them, set `ELEVENLABS_VOICE_ID` / `ELEVENLABS_COACH_VOICE_ID` from the dashboard.

Sources: https://elevenlabs.io/pricing/api , https://elevenlabs.io/docs/models , https://developer.puter.com/tutorials/elevenlabs-api-pricing/

## d. Decision

The video is the real product on screen: screen recordings of http://localhost:5173 (member UI) and `?dev` (the tools list), with a voice-over and burned-in captions, assembled by `scripts/video/assemble.sh` so the result is repeatable at 06:00. The jury must see the loop happen (end-to-end is 35 %): a new sport asked for, learned, tested, checked and installed on screen in one take, then a reused sport, then two $0 refusals. AI footage is optional and limited to an opening and a closing of at most 6 s each, captioned "AI-generated", never showing a product screen; since the Sora 2 API is reported shut down, the default plan uses screen recordings for those two shots too. Length is capped at 90 s by the script (exit 1 above 90.0 s), which fits both the 90 s we were told and the 2 minutes on the public page.
