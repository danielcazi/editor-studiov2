#!/usr/bin/env python3
"""Clean a talking-head voice track: light noise removal (DeepFilterNet + gate), de-essing, gentle EQ + compression, two-pass loudness to -14 LUFS.
Usage: clean_audio.py <clip> <out.wav> [--no-denoise] [--no-loudnorm]   (both ON by default: noise removal for birds, traffic, fans, room hiss; --no-loudnorm keeps the clip's own level)"""
import array, glob, json, math, os, re, shutil, subprocess, sys, tempfile, wave

src_in, out = sys.argv[1], sys.argv[2]
flags = sys.argv[3:]
denoise, loudnorm = "--no-denoise" not in flags, "--no-loudnorm" not in flags
def ff(*a, **kw): return subprocess.run(["ffmpeg", *map(str, a)], **kw)

with tempfile.TemporaryDirectory() as tmp:
    src = f"{tmp}/raw.wav"
    ff("-v", "error", "-y", "-i", src_in, "-vn", "-ac", "1", "-ar", "48000", src, check=True)
    if denoise:
        # capped at 30 dB: light, natural, no underwater artefacts
        dfn = shutil.which("deepFilter")
        if dfn and subprocess.run([dfn, "-a", os.environ.get("DENOISE_DB", "30"), src, "-o", f"{tmp}/dfn"], capture_output=True).returncode == 0 and glob.glob(f"{tmp}/dfn/*.wav"):
            src = sorted(glob.glob(f"{tmp}/dfn/*.wav"))[0]
        else:
            print("note: DeepFilterNet missing or failed, using ffmpeg's built-in denoiser (weaker on birds/traffic)", file=sys.stderr)
            ff("-v", "error", "-y", "-i", src, "-af", "afftdn=nf=-25", f"{tmp}/dn.wav", check=True); src = f"{tmp}/dn.wav"
    # Gate: whatever noise survives between words is pulled down a further ~12 dB (no pumping on speech).
    # Then rumble cut, take out boxiness, add clarity and air, tame harsh "s" sounds (the clarity boost exaggerates them),
    # light 3:1 compression (keeps it natural, not squashed).
    gate = "agate=threshold=0.015:ratio=3:range=0.25:attack=4:release=150," if denoise else ""
    chain = gate + "highpass=f=85,equalizer=f=220:t=q:w=1:g=-2.5,equalizer=f=3200:t=q:w=1:g=2.5,highshelf=f=9000:g=2,deesser=i=0.4:m=0.5:f=0.5,acompressor=ratio=3:threshold=-20dB:attack=5:release=80"
    if loudnorm:
        LN = "loudnorm=I=-14:TP=-1.5:LRA=7"
        r = ff("-hide_banner", "-i", src, "-af", f"{chain},{LN}:print_format=json", "-f", "null", "-", capture_output=True, text=True)
        m = json.loads(re.search(r"^\{.*?^\}", r.stderr + r.stdout, re.S | re.M).group(0))
        chain += f",{LN}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    ff("-v", "error", "-y", "-i", src, "-af", chain, "-ar", "48000", out, check=True)

# Sound-engineer check: the gaps between words must be quiet. 10th-percentile 50 ms level = the background.
w = wave.open(out); sr = w.getframerate(); a = array.array("h"); a.frombytes(w.readframes(w.getnframes()))
hop = int(sr * 0.05)
lev = sorted(20 * math.log10(max(1.0, math.sqrt(sum(x * x for x in a[i:i + hop:4]) / (hop / 4))) / 32768) for i in range(0, len(a) - hop, hop))
floor = round(lev[len(lev) // 10])
print(f"background noise between words: {floor} dB (want -45 or quieter)", file=sys.stderr)
if floor > -45: print("WARNING: still noisy - check the raw clip (wind/handling noise can't be fully removed)", file=sys.stderr)
print(out)
