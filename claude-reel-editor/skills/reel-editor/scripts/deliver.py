#!/usr/bin/env python3
"""Make the upload copy: same resolution, high-bitrate H.264, fast-start, saved to the brand's delivery folder.
Usage: deliver.py <final.mp4> "<clear name>" """
import json, os, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]); name = sys.argv[2] if len(sys.argv) > 2 else src.stem
brand = Path(os.environ.get("REELS_HOME", Path.home() / "reels")) / "brand.json"
d = Path(os.path.expanduser(json.load(open(brand)).get("deliver_dir", "~/Movies/Reels"))); d.mkdir(parents=True, exist_ok=True)
out = d / f"{name}.mp4"

h = int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", str(src)],
                       capture_output=True, text=True, check=True).stdout.strip())
rate, mx = ("35M", "45M") if h >= 3000 else ("16M", "20M")   # 4K vs 1080p
venc = (["-c:v", "h264_videotoolbox", "-profile:v", "high"] if sys.platform == "darwin"   # Apple hardware encoder: fast, quiet
        else ["-c:v", "libx264", "-preset", "slow"]) + ["-b:v", rate, "-maxrate", mx, "-bufsize", mx]
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), *venc, "-pix_fmt", "yuv420p", "-tag:v", "avc1",
                "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", str(out)], check=True)
print(out)
