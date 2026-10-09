#!/usr/bin/env bash
# Voice-over: docs/video/voiceover.json -> docs/media/vo/<shot>.m4a, prints "<shot> <seconds>".
set -euo pipefail

usage() {
  cat <<'EOF'
usage: scripts/video/tts.sh [-h]
  Writes one m4a per entry of docs/video/voiceover.json (uses "speak" if present, else "text").
  ELEVENLABS_API_KEY set  -> ElevenLabs eleven_multilingual_v2 (about $0.10 per 1 000 characters, ~900 chars total)
      narrator voice ELEVENLABS_VOICE_ID       (default JBFqnCBsd6RMkjVDRZzb)
      coach voice    ELEVENLABS_COACH_VOICE_ID (default 21m00Tcm4TlvDq8ikWAM)
  otherwise               -> macOS say, free: narrator ${TTS_VOICE:-Samantha}, coach ${TTS_COACH_VOICE:-Daniel}, 170 wpm
  VO_FILE (default docs/video/voiceover.json), VO_DIR (default docs/media/vo).
EOF
}
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VO_FILE="${VO_FILE:-$ROOT/docs/video/voiceover.json}"
VO_DIR="${VO_DIR:-$ROOT/docs/media/vo}"
mkdir -p "$VO_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# One TSV line per entry: shot, voice, spoken text (tabs/newlines collapsed).
bun -e '
const v = await Bun.file(process.argv[1]).json()
for (const e of v) console.log([e.shot, e.voice, (e.speak ?? e.text).replace(/\s+/g, " ")].join("\t"))
' "$VO_FILE" > "$TMP/lines.tsv"

engine="say"
[[ -n "${ELEVENLABS_API_KEY:-}" ]] && engine="elevenlabs"
echo "tts engine: $engine" >&2

while IFS=$'\t' read -r shot voice text; do
  out="$VO_DIR/$shot.m4a"
  if [[ "$engine" == "elevenlabs" ]]; then
    vid="${ELEVENLABS_VOICE_ID:-JBFqnCBsd6RMkjVDRZzb}"
    [[ "$voice" == "coach" ]] && vid="${ELEVENLABS_COACH_VOICE_ID:-21m00Tcm4TlvDq8ikWAM}"
    TEXT="$text" bun -e 'console.log(JSON.stringify({ text: process.env.TEXT, model_id: "eleven_multilingual_v2" }))' < /dev/null > "$TMP/body.json"
    # The key goes to curl through a process-substitution header file, never argv or stdout.
    code=$(curl -sS -o "$TMP/$shot.mp3" -w '%{http_code}' -X POST \
      "https://api.elevenlabs.io/v1/text-to-speech/$vid?output_format=mp3_44100_128" \
      -H @<(printf 'xi-api-key: %s\n' "$ELEVENLABS_API_KEY") \
      -H 'Content-Type: application/json' --data-binary @"$TMP/body.json" < /dev/null)
    if [[ "$code" != "200" ]]; then
      echo "ERROR: ElevenLabs returned HTTP $code for $shot: $(head -c 300 "$TMP/$shot.mp3")" >&2
      exit 1
    fi
    ffmpeg -nostdin -hide_banner -loglevel error -y -i "$TMP/$shot.mp3" -c:a aac -b:a 160k -ar 48000 -ac 2 "$out"
  else
    v="${TTS_VOICE:-Samantha}"
    [[ "$voice" == "coach" ]] && v="${TTS_COACH_VOICE:-Daniel}"
    say -v "$v" -r 170 -o "$TMP/$shot.aiff" -- "$text" < /dev/null
    ffmpeg -nostdin -hide_banner -loglevel error -y -i "$TMP/$shot.aiff" -c:a aac -b:a 160k -ar 48000 -ac 2 "$out"
  fi
  secs=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")
  printf '%s %.2f\n' "$shot" "$secs"
done < "$TMP/lines.tsv"
