#!/usr/bin/env bash
# Optional b-roll through the OpenAI Sora 2 videos API: create -> poll -> download.
# Note (RESEARCH.md b): OpenAI's guide says the Sora 2 Videos API was shut down on 2026-09-24; expect an error.
set -euo pipefail

usage() {
  cat <<'EOF'
usage: scripts/video/broll.sh [-h] [name ...]
  Generates docs/media/raw/broll-<name>.mp4 for the prompts below (default: dusk dawn).
  Needs OPENAI_API_KEY (hackathon OpenAI credits). Model SORA_MODEL (default sora-2), size SORA_SIZE (default 1280x720),
  8 s per clip. Price: sora-2 720p $0.10/s = $0.80 per clip; sora-2-pro 1080p $0.70/s = $5.60 per clip.
  Without the key it prints the price and the export line, then exits 0 without doing anything.
  Optional third clip: scripts/video/broll.sh athlete
EOF
}
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RAW_DIR="${RAW_DIR:-$ROOT/docs/media/raw}"
MODEL="${SORA_MODEL:-sora-2}"
SIZE="${SORA_SIZE:-1280x720}"
SECONDS_PER_CLIP=8
API="https://api.openai.com/v1/videos"

# Same prompts as docs/video/SHOTLIST.md ("B-roll prompts").
prompt_for() {
  case "$1" in
    dusk) echo "Slow dolly through an empty night laboratory at dusk, last orange light through tall windows, rows of dark monitors with faint green glow, cables, a workbench with a jump rope and a swim fin. No people, no faces, no text, no logos. Cinematic, 16:9, steady camera, 6 seconds of calm motion." ;;
    dawn) echo "The same empty laboratory at dawn, pale blue and warm light rising through tall windows, monitors glowing green, steam from a coffee cup on the workbench next to a jump rope and a swim fin. No people, no faces, no text, no logos. Cinematic, 16:9, slow push-in." ;;
    athlete) echo "Silhouette of a freediver gliding down along a rope in deep blue water, seen from the side and from far away, body only, no face visible, light rays from the surface. No text, no logos. Cinematic, 16:9, slow motion." ;;
    *) echo "unknown b-roll name: $1 (dusk|dawn|athlete)" >&2; return 1 ;;
  esac
}

names=("$@")
[[ ${#names[@]} -eq 0 ]] && names=(dusk dawn)

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set: no b-roll generated, nothing changed."
  echo "Price per 8-s clip: sora-2 1280x720 \$0.80; sora-2-pro 1920x1080 \$5.60. Clips requested: ${names[*]}"
  echo "To run it, the owner sets the key in this shell (not in a file that gets committed):"
  echo "  export OPENAI_API_KEY=sk-...   # then: scripts/video/broll.sh ${names[*]}"
  echo "Without b-roll, assemble.sh uses docs/media/raw/01-dusk.mov and 09-dawn.mov (see SHOTLIST.md)."
  exit 0
fi

mkdir -p "$RAW_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
auth() { printf 'Authorization: Bearer %s\n' "$OPENAI_API_KEY"; }
field() { bun -e 'const j = await Bun.file(process.argv[1]).json(); const v = process.argv[2].split(".").reduce((o, k) => o?.[k], j); console.log(v ?? "")' "$1" "$2"; }

for name in "${names[@]}"; do
  prompt="$(prompt_for "$name")"
  out="$RAW_DIR/broll-$name.mp4"
  echo "create: $name ($MODEL $SIZE ${SECONDS_PER_CLIP}s)"
  code=$(curl -sS -o "$TMP/create.json" -w '%{http_code}' -X POST "$API" -H @<(auth) \
    --form-string "model=$MODEL" --form-string "prompt=$prompt" --form-string "seconds=$SECONDS_PER_CLIP" --form-string "size=$SIZE")
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "ERROR: create returned HTTP $code: $(head -c 400 "$TMP/create.json")" >&2
    echo "The Sora 2 Videos API is reported shut down (2026-09-24). Record 01-dusk.mov / 09-dawn.mov instead." >&2
    exit 2
  fi
  id="$(field "$TMP/create.json" id)"
  status="$(field "$TMP/create.json" status)"
  waited=0
  while [[ "$status" != "completed" ]]; do
    if [[ "$status" == "failed" ]]; then
      echo "ERROR: $name failed: $(field "$TMP/poll.json" error.message)" >&2
      exit 2
    fi
    if (( waited >= 900 )); then echo "ERROR: $name still '$status' after 15 min (id $id)" >&2; exit 2; fi
    sleep 10; waited=$((waited + 10))
    curl -sS -o "$TMP/poll.json" "$API/$id" -H @<(auth)
    status="$(field "$TMP/poll.json" status)"
    echo "  $name: $status $(field "$TMP/poll.json" progress)% (${waited}s)"
  done
  code=$(curl -sS -L -o "$out" -w '%{http_code}' "$API/$id/content" -H @<(auth))
  [[ "$code" == "200" ]] || { echo "ERROR: download returned HTTP $code" >&2; rm -f "$out"; exit 2; }
  echo "wrote $out ($(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out") s)"
done
