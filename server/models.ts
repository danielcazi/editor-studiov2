// SPEC §4: one fixed table, no agent that picks agents. Each call is a fresh request with only the files it needs.
import { spawn } from 'node:child_process';

export const MODEL_BY_STEP = {
  triage: 'claude-haiku-5-5',     // transcript clean-up, QA error summary
  script: 'claude-opus-5-5',      // step 2 and tweaks to standard cards
  brandChat: 'claude-sonnet-5-5', // step 3, only when the person types free text
  motion: 'claude-opus-5-5',      // step 5, Opus renders the final code/cards
  reference: 'claude-opus-5-5',   // analisa o reel de referência (link) e extrai ritmo, cards e legendas
  cloneBrand: 'claude-opus-5-5',  // Opus identifica e clona marca a partir de imagem ou YouTube
  compose: 'claude-opus-5-5',     // agent composer: Opus writes the whole HyperFrames composition (formats with composer: "agent")
  composeTreatment: 'claude-opus-5-5',   // the director's treatment.md (prose, no code): same Opus at medium effort, measured 1-3 min at high
  cloneFormat: 'claude-opus-5-5', // clona um estilo de animação (vídeos + imagens de referência) em um novo formato
  cortes: 'claude-sonnet-5-5',    // Cortes: maps a long talk and picks its 10 strongest 1-2 min passages (prose judgement, no motion code)
  cortesSrt: 'claude-haiku-5-5',  // Cortes export: fixes transcription slips in the srt of a chosen clip (text only, timing untouched)
  broll: 'claude-sonnet-5-5',     // b-roll fill: picks the beats and writes the stock search queries; no motion code, so not Opus
  embrulhos: 'claude-sonnet-5-5', // embrulhos tab: reads the video's offer and writes the static copy of the frames the user chose (text only)
  mtAnalyze: 'claude-opus-5-5',   // Motion Think: reads the frames of a reference excerpt and splits it into movements (what moves, how, measured)
  mtSynthesize: 'claude-opus-5-5', // Motion Think: turns one approved movement into a kit helper and renders its demo (agent run, max 30 turns)
} as const;
export type ModelStep = keyof typeof MODEL_BY_STEP;

const EFFORT: Record<ModelStep, 'low' | 'medium' | 'high'> = { triage: 'low', script: 'high', brandChat: 'low', motion: 'high', cloneBrand: 'high', reference: 'high', compose: 'high', composeTreatment: 'medium', cloneFormat: 'high', broll: 'low', cortes: 'medium', cortesSrt: 'low', embrulhos: 'medium', mtAnalyze: 'high', mtSynthesize: 'high' };

export type Cost = { at: string; stage: string; step: ModelStep; model: string; in: number; out: number; cacheRead: number; cacheWrite: number; turns?: number; ms?: number };   // turns/ms from the CLI result: wall time per call, to see where the pipeline's time goes

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';   // the Claude Code CLI on this machine, logged in with its own account

type ClaudeResult = {
  is_error: boolean; result: string; structured_output?: unknown;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  num_turns?: number; duration_ms?: number; subtype?: string;   // subtype 'error_max_turns': the --max-turns ceiling cut the run
};

// A call that never answers would hold the project's step lock until the server restarts: give up after this long (Opus at high effort included).
const CALL_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS ?? 20 * 60_000);

// The composer works for 15-30 min (treatment, scenes.py, check, snapshots): its own ceiling, above the per-call default.
const COMPOSE_TIMEOUT_MS = Number(process.env.COMPOSE_TIMEOUT_MS ?? 45 * 60_000);

// A spent subscription window ("You've hit your 5-hour limit · resets 6:30pm") is not a failure of the step: the user waits and clicks again.
export const quotaMessage = (msg: string) => /hit your .*limit|usage limit|rate limit/i.test(msg)
  ? `Cota do Claude esgotada (${msg.replace(/^claude exited \d+: /, '')}). A etapa não rodou: espere o horário indicado e clique de novo.` : null;

function claude(args: string[], input: string, cwd?: string, timeoutMs = CALL_TIMEOUT_MS): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn(CLAUDE_BIN, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(timeoutMs) });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => fail(e.name === 'AbortError' ? new Error(`claude gave no answer in ${Math.round(timeoutMs / 60_000)} min`) : e));
    // On failure the CLI prints a JSON result on stdout (e.g. "OAuth session expired"): show that message, not the raw JSON head.
    p.on('close', code => {
      if (code === 0) return ok(out);
      try { if (JSON.parse(out).subtype === 'error_max_turns') return ok(out); } catch {}   // --max-turns reached: exit 1 with the JSON on stdout
      const msg = `claude exited ${code}: ${err.trim() || (() => { try { return JSON.parse(out).result; } catch { return out.slice(0, 300); } })()}`;
      const quota = quotaMessage(msg);
      fail(Object.assign(new Error(quota ?? msg), quota ? { quota: true } : {}));
    });
    p.stdin.end(input);
  });
}

