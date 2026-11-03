"""Regression: build_reel.py must write the same index.html for each caption preset before and after the anim interpreter.
Baseline hashes live in anim-baseline.json (made with `python3 test/test_anim.py --update` on the pre-anim build_reel.py)."""
import hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILD = HERE.parent.parent / "claude-reel-editor/skills/reel-editor/scripts/build_reel.py"
BASE = HERE / "anim-baseline.json"
W = lambda t, s, a=False: {"text": t, "t": s, "accent": a}
EDIT = {"captions": [
    {"start": 0.2, "end": 1.6, "words": [W("Esse", 0.2), W("é", 0.5), W("o", 0.7), W("SEU", 0.9, True), W("novo", 1.2), W("reel", 1.4)]},
    {"start": 1.8, "end": 2.8, "words": [W("Vamos", 1.8), W("lá", 2.2, True)]},
    {"start": 2.85, "end": 3.6, "words": [W("agora", 2.85)]}], "cards": []}
BRAND = {"colors": {"main": "#750800", "pop": "#ffffff", "light": "#ffeef5", "caption": "#ffffff", "caption_accent": "#f7b708"},
         "captions": {"size": 104, "y": 1250, "case": "lower"}, "fonts": {}}

def build(preset, tmp):
    reel, home = Path(tmp) / f"r-{preset or 'fork'}", Path(tmp) / f"h-{preset or 'fork'}"
    reel.mkdir(); home.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=d=4:s=320x240:r=30", "-y", str(reel / "master.mp4")], check=True)
    m = (reel / "master.mp4").stat()
    json.dump({"key": f"{m.st_size}:{int(m.st_mtime)}", "track": []}, open(reel / "nose.json", "w"))
    json.dump(EDIT, open(reel / "edit.json", "w"))
    json.dump({**BRAND, **({"captionStyle": {"preset": preset}} if preset else {})}, open(home / "brand.json", "w"))
    subprocess.run([sys.executable, str(BUILD), str(reel)], check=True, env={**os.environ, "REELS_HOME": str(home)}, capture_output=True)
    return hashlib.sha256((reel / "proj/index.html").read_bytes()).hexdigest()

def hashes():
    with tempfile.TemporaryDirectory() as tmp:
        return {p or "fork": build(p, tmp) for p in (None, "word-pop", "karaoke", "block", "minimal")}

def custom():
    """A hand-made anim (slide-up + blur, 0.2 s, back.out, stagger 0.05, per character) must reach the timeline."""
    with tempfile.TemporaryDirectory() as tmp:
        build("word-pop", tmp)
        reel, home = Path(tmp) / "r-word-pop", Path(tmp) / "h-word-pop"
        brand = json.load(open(home / "brand.json"))
        brand["captionStyle"]["anim"] = {"unit": "char", "stagger": 0.05, "in": {"type": "slide-up", "duration": 0.2, "ease": "back.out", "from": {"opacity": 0, "y": 40, "blur": 12}}}
        json.dump(brand, open(home / "brand.json", "w"))
        subprocess.run([sys.executable, str(BUILD), str(reel)], check=True, env={**os.environ, "REELS_HOME": str(home)}, capture_output=True)
        h = (reel / "proj/index.html").read_text()
        assert 'tl.fromTo("#c0w0c0",{autoAlpha:0,y:40,filter:"blur(12px)"},{autoAlpha:1,y:0,filter:"blur(0px)",duration:0.2,ease:"back.out"},0.2);' in h
        assert 'tl.fromTo("#c0w0c1",' in h and ',0.2667);' in h        # stagger 0.05 between characters, frame-snapped
        bad = dict(brand); bad["captionStyle"] = {"preset": "word-pop", "anim": {"in": {"ease": "x=>1"}}}
        json.dump(bad, open(home / "brand.json", "w"))
        r = subprocess.run([sys.executable, str(BUILD), str(reel)], env={**os.environ, "REELS_HOME": str(home)}, capture_output=True, text=True)
        assert r.returncode != 0 and "ease" in r.stderr, "an unlisted ease must stop the build"

if __name__ == "__main__":
    h = hashes()
    if "--update" in sys.argv: BASE.write_text(json.dumps(h, indent=1)); print("baseline written", h)
    else:
        base = json.loads(BASE.read_text())
        bad = [k for k in base if base[k] != h[k]]
        assert not bad, f"caption output changed for: {bad}"
        custom(); print("anim regression + custom anim: ok")
