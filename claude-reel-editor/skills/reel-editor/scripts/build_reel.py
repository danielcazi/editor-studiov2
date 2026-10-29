#!/usr/bin/env python3
"""Turn edit.json + brand.json into a HyperFrames project (one fixed template, no per-reel installs), ready to render.
Usage: python3 build_reel.py <reel-folder>

edit.json (written by auto_edit.py, then Claude marks accents and adds cards):
  captions: [{start, end, words: [{text, t, accent}], plain?}]   plain = basic white sans (a "before" look), not brand
  punch:    [seconds | [seconds, scale]]    quick zoom-ins on the camera (alternate in/out; [t, 1.25] forces a level)
  cards:    [{type, start, end, ...}]       types:
     (every card: leave out "end" and it clears when the phrase it starts in finishes)
     shot   {src: "shots/tool.png", label: "heyclicky.com", y?: 130}   website screenshot in a browser window (make it with screenshot.sh);
                                                     set y lower (e.g. 1000) when the face sits high in frame
     image  {src: ["a.png", "b.jpg"]}               1-3 images fanned out above the head (their own photos, screenshots, stock)
     sticker {src: "sticker.png", x: 760, y: 420, size: 260}  transparent PNG that bounces on (brand stickers, emoji, logos)
     motion {name: "carousel-vision-1", vars: {...}, box: [x, y, w, h]}   any HyperFrames catalog motion cached in
                                                     engine/hf (see references/motions.md for names + vars). Carousels take
                                                     images: {"images": ["a.png", ...]} and the slots are filled for you.
     custom {html, css, js, sfx?}                    one-off motion written by Claude (validated by server/validate.ts):
                                                     css is scoped to the card, js runs as fn(tl, T, el) with T = card start
     follow {words: [{text, accent}], framing: "wide"}   caption-camera-follow in brand colours/font: one sentence
                                                     written word by word across a camera that pulls back (hook moments)
  Image paths: relative to the reel folder, or to ~/reels/assets/, or absolute.
"""
import html, json, math, os, re, shutil, subprocess, sys
from pathlib import Path

reel = Path(sys.argv[1]).expanduser()
HOME = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
ENGINE = Path(__file__).resolve().parent.parent / "engine"
brand = json.load(open(HOME / "brand.json"))
edit = json.load(open(reel / "edit.json"))

C = brand["colors"]
MAIN, POP, LIGHT = C["main"], C["pop"], C.get("light", "#FFFFFF")
CAPS = brand.get("captions", {})
CASE = CAPS.get("case", "lower")
# captionStyle (SPEC §2): preset + font role, size, color, highlight, y, case, maxWords; each falls back to the fork's keys
CS = brand.get("captionStyle") or {}
PRESET = CS.get("preset") or None              # word-pop | karaoke | block | minimal; none = the fork's phrase + accent look
# captionStyle.anim (SPEC ajustes 4): the preset is only a starting point (anim-presets.json, next to SKILL.md); anim overrides it field by field.
# "from" replaces the preset's whole start state instead of merging into it. Validated by server/validate.ts; the checks below only keep a hand-edited brand.json from injecting JS into the timeline.
def _merge(a, b):
    return {**a, **{k: _merge(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) and k != "from" else v for k, v in b.items()}}
_presets = json.load(open(os.environ.get("REEL_ANIM_PRESETS") or Path(__file__).resolve().parent.parent / "anim-presets.json")) if PRESET else {}   # read only when a preset is used
ANIM = _merge(_presets[PRESET] if PRESET else {"unit": "word", "maxWords": 4, "in": {"type": "none"}}, CS.get("anim") or {}) if PRESET or CS.get("anim") else None
CAP, CAP_ACC = CS.get("color") or C.get("caption", "#FFFFFF"), CS.get("highlight") or C.get("caption_accent", POP)
CAP_PX, CAP_Y = CS.get("size") or CAPS.get("size", 96), CS.get("y") or CAPS.get("y", 1250)
CAP_FONT, CAP_CASE = CS.get("font") or "body", CS.get("case") or CASE
W, H, FPS = 1080, 1920, 30                     # overlays authored at 1080x1920
# output format (SPEC §3 step 5): the camera fills the frame (cover = zoom, no bars); the 9:16 overlays are scaled to
# the frame height and centred. The composition is the frame, always Full HD.
OUT = {"16:9": (1920, 1080), "9:16": (1080, 1920), "4:3": (1440, 1080), "1:1": (1080, 1080), "4:5": (1080, 1350)}[os.environ.get("REEL_FORMAT", "9:16")]
OW, OH = OUT
S = min(OW / W, OH / H)                        # shortcut: overlays keep the 9:16 layout (smaller off 9:16); per-format layouts when needed
DX, DY = (OW - W * S) / 2, (OH - H * S) / 2
# panel layouts (Explainer Panel): the talking head lives in a rounded frame on the bottom 40%, cards own the top 60%
PANEL = os.environ.get("REEL_LAYOUT") == "bottom-panel-60-40" and OUT == (1080, 1920)
# tier list (Ranking): the S-F table sits low (bottom 100 px free); the speaker is framed in the top 1400 px so the face
# rises clear of the item cards, and a black gradient strip covers the bottom where the camera box ends
TIER = os.environ.get("REEL_LAYOUT") == "tier-list-bottom" and OUT == (1080, 1920)
TIER_ROW, TIER_TOP, TIER_CAM = 100, 1920 - 100 - 6 * 100, 1400
# split (Split Reel): the speaker always fills the top half; the bottom half is dark with a soft glow in the brand pop colour,
# where the diagram cards live; captions sit on the seam between the halves
SPLIT = os.environ.get("REEL_LAYOUT") == "split-horizontal" and OUT == (1080, 1920)
# cluster (Image Cluster): the speaker sits low (bottom 1360 px) and fades into black at the top, where image clusters float above the head
CLUSTER = os.environ.get("REEL_LAYOUT") == "cluster-floating" and OUT == (1080, 1920)
# widgets (Personal Reels): the cut-out stays on over the full video, so cards marked "behind" sit between the room and the person
WIDGETS = os.environ.get("REEL_LAYOUT") == "cutout-widgets" and OUT == (1080, 1920)
# full editorial (Fitted Captions): kinetic words that alternate between behind the cut-out and over it
EDITORIAL = os.environ.get("REEL_LAYOUT") == "full-editorial" and OUT == (1080, 1920)
# split-dynamic (Business Reels): the cut-out is the presenter, so it stays on; before this flag the layout was unknown and the cut-out stayed hidden
SPLIT_DYNAMIC = os.environ.get("REEL_LAYOUT") == "split-dynamic" and OUT == (1080, 1920)
PERSON_FRONT = WIDGETS or EDITORIAL or SPLIT_DYNAMIC     # the cut-out stays on over the whole video, so "behind" cards work
FW, FH = (OW, 768) if PANEL else (OW, TIER_CAM) if TIER else (OW, 960) if SPLIT else (OW, 1360) if CLUSTER else (OW, OH)   # the camera box: panel frame, tier/split top area, cluster bottom area, or the whole picture
FY = 0 if TIER or SPLIT else OH - FH
ZOOM = float(os.environ.get("REEL_ZOOM", 1))    # format camera.zoomFactor: the main picture is cover x ZOOM, which also gives the nose room to pan
if os.environ.get("REEL_SAFE_BOTTOM"): CAP_Y = min(CAP_Y, int(1920 - float(os.environ["REEL_SAFE_BOTTOM"]) / S - 2 * CAP_PX))   # format safeZones.bottom (output px -> overlay px)
# tier list (Ranking): empty S-F table over the full-screen camera, above the bottom IG zone; classic tier colours, never brand
if TIER: CAP_Y = TIER_TOP - 2 * CAP_PX
TIER_CARD = TIER_TOP - 260 - 70                # item card top: on the chest, between the face and the table
TIER_FILL = [0] * 6                            # thumbnails already placed per row (S..F)
if SPLIT: CAP_Y = 960 - int(CAP_PX * 0.6)
if PANEL: CAP_Y = FY - 92   # the format owns the layout; brand y is always filled in by the editor, so it can't be told from a choice
SAFE = 900                                     # guardrail: no text line may be wider than this (90 px margin each side)
EM = 0.66                                      # conservative average glyph width (bold display fonts run ~0.6-0.66 em)
def fit(text, want, extra=0):
    """Largest size <= want at which `text` stays inside the safe area (extra = outline px on each side)."""
    return max(24, min(int(want), int((SAFE - 2 * extra) / (max(len(text), 1) * EM))))

