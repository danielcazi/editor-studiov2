"""Pacing presets: how hard the edit trims. One place, so cut.py, tighten.py and the review page agree.
brand.json "pacing": "natural" (default) | "tight" | "fast". An explicit brand.json "speed" still wins."""

# Portuguese hesitations. Never "é", "tipo" or "um": they are real words in PT ("é" = is, "um" = one).
FILLERS = ["hum", "humm", "hm", "hmm", "ahn", "ah", "hã", "éé", "ééé", "eh", "mm"]

PRESETS = {
    # pauses longer than pause_min get shortened, leaving `air` seconds either side of the cut
    "natural": {"speed": 1.0, "pause_min": 0.6, "air": 0.15, "fillers": FILLERS},
    "tight":   {"speed": 1.1, "pause_min": 0.25, "air": 0.06, "fillers": FILLERS + ["né"]},
    "fast":    {"speed": 1.15, "pause_min": 0.2, "air": 0.05, "fillers": FILLERS + ["né"]},
}

def pacing(brand):
    p = dict(PRESETS.get(brand.get("pacing", "natural"), PRESETS["natural"]))
    if brand.get("speed"): p["speed"] = float(brand["speed"])
    if brand.get("fillers") is not None: p["fillers"] = list(brand["fillers"])   # [] = keep every filler
    return p

def jl_video_spans(spans, frames, fps=30, dur=None):
    """Video trims for J/L cuts: at every real join the picture changes `frames` after the sound (J) or before it (L), alternating.
    The video pieces keep the same total length as the audio ones, so sound and picture stay in sync after the last join.
    A join is left hard when the shift would run off the clip or leave a piece under 0.1 s."""
    d, v, k = frames / fps, [list(s) for s in spans], 0
    for j in range(1, len(spans)):
        s = d if k % 2 == 0 else -d
        a, b = v[j - 1], v[j]
        if spans[j][0] - spans[j - 1][1] < 0.05 or b[0] + s < 0 or (dur is not None and a[1] + s > dur): continue
        if a[1] + s - a[0] < 0.1 or b[1] - (b[0] + s) < 0.1: continue
        a[1] += s; b[0] += s; k += 1
    return v
