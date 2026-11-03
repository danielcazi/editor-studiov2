"""scripts/pace.py on synthetic video: a still frame fails, cuts every 0.7 s over slow motion pass, and a mask hides motion inside it."""
import json, subprocess, sys, tempfile
from pathlib import Path
PACE = Path(__file__).resolve().parents[2] / "claude-reel-editor/skills/reel-editor/scripts/pace.py"
d = Path(tempfile.mkdtemp())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=1080x1920:d=4:r=30", "-pix_fmt", "yuv420p", d / "still.mp4"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=1080x1920:d=4:r=30:speed=0.8",
                "-vf", "drawbox=x=0:y=0:w=1080:h=1000:color=white:t=fill:enable='lt(mod(t\\,1.4)\\,0.7)'", "-pix_fmt", "yuv420p", d / "busy.mp4"], check=True)
json.dump([{"t0": 0, "ignore": [[0, 0, 1080, 1920]]}], open(d / "mask.json", "w"))
run = lambda *a: subprocess.run([sys.executable, str(PACE), *map(str, a)], capture_output=True, text=True)
r = run(d / "still.mp4"); assert r.returncode == 3 and "hold" in r.stdout, r.stdout
r = run(d / "busy.mp4"); assert r.returncode == 0 and "PASS" in r.stdout, r.stdout
r = run(d / "busy.mp4", "--mask", d / "mask.json"); assert r.returncode == 3 and "speaker masked" in r.stdout, r.stdout
print("pace gate: ok")
