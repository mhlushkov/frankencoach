# 03 — Fleet ops: 8–10 Claude Code windows, no multi-hour sessions · v1

> **Українською (для обох):** довгі сесії — це не "повільна модель", а **відкрита таска**: без списку файлів, без "done when", з dev-сервером у фореграунді, з підтвердженнями прав, з "а заодно зроблю ще". Ліки: одна коротка таска на вікно, окремий worktree, allow-list прав у репо, англійський промпт із жорстким "stop after commit", і людина, яка раз на 30 хв мерджить і запускає наступну хвилю. Промпти для агентів — **англійською** (код, контракти, тести і промпти росту вже англійські; українська в промпті коштує ~2–3× токенів і гірше тримає точність кодових інструкцій). Нотатки між собою — українською. Нижче все готове до копіювання.

---

## 1. Why a session runs 1–3 hours, and the fix for each

| Cause | Fix (built into the templates below) |
|---|---|
| No file list → the agent explores the repo | Every task card has **Files**; prompt: "touch only these" |
| No stop condition → the agent keeps polishing | **Done when** + "commit, print 3 lines, stop" |
| Dev server / watch mode started in the foreground → session hangs | Rule: never `bun dev`, `vite`, `--watch`; tests only; humans run servers |
| Permission prompts wait for a human who is busy | `.claude/settings.json` allow-list committed in the repo (§3) |
| A dependency is not merged → the agent builds it itself | "Mock missing modules against `contracts/types.ts`; never implement another task" |
| Root `bun test` → slow, red because of others | `bun test <own folder>` only |
| Several agents in one checkout → git index fights, mixed commits | One worktree per window (§2) |
| Agent reads all three Ukrainian plans (~25k tokens) | Agent reads `CLAUDE.md` (English, short), `contracts/*`, its task card only |
| Session context grows over several tasks | `/clear` between tasks; one task per context |

---

## 2. Window layout (10 windows)

| Window | Where | Who | What |
|---|---|---|---|
| W0 | main checkout `frankencoach/` | human | `git pull`, root `bun test`, launch next wave, `contracts/` fixes |
| W0' | same, second tab | human | `bun dev` (server) and `bun web` (vite) — the only place servers run |
| W1–W4 | worktrees `../fc-W1`…`../fc-W4` | agents, Track A | wave 1: A1, A2a, A2b, A6 → wave 2: A3, A4, A5, A7 → wave 3: A8, A9, A12-pose, A12-api → wave 4: A10, A13 → A11 |
| W5–W6 | worktrees `../fc-W5`, `../fc-W6` | agents, Track B | from 22:30: B2 → B3, B4 → B5, B6 → B8, B11 |
| W7 | worktree `../fc-W7` | agent, either | spare: fixes after integration, `scripts/*`, docs |
| W8 | any folder | human | one-shot independent review (master plan §13), later `DEMO-SCRIPT` dry run |

**Worktree per window, branch per task.** Create once, reuse for the next task by resetting the branch to `origin/main`:

```bash
# scripts/agent-worktree.sh  (commit in A0)
#!/usr/bin/env bash
# usage: scripts/agent-worktree.sh W3 A7   -> ../fc-W3 on branch agent/A7, deps installed
set -euo pipefail
WIN="$1"; TASK="$2"
ROOT="$(git rev-parse --show-toplevel)"
DIR="$ROOT/../fc-$WIN"
git fetch origin --quiet
if [ ! -d "$DIR" ]; then
  git worktree add -B "agent/$TASK" "$DIR" origin/main
else
  git -C "$DIR" checkout -q -B "agent/$TASK" origin/main
fi
( cd "$DIR" && bun install --silent && if [ -d web ]; then cd web && bun install --silent; fi )
echo "cd $DIR && claude            # strong task: claude --model fable --effort high"
```

No `.env` in worktrees: agent tasks never call the real API (tests use fakes). Only W0 has `.env`.

