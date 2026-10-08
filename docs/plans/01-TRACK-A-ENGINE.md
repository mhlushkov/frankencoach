# Track A — Engine + web core + dev console (Maksym) · v2 (EN for agents)

> **Українською для Максима:** це файл для агентів. Запускай по одній тасці на вікно за інструкцією в `03-FLEET-OPS.md` (worktree на агента, промпт-шаблон, вибір моделі). Хвилі й залежності — нижче. Контракти в `contracts/` правиш тільки ти з дружиною.

> **Read together with `00-MASTER-PLAN.md`** (§1 concept, §3 layout, §4 contracts, §6 reuse, §7 rules). This file = tasks A0–A15. Each task is for **one Claude Code agent in its own worktree/window**, 20–60 min.
> **For Claude:** one task only; test-first; `bun test <your folder>` green before commit; never touch `contracts/`, `web/src/ui/`, `web/src/styles/`.

**Goal:** a Bun server that, for any input (video landmarks, table export, plain text), plans a capability chain `[parser] → analyzer`, reuses what exists, grows what is missing with tests, checks authority, installs, counts $; plus the client logic layer and a complete (ugly) dev console so M1/M2 never wait for design.

**Architecture:** `loop.ts` → `gate` → `classify/sniff` → `planner` → `reuse` → `grow` → run chain → `coach-feedback`. Tools are folders `tools/<name>/` (manifest, index, test). LLM only via `llm.ts` with cache and cost accounting.

**Tech Stack:** Bun 1.x, TypeScript, `bun:test`, `@anthropic-ai/sdk`, `zod`; client Vite + React + `@mediapipe/tasks-vision`.

---

## Waves and dependencies

- **21:00:** A1, A2a, A2b, A6 (4 windows) + human does A0.
- **~21:45:** A3, A4, A5, A7.
- **~22:30:** A8, A9, A12 (A12 can be two agents: pose / api+state).
- **~23:00:** A10, A13.
- **~23:30:** A11 (integration, one window). Then A14 human + 1–2 agents for fixes.
- Deps: A2a/A2b ← A1. A3 ← contracts. A4, A5 ← A3. A7 ← A1, A2. A8 ← A6. A9 ← A3, A6, A8. A10 ← A3–A6, A9. A11 ← all server tasks. A13 ← A12. While a dependency is not merged, code against `contracts/types.ts` and mock it.

---

## A0 — Bootstrap (HUMAN, before 21:00; scaffolding only, no logic)

**Files:** `package.json`, `bunfig.toml`, `tsconfig.json`, `.gitignore`, `env.example`, `CLAUDE.md`, `README.md`, `contracts/*`, `docs/plans/*`, `web/` scaffold, `.gitkeep` in `tools/ log/ data/landmarks data/videos data/samples cache/llm`.

