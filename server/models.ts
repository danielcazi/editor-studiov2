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
  cloneFormat: 'claude-opus-5-5', // clona um estilo de animação (vídeos + imagens de referência) em um novo formato
  broll: 'claude-sonnet-5-5',     // b-roll fill: picks the beats and writes the stock search queries; no motion code, so not Opus
} as const;
export type ModelStep = keyof typeof MODEL_BY_STEP;

const EFFORT: Record<ModelStep, 'low' | 'medium' | 'high'> = { triage: 'low', script: 'medium', brandChat: 'low', motion: 'high', cloneBrand: 'high', reference: 'high', compose: 'high', cloneFormat: 'high', broll: 'low' };

export type Cost = { at: string; stage: string; step: ModelStep; model: string; in: number; out: number; cacheRead: number; cacheWrite: number };

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';   // the Claude Code CLI on this machine, logged in with its own account

type ClaudeResult = {
  is_error: boolean; result: string; structured_output?: unknown;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
};

// A call that never answers would hold the project's step lock until the server restarts: give up after this long (Opus at high effort included).
const CALL_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS ?? 20 * 60_000);

function claude(args: string[], input: string, cwd?: string): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn(CLAUDE_BIN, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => fail(e.name === 'AbortError' ? new Error(`claude gave no answer in ${Math.round(CALL_TIMEOUT_MS / 60_000)} min`) : e));
    // On failure the CLI prints a JSON result on stdout (e.g. "OAuth session expired"): show that message, not the raw JSON head.
    p.on('close', code => code === 0 ? ok(out) : fail(new Error(`claude exited ${code}: ${err.trim() || (() => { try { return JSON.parse(out).result; } catch { return out.slice(0, 300); } })()}`)));
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
    cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
  if (r.is_error) throw new Error(`${model} failed in ${stage}: ${r.result}`);
  if (r.structured_output === undefined) throw new Error(`${model} returned no structured output in ${stage}`);
  return r.structured_output as T;
}

// Agent run for the composer: Opus works inside `cwd` (the project's compose/ folder) with file tools and a short Bash allowlist, then answers in plain text.
// shortcut: Bash is limited by allowlist patterns, not a sandbox; the server stays local-only (see CLAUDE.md)
// Any `python3 -B` script is allowed (patch scripts, not only scenes.py): scenes.py is written by the agent itself, so this adds no new reach.
export async function agent(stage: string, opts: { system: string; prompt: string; cwd: string; noRender?: boolean }, logCost: (c: Cost) => void): Promise<string> {
  const model = MODEL_BY_STEP.compose;
  const args = ['-p', '--model', model, '--effort', EFFORT.compose, '--output-format', 'json', '--system-prompt', opts.system,
    '--no-session-persistence', '--setting-sources', 'user', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', 'Read,Write,Edit,Bash', '--allowedTools', 'Read', 'Write', 'Edit', 'Bash(python3 -B:*)','Bash(npx --yes hyperframes@0.8.192:*)',
    'Bash(ffmpeg:*)', 'Bash(ffprobe:*)', 'Bash(ls:*)', 'Bash(cat:*)',
    ...opts.noRender ? ['--disallowedTools', 'Bash(npx --yes hyperframes@0.8.192 render:*)'] : []];
  const r = JSON.parse(await claude(args, opts.prompt, opts.cwd)) as ClaudeResult;
  const u = r.usage;
  logCost({ at: new Date().toISOString(), stage, step: 'compose', model, in: u.input_tokens, out: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
  if (r.is_error) throw new Error(`${model} failed in ${stage}: ${r.result}`);
  return r.result;
}
