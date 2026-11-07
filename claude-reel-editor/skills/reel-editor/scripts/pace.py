#!/usr/bin/env python3
"""Pace gate: measures on the RENDERED video whether the reel keeps changing, or sits still where viewers scroll away.
Usage: python3 pace.py <video> [--mask motion_mask.json] [--words transcript.json]    exit 3 when below the bar

How: the video is read at 10 fps, 108x192 grey. Between neighbouring frames it measures the share of pixels that moved.
  change every   mean gap between visual events (a frame where ≥ EVENT_SHARE of the picture moved)
  frames moving  share of frames with any motion
  holds          stretches with no motion for HOLD s or more (each listed with the words spoken there)
  on a word      share of events within 0.15 s of a word start (info only: needs --words)
The mask (compose/motion_mask.json, written by kit.py) lists the speaker's box per scene: inside it only near-total
changes count (text landing on the chest), so the speaker moving on his own never carries the pace."""
import json, subprocess, sys
import numpy as np

W, H, FPS = 108, 192, 10
# shortcut: limiares iniciais, tirados do DIRETOR.md (nada parado > 1 s, ~1,5 s por estímulo); calibrar após três reels reais
BAR = dict(every=1.5, moving=0.80, hold=1.2)
EVENT_SHARE, EVENT_GAP, MOVING_LEVEL, PX, MASK_PX = 0.20, 0.3, 0.004, 24, 90


def grey_frames(video):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.int16)


def masks(entries):
    """[(t0, counted, rescued)]: counted = pixels measured in full; rescued = speaker box, measured only on near-total change."""
    out = []
    for e in entries:
        counted = np.ones((H, W), bool)
        for x, y, w, h in e.get("ignore", []):
            k = W / 1080
            counted[max(0, int(y * k)):int((y + h) * k + 1), max(0, int(x * k)):int((x + w) * k + 1)] = False
        out.append((e.get("t0", 0), counted, ~counted))
    return out


def measure(frames, plan, words):
    energy, share = [], []
    for n in range(len(frames) - 1):
        t = (n + 1) / FPS
        counted, rescued = next(((c, r) for t0, c, r in reversed(plan) if t >= t0 - 1e-3), (np.ones((H, W), bool), np.zeros((H, W), bool)))
        diff = np.abs(frames[n + 1] - frames[n])
        moved = (diff > PX) & counted | (diff > MASK_PX) & rescued
        share.append(moved.mean())
        energy.append((diff * moved).mean() / 255)
    times = np.arange(1, len(frames)) / FPS
    events, last = [], -9.0
    for t, s in zip(times, share):
        if s >= EVENT_SHARE and t - last >= EVENT_GAP: events.append(float(t)); last = t
    holds, start = [], None
    for t, e in zip(times, energy):
        if e < MOVING_LEVEL: start = t if start is None else start
        elif start is not None:
            if t - start >= BAR["hold"]: holds.append((start, t))
            start = None
    if start is not None and times[-1] - start >= BAR["hold"]: holds.append((start, float(times[-1])))
    length = len(frames) / FPS
    on_word = [e for e in events if any(abs(e - w["start"]) <= 0.15 for w in words)]
    return dict(length=length, every=length / max(1, len(events)), moving=float((np.array(energy) >= MOVING_LEVEL).mean()),
                holds=holds, events=events, on_word=len(on_word) / max(1, len(events)) if words else None)


def spoken(words, a, b):
    return " ".join(w["text"] for w in words if w["end"] > a and w["start"] < b)


def main():
    args = sys.argv[1:]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    if opt("--every"): BAR["every"] = float(opt("--every"))   # the reel's pace toggle (compose.json pace.every); default is the dinamico bar
    video, words = args[0], json.load(open(opt("--words"))) if opt("--words") else []
    plan = masks(json.load(open(opt("--mask")))) if opt("--mask") else []
    m = measure(grey_frames(video), plan, words)
    rows = [(m["every"] <= BAR["every"], "change every", f'{m["every"]:.2f} s', f'≤ {BAR["every"]} s'),
            (m["moving"] >= BAR["moving"], "frames moving", f'{m["moving"] * 100:.0f} %', f'≥ {BAR["moving"] * 100:.0f} %'),
            (not m["holds"], f'holds ≥ {BAR["hold"]} s', str(len(m["holds"])), "0")]
    print(f'pace      {m["length"]:.1f} s' + (" (speaker masked)" if plan else "") + (f', {m["on_word"] * 100:.0f} % of events on a word' if m["on_word"] is not None else ""))
    for ok, label, value, target in rows: print(f'  {"✓" if ok else "✗"} {label:<16} {value:<9} target {target}')
    for a, b in m["holds"][:10]: print(f'    hold {a:5.1f}-{b:5.1f}s  "{spoken(words, a, b)}"   (give it a beat on a word: a pop, a count, a new card, a cut)')
    ok = all(r[0] for r in rows)
    print("PASS" if ok else "BELOW THE BAR")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
