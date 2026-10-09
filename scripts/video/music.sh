#!/usr/bin/env bash
# Background music bed: ElevenLabs Music API -> docs/media/music/bed.mp3 (assemble.sh mixes it under the voice-over).
set -euo pipefail
usage() {
  cat <<'EOF2'
usage: scripts/video/music.sh [-h]
  Writes docs/media/music/bed.mp3, 95 s, instrumental. With ELEVENLABS_API_KEY: the Music API, then the
  sound-generation API (22 s, looped by assemble.sh); MUSIC_PROMPT overrides the prompt. Without a key, or when
  the key lacks those permissions: an ambient drone synthesized by ffmpeg, free and offline.
EOF2
}
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/docs/media/music"
mkdir -p "$OUT"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Offline fallback: a dark drone (A1, E2, A2 with slow swells) over filtered noise; two higher notes rise
# from 65 s to 85 s for the dawn part. Free, no key, 95 s.
synth() {
  local e='0.22*sin(2*PI*55*t)*(0.6+0.4*sin(2*PI*0.07*t))'
  e+='+0.16*sin(2*PI*82.41*t)*(0.6+0.4*sin(2*PI*0.05*t+1))'
  e+='+0.10*sin(2*PI*110*t+0.4*sin(2*PI*0.21*t))'
  e+='+0.05*sin(2*PI*164.81*t)*(0.5+0.5*sin(2*PI*0.11*t+2))'
  e+='+0.07*sin(2*PI*329.63*t)*clip((t-65)/20\,0\,1)*(0.7+0.3*sin(2*PI*0.3*t))'
  e+='+0.05*sin(2*PI*440*t)*clip((t-72)/18\,0\,1)*(0.7+0.3*sin(2*PI*0.23*t+1))'
  ffmpeg -nostdin -hide_banner -loglevel error -y \
    -f lavfi -i "aevalsrc=$e:s=48000:d=95" \
    -f lavfi -i "anoisesrc=color=pink:amplitude=0.05:d=95:r=48000" \
    -filter_complex "[1:a]lowpass=f=500,highpass=f=80[n];[0:a][n]amix=inputs=2:normalize=0,lowpass=f=2400,aecho=0.8:0.7:420|900:0.35|0.22,afade=t=in:d=3,afade=t=out:st=91:d=4,aformat=channel_layouts=stereo,loudnorm=I=-24:TP=-3" \
    -c:a libmp3lame -b:a 160k -ar 48000 "$OUT/bed.mp3"
  echo "synthesized offline: $OUT/bed.mp3"
}
PROMPT="${MUSIC_PROMPT:-Dark ambient instrumental score for a short film about a laboratory at night that comes alive. Low pulsing synth drones, soft ticking, a slow mysterious build, warm and hopeful toward dawn at the end. No vocals, no drums until the last 20 seconds, quiet and sparse so a narrator can speak over it.}"

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then synth; exit 0; fi
PROMPT="$PROMPT" bun -e 'console.log(JSON.stringify({ prompt: process.env.PROMPT, music_length_ms: 95000, force_instrumental: true }))' < /dev/null > "$TMP/body.json"
code=$(curl -sS -o "$TMP/bed.mp3" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H @<(printf 'xi-api-key: %s\n' "$ELEVENLABS_API_KEY") -H 'Content-Type: application/json' --data-binary @"$TMP/body.json" < /dev/null)
if [[ "$code" == "200" ]]; then
  mv "$TMP/bed.mp3" "$OUT/bed.mp3"; echo "music api: $OUT/bed.mp3"
else
  echo "music api HTTP $code: $(head -c 200 "$TMP/bed.mp3"); trying sound generation" >&2
  PROMPT="$PROMPT" bun -e 'console.log(JSON.stringify({ text: process.env.PROMPT.slice(0, 400), duration_seconds: 22, prompt_influence: 0.4 }))' < /dev/null > "$TMP/body.json"
  code=$(curl -sS -o "$TMP/bed.mp3" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/sound-generation" \
    -H @<(printf 'xi-api-key: %s\n' "$ELEVENLABS_API_KEY") -H 'Content-Type: application/json' --data-binary @"$TMP/body.json" < /dev/null)
  if [[ "$code" == "200" ]]; then
    mv "$TMP/bed.mp3" "$OUT/bed.mp3"; echo "sound generation: $OUT/bed.mp3 (22 s, looped)"
  else
    echo "sound generation HTTP $code: $(head -c 200 "$TMP/bed.mp3"); synthesizing offline" >&2
    synth
  fi
fi
printf 'length %.2f s\n' "$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT/bed.mp3")"
