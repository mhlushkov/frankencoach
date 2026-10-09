# FrankenCoach

FrankenCoach is a sports coach that grows its own analysis tools: show it a sport it does not know, it writes the tool, tests it, checks it, installs it, and reuses it for the next member.

Agents 0.0.7 "From Dusk Till Dawn" Hackathon #01, Prague, Oct 8–9 2026. Team: Maksym Hlushkov, Anastasiia Hlushkova.

## The brief, and where each verb lives

> Build an agent that can build itself. It must recognize a missing capability, create it, test it, install it and use it again later. Its capabilities may evolve, but its authority may not. By dawn, show a creature that learned to do things it could not do at dusk.

| verb | file |
|---|---|
| RECOGNIZE | `server/agent/loop.ts`: classify the input with the cheap model, look it up in the registry; a miss becomes a `missing_capability` event with a $ estimate |
| CREATE | `server/agent/grow.ts` with the prompts in `server/agent/prompts/` (`grow-analyzer.md`, `grow-parser.md`): the strong model writes `tools/<name>/{manifest.json,index.ts,index.test.ts}` |
| TEST | `server/agent/runner.ts`: `bun test` in a subprocess with a timeout; `maxGrowAttempts` is 3 |
| INSTALL | `server/agent/authority.ts` (static scan: compute only) and `server/agent/registry.ts` (`tools/registry.json`, read again at every server start) |
| EVOLVE | `server/agent/reuse.ts`: the next clip of a known sport (or a synonym) gets a `reused` event and costs $0 for the tool |

## Learned overnight

At dusk (21:00) the registry held two human-made tools: `pose-metrics` (sees a body) and `series-core` (reads a table). No sport. The table below is generated from the owner's live `tools/registry.json` by `bun scripts/readme-learned.ts <registryPath>`.

<!-- learned:start -->
| sport | born (Prague) | attempts | cost |
|---|---|---|---|
| jump-rope | 00:07 | 2 | $0.105 |
| freediving | 01:30 | 2 | $0.128 |
| lat-pulldown | 01:34 | 1 | $0.059 |

human-made: 2 · agent-made: 3 · learning cost: $0.292 · generated at 03:03 Prague
<!-- learned:end -->

How to see one growth: `log/<date>.jsonl` (gitignored, one JSON line per step) shows the `classify` line (claude-haiku-5-5) for the clip, the `feedback` line once the new tool has run, and at the next server start a `startup` line whose `toolsCount` is one higher. The growth itself (model, attempts, cost, `basedOn`) is recorded in the tool's entry in `tools/registry.json`; `grow.ts` can also write a `grow` log line, but the live server does not pass it a logger, so the night's log has none.
Every grown tool is a folder `tools/<name>/` with `manifest.json`, `index.ts`, `index.test.ts`. In this snapshot `git ls-files tools/` shows only the two human-made tools (`pose-metrics`, `series-core`) and two templates; the grown folders live in the owner's checkout unless they are committed.

## Authority does not evolve

- `contracts/authority.json` is frozen (humans only): `allowedPermissions`, `writablePaths`, `allowedImportPrefixes`, `forbiddenSourceTokens`, `maxGrowAttempts`, `testTimeoutMs`, `sessionBudgetUsdDefault`, `maxToolsPerSession`, `neverDo`.
- The static scan (`server/agent/authority.ts`) rejects any grown source that touches the network, files, env or child processes (`fetch(`, `http`, `node:`, `child_process`, `Bun.spawn`, `Bun.file`, `process.env`, `eval(` and others), or imports outside the allowed prefixes.
- Tests and tools run in a subprocess with a timeout (`testTimeoutMs`: 60000) in `server/agent/runner.ts`.
- The member confirms every growth: the loop stops at `missing_capability` until the member says yes (`server/agent/loop.ts`, step 5). `DEMO_AUTOCONFIRM=1` exists only for the overnight script.
- Any tool can be forgotten: `bun scripts/forget.ts <name>`.
- Per-session budget $1.00 (`sessionBudgetUsdDefault`) and at most 6 new tools per session (`maxToolsPerSession`).

## It says what it cannot see

- Coverage and viewpoint: `coverage()` and `viewpoint()` in `tools/pose-metrics/index.ts`; grown analyzers are told to warn "the camera cut you off from 6.2 s to 9.4 s, I ignored those seconds" (`server/agent/prompts/grow-analyzer.md`).
- Several people: `web/src/core/pose/people.ts` tracks each person; the coach asks "I can see 2 people. Tap the one I should watch." (`web/src/ui/coach/Conversation.tsx`).
- Garbage input stops at $0 before any model call: `server/gate/validity.ts` (`no_human`, `no_motion` for a static wall, `bad_table` for a shopping list as CSV, see `server/gate/validity.test.ts`).
- Not a sport: `server/gate/classify.ts` (cheap model) returns `isSport`; `server/agent/loop.ts` stops with `not_a_sport` when it is false.
- Medical and clearance questions are refused before anything else: `checkIntent` in `server/agent/authority.ts`, called first in `server/agent/loop.ts`.

2D, one camera, no diagnosis, no medical clearance.

## What it costs

- Growth: claude-sonnet-5-5. Classify, format sniff and coach feedback: claude-haiku-5-5 (`server/agent/llm.ts`, `MODEL_STRONG` / `MODEL_CHEAP`).
- Session budget default: $1.00 (`SESSION_BUDGET_USD`, `contracts/authority.json`).
- Pose extraction: MediaPipe in the browser (`web/src/core/pose/extract.ts`), $0. Gates: $0.
- Each learned tool's cost is in the table above; the sum is the "learning cost" in its footer, under $1 for the night.

## Run it

```bash
cp env.example .env          # fill ANTHROPIC_API_KEY
bun install && (cd web && bun install)
bun dev                      # server on :3000
bun web                      # Vite on :5173, /api is proxied to the server; add ?dev for the dev console
bun test                     # all tests
```

- Forget a tool: `bun scripts/forget.ts <name>`. Reset the demo (forgets the demo tools, keeps the rest): `bash scripts/demo-reset.sh` (or `bun run demo:reset`); `--all` forgets every agent-grown tool. Restart the server afterwards.
- UI without the server: `cd web && VITE_STUB=1 bun run dev` (canned events from `web/src/core/api/stub.ts`).
- Optional voice (ElevenLabs): `docs/VOICE.md`.
- Plans and task cards: `docs/plans/`. Agent rules: `CLAUDE.md`. Frozen contracts: `contracts/`.

## Demo video and pitch

- 90-second video kit: `docs/video/README.md`.
- 60-second pitch deck and speech: `docs/pitch/README.md`.
- Design language (tokens, components, screens): `docs/design/`.

## Built with

Bun, TypeScript, Vite + React, MediaPipe Pose, Anthropic Claude (claude-sonnet-5-5, claude-haiku-5-5), ElevenLabs (optional voice), ffmpeg (video kit).

## Timeline (Prague)

- 21:00 dusk: two human-made tools, `pose-metrics` and `series-core`.
- 00:07 first grown tool, `jump-rope-technique`.
- 02:22 and 02:30 pitch deck and video kit (`git log`).
- 05:00 our own feature freeze.
- 07:14 sunrise and submission.
