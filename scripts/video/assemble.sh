#!/usr/bin/env bash
# Builds docs/media/demo.mp4 (1920x1080, 30 fps, H.264 + AAC) and demo-720p.mp4 from docs/video/shots.json,
# docs/media/raw/* and docs/media/vo/*. Captions are PNGs from render-text.js (this ffmpeg has no drawtext).
set -euo pipefail

usage() {
  cat <<'EOF'
usage: scripts/video/assemble.sh [-h]
  For each shot in docs/video/shots.json: trim (start, duration x speed), scale + letterbox to 1920x1080 in #0a0c0d,
  caption bottom-left (Barlow Condensed 44 px, colour per shot, black box), voice-over docs/media/vo/<shot>.m4a.
  Shot length = max(duration, voice-over + 0.4 s). Missing raw clip -> labelled testsrc2 placeholder + WARNING.
  Adds a 3-s title card and a 3-s end card; every segment fades from and to black (FADE s, default 0.25).
  Music bed docs/media/music/bed.mp3 (scripts/video/music.sh), if present, is looped under the whole video at
  MUSIC_VOL (default 0.5) and ducked under the voice. Exits 1 if the result is longer than 90.0 s.
  Env: SHOTS (docs/video/shots.json), RAW_DIR (docs/media/raw), VO_DIR (docs/media/vo), OUT_DIR (docs/media),
  MUSIC (docs/media/music/bed.mp3; MUSIC=none for no music), MUSIC_VOL, FADE.
EOF
}
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOTS="${SHOTS:-$ROOT/docs/video/shots.json}"
RAW_DIR="${RAW_DIR:-$ROOT/docs/media/raw}"
VO_DIR="${VO_DIR:-$ROOT/docs/media/vo}"
OUT_DIR="${OUT_DIR:-$ROOT/docs/media}"
MUSIC="${MUSIC:-$ROOT/docs/media/music/bed.mp3}"
MUSIC_VOL="${MUSIC_VOL:-0.5}"
FADE="${FADE:-0.25}"
RENDER="$ROOT/scripts/video/render-text.js"
export FC_FONT_DIR="$ROOT/web/src/styles/fonts"
MAX_SECONDS=90.0
W=1920 H=1080 FPS=30 BG=0x0a0c0d

mkdir -p "$OUT_DIR"
BUILD="$(mktemp -d "${TMPDIR:-/tmp}/fc-assemble.XXXXXX")"
trap 'rm -rf "$BUILD"' EXIT

FF=(ffmpeg -nostdin -hide_banner -loglevel error -y)
VENC=(-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r "$FPS" -video_track_timescale 15360)
AENC=(-c:a aac -b:a 160k -ar 48000 -ac 2)

dur() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }
calc() { bun -e "console.log(($1).toFixed(3))" < /dev/null; }

colour_hex() {
  case "$1" in
    green) echo "#39ff88" ;; amber) echo "#ffb23e" ;; red) echo "#ff5a52" ;; *) echo "#8b9296" ;;
  esac
}

fades() { # $1 segment seconds, $2 fade seconds (default FADE) -> video filter for a fade from and to black
  local f="${2:-$FADE}"
  if [[ "$(calc "$f > 0 ? 1 : 0")" != "1.000" ]]; then echo "null"; return; fi
  echo "fade=t=in:st=0:d=$f,fade=t=out:st=$(calc "$1 - $f"):d=$f"
}

card() { # $1 out.mp4, $2 seconds, $3 line1, $4 line2
  osascript -l JavaScript "$RENDER" card "$3" "$4" "$BUILD/card.png" > /dev/null
  "${FF[@]}" -loop 1 -framerate "$FPS" -i "$BUILD/card.png" -f lavfi -i anullsrc=r=48000:cl=stereo \
    -t "$2" -vf "format=yuv420p,$(fades "$2")" "${VENC[@]}" "${AENC[@]}" "$1"
}

# Plan: one line per shot, fields split by \x1f (a tab would collapse empty fields in read).
bun -e '
const j = await Bun.file(process.argv[1]).json()
const t = [j.title.duration, j.title.line1, j.title.line2, j.end.duration, j.end.line1, j.end.line2]
console.log(["#cards", ...t].join("\x1f"))
for (const s of j.shots) console.log([s.shot, s.file, s.alt ?? "", s.start ?? 0, s.duration, s.speed ?? 1, s.caption || "-", s.colour, s.fade ?? ""].join("\x1f"))
' "$SHOTS" > "$BUILD/plan.tsv"

IFS=$'\x1f' read -r _ t_dur t1 t2 e_dur e1 e2 < "$BUILD/plan.tsv"
: > "$BUILD/list.txt"
font_used=""
n=0

if [[ "$t_dur" != "0" ]]; then
  card "$BUILD/seg-000.mp4" "$t_dur" "$t1" "$t2"
  echo "file '$BUILD/seg-000.mp4'" >> "$BUILD/list.txt"
  echo "title  ${t_dur}s"
fi

