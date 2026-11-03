#!/usr/bin/env python3
"""Build the reel from edit.json and render it. Logs how long each part took to <reel>/timings.log.
Usage: render.py <reel-folder> [--final]
Gentle by default: 2 Chrome workers. REEL_FORMAT = 16:9 | 9:16 | 4:3 | 1:1 | 4:5 (default 9:16), always Full HD."""
import json, os, shutil, subprocess, sys, time
from pathlib import Path

S = Path(__file__).resolve().parent
reel = Path(sys.argv[1]).resolve()
final = "--final" in sys.argv[2:]; args = [a for a in sys.argv[2:] if a != "--final"]
workers = os.environ.get("REEL_WORKERS", "2")                     # each worker is a Chrome; 2 keeps a 16 GB machine usable
brand = Path(os.environ.get("REELS_HOME", Path.home() / "reels")) / "brand.json"
# always Full HD (4K sources are scaled down in cut.py); 4:3, 1:1 and 4:5 have no preset, so its composition size is the output
res = {"9:16": ["--resolution", "portrait"], "16:9": ["--resolution", "landscape"]}.get(os.environ.get("REEL_FORMAT", "9:16"), [])
PY, NPX = sys.executable, shutil.which("npx") or "npx"             # which(): npx is npx.cmd on Windows

def sh(*cmd, **kw): subprocess.run([str(c) for c in cmd], check=True, **kw)
def stamp(s): open(reel / "timings.log", "a").write(f"{int(time.time())} {s}\n")

# the preview cut is a fast encode; re-cut it at full quality once, before the first final
if final and (reel / "master.preview").exists():
    print("re-cutting master.mp4 at full quality for the final")
    sh(PY, S / "cut.py", reel, env={k: v for k, v in os.environ.items() if k != "REEL_PREVIEW"})

gsap = S.parent / "engine/gsap.min.js"
if not gsap.exists() or not gsap.stat().st_size: sh(PY, S / "setup_engine.py")
stamp("build:start"); sh(PY, S / "build_reel.py", reel, *args); stamp("build:end")
# the manual layer edits of the Edição step (server/edits.ts), applied on top of what build_reel.py just wrote
if os.environ.get("REEL_AFTER_BUILD"): sh("node", os.environ["REEL_AFTER_BUILD"], reel / "proj")
stamp("render:start")
# finals capture in software (SwiftShader): the GPU capture drifts by a few levels between runs (SPEC §7 criterion 6)
# no nice: hyperframes 0.8.217 sets its workers' priority itself and EACCES-fails when started already niced
sh(NPX, "-y", "hyperframes@0.8.217", "render", reel / "proj", "--workers", workers, "-o", reel / "final.mp4",
   *res, *(["--no-browser-gpu"] if final else []), "--quality", "delivery", "--quiet")
stamp("render:end")

# Final mix. Optional music bed (brand.json "music": path) sits ~11 dB under the measured voice and ducks further while she talks.
# Then bring the whole mix to -14 LUFS (video copied, not re-encoded).
LN = "loudnorm=I=-14:TP=-1.5:LRA=7"; AUD = ["-ar", "48000", "-c:a", "aac", "-b:a", "256k"]
ln = reel / "final_ln.mp4"
try: music = json.load(open(brand)).get("music") or ""
except (OSError, ValueError): music = ""
music = os.path.expanduser(music)
if music and os.path.isfile(music):
    def lufs(f):   # integrated LUFS of a file's audio
        r = subprocess.run(["ffmpeg", "-nostats", "-i", str(f), "-vn", "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
        return [l.split()[1] for l in (r.stderr + r.stdout).splitlines() if "I:" in l][-1]
    # music is set ~11 dB under the measured voice (falls back to -18 dB if a measure fails)
    try: mg = round(float(lufs(reel / "final.mp4")) - 11 - float(lufs(music)), 1)
    except (ValueError, IndexError): mg = -18
    sh("ffmpeg", "-v", "error", "-y", "-i", reel / "final.mp4", "-stream_loop", "-1", "-i", music, "-filter_complex",
       f"[1:a]volume={mg}dB,afade=t=in:d=0.5[m];[0:a]asplit[v][key];[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[md];"
       f"[v][md]amix=inputs=2:duration=first:normalize=0,{LN}[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", *AUD, ln)
else:
    sh("ffmpeg", "-v", "error", "-y", "-i", reel / "final.mp4", "-c:v", "copy", "-af", LN, *AUD, ln)
# single-pass loudnorm undershoots on speech (measured -15.4 LUFS, outside qa.py's -15..-12.5); a second pass lands near -14.5
sh("ffmpeg", "-v", "error", "-y", "-i", ln, "-c:v", "copy", "-af", LN, *AUD, reel / "final.mp4")
ln.unlink(missing_ok=True)
sh(PY, S / "timings.py", reel)
