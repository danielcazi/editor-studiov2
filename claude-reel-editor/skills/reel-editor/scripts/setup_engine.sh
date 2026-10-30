#!/usr/bin/env bash
# One-time: fetch the animation library and the HyperFrames player. Re-run safely any time.
# Sound effects are committed in compose/sfx/ (rendered by scripts/make_sfx.py), nothing to make here.
set -euo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)/engine"; mkdir -p "$E"

GSAP_SHA=96c01b81f44a3290e2b4532f55e2c9534b2adc43273a19f3756b2cb41f0fd0b6   # gsap 3.13.0: refuse a tampered download
if [ ! -s "$E/gsap.min.js" ]; then
  curl -fsSL https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js -o "$E/gsap.min.js.tmp"
  [ "$(shasum -a 256 "$E/gsap.min.js.tmp" | cut -d' ' -f1)" = "$GSAP_SHA" ] || { rm -f "$E/gsap.min.js.tmp"; echo "gsap download failed its checksum - not installing it" >&2; exit 1; }
  mv "$E/gsap.min.js.tmp" "$E/gsap.min.js"
fi

# HyperFrames catalog motions (carousels, captions, charts, social cards): fetched from HyperFrames, not shipped in this repo.
H="$E/hf"; mkdir -p "$H"
[ -f "$H/hyperframes.json" ] || printf '%s' '{"$schema":"https://hyperframes.heygen.com/schema/hyperframes.json","registry":"https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry","paths":{"blocks":"compositions","components":"compositions/components","assets":"assets"}}' > "$H/hyperframes.json"
[ -f "$H/package.json" ] || echo '{"name":"engine","private":true,"type":"module"}' > "$H/package.json"
# The browser player + runtime of the same HyperFrames as render.sh: the review step plays proj/index.html live with them.
hf() { [ -s "$H/$2" ] && return; curl -fsSL "https://cdn.jsdelivr.net/npm/$1/dist/$2" -o "$H/$2.tmp"
  [ "$(shasum -a 256 "$H/$2.tmp" | cut -d' ' -f1)" = "$3" ] || { rm -f "$H/$2.tmp"; echo "$2 download failed its checksum - not installing it" >&2; exit 1; }
  mv "$H/$2.tmp" "$H/$2"; }
hf @hyperframes/core@0.8.217 hyperframe.runtime.iife.js 0d41a8caf8d45a36e83ff7218b7543020591d67d12e033e6142f2d54de8bd055
hf @hyperframes/player@0.8.217 hyperframes-player.global.js cca641ba2ce2ae06fd04b982c1c0349dc4ab02763bd036666ab1055a8c9b832d
for m in caption-camera-follow carousel-vision-1 carousel-path-1 carousel-circle-1 carousel-orbit-1 hw-arrow hw-underline \
         oversized-cursor notification-stack code-terminal-run chat-message yt-comment-card instagram-follow count-up \
         animated-bar-chart mk-line-graph native-notification-pop x-follow-card chart-story; do
  ls "$H"/compositions/"$m".html "$H"/compositions/components/"$m".html >/dev/null 2>&1 || (cd "$H" && npx -y hyperframes@0.8.217 add "$m" >/dev/null 2>&1) || echo "note: couldn't fetch motion $m" >&2
done
echo "engine ready: $E"
