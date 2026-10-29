#!/usr/bin/env python3
"""Apply the approved rough cut: keep spans from edl.json (in play order), speed up, optional colour grade, cap at
Full HD. Writes master.mp4 in the reel folder.
Usage: python3 cut.py <reel-folder>      (reads <reel-folder>/edl.json and ~/reels/brand.json)"""
import json, os, subprocess, sys
from pathlib import Path

reel = Path(sys.argv[1]).expanduser()
home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
brand = json.load(open(home / "brand.json"))
edl = json.load(open(reel / "edl.json"))

src, audio = reel / edl["source"], reel / edl.get("audio", "voice.wav")
spans = edl["keep"]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pacing import pacing
speed = edl.get("speed") or pacing(brand)["speed"]   # pre-edited clips: edl.json "speed": 1
grade = brand.get("grade")
FADE = 0.012  # tiny audio fades at every join so cuts never click

vp, ap = [], []
for k, (a, b) in enumerate(spans):
    vp.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{k}]")
    ap.append(f"[1:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,"
              f"afade=t=in:d={FADE},afade=t=out:st={max(b - a - FADE, 0):.3f}:d={FADE}[a{k}]")
n = len(spans)
# the master keeps the source's aspect (each format crops it at build time), capped at Full HD: 4K comes in, 1080p goes out
post = [f"setpts=PTS/{speed}", "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", "fps=30"]
if grade:
    if edl.get("grade_from") is not None:   # grade switches on at this reel second (a "before/after" moment)
        # shortcut: splits filters on commas, so a filter option containing a comma breaks; quote-aware split if one ever does
        grade = ",".join(f + (":" if "=" in f else "=") + f"enable='gte(t,{float(edl['grade_from']):.3f})'" for f in grade.split(","))
    post.insert(1, grade)
vcat = "".join(f"[v{k}]" for k in range(n)) + f"concat=n={n}:v=1:a=0," + ",".join(post) + "[vout]"
acat = "".join(f"[a{k}]" for k in range(n)) + f"concat=n={n}:v=0:a=1,atempo={speed}[aout]"

script = reel / "cut_filter.txt"
script.write_text(";".join(vp + ap) + ";" + vcat + ";" + acat)
kept = sum(b - a for a, b in spans)
print(f"{n} spans, {kept:.1f}s kept -> {kept / speed:.1f}s at {speed}x")
if kept / speed > brand.get("max_seconds", 60):
    print(f"warning: longer than {brand.get('max_seconds', 60)}s - suggest more cuts")

subprocess.run(["nice", "-n", "15", "ffmpeg", "-y", "-v", "error", "-stats", "-i", str(src), "-i", str(audio),
                "-/filter_complex", str(script),   # ffmpeg >= 7 (9 dropped -filter_complex_script)
                "-map", "[vout]", "-map", "[aout]",
                *((["-c:v", "h264_videotoolbox", "-b:v", "12M"] if sys.platform == "darwin" else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]) if os.environ.get("REEL_PREVIEW") else ["-c:v", "libx264", "-preset", "medium", "-crf", "16"]), "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", str(reel / "master.mp4")], check=True)
marker = reel / "master.preview"                   # render.sh --final re-cuts a fast preview encode at full quality
marker.touch() if os.environ.get("REEL_PREVIEW") else marker.unlink(missing_ok=True)
print(reel / "master.mp4")