def dur_of(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True, check=True).stdout)
DUR = round(dur_of(reel / "master.mp4") - 0.02, 2)

# ---- crop: the camera covers the frame and the nose is the guide line for its centre (both axes, clamped to the picture)
SW, SH = (int(x) for x in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                          "-of", "csv=p=0", str(reel / "master.mp4")], capture_output=True, text=True, check=True).stdout.strip().split(","))
def nose_track():
    """[[t, x, y]] of the nose (0-1) from nose.swift, cached in nose.json per master; [] without a face or without macOS Vision."""
    m = (reel / "master.mp4").stat(); key = f"{m.st_size}:{int(m.st_mtime)}"
    cache = reel / "nose.json"
    if cache.exists() and json.load(open(cache)).get("key") == key: return json.load(open(cache))["track"]
    try:
        track = json.loads(subprocess.run(["swift", str(Path(__file__).resolve().parent / "nose.swift"), str(reel / "master.mp4")],
                                          capture_output=True, text=True, check=True).stdout)["track"]
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError):
        print("warning: no nose track (needs macOS swift + Vision): the crop stays centred"); track = []
    json.dump({"key": key, "track": track}, open(cache, "w"))
    return track
NOSE = [] if os.environ.get("REEL_CAMERA_MODE") == "fixed-center" else nose_track()
def smooth(a, b=None):
    """Median nose (x, y) over [a, b], or the 5-sample median around a; the frame centre when no face was seen."""
    pts = [p for p in NOSE if a <= p[0] <= b] if b is not None else sorted(NOSE, key=lambda p: abs(p[0] - a))[:5]
    med = lambda v: sorted(v)[len(v) // 2]
    return (med([p[1] for p in pts]), med([p[2] for p in pts])) if pts else (0.5, 0.5)
def centre(nx, ny, bw, bh, z=1):
    """Offset (px) of a cover-scaled master inside a bw x bh box that puts the nose on the box centre."""
    s = max(bw / SW, bh / SH) * z; vw, vh = SW * s, SH * s
    return min(0, max(bw - vw, bw / 2 - nx * vw)), min(0, max(bh - vh, bh / 2 - ny * vh)), vw, vh
q = lambda t: round(round(max(t, 0) * FPS) / FPS, 4)
esc = lambda s: html.escape(s, quote=False)
def cnum(v, d=None):
    """Numeric card fields go into inline CSS and JS: coerce them, never paste the raw value (validate.ts checks them too)."""
    try: f = float(v)
    except (TypeError, ValueError): return d
    return d if not math.isfinite(f) else int(f) if f == int(f) else f
case = lambda s: s.lower() if CASE == "lower" else s

# ---- project folder: template files are copied, never installed -------------------------------------------------
proj = reel / "proj"
if proj.exists(): shutil.rmtree(proj)
(proj / "fonts").mkdir(parents=True); (proj / "sfx").mkdir(); (proj / "vendor").mkdir()
shutil.copy(ENGINE / "gsap.min.js", proj / "vendor/gsap.min.js")
try: os.link(reel / "master.mp4", proj / "master.mp4")
except OSError: shutil.copy(reel / "master.mp4", proj / "master.mp4")
for f in (ENGINE / "sfx").glob("*.wav"): shutil.copy(f, proj / "sfx" / f.name)
(proj / "img").mkdir()
HF = ENGINE / "hf"
if any(k["type"] in ("motion", "follow") for k in edit.get("cards", [])):
    (proj / "compositions/components").mkdir(parents=True); shutil.copytree(HF / "assets", proj / "assets", dirs_exist_ok=True)
def mount(src):
    """Copy one cached motion into the reel, minus any audio it ships with (our own sound effects do that job)."""
    rel = src.relative_to(HF).as_posix()
    (proj / rel).write_text(re.sub(r"<audio[^>]*>(</audio>)?", "", src.read_text()))
    return rel
def img(src):
    """Copy an image into the project and return its path there. Looks in the reel folder, ~/reels/assets/, then as given."""
    for cand in (reel / src, HOME / "assets" / src, Path(src).expanduser()):
        if cand.exists() and cand.suffix.lower() == ".svg":   # ffmpeg can't decode SVG; the browser renders it (sanitised on upload)
            dst = proj / "img" / f"{len(list((proj / 'img').iterdir()))}_{re.sub(r'[^\w.-]', '_', cand.name)}"
            shutil.copy(cand, dst); return f"img/{dst.name}"
        if cand.exists():
            dst = proj / "img" / f"{len(list((proj / 'img').iterdir()))}_{re.sub(r'[^\w.-]', '_', cand.stem)}.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(cand), "-vf", "scale='min(1280,iw)':-2", str(dst)], check=True)
            return f"img/{dst.name}"
    print(f"warning: image not found: {src}"); return ""

# fonts: brand.json "fonts": {"head": {...}, "body": {...}, "accent": {...}}, each {family, file?, weight?, style?}
FALLBACK = "'Helvetica Neue', Helvetica, Arial, sans-serif"   # single quotes: these go inside style="..." attributes
font_css, FAM = [], {}
for role, default in (("head", {"family": "Helvetica Neue", "weight": 700}), ("body", {"family": "Helvetica Neue", "weight": 500}),
                      ("accent", {"family": "Georgia", "weight": 400, "style": "italic"})):
    f = {**default, **brand.get("fonts", {}).get(role, {})}
    if f.get("file"):
        src = Path(f["file"]).expanduser()
        if src.exists():
            shutil.copy(src, proj / "fonts" / src.name)
            fmt = {"otf": "opentype", "ttf": "truetype", "woff2": "woff2", "woff": "woff"}.get(src.suffix[1:].lower(), "opentype")
            font_css.append(f'@font-face {{ font-family: "{f["family"]}-{role}"; src: url("fonts/{src.name}") format("{fmt}"); font-display: block; }}')
            f["family"] = f'{f["family"]}-{role}'
        else:
            print(f"warning: font file not found, using fallback: {src}")
    FAM[role] = (f"'{f['family']}', {FALLBACK}", f.get("weight", 400), f.get("style", "normal"))
def font(role, px):
    fam, wt, st = FAM[role]
    return f"font-family:{fam};font-weight:{wt};font-style:{st};font-size:{px}px"

back, mid, front, audio, js = [], [], [], [], []
under = []                                      # behind the speaker: backdrop cards (only with the cut-out layer)
behind = []                                     # between the full video and the cut-out: cards marked "behind" (widgets layout)
CUTOUT = bool(os.environ.get("REEL_CUTOUT")) and (reel / "cutout.webm").exists()
if CUTOUT: shutil.copy(reel / "cutout.webm", proj / "cutout.webm")
n_sfx = 0
def sfx(name, t, db=-12, level="subtle", dur=None):
    """Subtle, ASMR-clean accents: every effect sits 10-15 dB under the voice (db = level relative to full scale).
    level = lowest brand sfx setting that still plays it."""
    global n_sfx
    global CARD_SFX
    name = {"coin": "chime", "sparkle": "chime"}.get(name, name)   # engine/sfx has no coin or sparkle file
    if CARD_MUTE: return                                  # this graphic's sound was switched off in the review
    if CARD_SFX and level == "subtle":                    # the sound approved in the review replaces the entrance sound
        name, db = {"sparkle": "chime"}.get(CARD_SFX["name"], CARD_SFX["name"]), CARD_SFX.get("db", db)
        CARD_SFX = None
    if brand.get("sfx", "subtle") == "none" or (level == "lots" and brand.get("sfx") != "lots") or t >= DUR: return
    vol = round(min(1.0, 10 ** ((db + brand.get("sfx_gain_db", 8)) / 20)), 3)   # +8 dB: clearly audible under a voice with no music bed
    p = proj / "sfx" / f"{name}.wav"
    if not p.exists(): return
    n_sfx += 1
    d = min(dur or dur_of(p), dur_of(p), DUR - t)
    audio.append(f'<audio id="sx{n_sfx}" src="sfx/{name}.wav" data-start="{q(t)}" data-duration="{q(d)}" '
                 f'data-track-index="{500 + n_sfx}" data-volume="{vol}"></audio>')   # 500+: cards use 40+ and 60+, so sounds never share a track
CARD_MUTE = False
CARD_SFX = None
def show(sel, a, b, fade=0.18):
    b = max(b, a + 0.12); fade = min(fade, (b - a) / 2)              # very short words: keep the fade after the reveal
    js.append(f'tl.set("{sel}",{{autoAlpha:1}},{q(a)});tl.to("{sel}",{{autoAlpha:0,duration:{fade}}},{q(b - fade)});')

# ---- nose follow: the main camera pans so the nose stays on the frame centre; a 1.5% dead zone per axis stops twitching
px0, py0, VW, VH = centre(*smooth(0), FW, FH, ZOOM)
js.append(f'tl.set("#pan,#pan2",{{x:{px0:.1f},y:{py0:.1f}}},0);')
for t, _, _ in NOSE:
    x, y, _, _ = centre(*smooth(t), FW, FH, ZOOM)
    if (abs(x - px0) > 0.015 * FW or abs(y - py0) > 0.015 * FH) and t < DUR:
        js.append(f'tl.to("#pan,#pan2",{{x:{x:.1f},y:{y:.1f},duration:0.45,ease:"sine.inOut"}},{q(max(0, t - 0.2))});'); px0, py0 = x, y

# ---- camera punch-ins ---------------------------------------------------------------------------------------------
PUNCH = list(edit.get("punch", []))
if os.environ.get("REEL_PUNCH"):                 # format punchIns "min,max,scale" replaces auto_edit's: zoom in, hold half an interval, zoom out
    PUNCH = []
    lo, hi, zs = (float(x) for x in os.environ["REEL_PUNCH"].split(","))
    if lo + hi <= 0: sys.exit("REEL_PUNCH: the min and max interval must add up to more than 0")   # else the loop below never ends
    t = (lo + hi) / 2
    while t < DUR - 0.5: PUNCH += [[t, zs], [t + (lo + hi) / 4, 1.0]]; t += (lo + hi) / 2
for k, t in enumerate(PUNCH):   # [t, scale] forces a zoom level (e.g. a spoken "zoom in")
    t, z = t if isinstance(t, list) else (t, 1.0 if k % 2 else 1.07)
    js.append(f'tl.to("#cam",{{scale:{z},duration:0.22,ease:"power3.out",overwrite:"auto"}},{q(t)});')

# ---- cards --------------------------------------------------------------------------------------------------------
# Phrases from the cut's transcript: a phrase ends at punctuation or a gap over 0.35 s. A card with no "end" clears
# when the phrase it starts in finishes (min 1 s on screen), so overlays leave with their line.
_tw = json.load(open(reel / "master_transcript.json")) if (reel / "master_transcript.json").exists() else []
PHRASE_ENDS = [w["end"] for k, w in enumerate(_tw) if re.search(r"[.,!?;:]$", w["text"]) or k + 1 == len(_tw)
               or _tw[k + 1]["start"] - w["end"] > 0.35]
def phrase_end(t):
    return next((e + 0.15 for e in PHRASE_ENDS if e > t + 1.0), min(t + 2.5, DUR))

quiet = []                                      # spans where a card carries its own words, so captions step aside
covered = []                                    # spans where a card sits on the caption line: any caption overlapping it steps aside
for i, c in enumerate(edit.get("cards", [])):
    CARD_MUTE = c.get("sfx") is False
    CARD_SFX = c.get("sfx") if isinstance(c.get("sfx"), dict) else None
    a, b, cid = c["start"], c.get("end") or phrase_end(c["start"]), f"k{i}"
    b = min(b, DUR)
    # Regra de Ouro da Dupla Verificação (Editor 7.0):
    # Qualquer card ativo silencia a legenda simples naquele intervalo para evitar duplicação
    if c["type"] == "backdrop" and not CUTOUT: continue    # needs the person cut-out; without it the plain picture stays
    if c["type"] == "tier" and not TIER: continue          # needs the tier table (Ranking layout)
    if c.get("quiet", c["type"] not in ("backdrop", "broll") and not SPLIT):   # split: diagrams own the bottom half, captions keep the seam
        quiet.append((a, b))
    kind = c["type"]
    nb, nm, nf = len(back), len(mid), len(front)
    if kind == "shot":
        if cnum(c.get("y"), 130) + 700 > CAP_Y: quiet.append((a, b))         # screenshot covers the caption zone: captions step aside
        front.append(f'<div id="{cid}" class="shot" style="top:{cnum(c.get("y"), 130)}px"><div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i>'
                     f'<span style="{font("body", 30)}">{esc(c.get("label", ""))}</span></div><div class="vp"><img src="{img(c["src"])}" /></div></div>')
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid}",{{y:-200,scale:0.8,rotation:3}},{{y:0,scale:1,rotation:1.5,duration:0.55,ease:"back.out(1.5)"}},{q(a)});'
                  f'tl.fromTo("#{cid} img",{{y:0}},{{y:-120,duration:{max(b - a - 0.8, 0.5):.2f},ease:"sine.inOut"}},{q(a + 0.6)});')
        sfx("swish", a - 0.05, -12); sfx("typing", a + 0.5, -17, dur=0.8)
    elif kind == "image":
        srcs = c["src"] if isinstance(c["src"], list) else [c["src"]]
        if not 1 <= len(srcs) <= 5 or not all(srcs):
            print(f"warning: image card {cid} needs 1 to 5 image paths - skipped"); continue
        if CLUSTER:   # 3-5 smaller photos spread over the black top, alternating height and tilt
            n = min(len(srcs), 5); srcs = srcs[:n]
            spots = [(int(200 + k * 680 / max(n - 1, 1)), (-7, 6)[k % 2], (0, 110)[k % 2]) for k in range(n)]
            front.append(f'<div id="{cid}" class="imgs">' + "".join(
                f'<img class="ph" src="{img(s)}" style="left:{x - 150}px;top:{y}px;width:300px;height:370px;transform:rotate({r}deg)" />' for s, (x, r, y) in zip(srcs, spots)) + "</div>")
        else:
            spots = {1: [(540, 0)], 2: [(380, -6), (700, 7)], 3: [(300, -8), (540, 3), (780, 9)]}[min(len(srcs), 3)]
            front.append(f'<div id="{cid}" class="imgs">' + "".join(
                f'<img class="ph" src="{img(s)}" style="left:{x - 210}px;transform:rotate({r}deg)" />' for s, (x, r) in zip(srcs, spots)) + "</div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .ph",{{y:-260,opacity:0,scale:0.7}},{{y:0,opacity:1,scale:1,duration:0.5,ease:"back.out(1.7)",stagger:0.18}},{q(a)});')
        sfx("swish", a, -13)
    elif kind == "tier":   # {tier, text, src?}: item card above the table; at "end" (the grade) it shrinks into its row and stays
        if c["tier"] not in ("S", "A", "B", "C", "D", "F"):
            print(f"warning: tier card {cid} has tier {c['tier']!r}, expected S A B C D or F - skipped"); continue
        covered.append((a, b))
        row = "SABCDF".index(c["tier"]); slot = TIER_FILL[row]; TIER_FILL[row] += 1
        face = f'<img src="{img(c["src"])}"/>' if c.get("src") else f'<div class="tf" style="{font("head", fit(c["text"], 64))}">{esc(c["text"])}</div>'
        front.append(f'<div id="{cid}" class="tc">{face}{f'<div class="tn" style="{font("head", fit(c["text"], 44))}">{esc(c["text"])}</div>' if c.get("src") else ""}</div>')
        s_ = (TIER_ROW - 12) / 260                         # 260 px square -> 88 px thumbnail
        dx, dy = 70 + TIER_ROW + 8 + slot * (TIER_ROW - 6) - 410, TIER_TOP + row * TIER_ROW + 6 - TIER_CARD
        js.append(f'tl.set("#{cid}",{{autoAlpha:1}},{q(a)});tl.fromTo("#{cid}",{{scale:0.6,opacity:0}},{{scale:1,opacity:1,duration:0.35,ease:"back.out(1.7)"}},{q(a)});'
                  + (f'tl.to("#{cid} .tn",{{opacity:0,duration:0.15}},{q(b - 0.5)});' if c.get("src") else "")
                  + f'tl.to("#{cid}",{{x:{dx},y:{dy},scale:{s_:.4f},duration:0.5,ease:"power3.inOut"}},{q(b - 0.5)});')
        sfx("swish", a, -13); sfx("pop", b - 0.1, -14)
    elif kind == "backdrop":   # {src, dim}: picture behind the speaker; the full video hides, the cut-out (#pan2) takes its place
        under.append(f'<div id="{cid}" class="und"><img src="{img(c["src"])}"/><i style="opacity:{cnum(c.get("dim"), 0)}"></i></div>')
        show(f"#{cid}", a, b, 0.2)
        js.append(f'tl.set("#pan",{{opacity:0}},{q(a)});tl.set("#pan2",{{opacity:1}},{q(a)});tl.set("#pan",{{opacity:1}},{q(b)});tl.set("#pan2",{{opacity:{int(PERSON_FRONT)}}},{q(b)});')
    elif kind == "sticker":
        sz = cnum(c.get("size"), 260)
        front.append(f'<div id="{cid}" class="stk" style="left:{cnum(c.get("x"), 760) - sz // 2}px;top:{cnum(c.get("y"), 420) - sz // 2}px;width:{sz}px"><img src="{img(c["src"])}" /></div>')
        show(f"#{cid}", a, b, 0.15)
        js.append(f'tl.fromTo("#{cid}",{{scale:0,rotation:-25}},{{scale:1,rotation:{cnum(c.get("rotate"), 6)},duration:0.5,ease:"back.out(3)"}},{q(a)});')
        sfx("pop", a, -13)
    elif kind == "motion":
        src = next((f for f in (HF / "compositions").rglob(f"{c['name']}.html")), None)
        if not src:
            print(f"warning: motion {c['name']!r} not cached - add it: cd {HF} && npx hyperframes add {c['name']}"); continue
        rel = mount(src); txt = src.read_text()
        comp_id = re.search(r'data-composition-id="([^"]+)"', txt).group(1)
        nw, nh = (int(re.search(r'data-width="(\d+)"', txt).group(1)), int(re.search(r'data-height="(\d+)"', txt).group(1))) \
            if re.search(r'data-width="(\d+)"', txt) else (1080, 1080)
        vars_ = dict(c.get("vars", {}))
        if c.get("images"):                              # carousels: fill every image slot, cycling the supplied images
            slots = sorted({int(m) for m in re.findall(r'"id":\s*"image(\d+)"', txt)})
            ims = [img(x) for x in c["images"]]
            for k, sl in enumerate(slots): vars_[f"image{sl}"] = ims[k % len(ims)]
            vars_.setdefault("background", "transparent")
        x, y, bw, bh = [cnum(v, 0) for v in c.get("box") or [0, 160, W, int(W * nh / nw)]]
        sc = bw / nw
        if y + bh * 0.7 > CAP_Y: quiet.append((a, b))   # motion sits over the caption zone: captions step aside
        vals = html.escape(json.dumps(vars_), quote=True)
        mid.append(f'<div id="{cid}" class="clip" data-composition-id="{comp_id}" data-composition-src="{rel}" data-variable-values="{vals}" '
                   f'data-start="{q(a)}" data-duration="{q(b - a)}" data-track-index="{40 + i}" data-width="{nw}" data-height="{nh}" '
                   f'style="position:absolute;left:{x}px;top:{y}px;width:{nw}px;height:{nh}px;transform:scale({sc:.4f});transform-origin:0 0;'
                   f'--brand:{MAIN};--accent:{POP};--accent-2:{C.get("soft", POP)};--surface:{LIGHT};--fg:{MAIN};--muted:{C.get("soft", POP)}"></div>')
        sfx("swish", a - 0.05, -12)
    elif kind == "follow":
        src = HF / "compositions/components/caption-camera-follow.html"
        t = src.read_text()
        words = [{"text": case(w["text"]), **({"accent": True} if w.get("accent") else {})} for w in c["words"]]
        n = max(len(words), 1); dur = b - a
        # every swap must find its target: a changed HyperFrames template would otherwise ship a silently broken card
        if not re.search(r"var WORDS = \[.*?\];", t, flags=re.S): sys.exit("caption-camera-follow template changed: no 'var WORDS' line")
        t = re.sub(r"var WORDS = \[.*?\];", lambda _: "var WORDS = " + json.dumps(words) + ";", t, flags=re.S)  # lambda: json \u escapes break the template
        fam = FAM["head"][0].replace("'", '"')
        swaps = [("var DUR = 9;", f"var DUR = {dur:.2f};"), ("var STEP = 0.52;", f"var STEP = {max(0.22, (dur - 1.2) / n):.3f};"),
                 ('var ACCENT = ACCENTS[pick(ACCENTS, vars.accent, "gold")];', f'var ACCENT = "{CAP_ACC}";'),
                 ('data-duration="9"', f'data-duration="{dur:.2f}"'),
                 ('font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;', f"font-family: {fam};"),
                 ("'font-family:\"Helvetica Neue\",Helvetica,Arial,sans-serif;font-weight:700;'", "'font-family:" + fam.replace('"', '\\"') + ";font-weight:700;'")]
        if CASE == "lower": swaps += [("text-transform: uppercase;", "text-transform: none;"), ('"text-transform:uppercase;', '"text-transform:none;')]
        for old, new in swaps:
            if old not in t: sys.exit(f"caption-camera-follow template changed: {old[:50]!r} not found")
            t = t.replace(old, new)
        t = t.replace("<style>", "<style>\n" + "\n".join(font_css), 1)   # sub-compositions need their own @font-face
        out = proj / "compositions" / f"follow-{i}.html"; out.write_text(t)
        vals = html.escape(json.dumps({"framing": c.get("framing", "wide"), "smear": c.get("smear", "subtle")}), quote=True)
        front.append(f'<div id="{cid}" class="clip" data-composition-id="caption-camera-follow" data-composition-src="compositions/follow-{i}.html" '
                     f'data-variable-values="{vals}" data-start="{q(a)}" data-duration="{q(dur)}" data-track-index="{40 + i}" '
                     f'style="position:absolute;inset:0;width:{W}px;height:{H}px"></div>')
        quiet.append((a, b)); sfx("sparkle", a, -12)
    elif kind == "custom":
        css = re.sub(r"(^|})\s*([^{}@]+){", lambda m: m.group(1) + ",".join(f"#{cid} {s.strip()}" for s in m.group(2).split(",")) + "{", c.get("css", ""))
        mid.append(f'<div id="{cid}" class="custom" style="position:absolute;inset:0;--main:{MAIN};--pop:{POP};--light:{LIGHT};--cap:{CAP};--cap-accent:{CAP_ACC}">'
                   f'<style>{css}</style>{c["html"]}</div>')
        show(f"#{cid}", a, b)
        js.append(f'(function(tl,T,el){{{c.get("js", "")}}})(tl,{q(a)},document.getElementById("{cid}"));')
        sfx("swish", a - 0.05, -12)
    elif kind == "broll":   # {src: image or video}: the creator's own footage over the whole frame; the presenter is gone, the voice and captions stay
        src = next((p for p in (reel / c["src"], HOME / "assets" / c["src"], Path(c["src"]).expanduser()) if p.exists()), None)
        if src is None: print(f"warning: b-roll not found: {c['src']}"); continue
        if src.suffix.lower() in (".mp4", ".mov", ".webm", ".m4v"):
            shutil.copy(src, proj / "img" / f"br{i}{src.suffix.lower()}")
            face = f'<video class="clip" src="img/br{i}{src.suffix.lower()}" muted playsinline data-start="{q(a)}" data-duration="{q(b - a)}" data-track-index="{60 + i}"></video>'
        else:
            face = f'<img src="{img(c["src"])}"/>'
        mid.append(f'<div id="{cid}" class="broll">{face}</div>')
        show(f"#{cid}", a, b, 0.08)
    else:
        print(f"warning: unknown card type {kind!r} - skipped")
    if c.get("behind", False) and PERSON_FRONT and CUTOUT:     # move what this card added into the layer under the cut-out
        behind.extend(back[nb:] + mid[nm:] + front[nf:]); del back[nb:], mid[nm:], front[nf:]

