#!/usr/bin/env python3
"""Word-timed transcript for a clip via the local Whisper in HyperFrames (multilingual model, Portuguese by default),
or straight from a .srt/.vtt (no Whisper). Writes a flat word list: [{"text","start","end"}, ...].
Usage: python3 transcribe.py <video|audio|.srt|.vtt> <out.json>     REEL_LANG=pt (default) picks the Whisper language."""
import json, os, subprocess, sys
from pathlib import Path

HF = "hyperframes@0.8.145"

def split_words(entries):
    """HyperFrames returns one entry per subtitle: give each word a slice of its subtitle, proportional to its length."""
    out = []
    for e in entries:
        words = e["text"].split()
        t, total = e["start"], sum(len(w) for w in words) or 1
        for w in words:
            d = (e["end"] - e["start"]) * len(w) / total
            out.append({"text": w, "start": round(t, 3), "end": round(t + d, 3)})
            t += d
    return out

if __name__ == "__main__":
    src, out = Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser()
    subs = src.suffix.lower() in (".srt", ".vtt")
    d = out.parent / (out.stem + "_whisper")
    d.mkdir(parents=True, exist_ok=True)   # importing a .srt fails if the folder is missing
    cmd = ["npx", "-y", HF, "transcribe", str(src), "-d", str(d), "--json"]
    if not subs: cmd += ["--model", "small", "--language", os.environ.get("REEL_LANG", "pt")]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(d))
    if r.returncode: sys.exit(f"hyperframes transcribe failed: {(r.stderr or r.stdout).strip()[-400:]}")
    words = json.load(open(d / "transcript.json"))
    if subs: words = split_words(words)
    json.dump(words, open(out, "w"))
    print(f"{len(words)} words from {'subtitles' if subs else 'local Whisper'}")
