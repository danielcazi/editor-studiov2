#!/usr/bin/env python3
"""Word-timed transcript for a clip via the local Whisper in HyperFrames (multilingual model, Portuguese by default),
or straight from a .srt/.vtt (no Whisper). Writes a flat word list: [{"text","start","end"}, ...].
Usage: python3 transcribe.py <video|audio|.srt|.vtt> <out.json>     REEL_LANG=pt (default) picks the Whisper language."""
import json, os, shutil, subprocess, sys, unicodedata
from pathlib import Path

HF = "hyperframes@0.8.217"

def _norm(s):
    s = s.strip().lower().strip('.,!?…:;"\'()«»“”')
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def apply_corrections(words, rules):
    """Replace misheard words or phrases. rules: [{"from": "Connect Hub", "to": "Connect Hub"}, ...]. Matching ignores case,
    accents and edge punctuation. The replacement keeps the phrase's time span and the punctuation of its last word;
    an empty "to" deletes the phrase."""
    for rule in rules:
        src = [t for t in (_norm(x) for x in rule["from"].split()) if t]
        n = len(src)
        if not n: continue
        out, i = [], 0
        while i < len(words):
            if [_norm(w["text"]) for w in words[i:i + n]] == src:
                last = words[i + n - 1]
                tail = last["text"][len(last["text"].rstrip('.,!?…:;"\'()«»“”')):]
                out += split_words([{"text": rule["to"] + tail, "start": words[i]["start"], "end": last["end"]}])
                i += n
            else:
                out.append(words[i]); i += 1
        words = out
    return words

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

def align(subs_words, heard):
    """The subtitle words keep their text; each one that Whisper also heard (same word, in order) takes Whisper's time, and
    a run of words Whisper missed is spread between its timed neighbours, proportional to length (like split_words)."""
    import difflib
    a, b = [_norm(w["text"]) for w in subs_words], [_norm(w["text"]) for w in heard]
    timed = [None] * len(subs_words)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1): timed[i1 + k] = (heard[j1 + k]["start"], heard[j1 + k]["end"])
    hit = sum(1 for t in timed if t)
    if hit < len(subs_words) * .5: return None, hit   # another audio, or a transcript that failed: keep the subtitle times
    out, i = [], 0
    while i < len(subs_words):
        if timed[i]:
            out.append({**subs_words[i], "start": timed[i][0], "end": timed[i][1]}); i += 1; continue
        j = i
        while j < len(subs_words) and not timed[j]: j += 1
        lo = out[-1]["end"] if out else subs_words[i]["start"]
        hi = timed[j][0] if j < len(subs_words) else subs_words[j - 1]["end"]
        if hi <= lo: hi = lo + sum(len(w["text"]) for w in subs_words[i:j]) * .06
        out += split_words([{"text": " ".join(w["text"] for w in subs_words[i:j]), "start": lo, "end": hi}])
        i = j
    return out, hit

def transcribe(src, d, subs):
    cmd = [shutil.which("npx") or "npx", "-y", HF, "transcribe", str(src), "-d", str(d), "--json"]
    if not subs: cmd += ["--model", "small", "--language", os.environ.get("REEL_LANG", "pt")]
    # cwd is this scripts folder, never the fresh output dir: on macOS exFAT drives node's getcwd() fails with ENOENT
    # (uv_cwd) for a directory created moments ago, and npx dies before hyperframes even starts; every path above is absolute
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(Path(__file__).resolve().parent))
    if r.returncode: sys.exit(f"hyperframes transcribe failed: {(r.stderr or r.stdout).strip()[-400:]}")
    return json.load(open(d / "transcript.json"))

if __name__ == "__main__":
    src, out = Path(sys.argv[1]).expanduser().resolve(), Path(sys.argv[2]).expanduser().resolve()   # absolute: npx runs elsewhere
    subs = src.suffix.lower() in (".srt", ".vtt")
    d = out.parent / (out.stem + "_whisper")
    d.mkdir(parents=True, exist_ok=True)   # importing a .srt fails if the folder is missing
    words = transcribe(src, d, subs)
    if subs: words = split_words(words)
    # --align <media>: with subtitles, the per-word times come from Whisper on the audio (a cue sliced by length put words early or late)
    if subs and "--align" in sys.argv:
        media = Path(sys.argv[sys.argv.index("--align") + 1]).expanduser().resolve()
        da = out.parent / (out.stem + "_whisper_align"); da.mkdir(parents=True, exist_ok=True)
        try:
            heard = transcribe(media, da, False)
            aligned, hit = align(words, heard)
            if aligned: words = aligned; print(f"aligned {hit} of {len(words)} subtitle words to Whisper times")
            else: print(f"alignment skipped: Whisper matched only {hit} of {len(words)} words; subtitle times kept")
        except SystemExit as e:
            print(f"alignment skipped ({e}); subtitle times kept")
    fixes = out.parent / "corrections.json"   # project folder: user-maintained names and terms, applied to every transcript
    if fixes.exists(): words = apply_corrections(words, json.load(open(fixes)))
    json.dump(words, open(out, "w"))
    print(f"{len(words)} words from {'subtitles' if subs else 'local Whisper'}")