CARD_MUTE = False
# ---- brand rule: every edit has a carousel (unless the person said no for this reel) --------------------------------
if brand.get("require_carousel") and not edit.get("no_carousel_ok") and not any(
        k["type"] == "motion" and "carousel" in k.get("name", "") for k in edit.get("cards", [])):
    sys.exit("brand rule: add a carousel motion card (or ask them; if they say no, set \"no_carousel_ok\": true in edit.json)")

# ---- captions -----------------------------------------------------------------------------------------------------
def regroup(caps, n):
    """Re-chunk the caption words into lines of at most n words (a preset's maxWords). A line also ends at a phrase end
    of the transcript or a pause, and never mixes plain and brand captions. Each word gets its end "e"."""
    flat = []
    for c in caps:
        for k, w in enumerate(c["words"]):
            flat.append({**w, "e": c["words"][k + 1]["t"] if k + 1 < len(c["words"]) else c["end"], "plain": bool(c.get("plain"))})
    out = []
    for k, w in enumerate(flat):
        prev = flat[k - 1] if k else None
        if not out or len(out[-1]["words"]) >= n or w["plain"] != prev["plain"] or w["t"] - prev["e"] > 0.35 \
                or any(prev["t"] < pe <= prev["e"] + 0.05 for pe in PHRASE_ENDS):
            out.append({"start": w["t"], "words": [], "plain": w["plain"]})
        out[-1]["words"].append(w); out[-1]["end"] = w["e"]
    return out