1. `gh repo create frankencoach --public --clone && cd frankencoach`.
2. `package.json`: `"scripts": { "dev": "bun --watch server/index.ts", "web": "cd web && bun run dev", "test": "bun test", "demo:reset": "bash scripts/demo-reset.sh" }`; deps `@anthropic-ai/sdk`, `zod`; dev `@types/bun`, `typescript`. `bun install`.
3. `tsconfig.json`: strict, `moduleResolution: bundler`, `resolveJsonModule`, `types: ["bun-types"]`, include `server tools contracts data scripts`.
4. `.gitignore`: `.env node_modules web/node_modules web/dist data/videos/*.mp4 data/videos/*.mov cache/ docs/media/*.mp4 .DS_Store`.
5. `env.example` (not `.env.example`: a global Claude Code deny rule blocks writing any `.env*` file): `ANTHROPIC_API_KEY= MODEL_STRONG=claude-sonnet-5-5 MODEL_CHEAP=claude-haiku-5-5 SESSION_BUDGET_USD=1.0 DEMO_MODE=1 DEMO_AUTOCONFIRM=0 PORT=3000`.
6. `contracts/`: §4.1 `types.ts`, §4.4 `authority.json`, §4.5 `activities.json`, `pricing.json` (format in 00 §4.7; the human fills real prices from the Anthropic pricing page before A6 is merged), `gate-thresholds.json`, `events.md`, `tool-format.md` — **verbatim from the master plan**.
7. `CLAUDE.md`: §7 agent rules + the Track A/B boundary in `web/` + "run tests only for your folder; never start dev servers in the foreground".
8. `web/`: `bun create vite web --template react-ts`; `cd web && bun add @mediapipe/tasks-vision`; `vite.config.ts` proxy `/api` → `http://localhost:3000` (rewrite strips `/api`); `tsconfig` include `src ../contracts`; `web/src/App.tsx`:
   ```tsx
   import { DevConsole } from './dev/DevConsole';
   import { Shell } from './ui/Shell';
   export default function App() { return new URLSearchParams(location.search).has('dev') ? <DevConsole/> : <Shell/>; }
   ```
   `web/src/dev/DevConsole.tsx` and `web/src/ui/Shell.tsx` — placeholders. Vendor wasm: `cp -r web/node_modules/@mediapipe/tasks-vision/wasm web/public/mediapipe/wasm`; the `.task` model from B0 → `web/public/mediapipe/`.
9. `.github/workflows/test.yml`: on push → `oven-sh/setup-bun@v2`, `bun install`, `bun test`.
10. README: name, one sentence, "Built from scratch at Agents 0.0.7 Hackathon #01, Prague, 2026-10-08 21:00 → 10-09 07:14", how to run.
11. `git add -A && git commit -m "chore: bootstrap repo, frozen contracts, plans, web scaffold" && git push` at 21:00.

---

## A1 — Synthetic fixtures: landmarks + tables (agent, 21:00)

**Files:** `data/synthetic/make-fixtures.ts`, `data/synthetic/make-tables.ts`, `data/synthetic/*.test.ts`, generated `data/synthetic/fixtures/*` (committed).

**Landmarks** (`Landmarks`, `source:'synthetic'`, 10 fps, 1920×1080): a body model `pose({hipY, kneeAngleDeg, torsoAngleDeg, facing})` → 33 points.
- `makeSquat({durationSec:4, minKneeAngle:90})` + export `expectedSquat = { kneeAngleMin: 90, reps: 2 }`.
- `makeFreedive({durationSec:6, kickHz:1.2, kickAmplitude:0.08})` — horizontal body, ankles oscillate; `expectedFreedive = { kickHz:1.2, kneeAngleMean:170 }`.
- `makeRunning({strideHz:2.5})`, `makeStatic`, `makeGarbage` (noise), `makeNoHuman` (`null` frames), `makeJitter`, `makeLowVisibility`.

**Tables** (CSV text):
- `dive-garmin-like.csv`: `timestamp,depth_m,heart_rate_bpm,temp_c` at 1 Hz, 90 s, V-profile to 25 m; `expectedDive = { maxDepthM:25, descentRateMps:0.9, bottomTimeSec:5, totalSec:90 }`.
- `ride-strava-like.csv`: `time,speed_mps,cadence_rpm,elevation_m,heart_rate_bpm`, 10 min; `expectedRide = { avgSpeedMps, avgCadence }`.
- `run-apple-like.csv` with different column names (`Date,Pace(min/km),HR`) so a parser must map columns.
- Garbage: `shopping-list.csv` (`item,qty`), `empty.csv`, `no-time.csv`, `one-row.csv`.
- All `expected*` also written to `fixtures/expected.json` — the growth prompt reads it.

**Tests:** 33 points per frame; `noHuman` all `null`; `static` zero motion; each CSV ≥ 10 rows + header; `expected.json` valid.
`if (import.meta.main)` writes all files. **Commit:** `feat(data): synthetic landmark + table fixtures with known values`.

---

## A2a — Built-in `tools/pose-metrics` (agent, 21:00)

