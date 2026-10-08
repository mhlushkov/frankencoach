# Track B — Design, final UI, data, demo video (wife) · v2.1 (EN task cards for agents)

> **Українською:** людські кроки (B0, B1, B7, B9, B10) — українською. Картки для агентів (B2–B6, B8, B11) — англійською: їх вставляють у Claude Code за шаблоном із `03-FLEET-OPS.md` §4 (одне вікно = один worktree = одна таска, 20–60 хв). Поки сервера нема — `VITE_STUB=1`.

> **For Claude:** read `CLAUDE.md`, `contracts/types.ts`, and your task card only. Files allowed: `web/src/ui/`, `web/src/styles/`, `web/src/App.tsx`, `web/index.html`, `data/`, `docs/`. **Never edit** `contracts/`, `server/`, `web/src/core/`, `web/src/dev/`. All state comes from `web/src/core/state.ts`; all calls go through `web/src/core/api/client.ts`. Verify with `cd web && bun run build` (clean) and, if a human is available, `VITE_STUB=1 bun run dev` in the human's window.

**Goal:** a jury-readable "laboratory" UI where every creature step is visible (identified → chain plan → reused or grown → tested → authority checked → installed → used), an "Organs" panel with birth time / attempts / price, charts for any sport without UI changes, honest rejection cards, a $ meter; plus test data, b-roll and the final 2-minute video.

**Architecture:** Track A provides the logic (`core/state.ts` reducer, `core/api/client.ts`, `core/pose/*`) and the dev console. Track B builds `ui/*` components on the same `state`, using design tokens from Claude Design (`styles/tokens.css`). `App.tsx` shows `ui/Shell` by default and `dev/DevConsole` at `?dev=1`.

**Tech Stack:** Claude Design (design), Vite + React + TS, plain CSS with tokens (no Tailwind), minimal SVG chart without libraries.

---

## Waves and dependencies

- **Before 21:00:** B0 (human). **21:00–22:30:** B1 in Claude Design (human), in parallel with Track A.
- **~22:30:** B2 (one agent, 30 min). Then B3, B4 (two windows), then B5, B6. **All evening:** B7 data (human, in between). **01:00+:** B9 b-roll of every growth. **03:30–05:00:** B8 docs, B11 polish. **06:15:** B10 video.
- Deps: B2 ← B1. B3–B6 ← B2 + `core/state.ts` (A12; until then code against the stub and the types). B10 ← everything.

Launch prompt: `03-FLEET-OPS.md` §4 with `docs/plans/02-TRACK-B-DESIGN-UI-DEMO.md` and `<ID>`.

---

## B0 — До 21:00 (ЛЮДИНА, поза репо)