ccase = lambda s: s.upper() if CAP_CASE == "upper" else s.lower() if CAP_CASE == "lower" else s
# ---- anim interpreter: JSON -> GSAP tweens ------------------------------------------------------------------------
EASE = re.compile(r"(power[1-4]|expo|sine|circ)\.(in|out|inOut)|back\.out(\(\d(\.\d)?\))?|elastic\.out|linear|none")
IN_FROM = {"pop": {"opacity": 0, "scale": 0.6, "y": 20}, "fade": {"opacity": 0}, "slide-up": {"opacity": 0, "y": 40},
           "slide-down": {"opacity": 0, "y": -40}, "blur-in": {"opacity": 0, "blur": 12}, "typewriter": {"opacity": 0},
           "scale": {"scale": 0}, "scale-fade": {"opacity": 0, "scale": 0.4}, "slide-scale": {"scale": 0, "y": 40}}
OUT_TO = {"slide-up": {"y": -40}, "slide-down": {"y": 40}, "pop": {"scale": 0.6}, "scale": {"scale": 0}, "blur-in": {"blur": 12}}
REST = {"opacity": 1, "scale": 1, "y": 0, "x": 0, "rotation": 0, "blur": 0}
num = lambda v: int(v) if float(v) == int(float(v)) else float(v)
def ease(e):
    if not EASE.fullmatch(e or "power2.out"): sys.exit(f"captionStyle.anim: ease {e!r} is not in the allowed list")
    return e or "power2.out"