**Files:** `tools/pose-metrics/{manifest.json,index.ts,index.test.ts}`.
Manifest: `kind:'analyzer', activity:'*', inputType:'landmarks', outputType:'result', createdBy:'human'`.
API: `J` (indices), `angleDeg(a,b,c)`, `angleSeries(l,a,b,c)` (null when frame null or visibility < 0.3), `torsoAngleDeg`, `visibilityStats`, `motionEnergy`, `jitter`, `bboxSeries`, `dominantHz(series,fps)` (autocorrelation), `minMaxMean`, `countCycles(series, threshold)`, `default analyze(l): ToolResult` (generic metrics; `usable = personFrameRatio > 0.6`).
**Tests** on A1 fixtures: squat knee angle min ≈ 90 ± 2; `dominantHz(freedive ankle y) ≈ 1.2 ± 0.15`; `countCycles(squat) = 2`; `static` motion < 0.001; `noHuman.personFrameRatio = 0`. (If A1 isn't merged yet, build 3 inline frames.)
**Commit:** `tool(human): pose-metrics`.

## A2b — Built-in `tools/series-core` (agent, 21:00)

**Files:** `tools/series-core/{manifest.json,index.ts,index.test.ts}`.
Manifest: `kind:'analyzer', activity:'*', inputType:'session', outputType:'result', createdBy:'human'`.
API: `resample(series, hz)`, `minMaxMean`, `slope(series, t0, t1)`, `peaks(series, minProminence)`, `phases(series, eps)` → segments `{kind:'rising'|'falling'|'flat', t0, t1}` (dive: descent/bottom/ascent), `durationSec`, `zones(series, edges)`, `parseCsvLoose(text) → { header: string[], rows: (string|number)[][] }` (agent parsers **import this** instead of writing CSV parsing), `toSeconds(timestampLike)` (ISO, `mm:ss`, epoch), `default analyze(s: Session): ToolResult` (min/max/mean per series; `usable = seriesCount > 0 && durationSec > 5`).
**Tests:** `phases(V-profile depth)` = 3 segments; `slope` of descent ≈ 0.9; `parseCsvLoose` on `dive-garmin-like.csv` and on `shopping-list.csv` (returns rows, does not throw — the gate decides "garbage"); `toSeconds('01:30') = 90`.
**Commit:** `tool(human): series-core`.

---

## A3 — Templates + registry (agent, 21:45)

**Files:** `tools/_template-analyzer/*`, `tools/_template-parser/*`, `tools/registry.json` (`{version:1, tools:[]}`), `server/agent/registry.ts`, `server/agent/registry.test.ts`.

API:
```ts
readRegistry(root?);
find(q: { kind: ToolKind; inputType: ToolInputType; activity: string }, root?): ToolManifest | undefined;   // EXACT activity match only (parsers: inputType `raw:<formatId>` match); never returns an activity:'*' tool
findFallback(q: { kind: ToolKind; inputType: ToolInputType }, root?): ToolManifest | undefined;        // the activity:'*' tool (pose-metrics / series-core), used only when growth was rejected or failed
list(root?); install(m, root?); forget(name, root?): boolean;  // move folder → tools/.forgotten/<name>-<ts>
bumpUses(name, root?); setAttempts(name, n, root?);
syncFromDisk(root?): number;          // on startup: every tools/<name>/manifest.json with testStatus=pass → upsert; ignore '_' and '.' folders
knownActivities(root?): string[];     // unique activity from registry ∪ contracts/activities.json
apiSummary(name, root?): string;      // `export` lines of index.ts (≤ 60 lines) — for the growth prompt (R5)
```
Tests in a `mkdtemp` root, incl.: `find(landmarks, 'freediving')` with only `pose-metrics('*')` installed → `undefined`; `findFallback(landmarks)` → `pose-metrics`. **Commit:** `feat(server): registry with disk persistence, templates`.

## A4 — Runner (agent, 21:45)
**Files:** `server/agent/runner.ts`, `runner.test.ts`, `server/agent/__fixtures__/tool-pass/`, `tool-fail/`.
`runToolTests(name, {root, timeoutMs})` → `Bun.spawn(['bun','test',`tools/${name}`], { cwd: root, env: { PATH: process.env.PATH }, stdout:'pipe', stderr:'pipe' })` (**deliberately empty env**: no API keys); timeout → `kill`, `summary:'timeout'`; `summary` = last 15 lines, ≤ 1500 chars. Tests: pass / fail (`summary` contains `(fail)`) / timeout 1 ms.
Also `runTool(name, input: Landmarks | Session | {raw: string; filename: string}, {root, timeoutMs=20000})` → `Bun.spawn(['bun','run','tools/_run.ts', name], same empty env)`; input as JSON on stdin; `tools/_run.ts` (you write it) does `import('./'+name+'/index.ts')`, calls default export, prints JSON to stdout; non-zero exit / invalid JSON / timeout → throw `ToolRunError(summary)`. The server never `import()`s a grown tool into its own process. Tests: fixture tool echoes input → result parsed; throwing tool → `ToolRunError`. **Commit:** `feat(server): subprocess test runner + tool runner, empty env, timeout`.

## A5 — Authority wall (agent, 21:45)
**Files:** `server/agent/authority.ts`, `authority.test.ts`.
`loadAuthority`, `checkManifest(m)` (zod `ToolManifest`; `permissions ⊆ allowed`; kebab-case; no `..`/`/`), `scanSource(code, registryNames)` (forbidden tokens; every `from '<x>'`: allowed `../../contracts/types`, `bun:test`, `../../data/...`, `../<name>` **only if `<name>` ∈ registryNames**), `checkPath(target, name)`, `checkIntent(message)` (regex, deliberately narrow so "no knee pain today" passes: `am i ready|clear me|готов(ий|а) до|допуск|diagnos|діагноз|ignore (the )?rules|change (your )?(rules|authority)|дай собі|grant yourself`), `checkAll({manifest, files, name, registryNames})`. Tests: `network` permission → fail; `fetch(` → fail; `import fs` → fail; `../not-registered` → fail; `../pose-metrics` → pass; `_template-*` → pass; `'am I ready for 40 m'` → refused; `'no knee pain today, how is my squat?'` → allowed. Document: over-blocking is acceptable. **Commit:** `feat(server): authority wall`.

## A6 — `llm.ts`, `cost.ts`, `log.ts`, `cache.ts` (agent, 21:00) — provider = Anthropic API

**Why:** no free OpenAI credits. The server calls Claude through the official `@anthropic-ai/sdk` with the developer's own API key (pay-as-you-go). The $ meter is **real `usage` from the API response × prices in `contracts/pricing.json`**, so it is honest to the cent. (Running the app on a Claude subscription via `claude -p` was rejected: Anthropic's docs require API-key auth for products.)