while IFS=$'\x1f' read -r shot file alt start duration speed caption colour fade; do
  n=$((n + 1))
  seg="$BUILD/seg-$(printf '%03d' "$n").mp4"
  src=""
  for f in "$file" "$alt"; do
    [[ -n "$f" && -f "$RAW_DIR/$f" ]] && { src="$RAW_DIR/$f"; break; }
  done
  [[ -n "$src" && "$(basename "$src")" == broll-* ]] && caption="$caption (AI-generated)"

  vo="$VO_DIR/$shot.m4a"
  if [[ -f "$vo" ]]; then
    vo_len="$(dur "$vo")"
  else
    echo "WARNING: no voice-over $vo, shot $shot is silent" >&2
    vo=""; vo_len=0
  fi
  len="$(calc "Math.max($duration, $vo_len + 0.4)")"
  window="$(calc "$len * $speed + 0.5")"

  if [[ "$caption" == "-" ]]; then # no caption: a transparent pixel keeps the filter graph the same
    "${FF[@]}" -f lavfi -i "color=c=black@0.0:s=2x2,format=rgba" -frames:v 1 "$BUILD/cap.png"
  else
    font_used="$(osascript -l JavaScript "$RENDER" caption "$caption" "$(colour_hex "$colour")" "$BUILD/cap.png" 44 < /dev/null)"
  fi

  if [[ -n "$src" ]]; then
    vin=(-ss "$start" -t "$window" -i "$src")
    vchain="[0:v]setpts=(PTS-STARTPTS)/$speed,scale=$W:$H:force_original_aspect_ratio=decrease,pad=$W:$H:(ow-iw)/2:(oh-ih)/2:color=$BG,fps=$FPS,tpad=stop_mode=clone:stop_duration=$len,setsar=1[base]"
    extra=()
    label=""
  else
    echo "WARNING: no raw clip for $shot (looked for $RAW_DIR/$file${alt:+ and $alt}), using a placeholder" >&2
    osascript -l JavaScript "$RENDER" caption "PLACEHOLDER  $shot  (record $file)" "#e4e7e5" "$BUILD/label.png" 72 < /dev/null > /dev/null
    vin=(-f lavfi -i "testsrc2=size=${W}x${H}:rate=$FPS")
    vchain="[0:v]setsar=1[raw];[raw][3:v]overlay=x=(W-w)/2:y=(H-h)/2[base]"
    extra=(-loop 1 -i "$BUILD/label.png")
  fi
  if [[ -n "$vo" ]]; then ain=(-i "$vo"); else ain=(-f lavfi -i anullsrc=r=48000:cl=stereo); fi

  "${FF[@]}" "${vin[@]}" -loop 1 -i "$BUILD/cap.png" "${ain[@]}" ${extra[@]+"${extra[@]}"} \
    -filter_complex "$vchain;[base][1:v]overlay=x=64:y=H-h-64,format=yuv420p,$(fades "$len" "$fade")[v];[2:a]aresample=48000,aformat=channel_layouts=stereo,adelay=150:all=1,apad[a]" \
    -map "[v]" -map "[a]" -t "$len" "${VENC[@]}" "${AENC[@]}" "$seg"
  echo "file '$seg'" >> "$BUILD/list.txt"
  printf '%-13s %6.2fs  vo %5.2fs  src %s\n' "$shot" "$len" "$vo_len" "$([[ -n "$src" ]] && basename "$src" || echo PLACEHOLDER)"
done < <(tail -n +2 "$BUILD/plan.tsv")

if [[ "$e_dur" != "0" ]]; then
  n=$((n + 1))
  card "$BUILD/seg-$(printf '%03d' "$n").mp4" "$e_dur" "$e1" "$e2"
  echo "file '$BUILD/seg-$(printf '%03d' "$n").mp4'" >> "$BUILD/list.txt"
  echo "end    ${e_dur}s"
fi

if [[ "$MUSIC" != "none" && -f "$MUSIC" ]]; then
  "${FF[@]}" -f concat -safe 0 -i "$BUILD/list.txt" -c copy "$BUILD/joined.mp4"
  # The voice keys a compressor on the music, so the bed drops while someone speaks and comes back in pauses.
  "${FF[@]}" -i "$BUILD/joined.mp4" -stream_loop -1 -i "$MUSIC" -filter_complex \
    "[0:a]asplit=2[vo][key];[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=$MUSIC_VOL[m];[m][key]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=600[md];[vo][md]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=$(calc "$(dur "$BUILD/joined.mp4") - 1.5"):d=1.5[a]" \
    -map 0:v -map "[a]" -c:v copy "${AENC[@]}" -movflags +faststart "$OUT_DIR/demo.mp4"
  echo "music  $(basename "$MUSIC") at volume $MUSIC_VOL, ducked under the voice"
else
  "${FF[@]}" -f concat -safe 0 -i "$BUILD/list.txt" -c copy -movflags +faststart "$OUT_DIR/demo.mp4"
  echo "music  none"
fi
"${FF[@]}" -i "$OUT_DIR/demo.mp4" -vf "scale=1280:720" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
  -c:a copy -movflags +faststart "$OUT_DIR/demo-720p.mp4"

total="$(dur "$OUT_DIR/demo.mp4")"
echo "caption $font_used"
echo "wrote $OUT_DIR/demo.mp4 and $OUT_DIR/demo-720p.mp4"
printf 'duration %.2f s (limit %s s)\n' "$total" "$MAX_SECONDS"
if [[ "$(calc "$total > $MAX_SECONDS ? 1 : 0")" != "1.000" ]]; then exit 0; fi
echo "ERROR: demo.mp4 is longer than $MAX_SECONDS s: shorten durations in docs/video/shots.json or the voice-over" >&2
exit 1