def color(v):
    v = {"@caption": CAP, "@caption_accent": CAP_ACC, **{f"@{k}": x for k, x in C.items()}}.get(v, v) if v else v
    if v and not re.fullmatch(r"#[0-9a-fA-F]{6}", v): sys.exit(f"captionStyle.anim: colour {v!r} must be #rrggbb or an @token")
    return v
def props(d, to=False):
    """{opacity, scale, y, x, rotation, blur} -> GSAP object body; `to` gives the resting values for the same keys."""
    out = []
    for k, v in d.items():
        if k not in REST: sys.exit(f"captionStyle.anim: unknown property {k!r}")
        v = REST[k] if to else num(v)
        out.append(f'filter:"blur({v}px)"' if k == "blur" else f'{"autoAlpha" if k == "opacity" else k}:{v}')
    return ",".join(out)
def anim_in(sel, t, A):
    """Entrance tween of one target at time t."""
    if A.get("type", "none") == "none": return
    frm = A.get("from") or IN_FROM.get(A["type"]) or sys.exit(f"captionStyle.anim: type {A['type']!r} needs a \"from\" (no default for it)")
    js.append(f'tl.fromTo("{sel}",{{{props(frm)}}},{{{props(frm, True)},duration:{num(A.get("duration", 0.2))},ease:"{ease(A.get("ease"))}"}},{q(t + float(A.get("delay", 0)))});')
