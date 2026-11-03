#!/usr/bin/env python3
"""Find on-screen text that sits in the caption band while a caption is up (macOS only; skipped elsewhere).

Reads proj/captions_layout.json (written by build_reel.py): where the caption line sits and which words it shows.
Samples the final video at 2 fps during caption lines, OCRs each frame with Apple Vision and reports text in the band
that is not the caption: a burned-in title, a screenshot, a sign in the footage.
Usage: python3 caption_overlap.py <final.mp4> <captions_layout.json>     exit 1 when foreign text shows in 3+ frames.
"""
import json, re, shutil, subprocess, sys, tempfile, unicodedata
from pathlib import Path

FPS, MIN_FRAMES, MIN_CONF, OWN = 2, 3, 0.5, 0.6   # OWN: share of an OCR line's words that must be caption words

def tokens(s):
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]+", " ", s).split()

def main(video, layout_path):
    if sys.platform != "darwin" or not shutil.which("swiftc"):
        print("overlap   skipped (needs macOS with swiftc: Apple Vision reads the frames)")
        return 0
    layout = json.load(open(layout_path))
    lines = layout["lines"]
    if not lines:
        print("overlap   no caption lines to check")
        return 0
    top, bottom = layout["top"] - 0.02, layout["top"] + layout["size"] * 1.6   # band around one caption line, frame heights
    helper = Path(__file__).resolve().parent / "ocr_frames.swift"
    with tempfile.TemporaryDirectory() as td:
        binary = Path(td) / "ocr_frames"
        subprocess.run(["swiftc", "-O", str(helper), "-o", str(binary)], check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={FPS}", "-q:v", "3", f"{td}/f_%05d.jpg"], check=True)
        # frame n (1-based) is at (n - 1) / FPS seconds; keep only the frames that fall inside a caption line
        todo = {}
        for f in sorted(Path(td).glob("f_*.jpg")):
            t = (int(f.stem[2:]) - 1) / FPS
            own = [l for l in lines if l["start"] <= t < l["end"]]
            if own: todo[str(f)] = (t, set(w for l in own for w in tokens(l["text"])))
        ocr = subprocess.run([str(binary), *todo], capture_output=True, text=True, check=True).stdout.splitlines()
    hits = []
    for row in map(json.loads, ocr):
        t, caption = todo[row["path"]]
        for item in row["items"]:
            words = tokens(item["t"])
            if item["c"] < MIN_CONF or not words or not top <= item["cy"] <= bottom: continue
            if sum(w in caption for w in words) / len(words) >= OWN: continue
            hits.append((t, item["t"]))
    frames = sorted({t for t, _ in hits})
    if len(frames) < MIN_FRAMES:
        print(f"overlap   {len(todo)} frames checked, no foreign text in the caption band")
        return 0
    examples = "; ".join(f"{t:.1f}s {txt!r}" for t, txt in hits[:4])
    print(f"overlap   foreign text in the caption band at {len(frames)} frames: {examples}")
    return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