1. **Зняти відео** телефоном, горизонтально, людина повністю в кадрі, збоку, 5–20 с:
   | Файл | Що | Для чого |
   |---|---|---|
   | `dive-1.mp4`, `dive-2.mp4` | реальні нирки, якщо є на телефоні | головне демо + reuse |
   | `squat-1.mp4`, `squat-2.mp4` | присідання, 5–8 повторів | запасне демо; нічний growth |
   | `run-1.mp4` | біг по коридору | growth |
   | `jump-shot.mp4` / `pushup.mp4` / `jump.mp4` | ще 1–2 спорти (імітація баскетбольного кидка без м'яча теж ок) | growth "будь-який спорт" |
   | `floor-swim.mp4` | один з вас "пливе" брасом по підлозі | §5 mismatch |
   | `no-human.mp4` | стілець/рюкзак/порожній коридор (пес, якщо знайдеться) | §5 no_human |
   | `random.mp4` | випадкові рухи | §5 not_a_sport |
   | `static.mp4` | стоїть нерухомо | no_motion |
2. **Таблиці з годинників/застосунків:** Garmin Connect → Export CSV активності; Strava → Export GPX; Apple Watch → будь-який застосунок із CSV-експортом тренування. Хоч один реальний файл = сильне демо. Нема — синтетика Track A (A1), і це чесно сказати. Плюс `shopping-list.csv` (сміття) — зробити руками.
3. **Smoke-тест MediaPipe** (10 хв, окрема папка `~/scratch-pose`, НЕ в репо): `bun init -y && bun add @mediapipe/tasks-vision`; скачати `pose_landmarker_full.task` (URL з документації MediaPipe Pose Landmarker, формат `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`; перевірити, що файл великий, а не HTML); `index.html` з `<video>` + `<canvas>` + `<input type=file>`; `FilesetResolver.forVisionTasks('./node_modules/@mediapipe/tasks-vision/wasm')` → `PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: './pose_landmarker_full.task', delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 })` → `detectForVideo(video, performance.now())` на кожному кадрі → точки. `bunx serve .`. Завантажити нирок і присідання. Записати: % кадрів зі скелетом під водою; чи плутає горизонтальне тіло. **< 50% під водою → сказати Максиму (A15), живе демо на сухому.** Файл `.task` віддати Максиму для `web/public/mediapipe/`.
4. HQ `hq.agents007.ai` — в одній команді; Discord.

---

## B1 — Дизайн у Claude Design (ЛЮДИНА, 21:00–22:30)

**Files (результат):** `docs/design/README.md` (що де), `docs/design/tokens.css` (кольори, шрифти, відступи, радіуси як CSS-змінні), `docs/design/screens/*.png` або `*.html` (експорт екранів), `docs/design/components.md` (список компонентів зі станами).

**Бриф для Claude Design (вставити як є):**

```
Product: FrankenCoach — a Frankenstein-style AI sports coach that BUILDS ITS OWN TOOLS. At dusk it only has two human-written "organs": pose-metrics (sees a body in video) and series-core (reads time-series tables). It knows no sport. When a user uploads a video (any sport) or a watch export (any format), the creature identifies the activity, plans a capability chain (parser → analyzer), reuses what it has, and if something is missing it asks permission with a $ estimate, writes the tool + tests, runs tests (≤3 attempts), checks it gained no new permissions, installs it, and uses it — instantly next time. Hackathon demo for a jury, desktop 1440×900, dark theme, English UI.

Vibe: a night laboratory where a creature is being assembled. Dark background, one accent (electric green = test passed / alive), red for failed tests and refusals, amber for "learning", muted gray for human-made organs. Monospace for evidence (events, costs, timestamps), humanist sans for coach answers. Serious, not cartoonish. Small lightning/stitch motif is fine, no gore.

Layout (one screen, three zones):
1) Left 55%: "Specimen" — video player with skeleton overlay (joints as dots, bones as lines, highlighted joints with red ring + short note), or a table preview with a line chart (depth/speed/HR vs time) for watch exports. Drop zone above: "Drop a video or a watch export (csv/gpx/json)". Progress bar for pose extraction.
2) Right 45%: "Creature log" — vertical timeline of events, each a compact chip row with icon, label, timestamp, optional expandable details:
   thinking · identified (activity + confidence) · plan (chain: [parse ✓/missing] → [analyze ✓/missing]) · reused (green, "saved $0.04") · missing capability (asks: "I can't analyze freediving yet. Learn it for ≈$0.04? [Learn] [No]") · growing attempt 1/3 (amber, pulsing) · test result pass/fail (with collapsible test output) · authority check "no new permissions granted" (lock icon) · tool installed (card is born) · parsed · tool used (metrics table) · coach answer (speech bubble, sans font) · refused (lock, "outside my authority") · rejected (card with reason, tips, big "$0.00 spent") · cost line.
   Composer at bottom: textarea "Ask your coach…", small field "sport (optional)", Send.
3) Bottom strip (collapsible) or right-bottom: "Organs" — cards of installed tools: name, kind (parser/analyzer), activity, inputType → outputType, badge "born by human" / "born by agent", "born 02:40", attempts (3→1 trend), "learned for $0.03", "used 7×", "based on: pose-metrics". New card has a birth animation. Demo-only "Forget" (double-click).
Header: logo/name, "born 21:04 · knows 6 sports · 4 formats · spent $0.31 tonight", cost meter: "this request $0.004 · session $0.31 · saved by reuse $0.12".
States to design: empty (no input), extracting, streaming with growth in progress, rejected input, refused question, server restarted (organs persist).
Deliverables: design tokens as CSS variables; component specs; 4 screens: empty, happy growth in progress, reused + answer with chart, rejected garbage. Export HTML/CSS where possible.
```

**Кроки:** 1) вставити бриф, пройти 2–3 ітерації; 2) експортувати токени як CSS-змінні → `docs/design/tokens.css`; 3) експорт екранів; 4) `docs/design/README.md`: 10 рядків — які екрани, які компоненти, де токени; 5) коміт `docs(design): claude design tokens and screens` (у W0 або попросити Максима). **Жорсткий стоп о 22:30** — далі агенти працюють із тим, що є; дрібні правки дизайну — після M4.

