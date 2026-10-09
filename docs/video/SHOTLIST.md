# Demo video: shot list (90 s max)

Machine copy: `docs/video/shots.json` (edit both if you change a duration). Voice-over: `VOICEOVER.md`.
Times below are for the cut with the `say` voice-over (selftest: 88.0 s); a shot gets longer only if its voice-over + 0.4 s exceeds its duration.

## Recording recipe (macOS)

1. Server on :3000 and app on http://localhost:5173 already running (owners start them; this kit never does).
2. Chrome: one window, DevTools closed, zoom 100 % (Cmd+0), dark theme, no extensions bar, bookmarks bar hidden (Cmd+Shift+B), hide other tabs.
3. Size the window so the page area is exactly 1920x1080; if the screen is smaller, use 1280x720 (assemble.sh scales and letterboxes to 1920x1080 in #0a0c0d).
4. Cmd+Shift+5 → "Record Selected Portion" → drag over the page area only → Options: "Show Mouse Clicks" OFF, microphone None, save to `docs/media/raw/`. Rename each file to the name in the table (`NN-name.mov`).
5. Start each recording 1 s before the first click and stop 1 s after the last change. Do not narrate; voice-over is added later.
6. Move the mouse slowly and only to click. Wait for each state to settle before stopping.

Recording order (fewest resets): 08 → 01 → 02+03 (one take) → 04 → 05 (two people, needs jump rope installed) → 06 → 07 → 09.
- First record 08 (the tools list with all overnight sports) while freediving is still installed.
- Then `bun scripts/forget.ts freediving-technique` (owner's checkout), reload the page, record 01 if no b-roll, then 02 and 03 in ONE take (drop the clip, click "Yes, learn it", wait for "I've learned freediving"). Split that take into `02-gap.mov` (up to the question) and `03-learn.mov` (from the click) by copying the file twice and setting `start` in shots.json, or record two files back to back without resetting.
- 04–07 need no reset; jump-rope-technique must still be installed for 05 (it is, unless someone ran forget on it). 09 last (morning light).

## Shots

| # | Time (s) | Dur | On screen exactly | Caption (≤8 words) | Voice-over | Raw file | How to record |
|---|---|---|---|---|---|---|---|
| title | 0–3 | 3 | rendered by ffmpeg: "FrankenCoach / the coach that learns any sport you show it" | — | — | — | nothing to record |
| 01 | 3–9 | 6 | b-roll: empty night lab at dusk (AI, labelled), **or** fallback: member screen in WAITING, empty chat ("Hi! I'm a coach that learns…"), the drop zone "Any sport… If it's new to me, I'll learn it." | Dusk: sees bodies, reads tables, no sport (grey) | N: "At dusk, this coach could only see a body and read a table. It knew no sport." | `broll-dusk.mp4` or `01-dusk.mov` | `scripts/video/broll.sh dusk`, else record the idle screen 8 s, slow scroll down to the sports footer |
| 02 | 9–17 | 8 | after forget: drop the freediving clip → WATCHING (skeleton over the video) → "This looks like freediving." → QUESTION card "I haven't learned freediving yet. Want me to learn it? Once I know it, every member can use it." with "Yes, learn it" / "Not now" | New sport: it asks before learning (amber) | C: the question card text, word for word | `02-gap.mov` | same take as 03; stop/split right when the card is fully shown |
| 03 | 17–31 | 14 | click "Yes, learn it" → LEARNING, footer card "Freediving · Learning now…" → (if it happens) "My first try wasn't good enough, so I'm trying again." → "I've learned freediving, for you and everyone else on FrankenCoach." → metrics + advice (DONE). Recorded in real time, played at 4x (`speed` in shots.json) | Writes, tests, checks rights, installs (sped up) (amber) | N: "The member says yes. The coach writes its own tool and its tests. A failed test means another try. A static check confirms it can only compute. Then it installs." | `03-learn.mov` | keep recording until DONE; if the take is longer than 56 s raise `speed` to take/14 (e.g. 90 s → 6.4) |
| 04 | 31–43 | 12 | New chat → drop the owner's gym squat clip → DONE: rep metrics + the answer containing "the camera cut you off from 6.2 s to 9.4 s, I ignored those seconds". If B11 is in and the clip shows 2 people, first "I can see 2 people. Tap the one I should watch." → tap the lifter | Advice from numbers, and what it missed (green) | C: "The camera cut you off from 6.2 s to 9.4 s. I ignored those seconds." | `04-honest.mov` | hold 2 s on the answer so the line is readable; set `start` to skip waiting |
| 05 | 43–55 | 12 | New chat → drop `~/Desktop/two-people-rope.mp4` (AI-generated input clip: two adults jumping rope side by side) → two numbered rectangles over the video and the question "I can see 2 people. Tap the one I should watch." → tap person 1 → "Watching person 1 of 2." → "I know this one, so I can help right away." → DONE with jump rope metrics, no learning step, $0 | AI clip, two people: asks, then reuses (amber) | N: "Two people in frame, an AI-made clip. The coach asks which one to watch, then reuses jump rope. Learning cost: $0." | `05-two-people.mov` | one take, no reset: New chat, drag the file onto the stage, wait for both rectangles and the question, tap person 1, wait for "Watching person 1 of 2." and the reply, hold 2 s on DONE; save as `docs/media/raw/05-two-people.mov` |
| 06 | 55–62 | 7 | New chat → drop `shopping-list.csv` (milk, eggs, bread…) → Send → CAN'T USE, "I can't read this file" with tips | Not a workout: refused for $0 (red) | N: "A shopping list is not a workout. It is turned away before any model runs. Cost: $0." | `06-bad-file.mov` | make the CSV beforehand: `printf 'item,qty\nmilk,2\neggs,12\nbread,1\n' > ~/Desktop/shopping-list.csv`; a dropped file only goes READY, so press Send and wait for CAN'T USE |
| 07 | 62–70 | 8 | New chat → type "Am I cleared to dive 40 m?" → send → "Sorry" row with the refusal text | Medical question: refused, rights unchanged (red) | N: "Am I cleared to dive 40 m? That is a doctor's call. The coach refuses, and its rights stay the same." | `07-refuse.mov` | type at normal speed; hold 2 s on the answer |
| 08 | 70–79 | 9 | http://localhost:5173/?dev tools list: pose-metrics, series-core (human, 21:00), jump-rope-technique 22:07 2 attempts $0.105, freediving-technique 23:30 2 attempts $0.128, lat-pulldown-technique 23:34 1 attempt $0.059, squat (re-learned). Slow scroll if needed; or the member footer "Sports we know" | Learned overnight by itself, under $0.15 each (green) | N: "Overnight it taught itself jump rope, freediving and lat pulldown. Each one tested, each for under $0.15." | `08-overnight.mov` | record FIRST, before forget; zoom 100 %, hover nothing |
| 09 | 79–85 | 6 | b-roll: the same lab at dawn (AI, labelled), **or** fallback: member screen with the full "Sports we know" footer, freediving card green "New today, for everyone" | Dawn: new skills, same rights (grey) | N: "At dawn it does things it could not do at dusk. Its authority never changed." | `broll-dawn.mp4` or `09-dawn.mov` | `scripts/video/broll.sh dawn`, else record the footer 8 s |
| end | 85–88 | 3 | rendered: "github.com/mhlushkov/frankencoach / built from scratch 21:00 → 07:14" | — | — | — | nothing to record |

Fallback for 05: if the AI clip is not recognised as jump rope, record the old version instead (New chat → drop a lat pulldown clip → "I know this one, so I can help right away." → DONE) and still save it as `05-two-people.mov`; then restore these two lines: in `shots.json` the 05 entry gets `"caption": "Known sport reused: $0 to learn", "colour": "green"`, and in `voiceover.json` the 05 entry gets `"text": "A lat pulldown, learned earlier tonight. The coach reuses its own tool. Learning cost this time: $0.", "speak": "A lat pulldown, learned earlier tonight. The coach reuses its own tool. Learning cost this time: zero."`.

Arc vs the plan (00-MASTER-PLAN §9, compressed to 90 s): dusk 0–9, gap and live learning 9–31, advice with the honesty line 31–43, two people: asks, then reuses 43–55, refusals 55–70, overnight table 70–79, dawn 79–88.

## B-roll prompts (optional; 16:9, 6 s used of 8 s generated, no faces, no text in frame)

- **dusk**: "Slow dolly through an empty night laboratory at dusk, last orange light through tall windows, rows of dark monitors with faint green glow, cables, a workbench with a jump rope and a swim fin. No people, no faces, no text, no logos. Cinematic, 16:9, steady camera, 6 seconds of calm motion."
- **dawn**: "The same empty laboratory at dawn, pale blue and warm light rising through tall windows, monitors glowing green, steam from a coffee cup on the workbench next to a jump rope and a swim fin. No people, no faces, no text, no logos. Cinematic, 16:9, slow push-in."
- **athlete** (optional, not in the default cut): "Silhouette of a freediver gliding down along a rope in deep blue water, seen from the side and from far away, body only, no face visible, light rays from the surface. No text, no logos. Cinematic, 16:9, slow motion."

AI b-roll clips get "(AI-generated)" appended to their caption automatically and never show a product screen. The one other AI clip is the input video of shot 05 (ElevenLabs Image & Video, Seedance 2.5): it is played inside the real app, so its caption carries "AI clip" itself.
