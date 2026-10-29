#!/usr/bin/env bash
# Build the reel from edit.json and render it. Logs how long each part took to <reel>/timings.log.
# Usage: render.sh <reel-folder> [--final]
# Gentle by default: 2 Chrome workers. REEL_FORMAT = 16:9 | 9:16 | 4:3 | 1:1 | 4:5 (default 9:16), always Full HD.
set -euo pipefail
REEL="$(cd "$1" && pwd)"; shift
FINAL=0; ARGS=(); for a in "$@"; do [ "$a" = "--final" ] && FINAL=1 || ARGS+=("$a"); done
WORKERS="${REEL_WORKERS:-2}"                     # each worker is a Chrome; 2 keeps a 16 GB Mac usable
S="$(cd "$(dirname "$0")" && pwd)"
BRAND="${REELS_HOME:-$HOME/reels}/brand.json"
# always Full HD (4K sources are scaled down in cut.py); 4:3, 1:1 and 4:5 have no preset, so its composition size is the output
case "${REEL_FORMAT:-9:16}" in 9:16) RES_ARG=(--resolution portrait);; 16:9) RES_ARG=(--resolution landscape);; *) RES_ARG=();; esac
stamp() { echo "$(date +%s) $1" >> "$REEL/timings.log"; }

# the preview cut is a fast encode; re-cut it at full quality once, before the first final
if [ "$FINAL" = 1 ] && [ -f "$REEL/master.preview" ]; then echo "re-cutting master.mp4 at full quality for the final"; env -u REEL_PREVIEW python3 "$S/cut.py" "$REEL"; fi

[ -s "$S/../engine/gsap.min.js" ] || bash "$S/setup_engine.sh"
stamp "build:start"; python3 "$S/build_reel.py" "$REEL" ${ARGS[@]+"${ARGS[@]}"}; stamp "build:end"
# the manual layer edits of the Edição step (server/edits.ts), applied on top of what build_reel.py just wrote
if [ -n "${REEL_AFTER_BUILD:-}" ]; then node "$REEL_AFTER_BUILD" "$REEL/proj"; fi
stamp "render:start"
# finals capture in software (SwiftShader): the GPU capture drifts by a few levels between runs (SPEC §7 criterion 6)
GPU_ARG=(); [ "$FINAL" = 1 ] && GPU_ARG=(--no-browser-gpu)
# no nice: hyperframes 0.8.145 sets its workers' priority itself and EACCES-fails when started already niced
npx -y hyperframes@0.8.145 render "$REEL/proj" --workers "$WORKERS" -o "$REEL/final.mp4" ${RES_ARG[@]+"${RES_ARG[@]}"} ${GPU_ARG[@]+"${GPU_ARG[@]}"} --quality delivery --quiet
stamp "render:end"
# Final mix. Optional music bed (brand.json "music": path) sits ~11 dB under the measured voice and ducks further while she talks.
# Then bring the whole mix to -14 LUFS (video copied, not re-encoded).
MUSIC="$(python3 -c "import json,os;m=json.load(open('$BRAND')).get('music');print(os.path.expanduser(m) if m else '')")"
if [ -n "$MUSIC" ] && [ -f "$MUSIC" ]; then
  # integrated LUFS of a file's audio; music is set ~11 dB under the measured voice (falls back to -18 dB if a measure fails)
  lufs() { ffmpeg -nostats -i "$1" -vn -af ebur128 -f null - 2>&1 | awk '/I:/ {v=$2} END {print v}'; }
  VL="$(lufs "$REEL/final.mp4")"; ML="$(lufs "$MUSIC")"
  MG="$(python3 -c "print(round(float('$VL')-11-float('$ML'),1))" 2>/dev/null || echo -18)"
  ffmpeg -v error -y -i "$REEL/final.mp4" -stream_loop -1 -i "$MUSIC" -filter_complex \
    "[1:a]volume=${MG}dB,afade=t=in:d=0.5[m];[0:a]asplit[v][key];[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[md];[v][md]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=7[a]" \
    -map 0:v -map "[a]" -c:v copy -ar 48000 -c:a aac -b:a 256k "$REEL/final_ln.mp4"
else
  ffmpeg -v error -y -i "$REEL/final.mp4" -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=7" -ar 48000 -c:a aac -b:a 256k "$REEL/final_ln.mp4"
fi
# single-pass loudnorm undershoots on speech (measured -15.4 LUFS, outside qa.py's -15..-12.5); a second pass lands near -14.5
ffmpeg -v error -y -i "$REEL/final_ln.mp4" -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=7" -ar 48000 -c:a aac -b:a 256k "$REEL/final.mp4"
rm -f "$REEL/final_ln.mp4"
python3 "$S/timings.py" "$REEL"