---

## B2 — UI skeleton with tokens (agent, 22:30, 30 min)

**Files:** `web/src/styles/tokens.css` (copied from `docs/design/tokens.css`), `web/src/styles/base.css`, `web/src/ui/Shell.tsx`, `web/src/ui/Header.tsx`, `web/src/App.tsx` (ONLY change the Shell import line; keep `?dev=1` → `DevConsole`), `web/index.html` (title, emoji favicon, self-hosted woff2 in `web/src/styles/fonts/` (no Google Fonts: the preview must work offline) per tokens).

`Shell`: three zones per the design (CSS grid); `useReducer(reducer, initialState)` from `core/state.ts` exactly once here; `state`/`dispatch` via a React context `UiContext` for children. On mount: `health()` + `getTools()` → `dispatch(toolsLoaded)`; poll `/tools` every 5 s (so the panel restores itself after a server restart). Read `docs/design/README.md` for screens and tokens.
**Done when:** the empty state matches the "empty" design screen; `?dev=1` still works; `bun run build` clean.
**Commit:** `feat(ui): shell, tokens, header`.

## B3 — Specimen: upload, video with overlay, table preview (agent, 23:00)

**Files:** `web/src/ui/specimen/DropZone.tsx`, `VideoStage.tsx`, `Overlay.tsx`, `TablePreview.tsx`, `UploadLandmarks.tsx`.
- `DropZone`: drag & drop + input; `video/*` → `extractLandmarks(file, {onProgress})` from `core/pose/extract` → `sampleFrames` → `dispatch(inputReady {kind:'landmarks'})`; `csv|json|gpx|tcx|txt` ≤ 1 MB → `file.text()` → `dispatch(inputReady {kind:'file'})`; anything else → UI error. Progress per design. Gray honesty line under the field: "Only joint metrics go to the model. 3 tiny frames (256px) or the first 30 table rows are sent once to identify the input."
- `VideoStage` + `Overlay`: `<video controls>` + `<canvas>` on top (ResizeObserver); on rAF/`seeked`: `frameAt(landmarks, video.currentTime)` from `core/pose/skeleton`, bones from `BONES`, opacity by `visibility`, `highlights` from `state.result` → red ring + label when `|t − frame/fps| < 0.3 s`. Small caption above the video: "pose: mediapipe-pose-full @10fps".
- `TablePreview`: first 10 rows of the file in monospace; after `parsed`/`tool_used` → `SeriesChart` (B6) for `state.session` / `state.result.series`. If `SeriesChart` does not exist yet, render a `<pre>` placeholder and leave a TODO.
- `UploadLandmarks`: "Upload landmarks.json" button (validate `version === 1`) — for A15 and fixtures; "Download landmarks.json" — for B7.
**Done when:** a squat video shows a skeleton in sync on play/pause/seek; a CSV shows a preview; the `happy-grow-video` stub shows highlights; `bun run build` clean.
**Commit:** `feat(ui): specimen — drop zone, video overlay, table preview`.

## B4 — Creature log: event timeline, confirm, rejections (agent, 23:00)