// shortcut: no refusal fallbacks ("fallbacks" beta) - they can route to another model and break the Opus-only-in-step-4 rule
// shortcut: MCP servers and user plugins are off so each call costs tokens for the prompt only, not the whole Claude Code context
export async function ask<T>(step: ModelStep, stage: string, opts: {
  system: string;                                  // stable rules (brand.md, vocabulary)
  content: string;                                 // this project's data, sent on stdin
  schema: Record<string, unknown>;
  readDir?: string;                                // folder the model may Read from (step 2 frames)
}, logCost: (c: Cost) => void): Promise<T> {
  const model = MODEL_BY_STEP[step];
  const args = ['-p', '--model', model, '--effort', EFFORT[step], '--output-format', 'json',
    '--json-schema', JSON.stringify(opts.schema), '--system-prompt', opts.system,
    '--no-session-persistence', '--setting-sources', 'user', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', opts.readDir ? 'Read' : ''];
  if (opts.readDir) args.push('--add-dir', opts.readDir, '--allowedTools', 'Read');
  const r = JSON.parse(await claude(args, opts.content)) as ClaudeResult;
  const u = r.usage;
  logCost({ at: new Date().toISOString(), stage, step, model, in: u.input_tokens, out: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, turns: r.num_turns, ms: r.duration_ms });
  if (r.is_error) throw new Error(`${model} failed in ${stage}: ${r.result}`);
  if (r.structured_output === undefined) throw new Error(`${model} returned no structured output in ${stage}`);
  return r.structured_output as T;
}

// Agent run for the composer: Opus works inside `cwd` (the project's compose/ folder) with file tools and a short Bash allowlist, then answers in plain text.
// shortcut: Bash is limited by allowlist patterns, not a sandbox; the server stays local-only (see CLAUDE.md)
// Any python3 script is allowed (patch scripts, not only scenes.py): scenes.py is written by the agent itself, so this adds no new reach.
// Was `python3 -B` only: the agent ran its patches as plain `python3 _patch.py`, the shell waited for an approval nobody gave, and review notes were never applied.
// step: compose (default) or composeTreatment; maxTurns: hard ceiling on tool turns (the compose call ran 69-88 turns, 16-27 min): past it the CLI stops
// with subtype error_max_turns and the caller keeps whatever index.html exists.
export const MAX_TURNS_HIT = '⚠ teto de turnos atingido';
export async function agent(stage: string, opts: { system: string; prompt: string; cwd: string; noRender?: boolean; step?: ModelStep; maxTurns?: number }, logCost: (c: Cost) => void): Promise<string> {
  const step = opts.step ?? 'compose', model = MODEL_BY_STEP[step];
  const args = ['-p', '--model', model, '--effort', EFFORT[step], '--output-format', 'json', '--system-prompt', opts.system,
    ...opts.maxTurns ? ['--max-turns', String(opts.maxTurns)] : [],
    '--no-session-persistence', '--setting-sources', 'user', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', 'Read,Write,Edit,Bash', '--allowedTools', 'Read', 'Write', 'Edit', 'Bash(python3:*)', 'Bash(python:*)', 'Bash(npx --yes hyperframes@0.8.217:*)',
    'Bash(ffmpeg:*)', 'Bash(ffprobe:*)', 'Bash(ls:*)', 'Bash(cat:*)',
    ...opts.noRender ? ['--disallowedTools', 'Bash(npx --yes hyperframes@0.8.217 render:*)'] : []];
  const r = JSON.parse(await claude(args, opts.prompt, opts.cwd, COMPOSE_TIMEOUT_MS)) as ClaudeResult;
  const u = r.usage;
  logCost({ at: new Date().toISOString(), stage, step, model, in: u.input_tokens, out: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, turns: r.num_turns, ms: r.duration_ms });
  // em 13/11 uma composição fechou com 143 turnos sob teto de 70 e nada no log explica: se repetir, fica registrado com os argumentos
  if (opts.maxTurns && (r.num_turns ?? 0) > opts.maxTurns + 1) console.warn(`[${stage}] ${r.num_turns} turnos com --max-turns ${opts.maxTurns} (subtype ${r.subtype}) em ${opts.cwd}`);
  if (r.subtype === 'error_max_turns') return `${MAX_TURNS_HIT} (${opts.maxTurns} turnos): ${r.result ?? (r as any).errors?.join('; ') ?? ''}`;
  if (r.is_error) throw new Error(`${model} failed in ${stage}: ${r.result}`);
  return r.result;
}
