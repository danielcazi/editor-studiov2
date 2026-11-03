#!/usr/bin/env python3
"""Check every join of the cut: transcribe the 2 s before and after it, exactly as cut.py plays it, and flag
  - repeats    the last words before the join come back right after it (a retake that was left in)
  - clipped    a word of transcript.json straddles a span edge (the cut sits inside a word)
Writes joins.txt (one line per join: the text either side) so the joins can also be read. Exit 1 when anything is flagged, 3 when Whisper is missing.
Usage: python3 check_joins.py <reel-folder> [--window 2]      (reads edl.json, voice.wav, transcript.json if present)"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path


def norm(s): return re.sub(r"[\W\d_]", "", s.lower())


def repeats(before, after, longest=3):
    """Number of words that end `before` and start `after` alike (0 = none), longest run first."""
    b, a = [norm(w) for w in before], [norm(w) for w in after]
    for n in range(min(longest, len(b), len(a)), 0, -1):
        if b[-n:] == a[:n] and all(b[-n:]): return n
    return 0


def clipped(words, keep, tol=0.04):
    """Words (dicts with text/start/end) that a span edge cuts in two, as (text, edge time)."""
    edges = [e for span in keep for e in span]
    return [(w["text"].strip(), e) for w in words for e in edges if w["start"] < e - tol and w["end"] > e + tol]


def join_clip(voice, prev, cur, win, out):
    """Audio of one join: the last `win` s of the previous span glued to the first `win` s of the next. Returns the tail length."""
    a1 = max(prev[0], prev[1] - win)
    f = "asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={:.3f}:d=0.012"   # same fades as cut.py
    graph = (f"[0:a]atrim=start={a1}:end={prev[1]},{f.format(prev[1] - a1 - 0.012)}[x];"
             f"[0:a]atrim=start={cur[0]}:end={min(cur[1], cur[0] + win)},{f.format(min(cur[1] - cur[0], win) - 0.012)}[y];"
             "[x][y]concat=n=2:v=0:a=1,aresample=16000,pan=mono|c0=c0[o]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(voice), "-filter_complex", graph, "-map", "[o]", str(out)], check=True)
    return prev[1] - a1


def main():
    reel = Path(sys.argv[1]).expanduser()
    win = float(sys.argv[sys.argv.index("--window") + 1]) if "--window" in sys.argv else 2.0
    edl = json.load(open(reel / "edl.json"))
    keep, voice = edl["keep"], reel / edl.get("audio", "voice.wav")
    cli = shutil.which("whisper-cli") or next((str(p) for p in Path("~/.cache/hyperframes/whisper").expanduser().rglob("whisper-cli")), None)
    model = next(iter(sorted(Path("~/.cache/hyperframes/whisper/models").expanduser().glob("ggml-small.bin"))), None)
    if not (cli and model):
        print("JOINS NOT CHECKED: local Whisper is not installed (tighten.py installs it)"); sys.exit(3)
    flags, lines, t = [], [], 0.0
    for k in range(1, len(keep)):
        t += keep[k - 1][1] - keep[k - 1][0]
        clip, base = reel / "_join.wav", reel / "_join"
        tail = join_clip(voice, keep[k - 1], keep[k], win, clip)
        r = subprocess.run([cli, "-m", str(model), "-f", str(clip), "-l", os.environ.get("REEL_LANG", "pt"), "-ml", "1", "-sow", "-oj", "-of", str(base)], capture_output=True, text=True)
        toks = [(x["text"].strip(), (x["offsets"]["from"] + x["offsets"]["to"]) / 2000) for x in json.load(open(f"{base}.json"))["transcription"] if x["text"].strip()] if r.returncode == 0 else []
        before, after = [w for w, m in toks if m < tail], [w for w, m in toks if m >= tail]
        n = repeats(before, after)
        if n: flags.append(f"join {k} @ {t:.1f}s repeats {n} word(s): …{' '.join(before[-n:])} | {' '.join(after[:n])}…")
        lines.append(f"{k:>3} @ {t:6.1f}s  {' '.join(before[-6:])} | {' '.join(after[:6])}{'   <- REPEAT' if n else ''}")
    tr = reel / "transcript.json"
    if tr.exists():
        flags += [f"word “{w}” is cut in two at {e:.2f}s (source time)" for w, e in clipped([x for x in json.load(open(tr)) if x["text"].strip()], keep)]
    for f in ("_join.wav", "_join.json"): (reel / f).unlink(missing_ok=True)
    (reel / "joins.txt").write_text("\n".join(lines) + "\n")
    print(f"{len(keep) - 1} joins checked -> joins.txt")
    for f in flags: print("FLAG:", f)
    sys.exit(1 if flags else 0)


if __name__ == "__main__":
    main()
