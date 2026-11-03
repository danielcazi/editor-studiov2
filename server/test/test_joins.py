"""Cut checks: check_joins.py helpers, J/L spans keep sound and picture the same length, tighten.py puts joins inside the silence, cut.py renders with jl."""
import json, os, subprocess, sys, tempfile
from pathlib import Path
S = Path(__file__).resolve().parents[2] / "claude-reel-editor/skills/reel-editor/scripts"
sys.path.insert(0, str(S))
from check_joins import repeats, clipped
from pacing import jl_video_spans

assert repeats("a gente vai".split(), "vai fazer".split()) == 1 and repeats("é muito".split(), "muito bom".split()) == 1
assert repeats("eu quero fazer isso".split(), "fazer isso agora".split()) == 2 and repeats("a b".split(), "c d".split()) == 0
w = [{"text": " casa", "start": 1.0, "end": 1.5}, {"text": "azul", "start": 1.6, "end": 2.0}]
assert clipped(w, [[0, 1.25], [1.6, 3]]) == [("casa", 1.25)] and clipped(w, [[0, 1.55], [1.58, 3]]) == []

keep = [[0, 2], [3, 5], [6, 8], [8.01, 9]]
v = jl_video_spans(keep, 4, 30, 10)
d = 4 / 30
assert abs(sum(b - a for a, b in v) - sum(b - a for a, b in keep)) < 1e-9, v
assert abs(v[0][1] - (2 + d)) < 1e-9 and abs(v[1][0] - (3 + d)) < 1e-9 and abs(v[1][1] - (5 - d)) < 1e-9 and abs(v[2][0] - (6 - d)) < 1e-9, v   # J then L
assert v[3] == [8.01, 9] and v[2][1] == 8, v                                                                                          # contiguous join stays hard
assert jl_video_spans([[0, 1], [2, 3]], 4, 30, 1.05) == [[0, 1], [2, 3]]    # the J shift would run past the end of the clip: stays hard

# tighten + cut on synthetic media: three tone bursts split by 1 s of near-silence
d = Path(tempfile.mkdtemp()); home = d / "home"; reel = home / "r"; reel.mkdir(parents=True); json.dump({}, open(home / "brand.json", "w"))
tone = "sine=f=300:d=1.5,volume=0.5"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"{tone}", "-f", "lavfi", "-i", "anoisesrc=d=1:amplitude=0.0005", "-f", "lavfi", "-i", f"{tone}",
                "-f", "lavfi", "-i", "anoisesrc=d=1:amplitude=0.0005", "-f", "lavfi", "-i", f"{tone}", "-filter_complex", "concat=n=5:v=0:a=1,aresample=16000,aformat=channel_layouts=mono[a]",
                "-map", "[a]", str(reel / "voice.wav")], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=320x568:r=30:d=6.5", "-i", str(reel / "voice.wav"), "-pix_fmt", "yuv420p", "-shortest", str(reel / "raw.mp4")], check=True)
json.dump({"source": "raw.mp4", "audio": "voice.wav", "keep": [[0, 6.5]], "jl": 4}, open(reel / "edl.json", "w"))
env = {**os.environ, "REELS_HOME": str(home)}
r = subprocess.run([sys.executable, str(S / "tighten.py"), str(reel)], capture_output=True, text=True, env=env); assert r.returncode == 0, r.stdout + r.stderr
keep = json.load(open(reel / "edl.json"))["keep"]
assert len(keep) == 3, keep
for (a, b), (c, e), (lo, hi) in zip(keep, keep[1:], [(1.5, 2.5), (4.0, 5.0)]):   # each cut edge sits inside a silent second, not on a tone
    assert lo <= b < c <= hi, keep
r = subprocess.run([sys.executable, str(S / "cut.py"), str(reel)], capture_output=True, text=True, env=env); assert r.returncode == 0, r.stdout + r.stderr
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(reel / "master.mp4")], capture_output=True, text=True).stdout)
assert abs(dur - sum(b - a for a, b in keep)) < 0.15, dur
r = subprocess.run([sys.executable, str(S / "check_joins.py"), str(reel)], capture_output=True, text=True, env=env)   # tones carry no words: nothing to flag; 3 = no local Whisper
assert r.returncode in (0, 3) and (r.returncode == 3 or (reel / "joins.txt").read_text().count("\n") == 2), r.stdout + r.stderr
print("cut checks: ok")