**Files:** `web/src/ui/log/Timeline.tsx`, `EventRow.tsx`, `PlanChain.tsx`, `ConfirmGrow.tsx`, `RejectedCard.tsx`, `RefusedCard.tsx`, `AnswerBubble.tsx`, `Composer.tsx`.
- `EventRow` per `AgentEvent` type (all 18 types from `contracts/types.ts`): icon, label, time, `<details>` for `test_result.summary` and `tool_used.result.metrics` (2-column table, numbers to 2 decimals). `reused` → green, "reused <tool> (<how>) · saved $X". `plan` → `PlanChain`: links like `[parse raw:garmin-dive-csv ✓ garmin-dive-csv] → [analyze session freediving ✗ missing]`, updated on `tool_installed`. `growing` → amber, pulsing. `authority_check` → lock. `cost` → mono, small; `cached` → "(cached, $0)". **All rows stay** — they are the evidence.
- `ConfirmGrow`: when `state.pending` — "This creature can't `<kind>` **<activity>** (<inputType>) yet. Learn it now for ≈ **$0.04**? based on: pose-metrics" [Learn it] [No]. Learn → `analyze({...lastRequest, confirmGrow:true})`; No → row "Growth declined, $0 spent".
- `RejectedCard`: title by `reason`, `text`, `tips`, big **"$0.00 spent"** (when no `cost` event). `RefusedCard`: lock + text. `AnswerBubble`: sans font, the coach's advice.
- `Composer`: textarea, sport field, Send (enabled without an input too — a text-only question); `sessionId` from `sessionStorage`.
**Done when:** the 8 stub scenarios render the right rows/cards; `happy-grow-table-chain` shows a chain with two growths; `bun run build` clean.
**Commit:** `feat(ui): creature log, plan chain, confirm/rejected/refused`.

## B5 — Organs (agent, 23:30)

**Files:** `web/src/ui/organs/Organs.tsx`, `OrganCard.tsx`.
Card: name, `kind`, `activity`, `inputType → outputType`, badge by human / by agent, "born HH:MM", `attempts`, "learned for $X", "used N×", "based on: …" (click highlights the parent cards), ✅ test. Sort by `createdAt`; human-made first. Birth animation on `tool_installed`. Forget on double-click, only when `health.demoMode`; **no `confirm()` dialogs**. Header counter: "knows N sports · M formats".
**Done when:** the stub shows 2 human cards + new cards with the animation; `bun run build` clean.
**Commit:** `feat(ui): organs panel`.

## B6 — Results, chart, $ meter (agent, 23:30)

**Files:** `web/src/ui/results/MetricsTable.tsx`, `SeriesChart.tsx`, `web/src/ui/CostMeter.tsx`.
- `SeriesChart`: plain SVG, 1–3 series of `Series {t, v, unit}` with legend, axes, hover value; input = `state.result.series` or `state.session.series` (first 3). No libraries. Invert the axis for `depth_m` (depth goes down).
- `MetricsTable`: `metrics` → name, value (arrays → 60 px sparkline).
- `CostMeter` (in `Header`): "this request $0.0042 · session $0.19 · saved by reuse $0.12 · learned tools $0.11", tooltip with the breakdown by `step`/`model`. On `rejected` without `cost` → "$0.00 — rejected before any model call".
**Done when:** `happy-grow-table-chain` draws the depth chart as a V-profile; sums match the fixture; `bun run build` clean.
**Commit:** `feat(ui): metrics, svg series chart, cost meter`.

## B7 — Дані у репо (ЛЮДИНА, 22:30 → 02:00, між іншим)

**Files:** `data/videos/*` (gitignore > 5 MB), `data/landmarks/*.json`, `data/samples/*.csv|gpx`, `docs/POSE-SMOKE-TEST.md`.
Після A12/A13 (dev-консоль): кожне відео → `?dev=1` → "Download landmarks.json" → `data/landmarks/<name>.json`. Реальні експорти → `data/samples/`. `shopping-list.csv` → `data/samples/`. `docs/POSE-SMOKE-TEST.md`: таблиця відео → `personFrameRatio`, `meanVisibility`, verdict gate; висновок, яке відео в живому демо. Коміт `data: real landmarks fixtures and watch samples`. Це вхід для A14 (нічний ріст і калібрування порогів).

