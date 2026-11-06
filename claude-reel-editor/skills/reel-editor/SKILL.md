---
name: reel-editor
description: Use when someone drops a raw talking-head video (phone clip, selfie video, webcam recording) and wants it edited into a short-form reel, TikTok or YouTube Short in their own brand style - "edit this", "make this a reel", "cut this down", "add captions and graphics". Also use the first time someone installs this skill or says "set up my brand".
---

# Reel editor

Turns a raw talking-head clip into a finished, on-brand vertical reel. Every brand choice (colours, fonts, caption style, sounds, CTA) comes from the person's **brand file**, never from defaults baked into this skill. You do the editing; they only make the calls that are theirs.

## Before anything else: is there a brand file?

The workspace is `~/reels/` unless `REELS_HOME` is set.

- **No `~/reels/brand.md` or no `~/reels/brand.json`** → run the setup interview in `references/setup-interview.md` first. The interview writes both files. Do not edit a clip without them, even if they say "just use whatever". The interview takes 5 minutes and it is the whole point of this skill.
- **Both files exist** → read `brand.md` and `brand.json` in full, then continue.

## Check the tools (once per machine)

`python3 scripts/doctor.py` - checks ffmpeg, Node, the HyperFrames skills. Fix anything it flags before editing. Install steps are in the repo README.

## The edit, in order

Each reel gets its own folder: `~/reels/<yyyy-mm-dd>-<short-name>/`. Copy the raw clip in (never edit the original).

1. **Transcribe** - `python3 scripts/transcribe.py <clip> transcript.json`. Local multilingual Whisper (`REEL_LANG`, default `pt`; timing can drift ~0.3 s). A `.srt`/`.vtt` works too and skips Whisper.
2. **Clean the voice** - `python3 scripts/clean_audio.py <clip> voice.wav` (add `--denoise` if there is background noise). Targets -14 LUFS, the level Instagram and TikTok expect.
3. **Review (their call)** - propose: lines to cut (repeats, false starts, rambles), fillers to drop, CTA moved to the end, target under 60 s, and the graphics plan. **Wait for their yes before cutting.** This is the step people care most about.
   **Look at the start and end before proposing cuts:** grab frames every 0.5 s for the first and last 4 s, e.g. `ffmpeg -i clip.mov -vf fps=2 -t 4 frames/start_%02d.png` and `ffmpeg -sseof -4 -i clip.mov -vf fps=2 frames/end_%02d.png`. Cut any camera setup (pointing at the floor/garden, flipping the camera, reaching for the phone) even if words are spoken over it. Start on the first frame where they're settled in shot, and on a word that works as an opener.
   - **Main path: the Reel Review page.** First check that the `Artifact` and `ArtifactData` tools exist in this session (load them through tool search if they're deferred). If they do, follow `references/review.md`: they tap words to cut, watch the live rough cut, check graphics, captions, sound and colour, then say "build preview". Its import step (`review_sync.py import`) writes `edl.json` and `edit.json` with the fillers and pauses the person chose already applied. So on this path skip the `tighten.py` in step 4 and go straight to `cut.py`, then step 5.4's render.
   - **Fallback: review in chat** when those tools aren't there (older Claude Code, other apps). Show the transcript as numbered lines (format in `references/rough-cut.md`), then the card list in step 5.
4. **Tighten, then cut + speed** - write `edl.json` from the approved lines, then `python3 scripts/tighten.py <folder>`: it removes fillers and shortens pauses inside the kept lines, as hard as the brand's `"pacing"` says (`natural` default, `tight`, `fast`; presets in `scripts/pacing.py`). They never approve these one by one. Then `python3 scripts/cut.py <folder>`. Speed comes from the same preset unless `brand.json` sets `"speed"`. Listen-check: re-transcribe `master.mp4` and confirm no clipped words at the joins.
5. **Compose** - the graphics are a HyperFrames composition written with the compose kit: copy `compose/kit.py`, `compose/GUIDE.md` and `compose/DIRETOR.md` into `<folder>/compose/`, write `scenes.py` from the script moments following GUIDE.md (helpers first, safe zone, nothing over the face), run `python3 -B scenes.py` (it writes `index.html`), then `npx --yes hyperframes@0.8.217 render -o out.mp4 --fps 30 --quality delivery` inside `compose/`, and normalise the audio to -14 LUFS (`loudnorm`). The Editor 7.0 server does exactly this (see `server/pipeline.ts` `composeScaffold`/`composeRun`).
6. **QA** - `python3 scripts/qa.py <folder>` (loudness, size, length, missing words). Then grab a frame at every card and look: text inside the frame, readable over the background, on brand. Fix `scenes.py` and re-render until it passes.
7. **Deliver** - copy the final MP4 to the delivery folder under a clear name.

Tell them what changed, and what to check by ear (cuts, names, brand words spelled right).

## Their brand rules win

If the brand file and your taste disagree, the brand file wins. If they correct something during an edit ("no, never outline captions"), add it to `brand.md` under "Rules" straight away so the next edit gets it right.

## Common mistakes

| Mistake | Instead |
|---|---|
| Editing before a brand file exists | Run the setup interview |
| Cutting on Whisper word times blindly | Check the joins; nudge cuts into the quiet gap between words |
| Graphics that decorate instead of illustrate | Each card shows what this exact line says |
| Captions in a font the brand file bans | Re-read brand.md "Rules" before step 5 |
| Fixing QA failures by lowering the bar | Fix the edit, re-run QA |
