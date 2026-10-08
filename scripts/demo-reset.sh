#!/usr/bin/env bash
# Reset the demo: forget every agent-grown tool, keep human ones.
# Moves tools/<name>/ with "createdBy": "agent" to tools/.forgotten/<name>-<timestamp>/,
# keeps only "createdBy": "human" entries in tools/registry.json, clears cache/llm/*.
# Never touches tools/pose-metrics, tools/series-core, tools/_template-*, contracts/, data/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/tools"
REGISTRY="$TOOLS/registry.json"
FORGOTTEN="$TOOLS/.forgotten"
TS="$(date +%Y%m%d-%H%M%S)"

moved=0
for dir in "$TOOLS"/*/; do
  name="$(basename "$dir")"
  case "$name" in
    pose-metrics|series-core|_template-*|.forgotten) continue ;;
  esac
  manifest="$dir/manifest.json"
  [ -f "$manifest" ] || continue
  if grep -Eq '"createdBy"[[:space:]]*:[[:space:]]*"agent"' "$manifest"; then
    mkdir -p "$FORGOTTEN"
    dest="$FORGOTTEN/$name-$TS"
    mv "$TOOLS/$name" "$dest"
    echo "moved: tools/$name -> tools/.forgotten/$name-$TS"
    moved=$((moved + 1))
  fi
done
echo "moved $moved agent tool(s)"

if [ -f "$REGISTRY" ]; then
  REGISTRY="$REGISTRY" bun -e '
    const p = process.env.REGISTRY;
    const reg = JSON.parse(await Bun.file(p).text());
    const before = (reg.tools ?? []).length;
    reg.tools = (reg.tools ?? []).filter((t) => t.createdBy === "human");
    await Bun.write(p, JSON.stringify(reg, null, 2) + "\n");
    console.log(`registry: ${before} -> ${reg.tools.length} tool(s) (human only)`);
  '
fi

if [ -d "$ROOT/cache/llm" ]; then
  n="$(find "$ROOT/cache/llm" -mindepth 1 -maxdepth 1 ! -name .gitkeep | wc -l | tr -d ' ')"
  find "$ROOT/cache/llm" -mindepth 1 -maxdepth 1 ! -name .gitkeep -exec rm -rf {} +
  echo "cleared cache/llm ($n entr(y/ies))"
else
  echo "cache/llm: nothing to clear"
fi
