#!/usr/bin/env python3
"""One-time: fetch the animation library and the HyperFrames player. Re-run safely any time.
Sound effects are committed in compose/sfx/ (rendered by scripts/make_sfx.py), nothing to make here."""
import hashlib, shutil, subprocess, sys, urllib.request
from pathlib import Path

E = Path(__file__).resolve().parent.parent / "engine"; E.mkdir(parents=True, exist_ok=True)

def fetch(url, dst, sha):   # refuse a tampered download
    if dst.exists() and dst.stat().st_size: return
    data = urllib.request.urlopen(url, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != sha: sys.exit(f"{dst.name} download failed its checksum - not installing it")
    dst.write_bytes(data)

fetch("https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js", E / "gsap.min.js", "96c01b81f44a3290e2b4532f55e2c9534b2adc43273a19f3756b2cb41f0fd0b6")   # gsap 3.13.0

# HyperFrames catalog motions (carousels, captions, charts, social cards): fetched from HyperFrames, not shipped in this repo.
H = E / "hf"; H.mkdir(exist_ok=True)
if not (H / "hyperframes.json").exists():
    (H / "hyperframes.json").write_text('{"$schema":"https://hyperframes.heygen.com/schema/hyperframes.json","registry":"https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry","paths":{"blocks":"compositions","components":"compositions/components","assets":"assets"}}')
if not (H / "package.json").exists(): (H / "package.json").write_text('{"name":"engine","private":true,"type":"module"}\n')
# The browser player + runtime of the same HyperFrames as render.py: the review step plays proj/index.html live with them.
for pkg, name, sha in [("@hyperframes/core@0.8.217", "hyperframe.runtime.iife.js", "0d41a8caf8d45a36e83ff7218b7543020591d67d12e033e6142f2d54de8bd055"),
                       ("@hyperframes/player@0.8.217", "hyperframes-player.global.js", "cca641ba2ce2ae06fd04b982c1c0349dc4ab02763bd036666ab1055a8c9b832d")]:
    fetch(f"https://cdn.jsdelivr.net/npm/{pkg}/dist/{name}", H / name, sha)
NPX = shutil.which("npx") or "npx"
for m in ("caption-camera-follow carousel-vision-1 carousel-path-1 carousel-circle-1 carousel-orbit-1 hw-arrow hw-underline "
          "oversized-cursor notification-stack code-terminal-run chat-message yt-comment-card instagram-follow count-up "
          "animated-bar-chart mk-line-graph native-notification-pop x-follow-card chart-story").split():
    if (H / "compositions" / f"{m}.html").exists() or (H / "compositions/components" / f"{m}.html").exists(): continue
    if subprocess.run([NPX, "-y", "hyperframes@0.8.217", "add", m], cwd=H, capture_output=True).returncode:
        print(f"note: couldn't fetch motion {m}", file=sys.stderr)
print(f"engine ready: {E}")
