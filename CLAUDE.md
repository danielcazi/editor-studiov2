# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The server lives in `server/` (Node ≥ 23.6, TypeScript run directly, no build step).

```bash
./start.sh                      # from repo root: frees port 4400 and starts the server (http://127.0.0.1:4400)
cd server && npm install        # first time only
cd server && npm start          # same server without the port-cleanup step
cd server && npm run check      # tsc --noEmit (type check only)
cd server && npm test           # node --test test/ (with WORKSPACE set to a temp dir) + python3 test/test_transcribe.py + python3 test/test_anim.py
cd server && node --test test/lib.test.ts          # single TS test file
cd server && node --test --test-name-pattern="spansFromWords" test/lib.test.ts   # single test by name
cd server && python3 test/test_anim.py             # single Python test
```

Environment variables read by the server and pipeline: `PORT` (default 4400), `WORKSPACE` (default `workspace/`), `CLAUDE_BIN` (path to the `claude` CLI used for model calls), `REEL_LANG` (default `pt`, passed to Whisper), `YT_DLP` (default `yt-dlp` from PATH), `CLAUDE_TIMEOUT_MS` (default 20 min per model call). `../.env` is loaded if present.

## Architecture

**Two halves, one pipeline.** `server/` is an HTTP + SSE orchestrator with a single-file UI (`server/ui.html`, no build). The heavy media work is done by scripts in `claude-reel-editor/skills/reel-editor/scripts/` (Python, shell, one Swift file for Vision face/nose tracking), which the server spawns. The `claude-reel-editor/skills/reel-editor/SKILL.md` describes the same workflow for use as a Claude Code skill; the server does not read it beyond locating the scripts.

**Request flow.** `server/server.ts` has a flat route table (`[method, regex, handler]`) that maps each endpoint to a function in `server/pipeline.ts`. `GET /projects/:id/events` is an SSE stream of step progress; the UI subscribes to it.

**Pipeline state machine (`server/pipeline.ts`).** Each project moves through steps: ingest → script → brand → motion → edit/batch → final, plus side branches `ae` (After Effects export) and `embrulhos` (hook variants). Every step is wrapped in `locked(id, step, fn)`, which allows only one step per project at a time and emits start/done/error events. `state.json` holds the project state and the cost log.

**Two render paths.** Most formats go through the card pipeline (model writes cards, `validate.ts` checks them, `build_reel.py` + HyperFrames renders). Formats with `composer: "agent"` in `format.json`, and any format with `cutout` when the project has a site reference, skip the cards: the motion step runs the agent composer instead, which sets up `<project>/compose/` (kit, guide, assets, auto-written `brief.md`), has Opus write `compose/scenes.py` (which writes `compose/index.html`), and does not render: `final()` renders `compose/out.mp4`.

**UI flow: Vídeo → 1 Ingestão → 2 Roteiro → 3 Revisão → 4 Entrega.** There is no storyboard step. Approving the script calls `POST /motion`, which for card formats makes the cards straight from the script in one Opus call (`motionCards`) and rebuilds `proj/` without rendering. Agent formats go from the script and brief straight to `compose()`. Internal step names are unchanged (`motion` = Revisão, `final` = Entrega). A project whose state still says `storyboard` (removed step) is moved back to `script` on load. Entrega groups the final render (formats + QA), the After Effects export and the hook copy (embrulhos).

**Revisão (review).** The UI's review step plays `proj/index.html` (what `build_reel.py` writes) live in the browser through `<hyperframes-player>` (`engine/hf/`, same HyperFrames 0.8.145 as `render.sh`; served at `/hf/*` and `/projects/:id/live/*`), so nothing renders while reviewing. Notes pinned to a time and an optional x/y spot live in `<project>/review.json`; `POST /review/apply` sends every open note to the motion model in one call, rewrites `edit.json` and rebuilds `proj/` only (about 1 s). `final()` refuses while any note is open, and the step 4 screen no longer starts a final render. Agent-composed reels play `compose/index.html` live the same way (`liveDir`), and their notes go to `compose()`, which fails if the agent did not rerun `scenes.py`.

**Projects are git repos.** Each project is `workspace/projects/<id>/` with its own `.git`; every step and every manual edit commits there. The root repo is not under git. `REELS_HOME` is set to the project folder when spawning scripts, so the scripts read and write inside it.

**Model calls (`server/models.ts`).** `ask()` spawns the `claude -p` CLI with a fixed model per step and effort (`MODEL_BY_STEP` and `EFFORT`: Haiku for triage, Sonnet for brand chat, Opus for everything else: script, motion, reference-reel analysis, brand cloning and the agent composer). Output is forced to a JSON schema and token usage is logged per call. Tools and MCP servers are disabled for these calls. Do not route a new step to a different model without updating that table, since the table is the cost policy.

**Pure logic and validation.** `server/lib.ts` (word spans, time remapping, deep merge, format list) and `server/validate.ts` (card types, card and custom-card checks, font/icon/caption-style checks) hold the logic that the tests cover. Validation runs on model output before it is written to project files.

**Brands, formats, projects.** `workspace/brands/<id>/` (`brand.json` + `brand.md` + fonts and icons) and `workspace/formats/<id>/format.json` are data, edited through the API or the UI. A project copies the brand and merges per-project overrides with `deepMerge`. `workspace/projects/` is user output.

**After Effects export (`server/ae/`).** `exportAfterEffects()` runs `make_jsx.mjs --html <liveDir>/index.html`, which serves that folder on 127.0.0.1, loads it in headless Chrome with the HyperFrames runtime (`engine/hf/hyperframe.runtime.iife.js`) and samples it frame by frame. Video and audio clips go in as their own files (`.webm` becomes ProRes 4444 with alpha), with the camera of the video wrappers as keyframes. Each sub-composition and each manual layer becomes a group of pieces: simple ones become native text and shape layers, and complex ones (images, gradients, masks, emoji, content that changes inside) become ProRes 4444 clips. `build_comp.template.jsx` builds the comp in z-index order, and `run.jsx` saves the `.aep` (the pipeline runs it through `osascript`). Output goes to `<project>/after-effects/`, which is gitignored. `pack_aep.mjs` still assumes the old `videos/<id>` layout and is not called.

**Tooling outside the server.** `tools/index_refs.mjs` (reference-clip indexer) and `tools/vision_cutout.swift` (macOS Vision person cutout) are standalone and not called by the server.

## Notes

- The server binds to `127.0.0.1` only and has no auth; it assumes a single local user. Do not expose it. It rejects any `Host` or `Origin` that is not 127.0.0.1/localhost and any non-GET request that is not `application/json` (except `/upload`), so a web page on another site cannot drive it; send `-H 'content-type: application/json'` with curl.
- Naming is inconsistent: the root README says "Editor 7.0", `server/README.md` and commit messages say "Editor 4.0". Treat the code as authoritative.