def anim_caption(i, c, ws):
    """All tweens of one caption line: entrance per unit, active-word highlight, hold, exit."""
    A, IN, ACT, OUT = ANIM, ANIM.get("in") or {}, ANIM.get("active") or {}, ANIM.get("out") or {}
    st = float(A.get("stagger", 0))
    if A.get("unit", "word") == "line":
        anim_in(f"#c{i} .box" if A.get("box") else f"#c{i}", c["start"], IN)
    for k, w in enumerate(ws):
        if A.get("unit", "word") == "char":
            for j in range(len(w["text"])): anim_in(f"#c{i}w{k}c{j}", w["t"] + j * st, IN)
        elif A.get("unit", "word") == "word":
            anim_in(f"#c{i}w{k}", c["start"] + k * st if st else w["t"], IN)
            if A.get("hold") == "word" and IN.get("type", "none") != "none":
                js.append(f'tl.to("#c{i}w{k}",{{autoAlpha:0,duration:0.05}},{q(max(w["t"] + 0.05, w["e"]))});')
        if ACT:
            d, to, sc = num(ACT.get("duration", 0.06)), color(ACT.get("to")), num(ACT.get("scale", 1))
            hi = ("color:" + f'"{to}",' if to else "") + (f"scale:{sc}," if sc != 1 else "")
            lo = ("color:" + f'"{CAP_ACC if A.get("accentWords") and w.get("accent") else CAP}",' if to else "") + ("scale:1," if sc != 1 else "")
            if hi:
                js.append(f'tl.to("#c{i}w{k}",{{{hi}duration:{d}}},{q(w["t"])});'
                          f'tl.to("#c{i}w{k}",{{{lo}duration:{d}}},{q(max(w["t"] + d, w["e"] - d))});')
    if OUT.get("type") in OUT_TO:
        d = num(OUT.get("duration", 0.1))
        js.append(f'tl.to("#c{i}",{{{props(OUT_TO[OUT["type"]])},duration:{d},ease:"{ease(OUT.get("ease"))}"}},{q(max(c["end"] - float(d), c["start"]))});')
