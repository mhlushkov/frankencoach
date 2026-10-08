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