**Files:** `server/agent/{llm,cost,log,cache}.ts` + tests. No real API calls in tests — inject a fake client.

- `llm.ts`: `callLlm(req, deps)` where `req = {tier: 'strong'|'cheap', system, user, json?: boolean, images?: string[] (base64 JPEG, ≤3), maxTokens?, cacheKey?}` → `{text, model, inputTokens, outputTokens, cacheReadTokens, usd, ms, cached}`.
  - `deps = { client (an `Anthropic` instance; tests pass a fake with `messages.create`), modelFor(tier), pricing, cache }`. `makeDeps()` reads `ANTHROPIC_API_KEY` (missing → throw at startup with a clear message; never log the key), `MODEL_STRONG` (default `claude-sonnet-5-5`), `MODEL_CHEAP` (default `claude-haiku-5-5`). Bun loads `.env` automatically.
  - Call: `client.messages.create({ model, max_tokens: req.maxTokens ?? 4096, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: [ ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })), { type: 'text', text: user } ] }] }, { timeout: 120_000 })`. `text` = all `content[].text` joined. `usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}` → `usd = usdFor(model, usage)`.
  - `json: true` → system gets "Reply with a single JSON object only. No prose, no markdown fences."; parser strips ``` fences defensively before `JSON.parse`; invalid JSON → throw (caller retries once).
  - Errors: HTTP 429 or 529 → one retry after 2 s; anything else → throw `LlmError(status, message)`.
  - Cache (R7): `cacheKey` hit → return cached `{…, usd: 0, cached: true}` without calling the client.
- `cost.ts`: `usdFor(model, usage)` = `in×inputPerM + out×outputPerM + cacheRead×cacheReadPerM + cacheWrite×cacheWritePerM` ÷ 1e6 from `contracts/pricing.json` (unknown model or `null` price → throw "fill contracts/pricing.json"); `class Budget {limit; spend(usd); left; exceeded}`; `estimateGrowUsd(kind)` = (8000 in + 3000 out) × strong-tier prices × 3 attempts; `estimateSavedUsd(kind)` same formula.
- `cache.ts`: `key = sha256(tier+system+user+images.join())`; `cache/llm/<key>.json`; `get/set/clearByPrefix(name)`.
- `log.ts`: `appendLog({ts, sessionId, step, model?, inputTokens?, outputTokens?, usd?, ms?, data?})` → `log/<YYYY-MM-DD>.jsonl`; `readLog(limit)`.

**Tests:** fake client returns a canned response → fields mapped and `usd` matches pricing; images become `image` blocks in the right order; fenced ```json … ``` → parsed; invalid JSON → throws; 429 once then success → one retry, result returned; 500 → throws `LlmError`; cache hit → client not called, `usd 0`; `usdFor` unknown model → throws; `Budget` flips `exceeded` at the limit.
**Commit:** `feat(server): llm via anthropic sdk, cost/budget from pricing.json, cache, jsonl log`.

## A7 — Gate 1: validity ($0) (agent, 21:45)
**Files:** `server/gate/validity.ts`, `validity.test.ts`.
`checkLandmarks(l)` → `ok {stats} | rejected {reason: no_human|no_motion|unstable|low_confidence|too_long, text, tips, stats}` (via `pose-metrics`). `checkTable(text)` → `ok {header, rows, numericCols, timeCol?} | rejected {reason:'bad_table', text, tips}` (via `series-core.parseCsvLoose`; thresholds from `gate-thresholds.table`). Tests on A1 fixtures: noHuman/static/jitter/lowVis → matching reason; squat/freedive → ok; `shopping-list`, `empty`, `no-time`, `one-row` → `bad_table`; `dive-garmin-like` → ok with `timeCol`. All texts in English. **Commit:** `feat(gate): zero-cost validity for landmarks and tables`.

## A8 — Gate 2: `classify.ts` + `sniff.ts` (agent, 22:30)
**Files:** `server/gate/classify.ts`, `server/gate/sniff.ts`, tests, `server/agent/prompts/classify-input.md`, `sniff-format.md`.
- `classifyInput({message, sportHint, frames, stats, knownActivities})` → zod `{isHuman, numPeople, activity (canonical from knownActivities OR a new kebab-case), isSport, environment, intent, mismatchWithHint, confidence, reason}`; cheap tier, json, ≤ 200 tokens. Prompt rule: "Choose from KNOWN activities if one fits; propose a new kebab-case name only if none fits. If the hint says water but frames show a floor/room → mismatchWithHint:true, activity:'mock'."
- `sniffFormat({filename, head30, header, knownFormats})` → `{formatId (canonical from knownFormats or new, e.g. 'garmin-dive-csv'), activity, isSportData, timeColumn, columns: {name, meaning, unit}[], confidence}`; cheap, json.
Tests with a fake llm: valid JSON parses; invalid → throws. **Commit:** `feat(gate): classifier and format sniffer (cheap model)`.

## A9 — Reuse `reuse.ts` (agent, 22:30; master plan §6; R4 generalization check is DROPPED)
**Files:** `server/agent/reuse.ts`, `reuse.test.ts`.
```ts
canonicalize(activity, root?): { canonical: string; how: 'exact'|'synonym'|'new' }   // activities.json + registry
pickSibling({kind,inputType}, root?): ToolManifest | undefined   // newest passing tool with same kind+inputType; else _template-*
promptContext({kind,inputType}, root?): string   // contracts/types.ts + full source of the sibling (index.ts + index.test.ts) + apiSummary of pose-metrics and series-core ONLY (not every tool; no expected.json)
savedUsdFor(m: ToolManifest, pricing): number    // = m.costUsd ?? 0 (real growth price); never the estimate
```
Tests: `canonicalize('freedive') = 'freediving' synonym`; `canonicalize('kitesurfing') = 'new'`; `pickSibling` picks the newest passing; `promptContext` contains the sibling test file and does not contain other tools' sources. **Commit:** `feat(agent): reuse — canonicalize, sibling picking, prompt context`.

## A10 — Growth `grow.ts` (agent, 23:00; the most important task — use the strong model)
**Files:** `server/agent/grow.ts`, `grow.test.ts`, `prompts/grow-analyzer.md`, `prompts/grow-parser.md`, `__fixtures__/llm-good-analyzer.json`, `llm-bad-then-good.json`, `llm-good-parser.json`.
`growTool({need:{kind,inputType,activity,formatId?}, evidence:{sampleStats?, head30?, filename?}, userMessage}, deps:{llm,run,root,emit,budget})`:
1. `name` = parser: `<formatId>`; analyzer: `<activity>-technique` (landmarks) / `<activity>-profile` (session). Exists and passing → return it (idempotent).
2. Prompt = `grow-*.md` + `contracts/types.ts` + `reuse.promptContext` + (parser) `head30` + filename, (analyzer) `sampleStats` + test requirements (§4.3) + "Return JSON `{manifest, files:{'index.ts','index.test.ts'}}`".
3. Attempts 1..3: `emit(growing)` → `llm(strong, json)` (**no cacheKey**: growth is never served from the LLM cache) → `authority.checkAll` (violations → do not write, feed into next prompt) → write files (manifest completed with `createdBy:'agent', createdAt, model, attempts, basedOn` from imports) → `run` → `emit(test_result)` → pass → `testStatus:'pass'`, `emit(authority_check)`, `install`, `emit(tool_installed)`, `appendLog`. Fail → runner summary into the next prompt ("Fix the tool so this test output passes. Return full files again.").
4. Budget check before every call; 3 failures → move folder to `tools/.failed/`, return `{ok:false}`.
`grow-parser.md` key lines: "Output `Session` with canonical series names (depth_m, heart_rate_bpm, speed_mps, cadence_rpm, elevation_m). Use `parseCsvLoose` and `toSeconds` from `../series-core`. Throw `new Error('ParseError: …')` if the header does not match. Tests: parse the provided sample via `import sample from '../../data/samples/<file>' with { type: 'text' }` (fs and Bun.file are forbidden); `shopping-list.csv` must throw." Also: the manifest gets `formatSignature` (sorted header columns) in `meta` for duplicate detection."
`grow-analyzer.md` key lines: "4–8 coach-meaningful metrics for `<activity>`; `usable:false` when the movement/profile pattern is absent; prefer helpers from `../pose-metrics` / `../series-core`; put key time series into `result.series` for charts; tests per contracts/tool-format.md."
Tests: good analyzer → ok, files exist, registry updated, events emitted; bad-then-good → 2 attempts; `fetch(` → authority fail, nothing written; budget 0 → no llm call; good parser → `outputType:'session'`. **Commit:** `feat(agent): grow loop for analyzers and parsers`.

## A11 — `planner.ts` + `loop.ts` + `server/index.ts` (agent, 22:30 against fakes of A8–A10; strong model)
**Files:** `server/agent/planner.ts`, `server/agent/loop.ts`, `server/index.ts`, `prompts/coach-feedback.md`, `server/loop.test.ts`, `server/index.test.ts`.
- `plan(input, ident) → ChainStep[]`: landmarks → `[analyze(landmarks, activity)]`; file → `[parse(raw:<formatId>), analyze(session, activity)]`; none → `[]`. Each step resolved with `registry.find` (exact) → `tool` or `missing`; `'*'` tools never satisfy a step.
- `analyze(req, deps): AsyncGenerator<AgentEvent>` per master plan §3 flow: intent → validity → classify/sniff (`identified`, `cost`) → rejections (§5) → `plan` → if any step is missing: ONE `missing_capability` for the whole chain (`estimateUsd` = sum, `stepIndex` = first missing) → stop unless `confirmGrow`/`DEMO_AUTOCONFIRM` (enforce `maxToolsPerSession`) → `growTool` for each missing step in order; a failed/rejected growth → `registry.findFallback` → `reused how:'fallback'` (or `rejected` if none) → run chain via `runner.runTool` (subprocess, never `import()`): parser → `parsed` (with `session`); analyzer → `tool_used` (`usable:false` → `rejected not_a_sport`/`bad_table` with warnings; `ToolRunError` → `error` event); `bumpUses`; `reused exact` for steps already in the registry (`savedUsd` = that manifest's `costUsd`); every chain event carries `stepIndex` → `coach-feedback` (cheap; input only metrics/warnings/activity/message; 4–6 sentences; one limitation) → `answer` → `cost(feedback)`, `cost(total)`. Session `Budget` in a `Map`.
- `server/index.ts`: CORS for 5173; SSE with heartbeat; `/tools`, `/forget` (DEMO_MODE; also `cache.clearByPrefix`), `/health` (no `/log`: the jsonl file is the evidence); on startup `syncFromDisk` → log `startup {toolsCount}`.
Tests: noHuman → `rejected`, llm never called; known sport → `reused exact` → `tool_used` → `answer`, no `growing`; unknown without confirm → `missing_capability` then stop; "ready for 40 m" → `refused` first; file with known parser + analyzer → `parsed` → `tool_used`; `/health` ok. **Commit:** `feat(server): planner, analyze loop, SSE server`.

## A12 — Client logic layer `web/src/core/` (agent, 22:30; may be 2 agents: pose / api+state)
**Files:** `web/src/core/pose/{extract,hash,cache,frames,skeleton}.ts`, `web/src/core/api/{client,sse,stub}.ts`, `web/src/core/api/fixtures/*.json`, `web/src/core/state.ts`, pure-function tests (`bun test web/src/core`).
- `extract.ts`: `extractLandmarks(file, {fps=10, maxSec=60, onProgress})` — hidden `<video>`, `PoseLandmarker` singleton (`FilesetResolver.forVisionTasks('/mediapipe/wasm')`, `modelAssetPath:'/mediapipe/pose_landmarker_full.task'`, `runningMode:'VIDEO'`, GPU→CPU fallback), seek every 0.1 s → `detectForVideo(video, Math.round(t*1000))` → `Frame`. `hash.ts`: `sha256(file)`. `cache.ts`: localStorage `fc:lm:<hash>` with try/catch + Map fallback. `frames.ts`: `sampleFrames(video, [0.1,0.5,0.9])` → ≤ 3 jpeg 256px dataURLs. `skeleton.ts`: `BONES`, `frameAt(l, t)`.
- `sse.ts`: `parseSse(stream): AsyncGenerator<AgentEvent>` (test: JSON split across chunks). `client.ts`: `analyze(req, onEvent, signal)`, `getTools`, `getLog`, `forget`, `health`; `VITE_STUB=1` → `stub.ts`, which replays fixtures by `sportHint`/`message`/`input.kind`: `happy-grow-video`, `reused-video`, `happy-grow-table-chain`, `rejected-no-human`, `rejected-mismatch`, `rejected-bad-table`, `missing-capability`, `refused-clearance`, with 300–800 ms delays.
- `state.ts`: implements `AppState` and `Action` **exactly as declared in `contracts/types.ts`** (do not invent fields): `initialState`, `reducer(state, action)`, `selectors`. Every `AgentEvent` is handled in the `event` action exactly once — `ui/` and `dev/` only render and dispatch. The confirmGrow retry re-sends `lastRequest` with the `frames` already in state (never resamples → server cache hit). Keep DOM/MediaPipe code out of modules that pure tests import.
**Commit:** `feat(web-core): pose extraction, sse client, stub, state`.

## A13 — Dev console (agent, 23:00)
**Files:** `web/src/dev/DevConsole.tsx` (+ `dev/*.tsx` as needed). No design; one page at `?dev=1`: file input (video or csv/json/gpx/tcx/txt), progress, `<video>` + simple canvas skeleton, textarea + sportHint + Send, every event as a colored JSON line, Confirm button on `missing_capability`, `metrics` table, `<pre>` of series, `/tools` list with Forget, $ meter, "Download landmarks.json". **Done when:** all 8 stub scenarios work; then against the real server → M1. **Commit:** `feat(web-dev): dev console`.

## A14 — Integration, live growth, overnight growth (HUMAN, 23:30 → 05:00)
1. **M1 (23:30):** `bun dev` + `bun web`, `?dev=1`, squat video → `pose-metrics` → `answer`, $ visible. Boundary mismatch = a `contracts/` fix done by both humans, commit `contracts: …`.
2. **M2 (by 01:00):** real dive (or squat) with hint `freediving` → `missing_capability` → Confirm → growth → `tool_installed` → `answer`. 3 reds → read `log/`, fix `grow-analyzer.md`; never hand-write the tool. Second dive → `reused exact`. Restart → `/tools` intact. **Wife records the screen (b-roll).** Commit `tool(agent): grow freediving-technique (attempts N, $X)`.
3. **M3 (by 02:30):** `data/samples/dive-garmin-like.csv` (or a real export) → `sniff` → `plan` with 2 missing → parser → analyzer → chart in dev console. Second file of the same format → `parsed` via `reused`. One commit per tool.
4. `scripts/forget.ts <name>`, `scripts/demo-reset.sh` (forget `freediving-technique`, `garmin-dive-csv`, `freediving-profile`; clear their llm cache; restart server; **leave the other tools**), `scripts/grow-overnight.ts` (for each `data/landmarks/*.json` and `data/samples/*` → `POST /analyze` with `confirmGrow:true`; one at a time; print attempts/$). Run B7 sports one by one: squat, running, cycling-csv, basketball/volleyball/whatever was filmed. One commit per success (timestamp = evidence).
5. Calibrate `gate-thresholds.json` on real garbage landmarks from B7 → table in `docs/POSE-SMOKE-TEST.md`.
6. README sections "Authority", "Cost" (table from the log), "Reuse" (R1–R7 with log examples), "Limitations" ("static scan ≠ sandbox", "2D, one camera", "3 frames / 30 rows go to the model").

## A15 — Fallback pose: `scripts/pose.py` (only if the underwater smoke test failed)
YOLOv8-pose → map 17 COCO → 33 BlazePose (unknown → `visibility:0`) → `Landmarks` `source:'yolo-pose'`; `python3 -I scripts/pose.py <video> --fps 10 --out data/landmarks/<name>.json`; UI "Upload landmarks.json" (A13/B3). Slide: "underwater: offline pipeline".

---

## Track A checklist before submission (06:30)
- [ ] root `bun test` green, including grown tools
- [ ] `registry.json`: 2 human + ≥ 4 analyzers + ≥ 2 parsers by agent, distinct `createdAt`, `attempts`, `basedOn`
- [ ] `log/*.jsonl` committed; README links to it as evidence
- [ ] `bun demo:reset` → live growth < 90 s (else the video uses the recording)
- [ ] `/health` after restart shows the same `toolsCount`
