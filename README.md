# FrankenCoach

A Frankenstein-style AI sports coach that builds its own analysis tools: give it a video, a watch export, or plain text, and it reuses what it already knows or grows a new, tested, sandboxed tool on the spot.

Built from scratch at Agents 0.0.7 Hackathon #01, Prague, 2026-10-08 21:00 → 10-09 07:14.

## How to run

```bash
cp env.example .env          # fill ANTHROPIC_API_KEY
bun install && (cd web && bun install)
bun dev                      # server on :3000
bun web                      # Vite on :5173, /api is proxied to the server; add ?dev for the dev console
bun test                     # engine tests
```

- Plans and task cards: `docs/plans/`. Agent rules: `CLAUDE.md`. Frozen contracts: `contracts/`.
- One agent per worktree: `scripts/agent-worktree.sh W1 A1`.