CAPTIONS = edit.get("captions", [])
if ANIM:
    CAPTIONS = regroup(CAPTIONS, int(CS.get("maxWords") or ANIM.get("maxWords") or 4))
for i, c in enumerate(CAPTIONS):
    if any(a - 0.05 <= c["start"] < b for a, b in quiet) or any(c["start"] < b and c["end"] > a for a, b in covered): continue
    ws = c["words"]
    plain = c.get("plain")                                             # "before" captions: basic white sans, no brand styling
    if plain:
        front.append(f'<div id="c{i}" class="cap" style="top:{CAP_Y}px;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:500;font-size:46px;letter-spacing:0;color:#fff">{esc(" ".join(w["text"] for w in ws))}</div>')
        show(f"#c{i}", c["start"], c["end"], 0.04); continue
    if ANIM:
        line = " ".join(ccase(w["text"]) for w in ws)
        px = fit(line, CAP_PX * (ANIM.get("sizeMul") or (1.35 if len(ws) == 1 else 1)))
        hl = lambda w: ANIM.get("accentWords") and w.get("accent")                 # otherwise colour by time (active) or box
        chars = lambda w, k: "".join(f'<span id="c{i}w{k}c{j}" style="display:inline-block">{esc(ch)}</span>' for j, ch in enumerate(ccase(w["text"])))
        spans = " ".join(f'<span id="c{i}w{k}" class="w" style="color:{CAP_ACC if hl(w) else CAP}">{chars(w, k) if ANIM.get("unit") == "char" else esc(ccase(w["text"]))}</span>' for k, w in enumerate(ws))
        if ANIM.get("box"):   # the line sits on a solid box in the highlight colour
            spans = f'<span class="box" style="background:{CAP_ACC}">{spans}</span>'
        cls = PRESET or "custom"
        front.append(f'<div id="c{i}" class="cap {cls}{" block" if ANIM.get("box") and cls != "block" else ""}" style="top:{CAP_Y}px;{font(CAP_FONT, int(px))};letter-spacing:{CAPS.get("tracking", -0.02)}em">{spans}</div>')
        out_style = ANIM.get("out") or {}
        show(f"#c{i}", c["start"], c["end"], float(out_style.get("duration", 0.06)) if out_style.get("type", "fade") == "fade" else 0.06)
        anim_caption(i, c, ws)
        continue
    chars = sum(len(w["text"]) + 1 for w in ws)
    px = fit(" ".join(w["text"] for w in ws), CAP_PX * (1.35 if len(ws) == 1 else 1))
    big = 1.7 if CAPS.get("style") == "editorial" else 1.12          # editorial = dramatic size contrast on the emphasis word
    big = min(big, min((fit(w["text"], px * big) / px) for w in ws if w.get("accent")) if any(w.get("accent") for w in ws) else big)
    blk = "display:block;line-height:.95;" if CAPS.get("style") == "editorial" and len(ws) > 1 else ""
    spans = "".join(f'<span class="acc" style="{blk}{font("accent", int(px * big))};color:{CAP_ACC}">{esc(case(w["text"]))}</span> ' if w.get("accent")
                    else f'<span>{esc(case(w["text"]))}</span> ' for w in ws)
    front.append(f'<div id="c{i}" class="cap" style="top:{CAP_Y}px;{font("body", int(px))};color:{CAP};letter-spacing:{CAPS.get("tracking", -0.02)}em">{spans.strip()}</div>')
    show(f"#c{i}", c["start"], c["end"], 0.06)
    js.append(f'tl.fromTo("#c{i}",{{scale:0.86,y:14}},{{scale:1,y:0,duration:0.16,ease:"back.out(2)"}},{q(c["start"])});')

