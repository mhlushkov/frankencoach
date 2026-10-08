# FrankenCoach — rules for coding agents

## What this is
A Frankenstein-style AI sports coach that builds its own tools. At start it has two human-written tools:
`tools/pose-metrics` (reads body landmarks from video) and `tools/series-core` (reads time-series tables).
For any input (video landmarks, watch/app export, text) the server: validates at $0 → identifies activity/format
with a cheap model → plans a chain `[parser raw:<format> → Session] → [analyzer landmarks|session → ToolResult]`
→ reuses tools from `tools/registry.json` → for a missing step asks the user with a $ estimate → a strong model
writes `tools/<name>/{manifest.json,index.ts,index.test.ts}` → `bun test` in a subprocess (≤3 attempts)
→ static authority check (compute-only, imports only from the registry) → install → use; next time it is reused.
Authority never changes: `contracts/authority.json`. Everything streams to the browser as `AgentEvent` (SSE).

## Layout and ownership
- `contracts/` — frozen types/config. HUMANS ONLY. If a contract blocks you: stop and report, do not edit.
- `server/` `tools/` `data/synthetic` `scripts/` `web/src/core/` `web/src/dev/` — Track A (engine, client logic, dev console).
- `web/src/ui/` `web/src/styles/` `web/src/App.tsx` `web/index.html` `data/videos|samples|landmarks` `docs/` — Track B (design, final UI, data, demo).
- `ui/` reads `web/src/core/state.ts` and `web/src/core/api/client.ts`; it never edits them. Need a new state field? Report it.
- Task cards: `docs/plans/01-TRACK-A-ENGINE.md` (A0–A15), `docs/plans/02-TRACK-B-DESIGN-UI-DEMO.md` (B0–B11).

## Hard rules
1. One task per session. Touch only the files listed under "Files" in your task card.
2. Read `contracts/types.ts` before writing code. Do not invent fields or event types.
3. Test-first. Run only `bun test <your folder>` (Track B: `cd web && bun run build`). Never the root suite.
4. Never start a dev server, watch mode, or a browser. Never call a real LLM API; tests use fakes.
5. Missing dependency from another task → mock it against the contracts. Do not implement it.
6. Dependencies allowed: @anthropic-ai/sdk, zod, @mediapipe/tasks-vision, react, react-dom, vite, @vitejs/plugin-react, typescript, @types/bun. Anything else: stop and ask.
7. Never commit `.env`, videos > 5 MB, `cache/`, `node_modules`.
8. Commit prefixes: feat(server) feat(web-core) feat(ui) feat(gate) feat(agent) tool(human) tool(agent) data docs test chore contracts.

## Git flow (you are in a worktree on branch agent/<TASK>)
git add -A -- <your folders> && git commit -m "<message from the card>"
git fetch origin && git rebase origin/main && git push origin HEAD:main
Push rejected → repeat fetch/rebase/push (max 3), then report.

## When you are done
Print exactly three lines and stop:
DONE: <what works>
VERIFY: <command or click path>
LEFT: <what is missing, or "nothing">
Do not start another task. Do not refactor other folders.
