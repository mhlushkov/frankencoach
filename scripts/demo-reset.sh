#!/usr/bin/env bash
# Reset the demo: forget only the demo tools, keep everything else (human tools + overnight-grown sports).
#   bash scripts/demo-reset.sh                 # forgets freediving-technique garmin-dive-csv freediving-profile
#   bash scripts/demo-reset.sh <name> [...]    # forgets the given tools ("not found" is an error)
#   bash scripts/demo-reset.sh --all           # old behaviour: forget every agent-grown tool, clear all of cache/llm
# Per-tool forget = scripts/forget.ts (registry.forget + cache clear, same as POST /forget).
# Restart the server afterwards so it re-reads tools/registry.json.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/tools"
REGISTRY="$TOOLS/registry.json"
DEFAULTS=(freediving-technique garmin-dive-csv freediving-profile)

print_kept() {
  if [ -f "$REGISTRY" ]; then
    REGISTRY="$REGISTRY" bun -e '
      const reg = JSON.parse(await Bun.file(process.env.REGISTRY).text());
      const tools = reg.tools ?? [];
      console.log(`kept ${tools.length} tool(s):`);
      for (const t of tools) console.log(`  ${t.name}  (${t.createdBy}, ${t.kind}, ${t.activity})`);
    '
  fi
  echo "restart the server (bun dev) so it picks up the registry"
}

if [ "${1:-}" = "--all" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  FORGOTTEN="$TOOLS/.forgotten"
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
      mv "$TOOLS/$name" "$FORGOTTEN/$name-$TS"
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
  fi
  print_kept
  exit 0
fi

if [ "$#" -gt 0 ]; then
  bun "$ROOT/scripts/forget.ts" "$@"
else
  # Defaults may already be gone (fresh clone, second reset): "not found" is fine here.
  bun "$ROOT/scripts/forget.ts" "${DEFAULTS[@]}" || true
fi
# cache/llm keys are content hashes, so forget.ts can clear no per-tool entries; the rest of cache/llm is kept.
print_kept
