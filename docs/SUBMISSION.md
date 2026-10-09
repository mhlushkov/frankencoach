# Submission checklist (07:00)

Hard deadline: **07:14**, the organizers snapshot the public repo. Pitch: **09:30**.

1. Refresh the numbers from the live registry (repo root):
   - `bun scripts/readme-learned.ts /Users/mhlushkov/hackathon/frankencoach/tools/registry.json`
   - `bun scripts/pitch-learned.ts /Users/mhlushkov/hackathon/frankencoach/tools/registry.json`, then update the bold numbers in `docs/pitch/SPEECH.md`.
2. Check: `bun test` green, `git diff README.md` shows only the learned table.
3. Commit and push **before 07:14**:
   - `git add README.md docs/pitch && git commit -m "docs: refresh learned overnight numbers"`
   - `git pull --rebase origin main && git push origin HEAD:main`
4. Team page at https://hq.agents007.ai:
   - REPOSITORY: paste `https://github.com/mhlushkov/frankencoach`.
   - VIDEO: attach the 90-s video as `docs/video/README.md` step 6 says (upload, or a Drive / YouTube-unlisted link).
   - DRAFT: fill the description (the first sentence of `README.md` works).
   - Tick "Best ElevenLabs Use" only if the coach voice or the voice-over really used ElevenLabs (`scripts/video/tts.sh` printed ElevenLabs, not macOS `say`).
   - Press SUBMITTED. Check the status shows submitted before 07:14.
5. Pitch at **09:30** (`docs/pitch/README.md`):
   - Open `docs/pitch/index.html` in Chrome.
   - Open the Meet link, choose "Ask to use Companion mode".
   - Share the Chrome window with the deck (not the whole screen), press F.
   - Test with slide 1 (the team name) before the slot.
