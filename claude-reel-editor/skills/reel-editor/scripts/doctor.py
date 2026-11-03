#!/usr/bin/env python3
"""Check everything the reel editor needs and say plainly whether you can edit.
Ends with one of: READY · READY WITH LIMITS (works, something optional is missing) · MISSING (fix before editing)."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

state = {"missing": 0, "limits": 0}
WIN = sys.platform == "win32"
PKG = "winget install" if WIN else "brew install"
def ok(s): print(f"  ✅ {s}")
def warn(s, fix): print(f"  ⚠️  {s}\n     {fix}"); state["limits"] = 1
def no(s, fix): print(f"  ❌ {s}\n     fix: {fix}"); state["missing"] = 1
def out(*cmd):
    try: return subprocess.run(cmd, capture_output=True, text=True).stdout
    except OSError: return ""
print("Reel editor check")

if shutil.which("ffmpeg"):
    ok("ffmpeg")
    # cut.py reads its filter from a file with -/filter_complex, which only ffmpeg 7+ has (a git build has no number: skipped)
    v = re.match(r"ffmpeg version [nN]*(\d+)", out("ffmpeg", "-version"))
    if v and int(v.group(1)) < 7: no(f"ffmpeg {v.group(1)} is too old", f"cut.py needs ffmpeg 7 or newer: {PKG} ffmpeg")
else: no("ffmpeg", f"{PKG} ffmpeg")
if shutil.which("node"): ok(f"Node.js {out('node', '-v').strip()}")
else: no("Node.js", "install the LTS version from https://nodejs.org")
# build_reel.py nests f-strings with the same quotes (Python 3.12+): macOS's own /usr/bin/python3 (3.9) stops with a SyntaxError
pyv = ".".join(map(str, sys.version_info[:3]))
if sys.version_info >= (3, 12): ok(f"Python {pyv}")
else: no(f"Python 3.12 or newer (found {pyv})", "macOS: brew install python; Windows: https://python.org (tick 'Add to PATH')")
if WIN: warn("Windows", "macOS is the tested platform; the person cut-out needs RVM here (no Apple Vision)")
elif sys.platform != "darwin": warn("not macOS", "macOS is the tested platform; Linux is untested")

hf = any((Path.home() / d).is_dir() for d in (".claude/skills/hyperframes", ".agents/skills/hyperframes"))   # either location is fine
ok("HyperFrames skills") if hf else no("HyperFrames skills", "npx skills add heygen-com/hyperframes")

here = Path(__file__).resolve().parent
gsap = here.parent / "engine/gsap.min.js"
if gsap.exists() and gsap.stat().st_size: ok("reel template engine")
elif subprocess.run([sys.executable, str(here / "setup_engine.py")], capture_output=True).returncode == 0: ok("reel template engine (just set up)")
else: no("reel template engine", "python3 scripts/setup_engine.py")

if not shutil.which("deepFilter"):
    warn("DeepFilterNet not installed", "noise removal falls back to ffmpeg's weaker filter. Install: uv tool install deepfilternet --with torch --with torchaudio")
elif subprocess.run(["deepFilter", "--help"], capture_output=True).returncode == 0: ok("noise removal (DeepFilterNet)")
else: warn("DeepFilterNet is installed but broken (often missing torch)", "falls back to ffmpeg's filter. Fix: uv tool install --force deepfilternet --with torch --with torchaudio")

home = Path(os.environ.get("REELS_HOME", Path.home() / "reels"))
if (home / "brand.json").exists():
    ok(f"brand file ({home})")
    # every font the brand names must exist, or captions silently fall back to a system font
    for role, f in (json.load(open(home / "brand.json")).get("fonts") or {}).items():
        p = f.get("file")
        if p and not os.path.exists(os.path.expanduser(p)):
            print(f"  ⚠️  {role} font file missing: {p}\n     captions/titles will use a fallback font until it's in place"); state["limits"] = 1
        elif p: print(f"  ✅ {role} font ({f.get('family')})")
else: print("  ➖ no brand file yet - the setup interview will make one")
print("  ℹ️  the review page needs Claude Code's Artifact tools; Claude checks this when you start an edit (chat review otherwise)")

free = shutil.disk_usage(Path.home()).free // 2**30
ok(f"{free} GB free disk") if free >= 10 else no(f"only {free} GB free disk", "free up 10+ GB (35+ GB for 4K exports)")

if state["missing"]: sys.exit("MISSING: fix the ❌ items, then run this again.")
print("READY WITH LIMITS: you can edit; the ⚠️ items reduce quality or skip an optional extra." if state["limits"] else "READY")