# ---- assemble -----------------------------------------------------------------------------------------------------
doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style>
{chr(10).join(font_css)}
html, body {{ margin: 0; background: #000; overflow: hidden; }}
#stage {{ position: relative; width: {OW}px; height: {OH}px; overflow: hidden; background: {"#000" if CLUSTER else f"radial-gradient(ellipse 80% 45% at 50% 78%, color-mix(in srgb, {POP} 30%, transparent), transparent 70%), #0c0c10" if SPLIT else "#000" if TIER else MAIN}; }}
.design {{ position: absolute; left: {DX:.2f}px; top: {DY:.2f}px; width: {W}px; height: {H}px; transform: scale({S:.4f}); transform-origin: 0 0; overflow: hidden; }}
#cam {{ position: absolute; inset: 0; transform-origin: 50% 38%; }}
#frm {{ position: absolute; left: 0; top: {FY}px; width: {FW}px; height: {FH}px; overflow: hidden;{" border-radius: 44px 44px 0 0;" if PANEL else ""}{" -webkit-mask-image: linear-gradient(transparent, #000 220px);" if CLUSTER else ""} }}
#pan2 {{ opacity: {int(PERSON_FRONT)}; }}
#behind {{ position: absolute; inset: 0; }}
.broll {{ position: absolute; inset: 0; background: #000; }}
.broll > img, .broll > video {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
#tier {{ position: absolute; left: 70px; top: {TIER_TOP}px; width: 940px; border-radius: 14px; overflow: hidden; }}
#tier .tr {{ display: flex; height: {TIER_ROW}px; border-bottom: 3px solid #111; }}
#tarja {{ position: absolute; left: 0; top: {TIER_CAM - 300}px; width: {W}px; height: {1920 - TIER_CAM + 300}px; background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.85) 300px); }}
#tier .tr:last-child {{ border-bottom: 0; }}
#tier b {{ width: {TIER_ROW}px; display: grid; place-items: center; color: #2a2a2a; font: 800 64px {FALLBACK}; }}
.tc {{ position: absolute; left: 410px; top: {TIER_CARD}px; width: 260px; transform-origin: 0 0; }}
.tc > img, .tc .tf {{ width: 260px; height: 260px; object-fit: cover; display: grid; place-items: center; text-align: center; border-radius: 22px; background: {LIGHT}; color: {MAIN}; box-shadow: 0 18px 50px rgba(0,0,0,.4); }}
.tc .tn {{ margin-top: 10px; text-align: center; color: #fff; text-shadow: 0 3px 16px rgba(0,0,0,.6); white-space: nowrap; }}
#tier i {{ flex: 1; background: rgba(66,66,66,.94); }}
#under, #under .und {{ position: absolute; inset: 0; }}
#under .und img {{ width: 100%; height: 100%; object-fit: cover; }}
#under .und i {{ position: absolute; inset: 0; background: #000; }}
#pan, #pan2 {{ position: absolute; left: 0; top: 0; width: {VW:.0f}px; height: {VH:.0f}px; }}
#pan > video, #pan2 > video {{ width: 100%; height: 100%; display: block; }}{" #pan2 > video { object-fit: cover; }" if CUTOUT else ""}
#back, #mid, #front {{ position: absolute; inset: 0; }}
#back > :not(.clip), #mid > :not(.clip), #front > :not(.clip), #behind > :not(.clip) {{ visibility: hidden; opacity: 0; }}   /* .clip = HyperFrames motions, timed by the runtime */
.block {{ position: absolute; inset: 0; }}
.shot {{ position: absolute; left: 70px; top: 130px; width: 940px; border-radius: 26px; overflow: hidden; background: #fff; box-shadow: 0 34px 80px rgba(0,0,0,.3); }}
.bar {{ height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 24px; background: #F2F2F4; color: #555; }}
.bar i {{ width: 18px; height: 18px; border-radius: 50%; display: inline-block; }}
.bar span {{ margin-left: 18px; background: #fff; border-radius: 14px; padding: 6px 22px; }}
.vp {{ height: 620px; overflow: hidden; }}
.vp img {{ width: 100%; display: block; }}
.imgs {{ position: absolute; left: 0; top: 140px; width: {W}px; height: 560px; }}
.ph {{ position: absolute; top: 0; width: 420px; height: 520px; object-fit: cover; border: 12px solid #fff; border-radius: 18px; box-shadow: 0 26px 60px rgba(0,0,0,.28); }}
.stk {{ position: absolute; }}
.stk img {{ width: 100%; display: block; filter: drop-shadow(0 14px 22px rgba(0,0,0,.25)); }}
.cap {{ position: absolute; left: 60px; right: 60px; text-align: center; line-height: 1.02; letter-spacing: -.02em; text-shadow: 0 2px 14px rgba(0,0,0,.3); }}
.cap .w {{ display: inline-block; }}
.cap.block {{ text-shadow: none; }}
.cap .box {{ display: inline; padding: .06em .28em; border-radius: .16em; line-height: 1.25; -webkit-box-decoration-break: clone; box-decoration-break: clone; }}
.cap.minimal {{ text-shadow: 0 1px 8px rgba(0,0,0,.45); }}
.cap .acc {{ text-shadow: 0 0 2px rgba(0,0,0,.25), 0 3px 22px rgba(0,0,0,.5); }}   /* accent colour stays readable over white screens, no outline */
</style></head>
<body>
<div id="stage" data-composition-id="main" data-start="0" data-duration="{DUR}" data-fps="{FPS}" data-width="{OW}" data-height="{OH}">
  <div id="cam"><div id="under">{"".join(under)}</div><div id="frm"><div id="pan"><video id="bg" class="clip" src="master.mp4" playsinline data-has-audio="true" data-start="0" data-duration="{DUR}" data-track-index="1"></video></div>{'<div id="behind">' + "".join(behind) + '</div>' if behind else ""}{'<div id="pan2"><video id="fg" class="clip" src="cutout.webm" muted playsinline data-start="0" data-duration="' + str(DUR) + '" data-track-index="2"></video></div>' if CUTOUT else ""}</div>
    <div class="design"><div id="back">{"".join(back)}</div></div></div>
  {'<div class="design"><div id="tarja"></div><div id="tier">' + "".join(f'<div class="tr"><b style="background:{c}">{t}</b><i></i></div>' for t, c in zip("SABCDF", ("#f4b3e8", "#bdbcf0", "#f7f0a2", "#acdff3", "#cdf0b8", "#f7ab9c"))) + '</div></div>' if TIER else ""}
  <div class="design"><div id="mid">{"".join(mid)}</div>
  <div id="front">{"".join(front)}</div></div>
  {"".join(audio)}
  <script src="vendor/gsap.min.js"></script>
  <script>(function () {{ window.__timelines = window.__timelines || {{}};
    const tl = window.gsap.timeline({{ paused: true }});
    {chr(10).join(js)}
    window.__timelines["main"] = tl; }})();</script>
</div></body></html>"""
(proj / "index.html").write_text(doc)
(proj / "package.json").write_text('{"name":"reel","private":true,"type":"module"}')
print(f"built {proj/'index.html'}: {OW}x{OH}, {DUR}s, {len(edit.get('cards', []))} cards, {len(CAPTIONS)} captions{f" ({PRESET})" if PRESET else ""}, {n_sfx} sounds")