**Agent git flow** (inside the worktree, in the launch prompt): commit → fetch → rebase onto `origin/main` → push the rebased branch head to `main` (the exact three commands are in `CLAUDE.md` §Git flow below). Folders are disjoint, so rebases are conflict-free; a rejected push just means another agent pushed first — repeat, max 3 times.

**Human loop every 30 min (W0):** `git pull` → `bun test` at root → `git log --oneline -15` → if red: fix or `git revert <sha>` → launch the next wave with `scripts/agent-worktree.sh`. A window with no commit after 45 min: read its last message, narrow the task or kill it.

---

## 3. Repo files to add in A0 (so prompts can be short)

### 3.1 `.claude/settings.json` (committed → every worktree inherits it; no prompts for the safe commands)

```json
{
  "model": "opus",
  "effortLevel": "medium",
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Read", "Edit", "Write", "Glob", "Grep",
      "Bash(bun install *)", "Bash(bun test *)", "Bash(bun run build *)", "Bash(bun run typecheck *)", "Bash(bunx tsc *)",
      "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)", "Bash(git add *)", "Bash(git commit *)",
      "Bash(git fetch *)", "Bash(git rebase *)", "Bash(git push *)", "Bash(git checkout *)",
      "Bash(ls *)", "Bash(cat *)", "Bash(mkdir *)", "Bash(cp *)", "Bash(wc *)"
    ],
    "deny": [
      "Bash(rm -rf *)", "Bash(curl *)", "Bash(wget *)", "Bash(bun dev *)", "Bash(bun run dev *)", "Bash(bun --watch *)",
      "Read(./.env)", "Edit(./contracts/**)"
    ]
  }
}
```

Notes (verified in the Claude Code docs, 2026-10-08): `model` + `effortLevel` set the default for every window opened in this repo (bounded tasks); strong windows override with `--model fable --effort high`. `acceptEdits` auto-approves edits only — the `allow` list is what removes prompts for `bun` and `git`; `&&`-chained commands are matched per part, so every part must be in the list. `Edit(...)` deny also covers `Write`. Deny beats allow.

### 3.2 `CLAUDE.md` (English; this is what agents read instead of master plan §7)

```markdown
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
```

---

## 4. Launch prompt (paste into a fresh window; replace `<ID>` and the plan file)

```
You are one of ~8 Claude Code agents working in parallel on this repo tonight (hackathon, hard deadline 07:14). Do exactly one task, then stop.

Task: <ID> in docs/plans/01-TRACK-A-ENGINE.md   # or 02-TRACK-B-DESIGN-UI-DEMO.md
Read, in this order, and nothing else: CLAUDE.md; contracts/types.ts; contracts/tool-format.md (only if your task touches tools/); the task card <ID>. Do not read the other plan files or unrelated folders.

Then:
1. List the files you will create/modify (must match the card's "Files"). If the card depends on a module that is not in the repo yet, say which and mock it against contracts/types.ts.
2. Write the tests from the card first, run `bun test <your folder>` (Track B: `cd web && bun run build`), make them pass with the minimal implementation.
3. Time box 45 minutes. If blocked for 10 minutes or at 45 minutes: commit what passes and report.
4. Commit with the message from the card, then follow "Git flow" in CLAUDE.md (fetch, rebase, push; repeat on rejection, max 3).
5. Print the three lines DONE / VERIFY / LEFT and stop.
```

For a **repeat task in the same window**: in W0 run `scripts/agent-worktree.sh W3 A7`, in W3 type `/clear`, paste the prompt with the new `<ID>`.

---

## 5. Model and effort per task (decide once, do not revisit)

| Task group | Model | Effort | Why |
|---|---|---|---|
| A10 grow, A11 planner/loop/server, A9 reuse, A14 integration debugging, `contracts/` fixes, §13 review | strongest available (Fable 5.1 if your plan has it, else Opus 5.5) | high | multi-file reasoning, subprocess/async edge cases, prompt design; a wrong grow loop costs the demo |
| A1–A8, A12, A13, B2–B6, B8, B11 | Opus 5.5 at medium, or Sonnet 5.5 | medium | bounded, test-defined, single folder; speed and rate-limit headroom matter more |
| README/docs formatting, commit-message cleanup | Sonnet 5.5 or Haiku 5.5 | low | trivial |