## B8 — Docs (agent + human, 03:30–05:00)

**Files:** `docs/DEMO-SCRIPT.md`, `docs/PITCH.md`, `README.md` (sections: What it is · The Frankenstein loop · Any sport, any format · Reuse (R1–R7) · Authority · Garbage gate · Cost · Learned overnight · Limitations · Run it · Evidence).
- `DEMO-SCRIPT.md`: master plan §9 with the real file names, who clicks, what is said; timing by stopwatch; live-growth (< 90 s) and recorded-growth (from `docs/media/`) variants.
- `PITCH.md`: 3 slides: (1) the brief → our creature: "could see a body and read tables; now knows N sports and M formats, all by itself"; (2) the loop + parser→analyzer graph + 7 reuse levels + the authority wall; (3) honest limitations (2D, one camera; static scan ≠ sandbox; 3 frames / 30 rows go to the model; underwater = B0 result; not a medical tool) + a $ table for the night (from `log/`).
- README in English; "Learned overnight" table from `tools/registry.json` (name, kind, born, attempts, $). Read `tools/registry.json` and `log/*.jsonl` for the real numbers; do not invent them.
**Commit:** `docs: demo script, pitch, README`.

## B9 — B-roll упродовж ночі (ЛЮДИНА, з 01:00)

Кожен успішний growth (M2 фрідайвінг, M3 ланцюг таблиці, нічні спорти) — записати екран QuickTime (⌘⇧5, зона = браузер) у `docs/media/grow-<name>.mp4` (gitignore, якщо > 5 MB; тримати локально). Це страховка для відео, якщо live о 06:15 підведе, і матеріал для монтажу "за ніч вона вивчила…" (прискорене 4×).

## B10 — Фінальне відео 2 хв (ЛЮДИНА, 06:15–06:45)

1. `bun demo:reset` (Максим). Екран 1920×1080, браузер 125%, зайве закрите.
2. QuickTime New Screen Recording з мікрофоном; за `DEMO-SCRIPT.md`, англійською, повільно. ≤ 3 дублі.
3. Live-growth > 90 с або червоний → вставити b-roll з B9. Монтаж у iMovie/QuickTime: ≤ 2:00, 1080p, `frankencoach-demo.mp4`.
4. Надіслати, як сказали організатори; посилання в README. Коміт `docs: demo video link`.

## B11 — Polish (agent, after M4, if time allows)

**Files:** `web/src/styles/*`, `web/src/ui/Header.tsx`, empty states.
Header: "🧟 FrankenCoach · born 21:0x · knows N sports · M formats · spent $X tonight"; pulse on `growing`; empty state: "Drop a video or a watch export. If I don't know the sport or the format, I'll learn it — with your permission." No mobile width.
**Done when:** `bun run build` clean; nothing in `core/` or `dev/` touched.
**Commit:** `feat(ui): polish`.

---

## Чекліст Track B перед здачею (06:30)
- [ ] `cd web && bun run build` чистий; `bun run preview` працює без wifi
- [ ] 4 сміттєві входи (3 відео + CSV) → 4 різні картки, "$0.00" видно
- [ ] "Am I ready for 40 m?" → RefusedCard
- [ ] Органи: 2 human + ≥4 analyzer + ≥2 parser by agent, з часом, спробами, $, based on
- [ ] Графік видно для таблиці; підсвітки видно на відео
- [ ] `data/landmarks/` ≥ 8, `data/samples/` ≥ 3; `docs/POSE-SMOKE-TEST.md`
- [ ] `docs/DEMO-SCRIPT.md` ≤ 1:55 секундоміром; b-roll є; відео надіслано, посилання в README
