#!/usr/bin/env bash
# Proves the kit works before anything is recorded: synthetic raw clips -> tts (say) -> assemble -> checks.
# Works in docs/media/selftest/ so it never overwrites real recordings in docs/media/raw or docs/media/demo.mp4.
set -euo pipefail

usage() {
  cat <<'EOF'
usage: scripts/video/selftest.sh [-h]
  1. writes a testsrc2 + silent-audio clip for every shot file in docs/video/shots.json into docs/media/selftest/raw
     (b-roll shots get only their screen-recording 'alt', so the b-roll fallback path is tested too)
  2. runs scripts/video/tts.sh with macOS say into docs/media/selftest/vo (ElevenLabs key ignored)
  3. runs scripts/video/assemble.sh into docs/media/selftest/demo.mp4
  4. checks the file exists, is 1920x1080 with audio, and is at most 90.0 s; exits non-zero on any failure
EOF
}
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ST="$ROOT/docs/media/selftest"
rm -rf "$ST"
mkdir -p "$ST/raw" "$ST/vo"

bun -e '
const j = await Bun.file(process.argv[1]).json()
for (const s of j.shots) {
  const f = s.file.startsWith("broll-") && s.alt ? s.alt : s.file
  console.log([f, ((s.start ?? 0) + s.duration * (s.speed ?? 1) + 2).toFixed(1)].join("\t"))
}' "$ROOT/docs/video/shots.json" > "$ST/clips.tsv"

echo "== synthetic raw clips"
while IFS=$'\t' read -r f secs; do
  # 1280x720 on purpose: assemble must scale up to 1920x1080.
  ffmpeg -nostdin -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=1280x720:rate=30" \
    -f lavfi -i anullsrc=r=48000:cl=stereo -t "$secs" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac "$ST/raw/$f"
  echo "  $f ${secs}s"
done < "$ST/clips.tsv"

echo "== tts (say)"
env -u ELEVENLABS_API_KEY VO_DIR="$ST/vo" "$ROOT/scripts/video/tts.sh"

echo "== assemble"
RAW_DIR="$ST/raw" VO_DIR="$ST/vo" OUT_DIR="$ST" "$ROOT/scripts/video/assemble.sh"

echo "== checks"
out="$ST/demo.mp4"
[[ -s "$out" ]] || { echo "FAIL: $out missing" >&2; exit 1; }
[[ -s "$ST/demo-720p.mp4" ]] || { echo "FAIL: $ST/demo-720p.mp4 missing" >&2; exit 1; }
size="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$out")"
[[ "$size" == "1920,1080" ]] || { echo "FAIL: video is $size, want 1920,1080" >&2; exit 1; }
acodec="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$out")"
[[ "$acodec" == "aac" ]] || { echo "FAIL: audio codec '$acodec', want aac" >&2; exit 1; }
total="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")"
printf 'SELFTEST OK: %s  1920x1080 h264+aac  duration %.2f s\n' "${out#$ROOT/}" "$total"