Commands: §5.1. **Rate limits:** 8–10 parallel windows on one account can hit the limit; stagger launches by ~1 min and keep the strong model for the right column only. If a limit message appears, downgrade the bounded tasks to Sonnet, never the grow loop.

Rule of thumb: effort buys depth, not speed. Bounded tasks on high effort just spend longer thinking about a spec that is already explicit.

### 5.1 Verified CLI commands (Claude Code docs, 2026-10-08)

| Need | Command |
|---|---|
| Strong window (A9/A10/A11/A14/contracts/review) | `claude --model fable --effort high` (no Fable access → `--model opus --effort high`) |
| Bounded window (everything else) | `claude` — takes `model: opus`, `effortLevel: medium` from `.claude/settings.json`; or `claude --model sonnet` when rate-limited |
| Change inside a session | `/model fable` · `/model opus` · `/model sonnet` · `/effort high` · `/effort medium` (`/effort auto` resets) |
| Built-in worktree instead of the script | `claude -w W3` → creates `.claude/worktrees/W3/` on branch `worktree-W3` from the default branch; same name again reopens it. First prompt must then start with `bun install` (allowed in the list). The script in §2 is deterministic (`agent/<TASK>` from `origin/main`) — prefer it; `-w` is the zero-setup fallback. |
| Zero prompts at all (only inside a worktree without `.env`) | `claude --permission-mode auto` (project settings cannot set `auto`/`bypassPermissions` as default; pass it on the command line) |
| Effort values | `low`, `medium`, `high`, `xhigh`, `max` for `--effort` / `/effort`; `effortLevel` in settings accepts `low|medium|high|xhigh` |
| Precedence | `--model` > `ANTHROPIC_MODEL` > `model` setting; `CLAUDE_CODE_EFFORT_LEVEL` > `--effort` > `/effort` > `effortLevel` |

---

## 6. Human timeline for the fleet (overlay on master plan §8)

| Time | W0 (human) | Agents |
|---|---|---|
| 21:00 | commit A0 (incl. §3 files), `git push`; `scripts/agent-worktree.sh W1 A1` … `W4 A6` | W1 A1, W2 A2a, W3 A2b, W4 A6 |
| 21:30 | `git pull`, root `bun test`, launch wave 2 as windows free up | W1 A3, W2 A4, W3 A5, W4 A7 |
| 22:30 | wave 3; wife finishes B1 → `W5 B2` | W1 A8, W2 A9, W3 A12-pose, W4 A12-api, W5 B2 |
| 23:00 | wave 4; B3/B4 after B2 pushed | W1 A10 (strong), W2 A13, W5 B3, W6 B4 |
| 23:30 | **A11 in W1 (strong)** or do it yourself in W0; M1 vertical slice in `?dev=1` | W2 B5, W5 B6, W6 spare |
| 00:30–01:00 | M2 live growth in W0 (human); wife records | W7 fixes |
| 02:30 | M3 tables; overnight growth script | W5 B8 docs, W6 B11 polish |
| 05:00 | freeze; only W7 fixes | — |

**Kill rule:** no agent session outlives its task. When the three DONE/VERIFY/LEFT lines appear, the window is free.

---

## 7. Prompt language — the decision

- Agent prompts, task cards for agents, `CLAUDE.md`, commit messages, code, tests, the growth prompts (`server/agent/prompts/*.md`), UI copy: **English**.
- Human-only sections (B0, B1 steps, B7, B9, B10, A14, master plan prose, this intro): Ukrainian is fine — humans read it, agents never need it.
- The §13 independent review prompt: English (it is pasted into a fresh window); the reviewer may answer in English.
