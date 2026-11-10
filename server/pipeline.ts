// The 5 steps of SPEC §3. Every heavy lift is a fork script; this file only sequences them, keeps state.json,
// and makes the model calls of models.ts. One project = one folder in workspace/projects/ with its own git history.
import { execFile, execFileSync, spawn, execSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline as pipe } from 'node:stream/promises';
import { homedir } from 'node:os';
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { agent, ask, type Cost, MAX_TURNS_HIT } from './models.ts';
import { cutWindows, deepMerge, FORMATS, lookOnly, PACE, pickFormats, paceFromSkill, remapSrt, remapWords, resolveChoices, safeId, shortcutPlan, skillAsStyle, styleToSkill, type Pace, type Plan, type Word } from './lib.ts';
import { CAPTION_PRESETS, validateCaptionStyle, validateFont, validateFormat, validateIcon } from './validate.ts';
import { isVideoReference, processSiteReference } from './site_extractor.ts';
import { aiCopy, captionLines, checkLayers, colorsOf, isMarked, listLayers, readLayers, syncEdits, textRuns } from './edits.ts';
import { synthesize, synthesizeLong } from './voice.ts';
import { carregarEmbrulho, compor, conferirCampos, extrairQuadro, listarEmbrulhos, precosDoSrt, renderCamadas, sugerirQuadros } from './embrulhos.ts';
import { download as brollDownload, extOf, type Kind, pick as brollPick, rightsOf, search as brollSearch } from './broll.ts';
import { afterEffectsCmd, NPM, NPX, PYTHON, WIN } from './host.ts';
import { bancoBrief, copyBancoTo, readBanco } from './banco.ts';

const ROOT = resolve(import.meta.dirname, '..');
export const SKILL = join(ROOT, 'claude-reel-editor/skills/reel-editor');
const S = join(SKILL, 'scripts');
const K_DIR = join(SKILL, 'compose');
export const WS = resolve(process.env.WORKSPACE ?? join(ROOT, 'workspace'));
const brandDir = (b: string) => join(WS, 'brands', b);
const projDir = (p: string) => join(WS, 'projects', p);

export { FORMATS };
const checkFormats = (f: unknown) => {
  const list = typeof f === 'string' ? [f] : f;
  return pickFormats(list) ?? fail(`formats: one or more of ${FORMATS.join(', ')}`);
};
const VIDEO_EXT = ['.mp4', '.mov', '.m4v'], SUB_EXT = ['.srt', '.vtt'], IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
// what the Edição step can add to a timeline: picture, footage, music/sfx and 3D models
const MEDIA_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.mov', '.webm', '.mp3', '.wav', '.m4a', '.aac', '.glb'];

// JSON schema shorthands (structured outputs need every key required and no extra keys)
function obj(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
const num = { type: 'number' }, str = { type: 'string' };

export class UserError extends Error {}   // -> HTTP 400
const fail = (msg: string): never => { throw new UserError(msg); };

export interface BusyInfo {
  step: string;
  startedAt: number;
  phase?: string;   // what the step is doing now (compose: tratamento, ilustrações, composição); survives a page reload
}

type State = {
  id: string; name: string; brand: string; formatId?: string; preEdited: boolean; subtitle?: string; referenceUrl?: string; extraReferenceUrls?: string[]; referenceNote?: string; userImages?: string[]; formats: string[];
  override: Record<string, unknown>; step: string; plan?: Plan; cost: Cost[]; qa?: { pass: boolean; report: string; summary?: string };
  running?: BusyInfo | null;
  workMs?: number;   // time AI and render steps held the lock, summed (human waiting between steps excluded)
  completed?: boolean;
  completedAt?: number;
  approvedAt?: number;   // the reviewer approved the AI composition (Revisão); cleared by any new AI pass, not by manual edits
  skillId?: string;                    // a cloned video (workspace/skills/<id>/): locks format shots, look and rhythm
  pace?: Pace;                         // rhythm toggle (PACE table); absent = dinamico, the pace every reel had before the toggle
  styleId?: string;                    // motion style (workspace/styles/<id>/) chosen at creation or in Revisão; none = the director picks from the list in the brief
  broll?: boolean;                     // "Inserir b-roll": the asset fetch also takes named people, brands and events (photos, YouTube clips, no license filter) and a music bed
  character?: { name: string; pose?: string };   // animation-brandkit character standing in for the speaker (cutout.webm is built from its pose)
};

// ---- progress (SSE) & persistent project logs ----------------------------------------------------------------------
type Listener = (event: string, data: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
export function subscribe(id: string, fn: Listener) {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(fn);
  return () => listeners.get(id)!.delete(fn);
}

export function appendProjectLog(id: string, message: string, timestamp = new Date()): string {
  const timeStr = timestamp.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  const formatted = /^\[\d{1,2}\/\d{1,2}\/\d{4}/.test(message) ? message : `[${timeStr}] ${message}`;
  try {
    const dir = projDir(id);
    if (existsSync(dir)) {
      const logFile = join(dir, 'activity.log');
      appendFileSync(logFile, formatted + '\n', 'utf8');
    }
  } catch {}
  return formatted;
}

export function getProjectLogs(id: string): string[] {
  const dir = projDir(id);
  if (!existsSync(dir)) return [];
  const logFile = join(dir, 'activity.log');
  if (existsSync(logFile)) {
    try {
      const content = readFileSync(logFile, 'utf8');
      return content.split('\n').filter(Boolean);
    } catch {}
  }
  // Se for um projeto anterior sem activity.log, reconstrói o histórico a partir do git log
  const logs: string[] = [];
  try {
    if (existsSync(join(dir, '.git'))) {
      const gitLog = execSync('git log --reverse --format="[%ad] $ git commit -m \\"%s\\"" --date=format:"%d/%m/%Y, %H:%M:%S"', { cwd: dir, encoding: 'utf8' });
      const lines = gitLog.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length) {
        logs.push(...lines);
        try {
          writeFileSync(logFile, logs.join('\n') + '\n', 'utf8');
        } catch {}
      }
    }
  } catch {}
  return logs;
}

export function logFromClient(id: string, text: string) {
  if (!text || typeof text !== 'string') return { ok: false };
  emit(id, 'log', text);
  return { ok: true };
}

export const emit = (id: string, event: string, data: unknown) => {
  if (event === 'log' && typeof data === 'string') {
    appendProjectLog(id, data);
  }
  listeners.get(id)?.forEach(fn => fn(event, data));
};

// ---- small I/O helpers --------------------------------------------------------------------------------------------
const readJSON = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const writeJSON = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));
const load = (id: string): State => {
  if (!safeId(id) || !existsSync(join(projDir(id), 'state.json'))) fail(`no project ${id}`);
  const st: State = readJSON(join(projDir(id), 'state.json'));
  if (st.step === 'storyboard') st.step = 'script';   // step removed: projects that stopped there go back to the script
  // v9: the four video clones moved from styles/ to skills/ under the same id
  if (st.styleId && !st.skillId && !existsSync(join(WS, 'styles', st.styleId, 'style.json')) && existsSync(join(WS, 'skills', st.styleId, 'skill.json'))) { st.skillId = st.styleId; delete st.styleId; }
  return st;
};
const save = (st: State) => writeJSON(join(projDir(st.id), 'state.json'), st);
const logCost = (st: State) => (c: Cost) => { st.cost.push(c); save(st); emit(st.id, 'cost', c); };

const STEP_ORDER = ['created', 'ingest', 'script', 'motion', 'final'];
const stepRank = (step: string) => STEP_ORDER.indexOf(step === 'brand' ? 'script' : step);
// The hex colours of a brand: the only ones a custom card may use.

// brand.json keeps font and icon files relative to the brand folder, so the workspace can move or the drive be renamed;
// whatever reads a brand (getBrand) sees absolute paths, and saveBrand turns the ones inside the brand folder back.
const brandFiles = (brand: any, to: (f: string) => string) => {
  const out = structuredClone(brand);
  const poses = (out.animation?.characters ?? []).flatMap((c: any) => c?.poses ?? []);
  for (const f of [...Object.values(out.fonts ?? {}), ...(Array.isArray(out.icons) ? out.icons : []), ...poses] as any[]) if (typeof f?.file === 'string') f.file = to(f.file);
  return out;
};
const saveBrand = (b: string, brand: any) => writeJSON(join(brandDir(b), 'brand.json'),
  brandFiles(brand, f => f.startsWith(brandDir(b) + sep) ? f.slice(brandDir(b).length + 1) : f));

export function run(id: string, cmd: string, args: string[], env: Record<string, string> = {}, allowFail = false, cwd?: string): Promise<{ code: number; out: string }> {
  return new Promise((ok, ko) => {
    emit(id, 'log', `$ ${basename(cmd)} ${args.map(a => basename(a)).join(' ')}`);
    const workDir = cwd ?? (existsSync(projDir(id)) ? projDir(id) : ROOT);
    const p = spawn(cmd, args, { cwd: workDir, env: { ...process.env, REELS_HOME: projDir(id), REEL_LANG: process.env.REEL_LANG ?? 'pt', ...env } });
    let out = '';
    const take = (b: Buffer) => { const s = b.toString(); out += s; s.split('\n').filter(Boolean).forEach(l => emit(id, 'log', l)); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('error', ko);
    p.on('close', code => code === 0 || allowFail ? ok({ code: code ?? 1, out }) : ko(new Error(`${basename([PYTHON, 'node', process.execPath].includes(cmd) ? args.find(a => /\.(py|m?js|ts)$/.test(a)) ?? cmd : cmd)} failed (${code}): ${out.trim().slice(-600)}`)));
  });
}
export const py = (id: string, script: string, args: string[], env?: Record<string, string>) => run(id, PYTHON, [join(S, script), ...args], env);

export async function duration(id: string, file: string) {
  const { out } = await run(id, 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.trim());
}
async function pacing(id: string): Promise<{ speed: number; pause_min: number; air: number }> {
  const code = `import json,sys;sys.path.insert(0,${JSON.stringify(S)});from pacing import pacing;print(json.dumps(pacing(json.load(open(sys.argv[1])))))`;
  return JSON.parse((await run(id, PYTHON, ['-c', code, join(projDir(id), 'brand.json')])).out);
}
const rawClip = (P: string) => join(P, readdirSync(P).find(f => f.startsWith('raw.')) ?? fail('raw clip missing'));

async function commit(id: string, msg: string) {
  await run(id, 'git', ['-C', projDir(id), 'add', '-A']);
  await run(id, 'git', ['-C', projDir(id), '-c', 'user.name=Editor 4.0', '-c', 'user.email=editor@localhost', 'commit', '-q', '-m', msg], {}, true);
}

// One step at a time per project: two renders into the same folder would corrupt it.
// The lock is a file in workspace/locks/, not a Map: two servers on the same workspace (./start.sh and the preview one)
// each accepted the same compose and two agents wrote the same folder. The pid says whether a leftover lock is stale.
const lockFile = (id: string) => join(WS, 'locks', `${id}.lock`);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
const addWork = (id: string, startedAt: number) => { try { const st = load(id); st.workMs = (st.workMs ?? 0) + Date.now() - startedAt; save(st); } catch {} };
export const getBusy = (id: string): BusyInfo | null => {
  try { const l = JSON.parse(readFileSync(lockFile(id), 'utf8')); return alive(l.pid) ? { step: l.step, startedAt: l.startedAt, ...(l.phase ? { phase: l.phase } : {}) } : null; } catch { return null; }
};
// the running step names its current phase: the lock keeps it for a reload, the event updates the open page
function setPhase(id: string, phase: string) {
  try {
    const l = JSON.parse(readFileSync(lockFile(id), 'utf8'));
    writeFileSync(lockFile(id), JSON.stringify({ ...l, phase }));
    emit(id, 'step', { step: l.step, status: 'start', startedAt: l.startedAt, phase });
  } catch {}
}
function acquire(id: string, step: string, startedAt: number) {
  mkdirSync(join(WS, 'locks'), { recursive: true });
  for (;;) {
    try { writeFileSync(lockFile(id), JSON.stringify({ step, startedAt, pid: process.pid }), { flag: 'wx' }); return; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const cur = getBusy(id);
      if (cur) fail(`project ${id} is busy (${cur.step} em execução há ${Math.round((Date.now() - cur.startedAt) / 1000)}s)`);
      rmSync(lockFile(id), { force: true });   // left by a server that died mid-step
    }
  }
}
async function locked<T>(id: string, step: string, fn: (st: State) => Promise<T>): Promise<T> {
  const st = load(id);
  const startedAt = Date.now();
  acquire(id, step, startedAt);
  emit(id, 'step', { step, status: 'start', startedAt });
  try {
    const r = await fn(st);
    emit(id, 'step', { step, status: 'done' });
    return r;
  } catch (e) {
    const quota = !!(e as { quota?: boolean }).quota;
    emit(id, 'step', { step, status: 'error', error: String((e as Error).message), quota });
    emit(id, 'log', quota ? `⏳ ${(e as Error).message}` : `ERRO na etapa ${step}: ${(e as Error).message}`);
    throw e;
  } finally { rmSync(lockFile(id), { force: true }); addWork(id, startedAt); }
}

// ---- brands -------------------------------------------------------------------------------------------------------
export const GSAP = join(SKILL, 'engine/gsap.min.js');
export const animPresets = () => JSON.parse(readFileSync(join(SKILL, 'anim-presets.json'), 'utf8'));
export function listBrands() {
  return existsSync(join(WS, 'brands')) ? readdirSync(join(WS, 'brands')).filter(b => existsSync(join(brandDir(b), 'brand.json'))) : [];
}
export function getBrand(b: string) {
  if (!safeId(b) || !existsSync(join(brandDir(b), 'brand.json'))) fail(`no brand ${b}`);
  return brandFiles(readJSON(join(brandDir(b), 'brand.json')), f => !f || /^[/~]/.test(f) ? f : join(brandDir(b), f));
}
export function createBrand(b: string, brand?: Record<string, unknown>, md?: string) {
  if (!safeId(b)) fail('brand id: letters, digits, - and _ only');
  if (existsSync(brandDir(b))) fail(`brand ${b} exists`);
  const example = join(ROOT, 'claude-reel-editor/examples/insula');
  const { capcut, capcut_font, ...base } = readJSON(join(example, 'brand.json'));
  const out = { ...base, name: b, require_carousel: false, icons: [], ...brand };   // the example's carousel rule is that creator's, not a default
  checkBrand(out);
  mkdirSync(join(brandDir(b), 'icons'), { recursive: true });
  saveBrand(b, out);
  writeFileSync(join(brandDir(b), 'brand.md'), md ?? readFileSync(join(example, 'brand.md'), 'utf8'));
  return out;
}
export function updateBrand(b: string, brand?: Record<string, unknown>, md?: string) {
  getBrand(b);
  if (brand) { checkBrand(brand); saveBrand(b, { ...brand, name: b }); }
  if (typeof md === 'string') writeFileSync(join(brandDir(b), 'brand.md'), md);
  return getBrand(b);
}
export const getBrandMd = (b: string) => (getBrand(b), readFileSync(join(brandDir(b), 'brand.md'), 'utf8'));

// Sincroniza e extrai design tokens, cores, tipografia e emojis a partir de um brand.md fornecido (ex: extraído de site ou prompt)
export async function syncBrandMarkdown(b: string, md: string) {
  const brand = getBrand(b);
  writeFileSync(join(brandDir(b), 'brand.md'), md);

  // Extração de cores (tabela Markdown ou lista)
  const lines = md.split('\n');
  const extractedColors: Array<{ token: string; hex: string; role: string }> = [];

  for (const line of lines) {
    // Tabela: | Token | Value | Role |
    const tableMatch = line.match(/\|\s*([^|]+?)\s*\|\s*`?(#[0-9a-fA-F]{3,8})`?\s*\|\s*([^|]*?)\s*\|/);
    if (tableMatch) {
      const token = tableMatch[1].trim();
      let hex = tableMatch[2].trim().toLowerCase();
      if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      const role = tableMatch[3].trim();
      if (!/token/i.test(token) && !/^[-:]+$/.test(token) && /^#[0-9a-f]{6}$/i.test(hex)) {
        extractedColors.push({ token, hex, role });
      }
    } else {
      // Lista: - Main: #ED84B0 ou - color-1: #1F1E1D
      const listMatch = line.match(/-\s*([A-Za-z0-9 _-]+)\s*:\s*`?(#[0-9a-fA-F]{3,8})`?(?:\s*\((.*?)\))?/);
      if (listMatch) {
        const token = listMatch[1].trim();
        let hex = listMatch[2].trim().toLowerCase();
        if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        const role = (listMatch[3] || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(hex)) {
          extractedColors.push({ token, hex, role });
        }
      }
    }
  }

  // Mapeamento inteligente de papéis
  if (extractedColors.length) {
    brand.palette = extractedColors;
    brand.colors ??= {};

    const findByRole = (kw: string) => extractedColors.find(c => c.role.toLowerCase().includes(kw.toLowerCase()));
    const accents = extractedColors.filter(c => c.role.toLowerCase().includes('accent'));
    const backgrounds = extractedColors.filter(c => c.role.toLowerCase().includes('background') || c.role.toLowerCase().includes('bg'));
    const secondary = extractedColors.filter(c => c.role.toLowerCase().includes('secondary') || c.role.toLowerCase().includes('soft') || c.role.toLowerCase().includes('border'));

    // Main
    const mainCand = findByRole('text primary') || findByRole('main') || (backgrounds.length > 1 ? backgrounds[1] : backgrounds[0]);
    if (mainCand) brand.colors.main = mainCand.hex;

    // Pop
    if (accents.length > 0) brand.colors.pop = accents[0].hex;
    else if (findByRole('pop')) brand.colors.pop = findByRole('pop')!.hex;

    // Light
    const lightCand = backgrounds.find(b => !/dark/i.test(b.role)) || findByRole('light') || extractedColors.find(c => c.hex === '#ffffff' || c.hex === '#fbf6f3');
    if (lightCand) brand.colors.light = lightCand.hex;

    // Soft
    if (secondary.length > 0) brand.colors.soft = secondary[0].hex;
    else if (findByRole('soft')) brand.colors.soft = findByRole('soft')!.hex;

    // Caption & Caption Accent
    const whiteOrLight = extractedColors.find(c => c.hex === '#ffffff') || findByRole('text light');
    if (whiteOrLight) brand.colors.caption = whiteOrLight.hex;
    else brand.colors.caption = '#ffffff';

    if (accents.length > 1) brand.colors.caption_accent = accents[1].hex;
    else if (accents.length === 1) brand.colors.caption_accent = accents[0].hex;
    else if (brand.colors.pop) brand.colors.caption_accent = brand.colors.pop;

    // Sincroniza captionStyle
    brand.captionStyle ??= {};
    brand.captionStyle.color = brand.colors.caption || '#ffffff';
    brand.captionStyle.highlight = brand.colors.caption_accent || brand.colors.pop || '#f7b708';
    if (brand.colors.main) brand.captionStyle.boxColor = brand.colors.main;
  }

  // Extração de Tipografia
  const fontMatch = md.match(/\*\*Font stack:\*\*\s*(.+)$/m) || md.match(/-\s*Headlines:\s*([A-Za-z0-9 ]+)/m) || md.match(/Font-family:\s*([A-Za-z0-9, ]+)/m);
  let detectedFont = '';
  if (fontMatch) {
    const families = fontMatch[1].split(',').map(f => f.replace(/['"`]/g, '').trim()).filter(Boolean);
    const nonGeneric = families.find(f => !['system-ui', 'sans-serif', 'serif', 'monospace', 'Times', 'Arial', 'Helvetica'].includes(f));
    if (nonGeneric) {
      detectedFont = nonGeneric;
      brand.fonts ??= {};
      brand.fonts.body = { ...brand.fonts.body, family: nonGeneric, weight: brand.fonts.body?.weight || 500 };
      brand.fonts.head = { ...brand.fonts.head, family: nonGeneric, weight: brand.fonts.head?.weight || 700 };
      brand.captionStyle ??= {};
      brand.captionStyle.font = 'body';

      // Tenta baixar do Google Fonts se for uma fonte Google
      // addFont writes brand.json itself and returns the whole fonts object: keep it, or the save below would drop the new files
      try {
        brand.fonts = await addFont(b, { role: 'body', google: nonGeneric, weight: 500 });
        brand.fonts = await addFont(b, { role: 'head', google: nonGeneric, weight: 700 });
      } catch (err) {
        console.warn(`[SyncMD] Aviso ao baixar fonte ${nonGeneric}:`, (err as Error).message);
      }
    }
  }

  // Extração de Emojis do texto
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const foundEmojis = [...new Set(md.match(emojiRegex) || [])];
  if (foundEmojis.length) {
    brand.emojis = [...new Set([...(brand.emojis || []), ...foundEmojis])].slice(0, 16);
  } else if (!brand.emojis || !brand.emojis.length) {
    brand.emojis = ['💡', '🚀', '🔥', '⚡', '📊', '🤖', '🎯', '✨'];
  }

  checkBrand(brand);
  saveBrand(b, brand);

  return {
    success: true,
    count: extractedColors.length,
    colors: brand.colors,
    palette: brand.palette,
    detectedFont,
    emojis: brand.emojis,
    brand
  };
}
function checkBrand(b: any) {
  b.colors ??= {};
  for (const [k, v] of Object.entries(b.colors)) {
    if (v === null || v === undefined || v === '') continue;
    let hex = String(v).trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    hex = hex.toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(hex)) fail(`colour ${k} must be a #rrggbb hex, got ${JSON.stringify(v)}`);
    b.colors[k] = hex;
  }
  if (b.icons && !Array.isArray(b.icons)) fail('icons must be a list');
  const an = b.animation;
  if (an !== undefined) {
    if (!an || typeof an !== 'object' || Array.isArray(an)) fail('animation must be an object');
    if (an.style !== undefined && typeof an.style !== 'string') fail('animation.style must be text');
    if (an.characters !== undefined && !Array.isArray(an.characters)) fail('animation.characters must be a list');
    if (an.voice !== undefined && an.voice !== null && !(typeof an.voice?.provider === 'string' && typeof an.voice?.voice === 'string')) fail('animation.voice needs provider and voice');
  }
  const cs = validateCaptionStyle(b.captionStyle);
  if (cs.length) fail(cs.join('; '));
}
export function addIcon(b: string, name: string, tags: string[], path: string) {
  const brand = getBrand(b);
  if (!safeId(name)) fail('icon name: letters, digits, - and _ only');
  if (!existsSync(path)) fail(`no file ${path}`);
  const errs = validateIcon(path, readFileSync(path));
  if (errs.length) fail(errs.join('; '));
  const file = join(brandDir(b), 'icons', name + extname(path).toLowerCase());
  mkdirSync(join(brandDir(b), 'icons'), { recursive: true });
  copyFileSync(path, file);
  brand.icons = [...(brand.icons ?? []).filter((i: any) => i.name !== name), { name, file, tags: tags.map(String) }];
  saveBrand(b, brand);
  return brand.icons;
}
// Animation brandkit: characters with poses (transparent PNG/WebP/SVG). Style and default voice live in brand.animation and are saved with the brand.
const POSE_EXT = ['.png', '.webp', '.svg'];
const animationOf = (brand: any) => brand.animation = { style: '', voice: null, ...brand.animation, characters: brand.animation?.characters ?? [] };
export function addPose(b: string, character: string, pose: string, tags: string[], path: string, description?: string) {
  const brand = getBrand(b);
  if (!safeId(character) || !safeId(pose)) fail('character and pose names: letters, digits, - and _ only');
  if (!POSE_EXT.includes(extname(path).toLowerCase()) || !existsSync(path)) fail(`pose: arquivo ${POSE_EXT.join('/')} existente (use PNG com fundo transparente)`);
  const dir = join(brandDir(b), 'characters', character);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, pose + extname(path).toLowerCase());
  copyFileSync(path, file);
  const an = animationOf(brand);
  let c = an.characters.find((x: any) => x.name === character);
  if (!c) an.characters.push(c = { name: character, description: '', poses: [] });
  if (description !== undefined) c.description = String(description);
  c.poses = [...(c.poses ?? []).filter((x: any) => x.name !== pose), { name: pose, file, tags: tags.map(String) }];
  saveBrand(b, brand);
  return getBrand(b).animation;
}
export function deleteCharacter(b: string, character: string, pose?: string) {
  const brand = getBrand(b), an = animationOf(brand);
  if (!safeId(character) || (pose !== undefined && !safeId(pose))) fail('invalid name');
  const c = an.characters.find((x: any) => x.name === character);
  if (!c) fail(`no character ${character}`);
  if (pose === undefined) an.characters = an.characters.filter((x: any) => x !== c);
  else c.poses = (c.poses ?? []).filter((x: any) => x.name !== pose);
  saveBrand(b, brand);
  return getBrand(b).animation;
}
export function poseFile(b: string, c: string, f: string) {
  getBrand(b);
  if (!safeId(c) || !/^[\w-]+\.(png|webp|svg)$/.test(f) || !existsSync(join(brandDir(b), 'characters', c, f))) fail(`no pose ${c}/${f}`);
  return join(brandDir(b), 'characters', c, f);
}
// A font for one role (head/body/accent): an uploaded .ttf/.otf/.woff2 (base64) or a Google Font, saved in the brand's fonts/.
export async function addFont(b: string, o: { role: string; file?: string; data?: string; google?: string; weight?: number; family?: string; style?: string }) {
  const brand = getBrand(b);
  if (!['head', 'body', 'accent'].includes(o.role)) fail('role: head, body or accent');
  const cur = brand.fonts?.[o.role] ?? {};
  const weight = Number(o.weight || cur.weight || 400);
  if (!Number.isInteger(weight) || weight < 100 || weight > 900) fail('weight: 100 to 900');
  const style = o.style === 'italic' || cur.style === 'italic' ? 'italic' : 'normal';
  let family: string, file: string, bytes: Buffer;
  if (o.google) {
    family = String(o.google).trim();
    if (!/^[A-Za-z0-9 ]{1,60}$/.test(family)) fail('Google Font: the family name as fonts.google.com shows it');
    const axis = style === 'italic' ? `ital,wght@1,${weight}` : `wght@${weight}`;
    // a browser user agent, or Google serves .ttf; the latin block covers Portuguese (á, ã, ç)
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:${axis}&display=block`,
      { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' } });
    if (!css.ok) fail(`Google Fonts has no ${family} ${style === 'italic' ? 'italic ' : ''}at weight ${weight}`);
    const text = await css.text();
    const url = (/\/\* latin \*\/[^}]*?url\((https:[^)]+\.woff2)\)/.exec(text) ?? /url\((https:[^)]+\.woff2)\)/.exec(text))?.[1] ?? fail('no .woff2 in the Google Fonts answer');
    const res = await fetch(url);
    if (!res.ok) fail(`font download failed (${res.status})`);
    bytes = Buffer.from(await res.arrayBuffer());
    file = `${family.replace(/ /g, '')}-${weight}${style === 'italic' ? 'i' : ''}.woff2`;
  } else {
    const rawFile = basename(String(o.file ?? '')).trim();
    if (!rawFile) fail('nome do arquivo de fonte obrigatório');
    const ext = extname(rawFile).toLowerCase();
    if (!['.ttf', '.otf', '.woff2'].includes(ext)) fail('fontes devem ser .ttf, .otf ou .woff2');
    const stem = rawFile.slice(0, -ext.length).replace(/[\s_]+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    file = `${stem || 'custom-font'}${ext}`;
    if (!safeId(file)) fail('font file name: letters, digits, -, _ and . only');
    bytes = Buffer.from(String(o.data ?? ''), 'base64');
    family = (typeof o.family === 'string' && o.family.trim())
      ? o.family.trim()
      : stem.replace(/-(bold|regular|light|medium|semibold|extrabold|black|thin|italic)$/i, '').replace(/[-_]/g, ' ') || file.replace(/\.\w+$/, '');
  }
  const errs = validateFont(file, bytes);
  if (errs.length) fail(errs.join('; '));
  mkdirSync(join(brandDir(b), 'fonts'), { recursive: true });
  writeFileSync(join(brandDir(b), 'fonts', file), bytes);
  brand.fonts = { ...brand.fonts, [o.role]: { ...cur, family, file: join(brandDir(b), 'fonts', file), weight, ...(style === 'italic' ? { style: 'italic' } : {}) } };
  saveBrand(b, brand);
  return brand.fonts;
}
// List installed font files saved in the brand's fonts/
export function listBrandFonts(b: string) {
  getBrand(b);
  const dir = join(brandDir(b), 'fonts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => safeId(f) && /\.(ttf|otf|woff2)$/i.test(f)).map(f => {
    const stat = statSync(join(dir, f));
    const name = f.replace(/\.\w+$/, '');
    const family = name.replace(/-(bold|regular|light|medium|semibold|extrabold|black|thin|italic)$/i, '').replace(/[-_]/g, ' ') || name;
    return { file: f, name, family, size: stat.size, url: `/brands/${encodeURIComponent(b)}/fonts/${encodeURIComponent(f)}`, path: join(dir, f) };
  });
}
// List all font files saved across all brands in the workspace
export function listAllFonts() {
  const brands = listBrands();
  const all: Array<{ brand: string; file: string; name: string; family: string; size: number; url: string; path: string }> = [];
  for (const b of brands) {
    const dir = join(brandDir(b), 'fonts');
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter(f => safeId(f) && /\.(ttf|otf|woff2)$/i.test(f));
      for (const f of files) {
        try {
          const stat = statSync(join(dir, f));
          const name = f.replace(/\.\w+$/, '');
          const family = name.replace(/-(bold|regular|light|medium|semibold|extrabold|black|thin|italic)$/i, '').replace(/[-_]/g, ' ') || name;
          all.push({
            brand: b,
            file: f,
            name,
            family,
            size: stat.size,
            url: `/brands/${encodeURIComponent(b)}/fonts/${encodeURIComponent(f)}`,
            path: join(dir, f)
          });
        } catch {}
      }
    } catch {}
  }
  return all;
}
// Brand fonts for the UI's caption preview (@font-face)
export function fontFile(b: string, f: string) {
  getBrand(b);
  if (!safeId(f) || !existsSync(join(brandDir(b), 'fonts', f))) fail(`no font ${f}`);
  return join(brandDir(b), 'fonts', f);
}

// ---- brand clone (image or YouTube link -> Opus -> new brand) -------------------------------------------------------------
const YT_DLP = process.env.YT_DLP ?? 'yt-dlp';   // from PATH unless YT_DLP says otherwise (Homebrew on Apple Silicon is not everyone's)

// Runs a helper that is allowed to fail or be slow (frame grabs, downloads): never throws, never outlives `ms`.
const runQuiet = (cmd: string, args: string[], ms = 60_000) => new Promise<void>(resolve => {
  const p = spawn(cmd, args, { stdio: 'ignore', cwd: ROOT });
  const timer = setTimeout(() => p.kill(), ms);
  p.on('close', () => { clearTimeout(timer); resolve(); });
  p.on('error', () => { clearTimeout(timer); resolve(); });
});

// ---- self-update: git pull when the folder is a clone, GitHub tarball when it came as a ZIP; then restart ----------------
const git = (...args: string[]) => execP('git', ['-C', ROOT, ...args]);
const REPO = 'danielcazi/editor-studiov2', VERSION_FILE = join(ROOT, 'VERSION');   // VERSION holds the sha of the last tarball installed
const isClone = () => existsSync(join(ROOT, '.git'));
// VERSAO (tracked) is the human version shown next to "Editor 7.0"; bump it on every push to main.
export const version = () => { try { return readFileSync(join(ROOT, 'VERSAO'), 'utf8').trim(); } catch { return '?'; } };

async function githubCommits(): Promise<{ sha: string; message: string }[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=main&per_page=30`, { headers: { 'user-agent': 'editor-7' } });
  if (!res.ok) fail(`GitHub respondeu ${res.status} ao consultar atualizações`);
  return ((await res.json()) as { sha: string; commit: { message: string } }[]).map(c => ({ sha: c.sha, message: c.commit.message.split('\n')[0] }));
}

export async function checkUpdate() {
  if (isClone()) {
    await git('fetch', '-q', 'origin');
    const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).trim();
    const log = (await git('log', '--format=%s', `HEAD..origin/${branch}`)).trim();
    const commits = log ? log.split('\n') : [];
    const remote = await git('show', `origin/${branch}:VERSAO`).then(v => v.trim(), () => '?');
    return { branch, version: version(), remote, behind: commits.length, commits, dirty: (await git('status', '--porcelain', '--untracked-files=no')).trim() !== '' };
  }
  const all = await githubCommits();
  const installed = existsSync(VERSION_FILE) ? readFileSync(VERSION_FILE, 'utf8').trim() : '';
  const i = all.findIndex(c => c.sha === installed);
  // a ZIP download has no VERSION: everything listed counts as new until the first update writes it
  const commits = (i < 0 ? all : all.slice(0, i)).map(c => c.message);
  const remote = await fetch(`https://raw.githubusercontent.com/${REPO}/${all[0]?.sha}/VERSAO`).then(r => r.ok ? r.text() : '?', () => '?');
  return { branch: 'main', version: version(), remote: remote.trim(), behind: commits.length, commits, dirty: false, latest: all[0]?.sha };
}

// Overlays the tarball on ROOT. User data is never touched: workspace/projects|uploads|scratch, .env, node_modules;
// files already present under workspace/ (brands, formats the person edited) are kept, new ones are added.
async function overlayTarball(sha: string) {
  const tmp = join(ROOT, 'workspace', 'scratch', 'update'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const res = await fetch(`https://codeload.github.com/${REPO}/tar.gz/${sha}`);
  if (!res.ok) fail(`download falhou (${res.status})`);
  writeFileSync(join(tmp, 'src.tgz'), Buffer.from(await res.arrayBuffer()));
  await execP('tar', ['-xzf', join(tmp, 'src.tgz'), '-C', tmp]);
  const src = join(tmp, readdirSync(tmp).find(n => n !== 'src.tgz')!);
  const skip = /^(workspace\/(projects|uploads|scratch)|\.env|node_modules)(\/|$)/;
  cpSync(src, ROOT, { recursive: true, force: true, filter: s => {
    const rel = relative(src, s).split(sep).join('/');
    return !skip.test(rel) && !(rel.startsWith('workspace/') && existsSync(join(ROOT, rel)) && statSync(join(ROOT, rel)).isFile());
  } });
  // the overlay only adds and overwrites: files the previous update installed that this one no longer ships are removed here
  // (only files listed by a previous update, so nothing the person made, and never under workspace/)
  const files = (readdirSync(src, { recursive: true }) as string[]).map(f => f.split(sep).join('/'))
    .filter(f => !f.startsWith('workspace/') && !skip.test(f) && statSync(join(src, f)).isFile());
  const listFile = join(ROOT, '.arquivos-instalados'), keep = new Set(files);
  if (existsSync(listFile)) for (const f of readFileSync(listFile, 'utf8').split('\n')) if (f && !keep.has(f)) rmSync(join(ROOT, f), { force: true });
  writeFileSync(listFile, files.join('\n') + '\n');
  writeFileSync(VERSION_FILE, sha + '\n');
  rmSync(tmp, { recursive: true, force: true });
}

export async function applyUpdate() {
  const { branch, behind, latest } = await checkUpdate();
  if (!behind) return { ok: true, updated: false, message: 'Já está na versão mais recente.' };
  let out = '';
  // --autostash keeps brands/formats edited locally; --ff-only never creates merge commits on the user's machine.
  if (isClone()) out = await git('pull', '-q', '--ff-only', '--autostash', 'origin', branch);
  else await overlayTarball(latest!);
  await execP(NPM[0], [...NPM.slice(1), 'install', '--prefix', join(ROOT, 'server'), '--no-audit', '--no-fund']);
  // Restart without start.sh/start.cmd: a detached copy of this process starts while we exit; the client polls until it answers.
  setTimeout(() => { spawn(process.execPath, [...process.execArgv, 'server.ts'], { detached: true, stdio: 'ignore', cwd: join(ROOT, 'server'), env: process.env }).unref(); process.exit(0); }, 300);
  return { ok: true, updated: true, message: /conflict/i.test(out) ? 'Atualizado, mas houve conflito ao reaplicar edições locais (veja git stash list).' : 'Atualizado. Reiniciando o servidor...' };
}

// Thumbnail, official title and two frames of a YouTube video, as references for the clone.
// The URL is rebuilt from the 11-character id: whatever else came in the string never reaches yt-dlp.
async function youtubeReference(youtubeUrl: string, cloneDir: string): Promise<{ files: string[]; context: string }> {
  const ytMatch = youtubeUrl.match(/^https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})(?![\w-])/i);
  if (!ytMatch) return fail('URL do YouTube inválida. Use um formato como https://youtube.com/shorts/... ou https://youtu.be/...');
  const videoId = ytMatch[1], url = `https://www.youtube.com/watch?v=${videoId}`;
  const files: string[] = [];
  let context = '';

  const thumbPath = join(cloneDir, 'youtube_thumb.jpg');
  for (const t of ['maxresdefault', 'hqdefault', '0']) {
    try {
      const res = await fetch(`https://img.youtube.com/vi/${videoId}/${t}.jpg`);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 2000) { writeFileSync(thumbPath, buf); files.push(thumbPath); break; }
    } catch {}
  }

  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oembedRes.ok) {
      const meta = await oembedRes.json() as any;
      if (meta.title || meta.author_name) context += `Canal / Criador: ${meta.author_name || 'Desconhecido'}\nTítulo do Vídeo: ${meta.title || ''}\n`;
    }
  } catch {}

  const clipFile = join(cloneDir, 'clip.mp4');
  await runQuiet(YT_DLP, ['-f', 'best[ext=mp4]/best', '--download-sections', '*0-8', '--force-overwrites', '-o', clipFile, '--', url], 12_000);
  if (existsSync(clipFile)) {
    for (const [k, at] of [['1', '1.5'], ['2', '4.5']]) {
      const f = join(cloneDir, `frame_${k}.jpg`);
      await runQuiet('ffmpeg', ['-v', 'error', '-y', '-ss', at, '-i', clipFile, '-frames:v', '1', '-q:v', '2', f]);
      if (existsSync(f)) files.push(f);
    }
  }
  return { files, context };
}

const OPUS_CLONE_SCHEMA = {
  type: 'object',
  properties: {
    brand_id: { type: 'string', description: 'Slug seguro para a marca (ex: mrbeast, canal-tech)' },
    brand_name: { type: 'string', description: 'Nome da marca ou criador' },
    analysis: {
      type: 'object',
      properties: {
        creator_or_style: { type: 'string' },
        visual_summary: { type: 'string' },
        color_strategy: { type: 'string' },
        typography_strategy: { type: 'string' },
        caption_style_description: { type: 'string' },
        motion_and_graphics: { type: 'string' }
      },
      required: ['creator_or_style', 'visual_summary', 'color_strategy', 'typography_strategy', 'caption_style_description', 'motion_and_graphics']
    },
    colors: {
      type: 'object',
      properties: {
        main: { type: 'string', description: '#rrggbb cor primaria' },
        pop: { type: 'string', description: '#rrggbb cor de destaque vibrante' },
        light: { type: 'string', description: '#rrggbb cor de fundo clara ou cards' },
        soft: { type: 'string', description: '#rrggbb cor suave de apoio' },
        caption: { type: 'string', description: '#rrggbb cor do texto da legenda' },
        caption_accent: { type: 'string', description: '#rrggbb cor da palavra ativa' }
      },
      required: ['main', 'pop', 'light', 'soft', 'caption', 'caption_accent']
    },
    fonts: {
      type: 'object',
      properties: {
        head: {
          type: 'object',
          properties: {
            family: { type: 'string', description: 'Nome da fonte no Google Fonts (ex: Montserrat, Poppins, Inter, Bebas Neue, Outfit, Syne, Archivo)' },
            weight: { type: 'number' },
            style: { type: 'string', enum: ['normal', 'italic'] }
          },
          required: ['family', 'weight']
        },
        body: {
          type: 'object',
          properties: {
            family: { type: 'string', description: 'Nome da fonte no Google Fonts' },
            weight: { type: 'number' }
          },
          required: ['family', 'weight']
        },
        accent: {
          type: 'object',
          properties: {
            family: { type: 'string', description: 'Nome da fonte no Google Fonts' },
            weight: { type: 'number' },
            style: { type: 'string', enum: ['normal', 'italic'] }
          },
          required: ['family', 'weight']
        }
      },
      required: ['head', 'body', 'accent']
    },
    captionStyle: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: [...CAPTION_PRESETS] },
        font: { type: 'string', enum: ['head', 'body', 'accent'] },
        size: { type: 'number' },
        y: { type: 'number' },
        case: { type: 'string', enum: ['lower', 'upper', 'as-is'] },
        color: { type: 'string' },
        highlight: { type: 'string' },
        maxWords: { type: 'number' },
        stroke: { type: 'boolean' },
        strokeColor: { type: 'string' },
        strokeWidth: { type: 'number' },
        shadow: { type: 'boolean' },
        shadowColor: { type: 'string' },
        shadowBlur: { type: 'number' },
        shadowDistance: { type: 'number' },
        box: { type: 'boolean' },
        boxColor: { type: 'string' },
        scale: { type: 'number' },
        letterSpacing: { type: 'number' },
        align: { type: 'string', enum: ['center', 'left', 'right'] }
      },
      required: ['preset', 'font', 'size', 'y', 'case', 'color', 'highlight']
    },
    pacing: { type: 'string', enum: ['tight', 'moderate', 'fast'] },
    graphics: { type: 'string', enum: ['minimal', 'clean', 'busy', 'rich'] },
    speed: { type: 'number' },
    sfx: { type: 'string', enum: ['lots', 'subtle', 'none'] },
    brand_md: { type: 'string', description: 'Manual de marca em markdown em Português do Brasil' }
  },
  required: ['brand_id', 'brand_name', 'analysis', 'colors', 'fonts', 'captionStyle', 'pacing', 'graphics', 'speed', 'sfx', 'brand_md']
};

// Opus's answer -> a brand.json: every number clamped, every colour checked, so nothing odd reaches the render.
function brandFromClone(opusRes: any, cleanId: string): any {
  const validHex = (h: any, fallback: string) => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h)) ? h : fallback;
  let rawY = Number(opusRes.captionStyle.y) || 1250;
  if (rawY > 0 && rawY <= 1) rawY = Math.round(rawY * 1920);
  else if (rawY > 1 && rawY <= 100) rawY = Math.round((rawY / 100) * 1920);
  const cleanY = Math.round(Math.min(1900, Math.max(100, rawY || 1250)));

  const cleanSize = Math.round(Math.min(220, Math.max(30, Number(opusRes.captionStyle.size) || 80)));
  const cleanMaxWords = (typeof opusRes.captionStyle.maxWords === 'number' && Number.isInteger(opusRes.captionStyle.maxWords) && opusRes.captionStyle.maxWords >= 1 && opusRes.captionStyle.maxWords <= 8) ? opusRes.captionStyle.maxWords : 0;

  let rawScale = Number(opusRes.captionStyle.scale) || 100;
  if (rawScale > 0 && rawScale <= 3) rawScale = Math.round(rawScale * 100);
  const cleanScale = Math.round(Math.min(200, Math.max(50, rawScale || 100)));

  const brandData: any = {
    name: opusRes.brand_name || cleanId,
    resolution: [1080, 1920],
    pacing: opusRes.pacing || 'tight',
    graphics: opusRes.graphics || 'busy',
    speed: Number(opusRes.speed) || 1.1,
    max_seconds: 60,
    colors: {
      main: validHex(opusRes.colors.main, '#111111'),
      pop: validHex(opusRes.colors.pop, '#f7b708'),
      light: validHex(opusRes.colors.light, '#ffffff'),
      soft: validHex(opusRes.colors.soft, '#cccccc'),
      caption: validHex(opusRes.colors.caption, '#ffffff'),
      caption_accent: validHex(opusRes.colors.caption_accent, '#f7b708'),
    },
    sfx: opusRes.sfx || 'lots',
    deliver_dir: '~/Movies/Reels',
    grade: null,
    require_carousel: false,
    title_outline: validHex(opusRes.colors.pop, '#ffffff'),
    title_y: '380',
    captions: {
      mode: cleanMaxWords === 1 ? 'word' : 'line',
      case: opusRes.captionStyle.case || 'lower',
      size: cleanSize,
      y: cleanY,
      style: 'editorial'
    },
    captionStyle: {
      preset: opusRes.captionStyle.preset || 'word-pop',
      font: opusRes.captionStyle.font || 'body',
      size: cleanSize,
      y: cleanY,
      x: 0,
      case: opusRes.captionStyle.case || 'lower',
      color: validHex(opusRes.captionStyle.color, '#ffffff'),
      highlight: validHex(opusRes.captionStyle.highlight, validHex(opusRes.colors.pop, '#f7b708')),
      maxWords: cleanMaxWords,
      stroke: Boolean(opusRes.captionStyle.stroke),
      strokeColor: validHex(opusRes.captionStyle.strokeColor, '#000000'),
      strokeWidth: Math.round(Number(opusRes.captionStyle.strokeWidth) || 4),
      shadow: opusRes.captionStyle.shadow !== false,
      shadowColor: opusRes.captionStyle.shadowColor || 'rgba(0,0,0,0.85)',
      shadowBlur: Math.round(Number(opusRes.captionStyle.shadowBlur) || 14),
      shadowDistance: Math.round(Number(opusRes.captionStyle.shadowDistance) || 6),
      box: Boolean(opusRes.captionStyle.box),
      boxColor: validHex(opusRes.captionStyle.boxColor, validHex(opusRes.colors.main, '#111111')),
      scale: cleanScale,
      rotation: 0,
      letterSpacing: Math.round(Number(opusRes.captionStyle.letterSpacing) || 0),
      underline: false,
      align: opusRes.captionStyle.align || 'center'
    },
    fonts: {
      head: { family: opusRes.fonts.head.family, weight: Math.round(Number(opusRes.fonts.head.weight) || 700) },
      body: { family: opusRes.fonts.body.family, weight: Math.round(Number(opusRes.fonts.body.weight) || 600) },
      accent: { family: opusRes.fonts.accent.family, weight: Math.round(Number(opusRes.fonts.accent.weight) || 400), ...(opusRes.fonts.accent.style === 'italic' ? { style: 'italic' } : {}) }
    },
    icons: []
  };
  return brandData;
}

// Google Fonts for each role; a font that cannot be fetched only costs a warning.
async function installCloneFonts(brandId: string, fonts: any) {
  for (const role of ['head', 'body', 'accent'] as const) {
    const f = fonts?.[role];
    if (!f?.family) continue;
    try {
      await addFont(brandId, { role, google: f.family, weight: Number(f.weight) || 700, style: f.style || 'normal' });
    } catch (fontErr) {
      console.warn(`[CloneBrand] Aviso: não foi possível baixar fonte ${role} (${f.family}):`, (fontErr as Error).message);
    }
  }
}

// Clona uma Brand existente a partir de imagem ou link do YouTube usando Claude Opus 5.5
export async function cloneBrandWithOpus(body: any) {
  const youtubeUrl = typeof body?.youtubeUrl === 'string' ? body.youtubeUrl.trim() : '';
  const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : '';
  const imageName = typeof body?.imageName === 'string' ? body.imageName : '';
  const requestedBrandId = typeof body?.brandId === 'string' ? body.brandId.trim() : '';
  const userNotes = typeof body?.notes === 'string' ? body.notes.trim() : '';

  if (!youtubeUrl && !imageBase64) {
    fail('Forneça o link de um vídeo do YouTube ou envie uma imagem/print para clonar a Brand.');
  }

  const cloneId = 'clone_' + Date.now();
  const cloneDir = join(WS, 'scratch', cloneId);
  mkdirSync(cloneDir, { recursive: true });

  const imageFiles: string[] = [];
  let mediaContext = '';

  try {
    if (youtubeUrl) {
      const ref = await youtubeReference(youtubeUrl, cloneDir);
      imageFiles.push(...ref.files);
      mediaContext += ref.context;
    }

    if (imageBase64) {
      const rawData = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
      const buf = Buffer.from(rawData, 'base64');
      if (buf.length < 50) fail('Imagem inválida ou corrompida.');
      const ext = (imageName && extname(imageName).toLowerCase()) || '.jpg';
      const imgPath = join(cloneDir, `uploaded_reference${ext}`);
      writeFileSync(imgPath, buf);
      imageFiles.push(imgPath);
      mediaContext += `\nImagem enviada: ${imageName || 'screenshot'}`;
    }

    if (imageFiles.length === 0) {
      fail('Não foi possível obter imagem da referência (thumbnail ou imagem enviada). Verifique a conexão ou envie uma imagem diretamente.');
    }

    const systemPrompt = `Você é o Claude Opus 5.5 atuando como Art Director de elite, Colorista e Motion Designer especialista no estilo de vídeos do YouTube Shorts, Reels e TikTok.
Sua missão é identificar com olhar crítico e estético a identidade visual da referência e gerar um Brand Kit clonado completo e profissional.

IMPORTANTE: Use sua ferramenta Read em cada um dos seguintes arquivos de imagem absolutos para inspecionar minuciosamente elementos visuais, paleta de cores, tipografia e estilo de edição antes de formular sua resposta:
${imageFiles.map(f => `- ${f}`).join('\n')}

DIRETRIZES:
1. Identifique o criador, canal ou estética (ex: Tech sofisticado, Dark editorial, Neon futurista, MrBeast dinâmico, Minimalista corporativo, etc.).
2. Cores: extraia códigos hexadecimais #rrggbb reais da imagem, garantindo excelente contraste e harmonia.
3. Tipografia: recomende famílias disponíveis no Google Fonts para instalação automática (ex: Montserrat, Poppins, Inter, Bebas Neue, Outfit, Syne, Archivo, Space Grotesk, Oswald, Roboto).
4. Legendas: defina o estilo fiel ao que costuma ser usado pelo criador (tamanho, case, preset de animação, stroke e sombra).
5. Manual brand_md: escreva em Português do Brasil com riqueza de detalhes as regras editoriais da marca (Account, Reference reel, Colours, Fonts, Captions, Graphics, Sound, Pacing, Call to action, Rules).`;

    const content = JSON.stringify({
      mediaContext: mediaContext || 'Referência visual enviada',
      requestedBrandId: requestedBrandId || null,
      userNotes: userNotes || null,
      availableImages: imageFiles
    });

    const opusRes = await ask<any>('cloneBrand', 'brand:clone', {
      system: systemPrompt,
      content,
      schema: OPUS_CLONE_SCHEMA,
      readDir: cloneDir
    }, (c: Cost) => console.log('[Cost Brand Clone]', c));

    // Determina o brand ID final
    let cleanId = (requestedBrandId || opusRes.brand_id || 'brand-clone')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'brand-clone';

    if (existsSync(brandDir(cleanId))) {
      let suffix = 2;
      while (existsSync(brandDir(`${cleanId}-${suffix}`))) suffix++;
      cleanId = `${cleanId}-${suffix}`;
    }

    const brandData = brandFromClone(opusRes, cleanId);
    createBrand(cleanId, brandData, opusRes.brand_md);
    await installCloneFonts(cleanId, opusRes.fonts);

    return {
      success: true,
      brandId: cleanId,
      name: brandData.name,
      analysis: opusRes.analysis,
      brand: getBrand(cleanId),
      md: opusRes.brand_md
    };
  } finally {
    try {
      rmSync(cloneDir, { recursive: true, force: true });
    } catch {}
  }
}

// Everything composeScaffold copies into compose*/ (cut.webm, plate, fonts, catalog motions, transcode cache, snapshots, layout check)
// is a copy or regenerated by scenes.py: one agent rerun was adding ~600 MB to a project's .git.
const COMPOSE_IGNORE = 'compose*/assets/\ncompose*/media/\ncompose*/motions/\ncompose*/.transcode-cache/\ncompose*/snaps*/\ncompose*/review/\nassets/video/\nassets/music/\n';   // b-roll clips and music stay out of the project repo (tens of MB each run)
// Projects created before COMPOSE_IGNORE existed: add the lines and drop the already-tracked copies from the index (files stay on disk).
export async function ensureComposeIgnored(id: string) {
  const ignore = join(projDir(id), '.gitignore'), cur = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  const missing = COMPOSE_IGNORE.split('\n').filter(l => l && !cur.split('\n').includes(l));
  if (!missing.length) return;
  appendFileSync(ignore, missing.join('\n') + '\n');
  const { out } = await run(id, 'git', ['-C', projDir(id), 'ls-files', '-ci', '--exclude-standard', '-z'], {}, true);
  const tracked = out.split('\0').filter(Boolean);
  if (tracked.length) await run(id, 'git', ['-C', projDir(id), 'rm', '--cached', '-q', '--', ...tracked], {}, true);
}

// brand max_seconds is qa.py's length gate: measured on master.mp4 right after the cut and again before any render,
// so an over-long reel is caught in seconds instead of after minutes of Opus and Chrome.
// Speech Screen: the format says where the speaker is cut out (janelas.cut) and where he sits in a panel (panel.top, fraction of H)
// how a shot is written in scenes.py: scene(..., cam=)
const PLANO_CAM: Record<string, string> = { cut: "cam=('M'|'L'|'XL'|'XXL', modo, final), locutor recortado", panel: "cam='panel', vídeo cru no painel de baixo", 'panel-top': "cam='panel-top', vídeo cru em cima", raw: "cam='raw' com bg='clear', vídeo cru em tela cheia com os gráficos por cima", none: 'cam=None, só animação', react: "cam='react' com bg='clear', vídeo de referência ao lado do locutor cru" };
const fmtOf = (st: State): any => { try { return getFormat(st.formatId || 'business-reels'); } catch { return {}; } };
const cutWindowsOf = (st: State, dur: number) => cutWindows(fmtOf(st).janelas?.cut, dur);
async function overLength(id: string, P: string, brand: any): Promise<string | null> {
  const max = Number(brand.max_seconds ?? 60), dur = await duration(id, join(P, 'master.mp4'));
  return dur > max ? `o vídeo tem ${dur.toFixed(1)} s e o limite da marca é ${max} s (max_seconds no brandkit)` : null;
}

// The project's brand.json (what the fork scripts read via REELS_HOME) is rebuilt before every step, so an icon
// saved to the brand from any project shows up everywhere.
function writeBrand(st: State) {
  const brand = deepMerge(getBrand(st.brand), st.override);
  checkBrand(brand);
  writeJSON(join(projDir(st.id), 'brand.json'), brand);
  copyFileSync(join(brandDir(st.brand), 'brand.md'), join(projDir(st.id), 'brand.md'));
  return brand as any;
}

// ---- picking the source ---------------------------------------------------------------------------------------------
// The native macOS chooser returns the real path (no copy of a 2 GB clip); drops are streamed into workspace/uploads.
export const expandHome = (p: string) => typeof p === 'string' && /^~(\/|$)/.test(p) ? join(homedir(), p.slice(1)) : p;
const UPLOADS = join(WS, 'uploads');
export function pickFile(kind: string): Promise<{ path: string | null; paths: string[] }> {
  // osascript só existe no macOS: fora dele devolve 400 e a UI abre o <input type="file"> do navegador
  if (process.platform !== 'darwin') fail('native file picker only on macOS');
  const types = kind === 'video' ? '"public.movie"' : kind === 'subtitle' ? '"srt","vtt"' : fail('kind: video or subtitle');
  const script = `set fs to choose file of type {${types}} with multiple selections allowed
set p to ""
repeat with f in fs
set p to p & POSIX path of f & linefeed
end repeat
return p`;
  return new Promise(ok => execFile('osascript', ['-e', script], (err, out) => {
    if (err || !out.trim()) return ok({ path: null, paths: [] });
    const paths = out.trim().split('\n').map(s => s.trim()).filter(Boolean);
    ok({ path: paths[0] || null, paths });
  }));
}

export async function probeMedia(input: string | string[]): Promise<{ duration: number; width: number; height: number; fps: number; count?: number }> {
  const rawPaths = Array.isArray(input) ? input : (typeof input === 'string' ? input.split(',').map(s => s.trim()).filter(Boolean) : []);
  const paths = rawPaths.map(expandHome);
  if (!paths.length || !existsSync(paths[0])) fail('file not found');

  const probeOne = (p: string) => new Promise<{ duration: number; width: number; height: number; fps: number }>((ok, no) => {
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', p], (err, out) => {
      if (err) return no(new UserError('not a readable video'));
      try {
        const j = JSON.parse(out), s = j.streams?.[0] ?? fail('no video stream'), [a, b] = String(s.r_frame_rate).split('/').map(Number);
        ok({ duration: Number(j.format.duration || 0), width: s.width, height: s.height, fps: Math.round((a / (b || 1)) * 100) / 100 });
      } catch (e: any) {
        no(new UserError(e.message));
      }
    });
  });

  const list = await Promise.all(paths.map(probeOne));
  const totalDuration = list.reduce((acc, cur) => acc + cur.duration, 0);
  return {
    duration: totalDuration,
    width: list[0].width,
    height: list[0].height,
    fps: list[0].fps,
    count: paths.length
  };
}
export async function upload(kind: string, name: string, stream: NodeJS.ReadableStream) {
  const ext = extname(name ?? '').toLowerCase();
  const allowed = kind === 'video' ? VIDEO_EXT : kind === 'subtitle' ? SUB_EXT : kind === 'media' ? MEDIA_EXT : fail('kind: video, subtitle or media');
  if (!allowed.includes(ext)) fail(`file must be ${allowed.join(' ')}`);
  mkdirSync(UPLOADS, { recursive: true });
  const path = join(UPLOADS, `${Date.now()}-${basename(name).replace(/[^\w.-]+/g, '_')}`);
  await pipe(stream, createWriteStream(path));
  return { path };
}
export const intake = (from: string, to: string) => from.startsWith(UPLOADS + sep) ? renameSync(from, to) : copyFileSync(from, to);   // uploads move, picked paths copy


// ---- formats (Editor 7.0) --------------------------------------------------------------------------------------------
// every format id comes from a URL or a request body, so the folder is only built from a safe id
const formatDir = (f: string) => safeId(f) ? join(WS, "formats", f) : fail('format id: letters, digits, - and _ only');
export function listFormats(): string[] {
  const p = join(WS, "formats");
  if (!existsSync(p)) return [];
  // hidden: true keeps a format folder (old projects open) out of the lists and the create dialog
  const dirs = readdirSync(p).filter(d => existsSync(join(p, d, "format.json"))).filter(d => { try { return !JSON.parse(readFileSync(join(p, d, "format.json"), "utf8")).hidden; } catch { return true; } });
  return dirs.sort((a, b) => {
    let fa = 999, fb = 999;
    try { fa = JSON.parse(readFileSync(join(p, a, "format.json"), "utf8")).order ?? 999; } catch {}
    try { fb = JSON.parse(readFileSync(join(p, b, "format.json"), "utf8")).order ?? 999; } catch {}
    if (fa !== fb) return fa - fb;
    return a.localeCompare(b);
  });
}

export function getFormat(id: string) {
  const file = join(formatDir(id), "format.json");
  if (!existsSync(file)) fail(`formato ${id} não encontrado`);
  return { ...JSON.parse(readFileSync(file, "utf8")), frames: formatFrames(id) };   // frames: the last reel rendered with it, for the create dialog
}
// <format>/frames/N.jpg: written by final() from the primary final of the last project that used the format
const formatFrames = (id: string): string[] => { const d = join(formatDir(id), 'frames'); return existsSync(d) ? readdirSync(d).filter(f => /^\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)) : []; };
export function formatFrameFile(id: string, f: string) {
  if (!formatFrames(id).includes(f)) fail(`no frame ${f}`);
  return join(formatDir(id), 'frames', f);
}
async function sampleFormatFrames(id: string, formatId: string, video: string, n = 6) {
  const dir = join(formatDir(formatId), 'frames');
  const dur = (await probeMedia(video)).duration || 0;
  if (!dur) return;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  for (let k = 0; k < n; k++) await run(id, 'ffmpeg', ['-v', 'error', '-y', '-ss', ((k + 0.5) * dur / n).toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=270:-2', join(dir, `${k}.jpg`)]);
}

// Creative brief of the format picked on the first screen, appended to the script prompt.
// Brand rules stay the authority on look (colours, fonts, icons, tone); the format owns structure and rhythm.
// reference.json of a landing-page reference, or null (video reference or none)
function siteRef(st: State): any {
  const f = join(projDir(st.id), 'reference.json');
  if (!existsSync(f)) return null;
  const r = readJSON(f);
  return r.isSite ? r : null;
}
// Absolute paths of the site screenshots and images, for prompts whose model can Read the project folder
function siteFiles(id: string): string {
  const P = projDir(id), img = join(P, 'assets', 'img');
  if (!existsSync(join(P, 'ref_site'))) return '';
  const shots = ['top_desktop.png', 'top_mobile.png'].map(f => join(P, 'ref', f)).filter(existsSync);
  const imgs = existsSync(img) ? readdirSync(img).filter(f => !f.startsWith('.')).map(f => join(img, f)) : [];
  return `Site screenshots (Read them): ${shots.join(', ')}\nSite images (assets/img/, Read the ones you may use): ${imgs.join(', ')}\n`;
}

function referenceGuide(st: State): string {
  return mainReferenceGuide(st) + extraReferenceGuide(st);
}

// The other links the user gave, each analysed in ref_extra/<k>/ (site: screenshots + images copied to assets/img/x<k>_*; video: frames)
function extraReferenceGuide(st: State): string {
  const parts = (st.extraReferenceUrls ?? []).map((url, k) => {
    const D = join(projDir(st.id), 'ref_extra', String(k)), f = join(D, 'reference.json');
    if (!existsSync(f)) return '';
    const r = readJSON(f);
    const shots = r.isSite ? ['top_desktop.png', 'top_mobile.png'] : readdirSync(join(D, 'ref')).filter(x => x.endsWith('.jpg'));
    return `\n## Referência extra ${k + 1}: ${url} (${r.isSite ? 'site' : 'vídeo'})\n` +
      `- prints/quadros (Read): ${shots.map(x => join(D, 'ref', x)).join(', ')}\n` +
      (r.isSite && r.downloadedImages?.length ? `- imagens em assets/img/: ${r.downloadedImages.map((x: string) => `x${k}_${x}`).join(', ')}\n` : '') +
      ['summary', 'visual_summary', 'pacing', 'cards', 'motion', 'captions', 'colors', 'fonts', 'iconography', 'content_data', 'images']
        .filter(x => r[x]).map(x => `- ${x}: ${r[x]}`).join('\n');
  }).filter(Boolean);
  return parts.length ? `\n# Outras referências do usuário - use cada uma para o que a expectativa do usuário pedir${st.referenceNote ? ` (${st.referenceNote})` : ''}\n` + parts.join('\n') : '';
}

function mainReferenceGuide(st: State): string {
  const f = join(projDir(st.id), 'reference.json');
  if (!existsSync(f)) return '';
  const r = readJSON(f);
  if (r.isSite) {
    return `\n# Site de referência (${st.referenceUrl}) - reproduza a identidade visual, cores e utilize as imagens do site disponíveis em assets/img/\n` +
      'PRIORIDADE (vale sobre brand.md e sobre o formato): 1) a expectativa do usuário abaixo; 2) o site, que é a campanha atual: ' +
      'paleta (siteColors), imagens e números do site vencem as cores do brand.md e qualquer regra "só texto" do formato; 3) o formato (ritmo e estrutura); ' +
      '4) brand.md (tom e fonte). Conecte a fala ao site: quando a fala cita um produto, trilha, número ou prova, mostre a imagem ou o dado do site ' +
      'correspondente. Se a fala e o site divergem num número, use o da fala e não invente outro.\n' +
      (r.siteColors ? `- paleta do site (use estes hex): ${JSON.stringify(r.siteColors)}\n` : '') +
      (r.downloadedImages?.length ? `- arquivos em assets/img/: ${r.downloadedImages.join(', ')}\n` : '') +
      `- resumo da marca: ${r.summary}\n` +
      `- visual: ${r.visual_summary || ''}\n` +
      `- cores: ${r.colors}\n` +
      `- tipografia: ${r.fonts}\n` +
      `- cards sugeridos: ${r.cards}\n` +
      `- motion: ${r.motion}\n` +
      `- legendas: ${r.captions}\n` +
      (r.images ? `- catálogo de imagens: ${r.images}\n` : '') +
      (r.content_data ? `- dados e números do site: ${r.content_data}\n` : '') +
      (st.referenceNote ? `- expectativa do usuário: ${st.referenceNote}\n` : '');
  }
  return `\n# Reference reel (${st.referenceUrl}) - edit in this reel's style, keeping the brand's colors/fonts unless told otherwise\n` +
    ['summary', 'pacing', 'cards', 'motion', 'captions', 'colors', 'fonts'].map(k => `- ${k}: ${r[k]}`).join('\n') +
    (st.referenceNote ? `\n- what the user expects from this reference (priority): ${st.referenceNote}` : '');
}

// Analisa a referência: se for site (landing page), extrai capturas, imagens, iconografia e cores. Se for vídeo, baixa com yt-dlp.
async function ensureReference(id: string, st: State) {
  await ensureMainReference(id, st);
  for (const [k, url] of (st.extraReferenceUrls ?? []).entries()) {
    const D = join(projDir(id), 'ref_extra', String(k));
    if (existsSync(join(D, 'reference.json'))) continue;
    mkdirSync(D, { recursive: true });
    emit(id, 'log', `🔗 Analisando referência extra ${k + 1}: ${url}`);
    try {
      if (isVideoReference(url)) await analyseVideoReference(id, st, url, D);
      else {
        const r = await processSiteReference(id, url, st.referenceNote, D, logCost(st));
        const img = join(projDir(id), 'assets', 'img');
        mkdirSync(img, { recursive: true });
        for (const f of r.downloadedImages ?? []) copyFileSync(join(D, 'assets', 'img', f), join(img, `x${k}_${f}`));
      }
    } catch (e: any) { emit(id, 'log', `⚠ referência extra ${k + 1} ignorada: ${e.message}`); }  // an extra link never blocks the edit
  }
  if (st.extraReferenceUrls?.length) await commit(id, 'extra references analysed');
}

async function ensureMainReference(id: string, st: State) {
  const P = projDir(id), out = join(P, 'reference.json');
  if (!st.referenceUrl || existsSync(out)) return;

  if (!isVideoReference(st.referenceUrl)) {
    emit(id, 'log', `🌐 Analisando site de referência: ${st.referenceUrl}`);
    await processSiteReference(id, st.referenceUrl, st.referenceNote, P, logCost(st));
    await commit(id, 'site reference analysed and assets downloaded');
    emit(id, 'log', '✓ Site de referência analisado com sucesso! Imagens salvas em assets/img/');
    return;
  }

  await analyseVideoReference(id, st, st.referenceUrl, P);
  await commit(id, 'reference analysed');
}

// Downloads a reel/video link and writes <P>/reference.json from 12 frames saved in <P>/ref/
async function analyseVideoReference(id: string, st: State, url: string, P: string) {
  const out = join(P, 'reference.json'), dir = join(P, 'ref');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  const clip = join(dir, 'ref.mp4');
  await run(id, YT_DLP, ['-f', 'best[ext=mp4]/best', '--download-sections', '*0-60', '-o', clip, '--', url]);
  const dur = await duration(id, clip);
  const cuts = [...(await run(id, 'ffmpeg', ['-v', 'info', '-i', clip, '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'], {}, true)).out.matchAll(/pts_time:([\d.]+)/g)].map(m => +m[1]);
  const frames: string[] = [];
  for (let k = 0; k < 12; k++) {
    const f = join(dir, `${k}.jpg`);
    await run(id, 'ffmpeg', ['-v', 'error', '-y', '-ss', ((k + 0.5) * dur / 12).toFixed(2), '-i', clip, '-frames:v', '1', '-vf', 'scale=360:-2', f]);
    frames.push(f);
  }
  const res = await ask<Record<string, string>>('reference', 'reference:analyze', {
    system: 'You analyse a short-form reel used as a style reference for another edit. Read every frame, then describe, in Brazilian Portuguese and concretely ' +
      '(numbers, positions, effects), how it is edited so an art director can reproduce the style with different content.',
    readDir: P,
    content: `Frames: ${frames.join(', ')}. Read each one first.\n` + (st.referenceNote ? `The user expects this from the reference: ${st.referenceNote}\n` : '') + JSON.stringify({ duration: dur, cutTimes: cuts, avgSecondsPerCut: cuts.length ? +(dur / (cuts.length + 1)).toFixed(2) : null }),
    schema: obj({ summary: str, pacing: str, cards: str, motion: str, captions: str, colors: str, fonts: str }),
  }, logCost(st));
  writeJSON(out, res);
}

function formatGuide(st: State): string {
  let f: any;
  try { f = getFormat(st.formatId || 'business-reels'); } catch { return ''; }
  let skill: any = null; if (st.skillId) try { skill = getSkill(st.skillId); } catch {}
  if (skill) f = resolveChoices({ format: f, skill }).format;
  const z = f.safeZones, r = effectivePace(st);
  const lines = [
    `Format: ${f.name} (${f.aspectRatio ?? '9:16'}${f.speaker === false ? ', no speaker on screen' : ''})`,
    f.planos?.length && `Speaker shots this format allows: ${f.planos.join(', ')} (cut = cut-out full screen, panel = raw video in a bottom panel, panel-top = raw video on top, raw = raw full screen, none = animation only, react = reference video beside the speaker)`,
    f.regras && `When each shot is used: ${f.regras}`,
    f.janelas?.cut && `The speaker is cut out only in these windows (seconds; "tail" = counted from the end): ${JSON.stringify(f.janelas.cut)}`,
    `Rhythm (${skill ? 'locked by the skill' : st.pace ?? 'dinamico'}): something new on screen about every ${r.every}s, scenes of ${r.scene[0]}-${r.scene[1]}s`,
    z && `Keep graphics inside the safe zones (px): top ${z.top}, bottom ${z.bottom}, left ${z.left}, right ${z.right}`,
  ].filter(Boolean);
  return `# Format brief (chosen by the user, follow it)\n${lines.join('\n')}\n` +
    (siteRef(st) ? 'A site reference is attached below: its palette, images and facts win over the brand colours and over any "text only" rule of this format; the brand keeps fonts and tone; the format decides which shots the speaker gets and when, the rhythm toggle decides the pace.\n\n'
      : 'The brand rules above always win on colours, fonts, icons, tone and caption look; the format decides layout, structure and rhythm.\n\n') +
    styleGuide(st) + referenceGuide(st) + userImageGuide(st);
}
// Images the user sent with the form: an image card points at one of them (src = the path listed here).
function userImageGuide(st: State): string {
  if (!st.userImages?.length) return '';
  return `\n# Imagens enviadas pelo usuário - quando a fala citar o que uma delas mostra (produto, print, tela, logo, pessoa), use a imagem num card image {src: "<caminho>"}. Não invente outras imagens.\n` +
    st.userImages.map(p => `- ${p}`).join('\n') + '\n';
}


export function createFormat(id: string, data?: any) {
  const dir = formatDir(id);
  if (existsSync(dir)) fail(`formato ${id} já existe`);
  mkdirSync(dir, { recursive: true });
  const base = data && typeof data === "object" ? data : {
    id,
    name: id,
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    speaker: true,
    planos: ["cut", "none"],
    janelas: null,
    regras: "",
    safeZones: { top: 200, bottom: 380, left: 70, right: 70 },
  };
  base.id = id;
  const bad = validateFormat(base);
  if (bad.length) { rmSync(dir, { recursive: true, force: true }); fail(bad.join('; ')); }
  writeFileSync(join(dir, "format.json"), JSON.stringify(base, null, 2));
  return base;
}

// ---- motion styles (workspace/styles/<id>/: style.json, refs/ with the frames the style came from, optional skill.md) ----------
// A style is the motion design cloned from references (typography, camera, beats, sfx, GSAP recipes); the format owns layout,
// face tracking and rhythm. Rhythm and sound hits are measured here with ffmpeg; Opus only reads the frames and writes the
// visual direction, so those numbers never come from the model's eye.
export const execP = (cmd: string, args: string[]) => new Promise<string>((ok, ko) =>
  execFile(cmd, args, { maxBuffer: 64 << 20 }, (e, out, err) => e ? ko(new Error(`${cmd} failed: ${String(err || e.message).slice(-400)}`)) : ok(out + err)));

// Sound-effect hits of a clip: energy jumps above 2.5 kHz (a voice carries little there, whooshes/clicks/pops a lot), as seconds.
// shortcut: no voice separation, so sibilants can show up as hits; the model sees the frame at each hit and drops the ones that are speech
async function sfxOnsets(clip: string, dur: number): Promise<number[]> {
  const pcm: Buffer = await new Promise((ok, ko) => execFile('ffmpeg', ['-v', 'error', '-t', '60', '-i', clip, '-vn', '-ac', '1', '-ar', '16000', '-af', 'highpass=f=2500', '-f', 's16le', '-'],
    { encoding: 'buffer', maxBuffer: 64 << 20 }, (e, out) => e ? ko(e) : ok(out)));
  const W = 320, n = Math.floor(pcm.length / 2 / W), e: number[] = [];   // 20 ms windows
  for (let i = 0; i < n; i++) { let acc = 0; for (let j = 0; j < W; j++) { const v = pcm.readInt16LE((i * W + j) * 2); acc += v * v; } e.push(Math.sqrt(acc / W)); }
  const hits: number[] = [];
  for (let i = 10; i < n; i++) {
    const base = e.slice(i - 10, i).reduce((a, b) => a + b, 0) / 10 + 30;   // 200 ms of context, +30 so silence does not trigger
    if (e[i] > base * 3 && (!hits.length || i * 0.02 - hits[hits.length - 1] > 0.25)) hits.push(+(i * 0.02).toFixed(2));
  }
  return hits.filter(t => t <= dur);
}

const styleDir = (s: string) => safeId(s) ? join(WS, 'styles', s) : fail('style id: letters, digits, - and _ only');
export const listMotionStyles = (): string[] => existsSync(join(WS, 'styles')) ? readdirSync(join(WS, 'styles')).filter(d => existsSync(join(WS, 'styles', d, 'style.json'))).sort() : [];
export function getStyle(id: string) {
  const file = join(styleDir(id), 'style.json');
  if (!existsSync(file)) fail(`estilo ${id} não encontrado`);
  return { ...JSON.parse(readFileSync(file, 'utf8')), refs: styleRefs(id).map(f => basename(f)) };   // refs: the frames beside it, for the UI covers
}
// pack = a file of compose/estilos/, engine = a file of compose/engines/: a typo here would only show up as a missing file inside a render
function checkStyleRefs(s: any) {
  if (s?.pack != null && !(safeId(s.pack) && existsSync(join(K_DIR, 'estilos', s.pack)))) fail(`pack ${JSON.stringify(s.pack)} não existe em compose/estilos/`);
  if (s?.engine != null && !(safeId(s.engine) && existsSync(join(K_DIR, 'engines', `${s.engine}.js`)))) fail(`engine ${JSON.stringify(s.engine)} não existe em compose/engines/`);
}
export function createStyle(id: string, data: any) {
  const dir = styleDir(id);
  if (existsSync(dir)) fail(`estilo ${id} já existe`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('style must be an object');
  const { refs: _r, ...fields } = data;   // refs is what getStyle adds on read, not a field
  checkStyleRefs(fields);
  mkdirSync(dir, { recursive: true });
  const base = { name: id, ...fields, id, camera: clampCamera(fields.camera) };
  writeFileSync(join(dir, 'style.json'), JSON.stringify(base, null, 2));
  return base;
}
export function updateStyle(id: string, data: any) {
  const file = join(styleDir(id), 'style.json');
  if (!existsSync(file)) fail(`estilo ${id} não encontrado`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('style must be an object');
  const { refs: _r, ...fields } = data;
  const next = { ...deepMerge(JSON.parse(readFileSync(file, 'utf8')), fields), id };
  checkStyleRefs(next);
  next.camera = clampCamera(next.camera);
  writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}
export function deleteStyle(id: string) {
  const dir = styleDir(id);
  if (!existsSync(dir)) fail(`estilo ${id} não encontrado`);
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, deleted: id };
}
export function styleRefFile(id: string, f: string) {
  getStyle(id);
  if (!/^[\w.-]+\.(jpe?g|png|webp)$/i.test(f) || f.includes('..') || !existsSync(join(styleDir(id), 'refs', f))) fail(`no ref ${f}`);
  return join(styleDir(id), 'refs', f);
}
const styleSkill = (id: string): string => { try { const f = join(styleDir(id), 'skill.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; } catch { return ''; } };
const styleRefs = (id: string): string[] => { const d = join(styleDir(id), 'refs'); return existsSync(d) ? readdirSync(d).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => join(d, f)) : []; };

// ---- skills (workspace/skills/<id>/: skill.json with format · look · rhythm, refs/ with the frames it came from, optional skill.md) ------------
// A skill is ONE cloned video, locked as a whole: its format shots, its look and its rhythm replace the three selectors of a project.
const skillDir = (s: string) => safeId(s) ? join(WS, 'skills', s) : fail('skill id: letters, digits, - and _ only');
export const listSkills = (): string[] => existsSync(join(WS, 'skills')) ? readdirSync(join(WS, 'skills')).filter(d => existsSync(join(WS, 'skills', d, 'skill.json'))).sort() : [];
const skillRefs = (id: string): string[] => { const d = join(skillDir(id), 'refs'); return existsSync(d) ? readdirSync(d).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => join(d, f)) : []; };
const skillMd = (id: string): string => { try { const f = join(skillDir(id), 'skill.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; } catch { return ''; } };
export function getSkill(id: string) {
  const file = join(skillDir(id), 'skill.json');
  if (!existsSync(file)) fail(`skill ${id} não encontrada`);
  return { ...JSON.parse(readFileSync(file, 'utf8')), refs: skillRefs(id).map(f => basename(f)) };
}
// what the UI and the shared style views read: the three drawers plus the flat style shape (guide, beats, camera...) of the same skill
export const getSkillView = (id: string) => { const k = getSkill(id); return { ...k, ...skillAsStyle(k), refs: k.refs }; };
export function createSkill(id: string, data: any) {
  const dir = skillDir(id);
  if (existsSync(dir)) fail(`skill ${id} já existe`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('skill must be an object');
  const { refs: _r, ...fields } = data;
  if (fields.format?.planos) { const bad = validateFormat({ panel: { top: 0.5 }, ...fields.format }); if (bad.length) fail(bad.join('; ')); }
  mkdirSync(dir, { recursive: true });
  const base = { name: id, format: {}, look: {}, rhythm: {}, colorsLocked: false, ...fields, id };
  writeFileSync(join(dir, 'skill.json'), JSON.stringify(base, null, 2));
  return base;
}
export function updateSkill(id: string, data: any) {
  const file = join(skillDir(id), 'skill.json');
  if (!existsSync(file)) fail(`skill ${id} não encontrada`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('skill must be an object');
  const { refs: _r, guide, ...fields } = data;   // `guide` is the flat name the shared style views send: it lives in look.guide
  const next = { ...deepMerge(JSON.parse(readFileSync(file, 'utf8')), guide !== undefined ? { ...fields, look: { ...(fields.look ?? {}), guide } } : fields), id };
  if (next.format?.planos) { const bad = validateFormat({ panel: { top: 0.5 }, ...next.format }); if (bad.length) fail(bad.join('; ')); }
  writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}
export function deleteSkill(id: string) {
  const dir = skillDir(id);
  if (!existsSync(dir)) fail(`skill ${id} não encontrada`);
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, deleted: id };
}
export function skillRefFile(id: string, f: string) {
  getSkill(id);
  if (!/^[\w.-]+\.(jpe?g|png|webp)$/i.test(f) || f.includes('..') || !existsSync(join(skillDir(id), 'refs', f))) fail(`no ref ${f}`);
  return join(skillDir(id), 'refs', f);
}

// World-camera limits of kit.py (GUIDE.md "Câmera de mundo"): out of range is a lint error in the composer, so a cloned move is kept inside them.
const CAM_LIMIT: Record<string, [number, number]> = { push: [0.9, 1.35], pull: [0.9, 1.35], pan: [-120, 120], crane: [-120, 120], tilt: [-8, 8], orbit: [-8, 8], roll: [-6, 6] };
const camUnit = (kind: string) => kind === 'push' || kind === 'pull' ? ' scale' : kind === 'pan' || kind === 'crane' ? ' px' : '°';
export function clampCamera(cam: any) {
  if (!cam || typeof cam !== 'object' || !Array.isArray(cam.world)) return cam;
  const world = cam.world.filter((m: any) => m && CAM_LIMIT[m.kind]).map((m: any) => {
    const [lo, hi] = CAM_LIMIT[m.kind], v = Number(m.amount);
    return { ...m, amount: Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo)) };
  });
  return { ...cam, world };
}

// The style's brief, read by the motion model (after the format brief) and by the agent composer (brief.md).
function styleBrief(s: any, refs: string[] = [], userSkill: string = styleSkill(s.id)): string {
  const cam = s.camera ?? {};
  const lines = [
    s.guide && `Style guide: ${s.guide}`,
    s.pack && `Illustration pack: ESTILO.md in the compose folder is how every illustration is drawn (materials, colour, line, light, motion)${s.engine ? `; the engine is canvas(..., engine='${s.engine}')` : ''}. The brand keeps colours and motifs, the pack the technique.`,
    s.motif && `Recurring motif (bring it back through the reel): ${s.motif}`,
    s.palette?.length && `Palette of the reference (approximate hex; the brand colours take their place, keep the roles and contrasts): ${s.palette.map((p: any) => `${p.hex} = ${p.role}`).join(', ')}`,
    s.pace && `Measured rhythm of the reference: a new screen about every ${s.pace}s${s.sfxPerMinute ? `, ${s.sfxPerMinute} sound hits per minute` : ''}`,
    cam.world?.length ? `World camera (the scene(..., world=) grammar of kit.py; amounts are targets):\n- ${cam.world.map((m: any) => `${m.kind} ${m.amount}${camUnit(m.kind)}: ${m.when}`).join('\n- ')}`
      : (cam.framing || cam.transitions) && 'World camera: none in the reference (static stage); do not invent camera moves',
    cam.framing && `Presenter framing: ${cam.framing}`,
    cam.transitions && `Scene transitions: ${cam.transitions}`,
    cam.depth && `Depth and focus: ${cam.depth}`,
    cam.signature && `Signature shot (mark it signature=True): ${cam.signature}`,
    s.beats?.length && `Beats of the reference (what is on screen and how it moves; reproduce the design, never the words):\n- ${s.beats.slice(0, 12).map((b: any) =>
      `${b.from}-${b.to}s · ${b.composition} · ${b.elements} · type: ${b.typography} · motion: ${b.motion} · out: ${b.transitionOut}${b.sfx ? ` · sfx: ${b.sfx}` : ''}`).join('\n- ')}`,
    refs.length && `Reference frames and images of the style (open each with Read before composing: the motion, textures and composition come from them, not the words): ${refs.join(', ')}`,
    s.styleCatalog?.length && `Style catalog (vary between these):\n- ${s.styleCatalog.join('\n- ')}`,
    s.sfxRules?.length && `Sound effects of this style (names from sfx/manifest.json):\n- ${s.sfxRules.map((r: any) => `${r.when} → ${r.sfx || 'no matching sound'} (${r.level})`).join('\n- ')}`,
    (s.sfxGainDb || s.sfxForbidden?.length) && `Sound effects: ${s.sfxGainDb ? `overall gain ${s.sfxGainDb} dB. ` : ''}${s.sfxForbidden?.length ? `Never use: ${s.sfxForbidden.join(', ')}.` : ''}`,
    s.motionRecipes?.length && `Motion recipes of this style (GSAP, adapt SEL and values):\n- ${s.motionRecipes.map((r: any) => `${r.name} (${r.use}): ${r.gsap}`).join('\n- ')}`,
    userSkill && `Skill of this style (the user's own rules, they win):\n${userSkill}`,
  ].filter(Boolean);
  return lines.join('\n');
}
export function styleGuide(st: State): string {
  if (st.skillId) try {
    const k = getSkill(st.skillId);
    return `# Skill brief (a cloned video the user chose; it locks the speaker's shots, the look and the rhythm, follow it to the letter; the brand still decides colours and fonts${k.colorsLocked ? ', except the palette this skill locks' : ''})\n${styleBrief(skillAsStyle(k), skillRefs(k.id), skillMd(k.id))}\n\n`;
  } catch { /* a skill that vanished: fall through to the style */ }
  if (!st.styleId) return '';
  let s: any;
  try { s = getStyle(st.styleId); } catch { return ''; }
  return `# Style brief (motion style chosen by the user, follow it; the format decides layout and the speaker's shots, the rhythm toggle decides the pace, the brand decides colours and fonts)\n${styleBrief(s)}\n\n`;
}

// Clone a motion style: reference videos (links or files) and images become workspace/styles/<id>/.
type CloneBody = { id: string; name?: string; urls?: string[]; paths?: string[]; note?: string; skill?: string };
// "clonar só o visual": the look of the reel, saved as a style (no shots, no rhythm); cloneSkill keeps the whole video as a skill
export const cloneStyle = (body: CloneBody) => cloneRef('style', body);
export const cloneSkill = (body: CloneBody) => cloneRef('skill', body);
async function cloneRef(kind: 'style' | 'skill', body: CloneBody) {
  const id = body?.id, dir = kind === 'skill' ? skillDir(id) : styleDir(id);
  if (existsSync(dir)) fail(`${kind === 'skill' ? 'skill' : 'estilo'} ${id} já existe`);
  const urls = (body.urls ?? []).map(u => String(u).trim()).filter(Boolean), paths = (body.paths ?? []).map(expandHome);
  const videos = paths.filter(p => VIDEO_EXT.includes(extname(p).toLowerCase())), images = paths.filter(p => IMAGE_EXT.includes(extname(p).toLowerCase()));
  if (!urls.length && !videos.length && !images.length && !body.skill?.trim()) fail('envie ao menos um vídeo, link, imagem ou skill de referência');
  if (urls.length + videos.length > 5) fail('use no máximo 5 vídeos de referência');
  for (const p of [...videos, ...images]) if (!existsSync(p)) fail(`arquivo não encontrado: ${p}`);
  const skill = typeof body.skill === 'string' ? body.skill.trim().slice(0, 30_000) : '';
  const refs = join(dir, 'refs');
  mkdirSync(refs, { recursive: true });
  const grab = async (clip: string, t: number, f: string, w = 540) => { await execP('ffmpeg', ['-v', 'error', '-y', '-ss', Math.max(0, t).toFixed(2), '-i', clip, '-frames:v', '1', '-vf', `scale=${w}:-2`, f]); return f; };
  try {
    const clips = [...videos];
    for (const [i, u] of urls.entries()) {
      const f = join(refs, `dl${i}.mp4`);
      await execP(YT_DLP, ['-f', 'best[ext=mp4]/best', '--download-sections', '*0-60', '-o', f, '--', u]);
      clips.push(f);
    }
    const frames: string[] = [], pairs: string[] = [], hires: string[] = [], hitFrames: string[] = [];
    const stats: { clip: string; duration: number; cuts: number; secondsPerCut: number; size: string; sfxHits?: number[] }[] = [];
    for (const [i, clip] of clips.entries()) {
      const info = (await execP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', clip]));
      const j = JSON.parse(info), dur = Math.min(60, Number(j.format.duration) || 0), size = `${j.streams?.[0]?.width}x${j.streams?.[0]?.height}`;
      const cuts = [...(await execP('ffmpeg', ['-v', 'info', '-t', '60', '-i', clip, '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'])).matchAll(/pts_time:([\d.]+)/g)].map(m => +m[1]);
      stats.push({ clip: basename(clip), duration: +dur.toFixed(1), cuts: cuts.length, secondsPerCut: +(dur / (cuts.length + 1)).toFixed(2), size });
      // the opening frame, one frame just after each cut (at most 12 per video) and the last held frame (end card, CTA)
      const step = Math.max(1, Math.ceil(cuts.length / 10)), times = [0.2, ...cuts.filter((_, k) => k % step === 0).map(t => t + 0.15)].slice(0, 11);
      // a continuous take has no cuts: sample evenly so the model still sees how the on-screen text and graphics change over time
      for (let k = 1; times.length < 6 && dur > 2; k++) times.push(dur * k / 6);
      if (dur > 1) times.push(dur - 0.3);
      const hits = await sfxOnsets(clip, dur).catch(() => [] as number[]);
      stats[stats.length - 1].sfxHits = hits.slice(0, 40);
      for (const [k, t] of hits.slice(0, 6).entries()) hitFrames.push(await grab(clip, t - 0.05, join(refs, `h${i}_${k}.jpg`)));   // the frame at a hit shows what the sound belongs to
      for (const [k, t] of times.entries()) {
        frames.push(await grab(clip, t, join(refs, `v${i}_${k}.jpg`)));
        if (k < 6 && t + 0.4 < dur) pairs.push(await grab(clip, t + 0.4, join(refs, `v${i}_${k}b.jpg`)));   // a second frame 0.4 s later: the camera and the motion show in the difference
      }
      // shortcut: the two full-width frames are the opening and the middle of the clip, not the densest beat (unknown before the model reads); upgrade if type details come out wrong
      hires.push(await grab(clip, 0.2, join(refs, `x${i}_0.jpg`), 1080), await grab(clip, dur / 2, join(refs, `x${i}_1.jpg`), 1080));
    }
    const imgs = images.map((p, k) => { const f = join(refs, `img${k}${extname(p).toLowerCase()}`); intake(p, f); return f; });
    const avg = stats.length ? +(stats.reduce((a, s) => a + s.secondsPerCut, 0) / stats.length).toFixed(2) : null;
    const move = obj({ kind: { type: 'string', enum: Object.keys(CAM_LIMIT) }, when: str, amount: num });
    const res = await ask<any>('cloneFormat', 'style:clone', {
      system: 'You are a motion graphics director cloning the motion design of reference videos into a reusable style for a talking-head reel editor. Read every frame and image first, across the whole duration. ' +
        'Work in this order (the fields of the answer are in that order): (1) beats: a shot-by-shot breakdown, at most 12 per video, each with its time range, composition and camera, every element (icons, illustrations, shapes, 3D), the typography (weight, case, size hierarchy, colour, how it animates), the motion, the transition into the next beat and the sound; ' +
        '(2) palette: the colours as approximate hex with their role (background, ink, accent, gradient, glow); (3) camera; (4) motif: the recurring element that defines the style; then (5) guide: the condensed direction another designer follows to rebuild the style with different content ' +
        '(typography, colour use, card/graphic types, how elements enter and leave, text-versus-presenter layout, density), and the recipes. Be concrete (positions, sizes, colours, durations). Write in Brazilian Portuguese. Never copy the on-screen words of the references, only the design. ' +
        'Rhythm numbers and sound-hit times are measured by a script and given to you: use them, do not re-estimate. Frames named v*b.jpg were taken 0.4 s after the frame of the same number: compare the pair to read the camera and the motion. x*.jpg are full-width for type and icon detail. ' +
        'camera.world: the camera moves seen, in this grammar: push/pull (target scale 0.9-1.35), pan/crane (px, up to ±120), tilt/orbit (degrees, up to ±8), roll (degrees, up to ±6); "when" says on which kind of beat it happens. Empty list when the stage is static: never invent moves. ' +
        'camera.framing: presenter framing modes used (M, L, XL punch-in, XXL) and how the frame changes (hold, snap, push, shake) and every how many seconds. camera.transitions: which transitions appear (push, fade, slide, wipe, cut) and how often the hard cut. ' +
        'camera.depth: parallax between layers (plate, background, presenter, foreground) and how much, depth-of-field blur (what is sharp, what is soft), and where the focal point sits per kind of scene. camera.signature: the single most striking shot. ' +
        'sfxRules: which visual event gets which sound (sfx = a name from the available list, or "" if the reference plays something not in the list); ignore hits that are speech; empty list if the video has no effects. ' +
        'motionRecipes: 3 to 6 reusable motions of this style as GSAP fragments (tween/timeline calls on the selector placeholder SEL, with from/to values, duration and ease), concrete enough to paste. ' +
        'sfxGainDb: overall sound-effect gain in dB when stated (negative number), else 0. sfxForbidden: sounds the skill or user rejects (e.g. typing, riser), else empty. sceneSeconds: typical seconds one idea/scene stays on screen, from the skill or the frames; 0 if unknown.',
      readDir: refs,
      content: `Frames from reference videos (read each): ${frames.join(', ') || 'none'}\nFrames 0.4 s after the ones above (read each, compare the pairs): ${pairs.join(', ') || 'none'}\nFull-width frames (type and icon detail): ${hires.join(', ') || 'none'}\nFrames at detected sound hits (read each): ${hitFrames.join(', ') || 'none'}\nAvailable sound effects (use these names only): ${Object.keys(JSON.parse(readFileSync(join(SKILL, 'compose/sfx/manifest.json'), 'utf8'))).join(', ')}\nDesign reference images (the target look, not content): ${imgs.join(', ') || 'none'}\n` +
        `Measured: ${JSON.stringify(stats)}\n` + (body.note ? `What the user wants copied (priority): ${body.note}\n` : '') +
        (skill ? `\nA skill the user already uses with Claude for this style. Its rules WIN over what you infer from the frames; fold them into guide, sfxRules and motionRecipes:\n<skill>\n${skill}\n</skill>\n` : ''),
      schema: obj({
        beats: { type: 'array', items: obj({ from: num, to: num, composition: str, elements: str, typography: str, motion: str, transitionOut: str, sfx: str }) },
        palette: { type: 'array', items: obj({ hex: str, role: str }) },
        camera: obj({ world: { type: 'array', items: move }, framing: str, transitions: str, depth: str, signature: str }),
        motif: str, name: str, description: str, guide: str,
        sfxRules: { type: 'array', items: obj({ when: str, sfx: str, level: { type: 'string', enum: ['subtle', 'normal', 'loud'] } }) },
        sfxGainDb: num, sfxForbidden: { type: 'array', items: str }, sceneSeconds: num,
        motionRecipes: { type: 'array', items: obj({ name: str, use: str, gsap: str }) },
      }),
    }, c => console.log(`[clone ${kind} ${id}] ${c.model} in=${c.in} out=${c.out}`));
    // secondsPerCut only means something when the video has cuts; a continuous take has none, so the model's sceneSeconds stands in
    const cutCount = stats.reduce((a, x) => a + x.cuts, 0);
    const pace = cutCount && avg ? Math.min(6, Math.max(0.5, avg)) : res.sceneSeconds > 0 ? Math.min(12, Math.max(0.5, res.sceneSeconds)) : 0;
    const base: any = {
      id, name: body.name?.trim() || res.name, description: res.description, guide: res.guide, motif: res.motif, palette: res.palette,
      camera: clampCamera(res.camera), beats: (res.beats ?? []).slice(0, 12 * Math.max(1, clips.length)), pace: pace || undefined,
      sfxRules: res.sfxRules, sfxGainDb: res.sfxGainDb || undefined, sfxForbidden: res.sfxForbidden?.length ? res.sfxForbidden : undefined,
      sfxPerMinute: stats.length ? Math.round(stats.reduce((a, x) => a + (x.sfxHits?.length ?? 0) / Math.max(1, x.duration), 0) / stats.length * 60) : 0, motionRecipes: res.motionRecipes,
      clonedFrom: { urls, measured: stats, note: body.note ?? '' },
    };
    if (skill) writeFileSync(join(dir, 'skill.md'), skill);   // also given verbatim to every project that uses it
    const out = kind === 'skill' ? styleToSkill(base) : lookOnly(base);
    writeFileSync(join(dir, kind === 'skill' ? 'skill.json' : 'style.json'), JSON.stringify(out, null, 2));   // refs/ stays beside it: the images and frames it came from
    return out;
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

// Compares a render made with a cloned style (frames) against the beats, camera and frames the style was cloned from, and rewrites the guide where they differ.
// The render is made by the user in a normal project; the loop here is compare -> fix the style -> render again.
export const refineStyle = (id: string, body: { path?: string; note?: string }) => refineRef('style', id, body);
export const refineSkill = (id: string, body: { path?: string; note?: string }) => refineRef('skill', id, body);
async function refineRef(kind: 'style' | 'skill', id: string, body: { path?: string; note?: string }) {
  const dir = kind === 'skill' ? skillDir(id) : styleDir(id), file = join(dir, kind === 'skill' ? 'skill.json' : 'style.json'), refs = join(dir, 'refs');
  if (!existsSync(file) || !existsSync(refs)) fail(`${kind === 'skill' ? 'skill' : 'estilo'} ${id} não foi criado por clone`);
  const clip = expandHome(String(body?.path ?? ''));
  if (!VIDEO_EXT.includes(extname(clip).toLowerCase()) || !existsSync(clip)) fail('path: caminho de um vídeo (.mp4 .mov) renderizado com este estilo');
  const dur = Number((await execP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip])).trim()) || 0;
  const out = join(dir, 'refs-test');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out);
  const test: string[] = [];
  for (let k = 0; k < 6; k++) {
    const f = join(out, `t${k}.jpg`);
    await execP('ffmpeg', ['-v', 'error', '-y', '-ss', ((k + 0.5) * dur / 6).toFixed(2), '-i', clip, '-frames:v', '1', '-vf', 'scale=540:-2', f]);
    test.push(f);
  }
  const orig = readdirSync(refs).filter(f => /^v\d+_\d+\.jpg$/.test(f)).slice(0, 8).map(f => join(refs, f));
  const raw = JSON.parse(readFileSync(file, 'utf8')), cur = kind === 'skill' ? skillAsStyle(raw) : raw;
  const res = await ask<any>('cloneFormat', 'style:refine', {
    system: 'You compare a render made with a cloned motion style against the reference it was cloned from. Read every frame of both sets, list concrete differences ' +
      '(typography, colours, layout, element types, camera and motion you can infer, density), then rewrite the guide so the next render is closer. Keep what already matches. match is a 0-10 similarity score. Write in Brazilian Portuguese.',
    readDir: dir,
    content: `Reference frames (the target): ${orig.join(', ')}\nRender frames (what the style produced): ${test.join(', ')}\n\nBeats and camera of the reference:\n${JSON.stringify({ beats: cur.beats ?? [], camera: cur.camera ?? {} })}\n\nCurrent guide:\n${cur.guide}\n` +
      (body.note ? `\nUser feedback on the render (priority): ${body.note}\n` : ''),
    schema: obj({ match: num, differences: { type: 'array', items: str }, guide: str,
      motionRecipes: { type: 'array', items: obj({ name: str, use: str, gsap: str }) } }),
  }, c => console.log(`[refine ${kind} ${id}] ${c.model} in=${c.in} out=${c.out}`));
  const refineLog = [...(cur.refineLog ?? []), { at: new Date().toISOString(), match: res.match, differences: res.differences }];
  const next = kind === 'skill' ? { ...raw, look: { ...raw.look, guide: res.guide, motionRecipes: res.motionRecipes }, refineLog }
    : { ...cur, guide: res.guide, motionRecipes: res.motionRecipes, refineLog };
  writeFileSync(file, JSON.stringify(next, null, 2));
  return { match: res.match, differences: res.differences };
}

export function updateFormat(id: string, data: any) {
  const file = join(formatDir(id), "format.json");
  if (!existsSync(file)) fail(`formato ${id} não encontrado`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('format must be an object');
  const cur = JSON.parse(readFileSync(file, "utf8"));
  const { frames: _f, ...fields } = data;   // frames is what getFormat adds on read, not a field
  const next = { ...deepMerge(cur, fields), id };   // deep: a partial safeZones must not wipe the sibling margins
  const bad = validateFormat(next);
  if (bad.length) fail(bad.join('; '));
  writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

export function deleteFormat(id: string) {
  const dir = formatDir(id);
  if (!existsSync(dir)) fail(`formato ${id} não encontrado`);
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, deleted: id };
}

// ---- projects -----------------------------------------------------------------------------------------------------
export async function createProject(o: {
  name: string;
  video?: string | string[];
  videos?: string[];
  subtitle?: string;
  referenceUrl?: string;
  referenceNote?: string;
  images?: string[];
  preEdited: boolean;
  brand: string;
  formatId?: string;
  formats?: string[];
  styleId?: string;                    // motion style id (workspace/styles/<id>/); validated here
  pace?: string;                       // 'lento' | 'normal' | 'dinamico' (default); validated here
  skillId?: string;                    // skill id (workspace/skills/<id>/); validated here
  broll?: boolean;                     // "Inserir b-roll" at creation: the script step fetches people, clips and music (no license filter)
  /** Text → voice: the script is spoken as written; replaces the video. `voice` falls back to the brand's `voice`. */
  text?: string;
  voice?: { provider: string; voice: string; language?: string };
  /** Brand character name (optionally a pose) that plays the speaker in formats with a cut-out. */
  character?: { name: string; pose?: string };
  /** Reaction video (formats with refVideo: Reação): a local file or upload (`path`) or a link (`url`, downloaded whole). Stored as <project>/react.mp4; not a style reference. */
  reactVideo?: { path?: string; url?: string };
}) {
  const textMode = typeof o.text === 'string' && o.text.trim() !== '';
  const rawList = o.videos && o.videos.length
    ? o.videos
    : (Array.isArray(o.video)
      ? o.video
      : (o.video ? o.video.split(',').map(s => s.trim()).filter(Boolean) : []));
  const rawVideos = rawList.map(expandHome);
  if (!rawVideos.length && !textMode) fail('pelo menos um arquivo de vídeo é obrigatório');
  for (const v of rawVideos) {
    if (!VIDEO_EXT.includes(extname(v ?? '').toLowerCase()) || !existsSync(v)) fail(`vídeo inválido ou não encontrado: ${v}`);
  }
  const primaryVideo = rawVideos[0];
  const subtitle = o.subtitle ? expandHome(o.subtitle) : undefined;
  // user images: copied, not moved, so a batch of projects can each take the same set
  const images = (o.images ?? []).map(expandHome);
  if (images.length > 20) fail('no máximo 20 imagens por projeto');
  for (const img of images) if (!IMAGE_EXT.includes(extname(img).toLowerCase()) || !existsSync(img)) fail(`imagem inválida ou não encontrada: ${img}`);
  // several links, one per line: the first site is the main reference (its palette and images drive the edit), the rest are extras
  const refUrls = [...new Set((o.referenceUrl ?? '').split(/\s+/).filter(Boolean))].slice(0, 8);
  for (const u of refUrls) if (!/^https?:\/\/\S+$/.test(u)) fail(`link de referência inválido (use http/https): ${u}`);
  const referenceUrl = refUrls.find(u => !isVideoReference(u)) ?? refUrls[0];
  const extraReferenceUrls = refUrls.filter(u => u !== referenceUrl);
  const referenceNote = referenceUrl ? o.referenceNote?.trim().slice(0, 1000) || undefined : undefined;
  if (subtitle && (!SUB_EXT.includes(extname(subtitle).toLowerCase()) || !existsSync(subtitle))) fail(`subtitle must be an existing ${SUB_EXT.join('/')} file`);
  // reaction video: required by a format with refVideo (Reação), refused elsewhere so a stray file never reaches the compose
  let fmtNeedsReact = false;
  try { fmtNeedsReact = !!getFormat(o.formatId || 'business-reels').refVideo; } catch {}
  const reactPath = o.reactVideo?.path ? expandHome(o.reactVideo.path) : undefined, reactUrl = o.reactVideo?.url?.trim() || undefined;
  if (fmtNeedsReact && !reactPath && !reactUrl) fail('este formato precisa de um vídeo de reação (arquivo ou link)');
  if (reactPath && (!VIDEO_EXT.includes(extname(reactPath).toLowerCase()) || !existsSync(reactPath))) fail(`vídeo de reação inválido ou não encontrado: ${reactPath}`);
  if (reactUrl && !/^https?:\/\/\S+$/.test(reactUrl)) fail(`link do vídeo de reação inválido (use http/https): ${reactUrl}`);
  
  const slug = String(o.name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) fail('name is required');
  if (textMode) o.preEdited = true;   // the synthetic voice has no pauses or retakes to cut
  if (typeof o.preEdited !== 'boolean') fail('preEdited (true/false) is required: was the video already cut?');

  const brandData = getBrand(o.brand);
  if (o.character) {
    const c = (brandData.animation?.characters ?? []).find((x: any) => x.name === o.character!.name);
    if (!c?.poses?.length) fail(`personagem ${JSON.stringify(o.character.name)} sem poses no brandkit`);
    if (o.character.pose && !c.poses.some((x: any) => x.name === o.character!.pose)) fail(`pose ${JSON.stringify(o.character.pose)} não existe em ${c.name}`);
  }
  if (o.formatId) formatDir(o.formatId);   // only checks the id is safe: an unknown format still falls back to no format guide
  let own: string[] | null = null;   // default export: the chosen format's own aspect ratio
  try { own = pickFormats([getFormat(o.formatId || 'business-reels').aspectRatio]); } catch {}
  const formats = o.formats === undefined ? own ?? FORMATS : checkFormats(o.formats);   // a default: the final step picks again
  const id = `${new Date().toISOString().slice(0, 10)}-${slug}`;
  const P = projDir(id);
  if (existsSync(P)) fail(`project ${id} exists`);
  mkdirSync(P, { recursive: true });
  appendProjectLog(id, `🚀 Projeto criado: ${o.name} (marca: ${o.brand})`);
  // a step that fails must not leave a folder with no state.json: it would hide the project and block its name
  const moved: [string, string][] = [];   // uploads are moved, not copied: put them back if the project falls through
  const take = (from: string, to: string) => { intake(from, to); if (from.startsWith(UPLOADS + sep)) moved.push([from, to]); };
  try {

    if (textMode) {
      const brandVoice = getBrand(o.brand).animation?.voice;
      const v = o.voice ?? brandVoice;
      if (!v?.provider || !v?.voice) fail('escolha uma voz (ou defina a voz padrão do brandkit)');
      appendProjectLog(id, `🎙️ Gerando a voz (${v.provider}, ${o.text!.length} caracteres)...`);
      const mp3 = join(P, 'voice.mp3');
      writeFileSync(mp3, await synthesizeLong(v.provider, { text: o.text, voice: v.voice, language: v.language }));
      // raw.mp4 = the voice over a flat brand-colour picture, so every later step (transcript, plate, review, AE) runs unchanged
      const [w, h] = ASPECT_SIZE[(() => { try { return getFormat(o.formatId || 'business-reels').aspectRatio ?? '9:16'; } catch { return '9:16'; } })()] ?? [1080, 1920];
      const bg = String(getBrand(o.brand).colors?.main ?? '#000000').replace('#', '0x');
      await run(id, 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${bg}:s=${w}x${h}:r=30`, '-i', mp3, '-shortest',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', join(P, 'raw.mp4')]);
      rmSync(mp3, { force: true });
      writeFileSync(join(P, 'fala.txt'), o.text!);
    } else if (rawVideos.length > 1) {
      // Vários vídeos selecionados: concatena todos em raw.mp4
      appendProjectLog(id, `📥 Concatenando ${rawVideos.length} arquivos de vídeo...`);
      const concatFile = join(P, 'concat.txt');
      const lines = rawVideos.map(v => `file '${v.replace(/'/g, "'\\''")}'`).join('\n');
      writeFileSync(concatFile, lines);
      try {
        await run(id, 'ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', join(P, 'raw.mp4')]);
      } catch {
        await run(id, 'ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', join(P, 'raw.mp4')]);
      }
    } else {
      appendProjectLog(id, `📥 Vídeo importado: ${basename(primaryVideo)}`);
      take(primaryVideo, join(P, 'raw' + extname(primaryVideo).toLowerCase()));
    }

    const subName = subtitle ? 'source' + extname(subtitle).toLowerCase() : undefined;
    if (subtitle) {
      appendProjectLog(id, `📝 Legenda importada: ${basename(subtitle)}`);
      take(subtitle, join(P, subName!));
    }
    if (fmtNeedsReact) {
      const dst = join(P, 'react.mp4');
      if (reactPath) {
        appendProjectLog(id, `🎬 Vídeo de reação importado: ${basename(reactPath)}`);
        if (extname(reactPath).toLowerCase() === '.mp4') copyFileSync(reactPath, dst);   // copied, not moved: a batch of projects can share one reaction video
        else await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', reactPath, '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', dst]);
      } else {
        appendProjectLog(id, `🎬 Baixando o vídeo de reação: ${reactUrl}`);
        await run(id, YT_DLP, ['-f', 'best[ext=mp4]/best', '-o', dst, '--', reactUrl!]);   // whole, unlike the 60 s style reference
      }
    }

    writeFileSync(join(P, '.gitignore'), '._*\nactivity.log\nraw.*\n*.mp4\n*.wav\nproj/\n*_whisper/\nqa_transcript/\nframes/\nref/\ncutout/\ncutout.webm\ncutout.json\nnose.json\nfillers.json\ncut_filter.txt\nafter-effects/\nref_extra/\nassets/user/\n' + COMPOSE_IGNORE);
    const userImages = images.map((img, k) => {
      const name = `${k}-${basename(img).replace(/[^\w.-]+/g, '_')}`;
      mkdirSync(join(P, 'assets', 'user'), { recursive: true });
      copyFileSync(img, join(P, 'assets', 'user', name));
      return `assets/user/${name}`;
    });
    if (userImages.length) appendProjectLog(id, `🖼️ Imagens importadas: ${userImages.length}`);
    const st: State = { id, name: o.name, brand: o.brand, formatId: o.formatId || 'business-reels', preEdited: o.preEdited, subtitle: subName, referenceUrl, extraReferenceUrls: extraReferenceUrls.length ? extraReferenceUrls : undefined, referenceNote, userImages: userImages.length ? userImages : undefined, formats, override: {}, step: 'created', cost: [], ...(o.styleId ? { styleId: styleChoice(o.styleId) } : {}), ...(o.pace ? { pace: checkPace(o.pace) } : {}), ...(o.skillId ? { skillId: getSkill(o.skillId).id } : {}), ...(o.broll === true ? { broll: true } : {}), ...(o.character ? { character: o.character } : {}) };
    save(st);
    await run(id, 'git', ['init', '-q', P]);
    await run(id, 'git', ['-C', P, 'config', 'core.autocrlf', 'false']);
    await commit(id, 'project created');
    appendProjectLog(id, '✓ Projeto inicializado e pronto para ingestão.');
    return st;
  } catch (e) {
    for (const [from, to] of moved) try { if (existsSync(to)) renameSync(to, from); } catch {}
    rmSync(P, { recursive: true, force: true });
    throw e;
  }
}
export const getProject = (id: string) => {
  const st = load(id);
  const P = projDir(id);
  // aspects with a finished agent composition (index.html): the format's own and any compose-<aspect>/ made for another format
  const composedFormats = composedByAgent(st) ? FORMATS.filter(f => existsSync(join(composeDirOf(P, st, f), 'index.html'))) : [];
  const readyFinals = FORMATS.filter(f => existsSync(join(P, finalName(f))));
  const running = getBusy(id);
  // the files the project was created from, so "Clonar projeto anterior" can feed them to createProject again (copied, not moved)
  const sources = {
    videos: VIDEO_EXT.map(e => join(P, 'raw' + e)).filter(existsSync),   // several uploads were concatenated: the clone gets one raw.mp4
    subtitle: st.subtitle && existsSync(join(P, st.subtitle)) ? join(P, st.subtitle) : undefined,
    images: (st.userImages ?? []).map(r => join(P, r)).filter(existsSync),
  };
  return { ...st, composed: true, composedFormats, readyFinals, primaryFormat: primaryAspect(st), running, sources,
    interrupted: !running && existsSync(composeMarker(id)) };   // a compose cut by a server restart (the marker outlived the lock)
};
// the marker compose() keeps while it runs; the user acknowledges it from the Revisão
const composeMarker = (id: string) => join(projDir(id), 'compose.running');
export function ackCompose(id: string) {
  const st = load(id);
  if (getBusy(id)) fail('a composição está rodando');
  rmSync(composeMarker(id), { force: true });
  if (existsSync(join(projDir(id), 'compose', 'index.html')) && stepRank(st.step) < stepRank('motion')) { st.step = 'motion'; save(st); }
  return getProject(id);
}
// to workspace/trash/, not rm: a wrong click is undone from the Finder
export function deleteProject(id: string) {
  load(id);
  if (getBusy(id)) fail('espere a etapa em execução terminar');
  const T = join(WS, 'trash');
  mkdirSync(T, { recursive: true });
  renameSync(projDir(id), join(T, `${id}-${Date.now()}`));
  return { ok: true };
}
export async function renameProject(id: string, name: unknown) {
  const st = load(id), n = String(name ?? '').trim();
  if (!n || n.length > 120) fail('nome: 1 a 120 caracteres');
  st.name = n; save(st);
  await commit(id, `rename: ${st.name}`);
  return getProject(id);
}
export { PACE };   // the table lives in lib.ts (resolveChoices needs it)
export const checkPace = (p: unknown): Pace => (p === 'lento' || p === 'normal' || p === 'dinamico') ? p : fail('ritmo: lento, normal ou dinamico');
export const paceOf = (st: { pace?: Pace }) => PACE[st.pace ?? 'dinamico'];
// the pace the reel is made at: the skill's measured seconds per cut when it has one, otherwise the toggle
export const effectivePace = (st: State) => { if (st.skillId) try { const p = paceFromSkill(getSkill(st.skillId)); if (p) return p; } catch {} return paceOf(st); };
// one call for the four selectors (SPEC-v9 §5); a field left out is left alone, null clears the optional ones
// 'none' = no illustration pack at all (the director gets no estilos/ list either); '' / undefined = the director picks one
const styleChoice = (id: string) => id === 'none' ? 'none' : getStyle(id).id;
export function setChoices(id: string, b: { formatId?: string; styleId?: string | null; skillId?: string | null; pace?: unknown }) {
  const st = load(id);
  if (b?.formatId !== undefined) { getFormat(b.formatId); st.formatId = b.formatId; }
  if (b?.styleId !== undefined) st.styleId = b.styleId ? styleChoice(b.styleId) : undefined;
  if (b?.skillId !== undefined) st.skillId = b.skillId ? getSkill(b.skillId).id : undefined;
  if (b?.pace !== undefined) st.pace = checkPace(b.pace);
  save(st);
  return { ok: true, formatId: st.formatId, styleId: st.styleId ?? null, skillId: st.skillId ?? null, pace: st.pace ?? 'dinamico' };
}
export const listProjects = () => existsSync(join(WS, 'projects')) ? readdirSync(join(WS, 'projects')).filter(p => safeId(p) && existsSync(join(projDir(p), 'state.json'))).sort().reverse() : [];

export interface ProjectOverview {
  id: string;
  name: string;
  brand: string;
  formatId?: string;
  step: string;
  stepLabel: string;
  running: BusyInfo | null;
  workMs: number;
  lastActivityAt: number;
  createdAt: number;
  requiresHumanConfirmation: boolean;
  humanConfirmationLabel: string;
  hasFinal: boolean;
  qaPass?: boolean;
  completed?: boolean;
  completedAt?: number;
}

export const completeProject = (id: string, completed = true) => locked(id, 'complete', async st => {
  st.completed = !!completed;
  if (st.completed) {
    st.completedAt = Date.now();
    emit(id, 'log', '✓ Projeto marcado como concluído.');
  } else {
    delete st.completedAt;
    emit(id, 'log', '↺ Projeto reaberto para edição.');
  }
  save(st);
  await commit(id, st.completed ? 'project marked as completed' : 'project reopened');
  emit(id, 'step', { step: st.step, status: 'done' });
  return st;
});

export const listProjectsOverview = (): ProjectOverview[] => {
  const ids = listProjects();
  const STEP_TITLES: Record<string, string> = {
    created: 'Vídeo Carregado',
    ingest: '1 Ingestão',
    script: '2 Roteiro',
    brand: 'Brand',
    motion: '3 Revisão',
    final: '4 Entrega',
  };
  const RUNNING_TITLES: Record<string, string> = {
    ingest: 'Transcrevendo (Whisper)',
    script: 'Gerando Roteiro (Opus)',
    broll: 'Buscando b-roll na internet',
    brand: 'Configurando Marca',
    motion: 'Gerando o vídeo (Opus)',
    review: 'Aplicando anotações (Opus)',
    build: 'Montando preview ao vivo',
    preview: 'Renderizando Preview',
    edit: 'Salvando Edição',
    batch: 'Processando Lote',
    ask: 'Ajustando Card (IA)',
    final: 'Renderizando Final',
    cutout: 'Processando Cutout',
    ae: 'Exportando After Effects',
    embrulhos: 'Gerando Embrulhos',
  };

  return ids.map(id => {
    try {
      const st = load(id);
      const P = projDir(id);
      const running = getBusy(id);
      const stateFile = join(P, 'state.json');
      let lastActivityAt = 0;
      let createdAt = 0;
      try {
        const stat = statSync(stateFile);
        lastActivityAt = stat.mtimeMs;
        createdAt = stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs;
      } catch {}

      if (st.cost && Array.isArray(st.cost) && st.cost.length > 0) {
        const lastCost = st.cost[st.cost.length - 1];
        if (lastCost?.at) {
          const t = new Date(lastCost.at).getTime();
          if (t > lastActivityAt) lastActivityAt = t;
        }
      }

      if (running && running.startedAt > lastActivityAt) {
        lastActivityAt = running.startedAt;
      }

      const isCompleted = !!st.completed;
      const hasFinal = existsSync(join(P, 'final.mp4'));
      let requiresHumanConfirmation = false;
      let humanConfirmationLabel = '';

      if (isCompleted) {
        requiresHumanConfirmation = false;
        humanConfirmationLabel = '';
      } else if (running) {
        requiresHumanConfirmation = false;
        humanConfirmationLabel = '';
      } else if (st.step === 'created') {
        requiresHumanConfirmation = true;
        humanConfirmationLabel = 'Iniciar Ingestão';
      } else if (st.step === 'ingest') {
        requiresHumanConfirmation = false;   // the server chains ingest into the script suggestion
        humanConfirmationLabel = '';
      } else if (st.step === 'brand') {
        requiresHumanConfirmation = true;
        humanConfirmationLabel = 'Configurar Marca';
      } else if (st.step === 'script') {
        requiresHumanConfirmation = true;
        humanConfirmationLabel = 'Aprovar Roteiro';
      } else if (st.step === 'motion') {
        if (!hasFinal) {
          requiresHumanConfirmation = true;
          humanConfirmationLabel = 'Revisar e aprovar';
        }
      }

      const stepLabel = running
        ? (RUNNING_TITLES[running.step] || running.step)
        : (isCompleted ? 'Concluído' : (hasFinal ? 'Vídeo Pronto' : (STEP_TITLES[st.step] || st.step)));

      return {
        id,
        name: st.name || id,
        brand: st.brand || '',
        formatId: st.formatId,
        step: st.step,
        stepLabel,
        running,
        workMs: st.workMs ?? 0,
        lastActivityAt,
        createdAt,
        requiresHumanConfirmation,
        humanConfirmationLabel,
        hasFinal,
        qaPass: st.qa?.pass,
        completed: isCompleted,
        completedAt: st.completedAt,
      };
    } catch {
      return {
        id,
        name: id,
        brand: '',
        step: 'unknown',
        stepLabel: 'Desconhecido',
        running: null,
        workMs: 0,
        lastActivityAt: 0,
        createdAt: 0,
        requiresHumanConfirmation: false,
        humanConfirmationLabel: '',
        hasFinal: false,
      };
    }
  });
};
// Files the UI may read; anything else stays private.
export const finalName = (format: string) => `final-${format.replace(':', '-')}.mp4`;
const PROJECT_FILES = ['script.json', 'embrulhos.json', 'preview.mp4', 'final.mp4', ...FORMATS.map(finalName), ...listarEmbrulhos().map(m => `embrulho-${m}.mp4`)];
export function projectFile(id: string, f: string) {
  load(id);
  if (!PROJECT_FILES.includes(f) || !existsSync(join(projDir(id), f))) fail(`no ${f} yet`);
  return join(projDir(id), f);
}

// Conversor inicial: a fonte maior que FullHD vira 1920x1080 (ou 1080x1920 se for retrato), com Lanczos e CRF 14.
// Quem já cabe na caixa é copiado sem reencode.
async function toFullHD(id: string, src: string, dst: string) {
  const { width, height } = await probeMedia(src);
  const [tw, th] = height > width ? [1080, 1920] : [1920, 1080];
  if (width <= tw && height <= th) return run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', src, '-c', 'copy', dst]);
  return run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', src,
    '-vf', `scale=${tw}:${th}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', dst]);
}

// Step 1 - no LLM. The shortcut matrix decides what runs.
export const ingest = (id: string) => locked(id, 'ingest', async st => {
  const P = projDir(id);
  const brand = writeBrand(st);
  const raw = rawClip(P);
  const plan = shortcutPlan(st.preEdited, !!st.subtitle);
  emit(id, 'log', `▶ Etapa 1: Ingestão de mídia iniciada (${st.preEdited ? 'pré-editado' : 'edição automática'}, transcrição: ${plan.transcribe})...`);
  // with an .srt the text is the user's, but the per-word times come from Whisper on the audio (transcribe.py --align):
  // a subtitle cue sliced proportionally put words early or late on screen
  const transcribeArgs = plan.transcribe === 'srt' ? [join(P, st.subtitle!), join(P, 'transcript.json'), '--align', raw] : [raw, join(P, 'transcript.json')];
  if (st.preEdited) {
    // Vídeo pré-editado: áudio original preservado, sem cortes automáticos nem silêncios
    await py(id, 'transcribe.py', transcribeArgs);
    const words: Word[] = readJSON(join(P, 'transcript.json')).filter((w: Word) => w.text.trim());
    if (!words.length) fail('no speech found in the transcript');
    const dur = await duration(id, raw);

    await toFullHD(id, raw, join(P, 'master.mp4'));
    const long = await overLength(id, P, brand);
    if (long) emit(id, 'log', `⚠ ${long}: corte antes da entrega ou suba o limite`);

    writeJSON(join(P, 'edl.json'), { source: basename(raw), keep: [[0, dur]], speed: 1 });
    writeJSON(join(P, 'master_transcript.json'), words);

    if (plan.transcribe === 'whisper') writeFileSync(join(P, 'expected.txt'), words.map(w => w.text).join(' '));
    await py(id, 'auto_edit.py', [P]);
    Object.assign(st, { plan, step: 'ingest' }); save(st);
    await commit(id, `step 1: ingest (pre-edited, transcribe: ${plan.transcribe})`);
    emit(id, 'log', `✓ Ingestão concluída com sucesso (${words.length} palavras transcritas).`);
    cutoutInBackground(id);
    return st;
  }

  // raw video: EQ, de-esser and compression only; the clip keeps its own noise floor and level (no denoise, no -14 LUFS)
  await py(id, 'clean_audio.py', [raw, join(P, 'voice.wav'), '--no-denoise', '--no-loudnorm']);
  await py(id, 'transcribe.py', transcribeArgs);
  const words: Word[] = readJSON(join(P, 'transcript.json')).filter((w: Word) => w.text.trim());
  if (!words.length) fail('no speech found in the transcript');
  const dur = await duration(id, raw), pace = await pacing(id);
  writeJSON(join(P, 'edl.json'), { source: basename(raw), audio: 'voice.wav', keep: [[0, dur]] });
  // silences (silencedetect on voice.wav) are cut on both routes; fillers only without an .srt, since the .srt is the user's text
  await py(id, 'tighten.py', plan.cut === 'srt' ? [P, '--pauses-only'] : [P]);
  await py(id, 'cut.py', [P], { REEL_PREVIEW: '1' });
  // every join transcribed on its own: a retake left in or a word clipped by the cut shows up here, not in the final (exit 3 = no local Whisper)
  if ((await run(id, PYTHON, [join(S, 'check_joins.py'), P], {}, true)).code === 1) emit(id, 'log', '⚠ emendas com problema (ver FLAG acima e joins.txt): confira o corte antes de seguir');
  const long = await overLength(id, P, brand);
  if (long) emit(id, 'log', `⚠ ${long}: corte antes da entrega ou suba o limite`);
  // Whisper glues words across pauses, so after tighten its times can sit inside a cut: re-transcribe the master
  // (as the fork does). SRT and pre-edited times are exact, so they are just remapped.
  const edl = readJSON(join(P, 'edl.json'));
  if (plan.cut === 'tighten') await py(id, 'transcribe.py', [join(P, 'master.mp4'), join(P, 'master_transcript.json')]);
  else writeJSON(join(P, 'master_transcript.json'), remapWords(words, edl.keep, edl.speed ?? pace.speed));
  // the brief reads the .srt for the script and its times, so the cues follow the cut too
  if (st.subtitle === 'source.srt') writeFileSync(join(P, 'master.srt'), remapSrt(readFileSync(join(P, 'source.srt'), 'utf8'), edl.keep, edl.speed ?? pace.speed));
  const master: Word[] = readJSON(join(P, 'master_transcript.json'));
  // qa.py's lost-words check compares Whisper with Whisper; SRT text would not match word for word
  if (plan.transcribe === 'whisper') writeFileSync(join(P, 'expected.txt'), master.map(w => w.text).join(' '));
  await py(id, 'auto_edit.py', [P]);
  Object.assign(st, { plan, step: 'ingest' }); save(st);
  await commit(id, `step 1: ingest (${plan.transcribe}, cut: ${plan.cut})`);
  emit(id, 'log', `✓ Ingestão concluída com sucesso (${master.length} palavras transcritas).`);
  cutoutInBackground(id);
  return st;
});

// Step 2 - Haiku cleans and segments, Opus writes script.json.
const SEGMENTS = obj({ segments: { type: 'array', items: obj({ t_start: num, t_end: num, text: str }) } });
const MOMENT = obj({
  t_start: num,
  t_end: num,
  motion_style: str,
  visual_action: str,
  texto: str,
  icone: str,
  sfx: str,
  motivo: str
});
const SCRIPT = obj({ moments: { type: 'array', items: MOMENT }, accentWords: { type: 'array', items: str } });

export const script = (id: string) => locked(id, 'script', async st => {
  const P = projDir(id), brand = writeBrand(st);
  const words: Word[] = readJSON(join(P, 'master_transcript.json'));
  const dur = await duration(id, join(P, 'master.mp4'));
  // the site and reel analyses (Opus, 1.5-2.5 min) run beside the Haiku segmentation, which does not read them; the moments call waits for both
  const refDone = ensureReference(id, st).then(() => null, (e: Error) => e);
  let segments: unknown[];
  try {
    ({ segments } = await ask<{ segments: unknown[] }>('triage', 'script:segment', {
    system: 'You clean Brazilian Portuguese speech transcripts. Join the words into sentences, fix obvious transcription ' +
      'mistakes and punctuation, drop hesitations (hum, ahn, né used as filler). Keep each sentence\'s time from its first and last word. Do not invent content.',
    content: JSON.stringify(words.map(w => [w.text, w.start, w.end])),
    schema: SEGMENTS,
  }, logCost(st)));
  } finally { const refErr = await refDone; if (refErr) throw refErr; }
  const frames = await sampleFrames(id, dur, Math.min(8, Math.max(4, readJSON(join(P, 'edl.json')).keep.length)));
  emit(id, 'log', '✨ Concebendo roteiro e momentos com IA (Claude)...');
  const res = await ask<any>('script', 'script:moments', {
    system: `# Brand rules (brand.md)\n${readFileSync(join(P, 'brand.md'), 'utf8')}\n\n${formatGuide(st)}\n# DIRETOR.md\n${readFileSync(join(K_DIR, 'DIRETOR.md'), 'utf8')}\n\n` +
      'You are an art director planning the graphics and motion design of a short talking-head reel. ' +
      'Return moments that each illustrate exactly what that line says, at the density the brand asks for ' +
      '("graphics": minimal 8-12 s, balanced 4-6 s, busy 2-4 s apart). Write texto in the language of the transcript.\n' +
      'Without a "graphics" value, follow the format pacing: a new moment every 2-3 s, and no moment over 3.5 s without an internal change written in visual_action. ' +
      'Split long sentences: each number, product, promise, list item and CTA gets its own moment. Read the whole script first and plan an arc (hook, offer/argument, proof, CTA).\n' +
      'Direct it (DIRETOR.md below, §2-4 and §7): end every visual_action with "câmera: push|pull|pan|crane|tilt|orbit|roll|hold" plus the reason in three words, use at least four different camera moves across the reel, ' +
      'never the same move in two moments in a row, mark exactly one moment "PLANO-ASSINATURA" (the oner, scale reveal or transition made from the medium) and give one moment before the turn or the CTA as "respiração" (a held pause).\n' +
      (siteRef(st) ? 'A site reference is attached (site in the content). Open the site screenshots and the images in assets/img/ with Read before planning. ' +
        'Tie each line to the site: when the speaker names something the site shows (a product, track, theme, testimonial, number, the brand on stage), that moment uses the site image ' +
        '(write its file name, e.g. "imagem: assets/img/12_tema-7.webp") or the site fact. Use at least one site image every ~10 s. In motivo, note when the speech and the site disagree on a number.\n' : '') +
      '- visual_action: Describe in Brazilian Portuguese, as a precise brief for the editor, in this order: fundo (cor sólida da paleta, vídeo desfocado ou imagem/B-roll do site), ' +
      'enquadramento do locutor (M, L, XL, XXL ou sem locutor), o destaque único da cena (palavra gigante atrás, número, card, imagem) com a cor, o apoio (ícone, pílula, imagem) e a troca interna se a cena passa de 2,5 s. ' +
      'Never two moments in a row with the same background or the same kind of highlight.\n' +
      '- motion_style: The visual motion category (a short free label for the visual idea, e.g. "Manchete editorial", "Diagrama orbital", "Tipografia gigante", "UI & Mockup"; not a fixed list, vary it across the reel).\n' +
      '- visual_action and motion_style are only a brief: Opus redesigns each moment freely.\n' +
      '- icone: the name of one of the brand icons, or "". sfx: a sound name or "". motivo: why this moment, in one short sentence. accentWords: one key word per sentence.',
    readDir: projDir(id),
    content: `Frames: ${frames.join(', ')}. Read each one before planning.\n` + siteFiles(id) + JSON.stringify({ duration: dur, segments, graphics: brand.graphics, sfx: brand.sfx,
      icons: (brand.icons ?? []).map((i: any) => ({ name: i.name, tags: i.tags })) }),
    schema: SCRIPT,
  }, logCost(st));
  writeJSON(join(P, 'script.json'), res);
  // images, icons and 3D objects for the moments, downloaded now so the composer finds them in assets/ (never blocks the script)
  try { await fetchAssets(id, st, res.moments ?? []); } catch (e) { emit(id, 'log', `⚠ Biblioteca de imagens não montada: ${(e as Error).message}`); }
  Object.assign(st, { step: 'script' }); save(st);
  await commit(id, `step 2: script (${res.moments.length} moments)`);
  emit(id, 'log', `✓ Roteiro gerado com sucesso (${res.moments.length} momentos).`);
  return res;
});

// The three small writers below (script, brand default, approval) take the project lock like the steps do:
// a long step saves its own copy of state.json at the end and would undo a change made meanwhile.
export const putScript = (id: string, s: any) => locked(id, 'script:save', async st => {
  if (!Array.isArray(s?.moments)) fail('script needs moments[]');
  writeJSON(join(projDir(id), 'script.json'), { accentWords: [], ...s });
  if (stepRank(st.step) < stepRank('script')) st.step = 'script';
  save(st);
  await commit(id, `step 2: script approved (${s.moments.length} moments)`);
  emit(id, 'log', `✓ Roteiro aprovado e salvo (${s.moments.length} momentos).`);
  emit(id, 'log', `$ git commit -m "step 2: script approved (${s.moments.length} moments)"`);
  return st;
});

async function sampleFrames(id: string, dur: number, n: number): Promise<string[]> {
  const dir = join(projDir(id), 'frames');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const f = join(dir, `${k}.jpg`);
    await run(id, 'ffmpeg', ['-v', 'error', '-y', '-ss', ((k + 0.5) * dur / n).toFixed(2), '-i', join(projDir(id), 'master.mp4'), '-frames:v', '1', '-vf', 'scale=270:-2', f]);
    out.push(f);
  }
  return out;
}

// The compose kit's helper list, read from compose/GUIDE.md: the composer picks from it, one source of truth.
function kitHelpers() {
  const guide = readFileSync(join(K_DIR, 'GUIDE.md'), 'utf8');
  return guide.slice(guide.indexOf('## Estilos prontos do kit'), guide.indexOf('## Regras de código'));
}

// Step 3 - a form, no model. Sonnet only when the person types what they want ("deixa mais sóbrio").
export const brandStep = (id: string, b: { brand?: string; override?: Record<string, unknown>; text?: string }) => locked(id, 'brand', async st => {
  if (b.brand) { getBrand(b.brand); st.brand = b.brand; st.override = {}; }
  if (b.override) st.override = deepMerge(st.override, b.override);
  if (b.text) {
    const { override_json } = await ask<{ override_json: string }>('brandChat', 'brand:chat', {
      system: 'You adjust a video brand file. Return override_json: a JSON object with only the brand.json keys to change ' +
        '(colours as #rrggbb). Keep the brand recognisable; change only what the request asks.',
      content: JSON.stringify({ brand: writeBrand(st), request: b.text }),
      schema: obj({ override_json: str }),
    }, logCost(st));
    const o = JSON.parse(override_json);
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail('the model did not return an object');
    st.override = deepMerge(st.override, o);
  }
  const brand = writeBrand(st);   // validates colours before anything is saved
  if (stepRank(st.step) < stepRank('script')) st.step = 'script';
  save(st);
  await commit(id, 'brand settings updated');
  if (stepRank(st.step) >= stepRank('motion')) await retheme(id, st);   // the review player shows the new fonts and colours at once
  return brand;
});
// A brand change on an existing composition: the reel gets the brand font file again and scenes.py rerun (no model call).
// shortcut: a font the composer wrote by name inside scenes.py does not change, only the kit's font.otf; a note to the composer does the rest
async function retheme(id: string, st: State) {
  if (!composedByAgent(st)) return;
  const C = join(projDir(id), 'compose'), font = brandFontFile(st, writeBrand(st));
  if (font) copyFileSync(font, join(C, 'assets', 'fonts', 'font.otf'));
  await run(id, PYTHON, ['-B', 'scenes.py'], {}, false, C);
  delete st.approvedAt; save(st);
  emit(id, 'built', {});
}
// the brand's heading font file: the one brand.json names, else the first in the brand's fonts/ folder
const brandFontFile = (st: State, brand: any) => {
  const fontDir = join(brandDir(st.brand), 'fonts');
  return brand.fonts?.head?.file && existsSync(brand.fonts.head.file) ? brand.fonts.head.file as string
    : existsSync(fontDir) ? (readdirSync(fontDir).filter(f => !f.startsWith('.') && /\.(otf|ttf|woff2?)$/i.test(f)).map(f => join(fontDir, f))[0] ?? '') : '';
};

// "Save as default": this project's override becomes the brand's.
export const saveBrandDefault = (id: string) => locked(id, 'brand:default', async st => {
  const merged = deepMerge(getBrand(st.brand), st.override);
  checkBrand(merged);
  saveBrand(st.brand, merged);
  st.override = {}; save(st);
  await commit(id, `brand ${st.brand}: project changes saved as default`);
  return merged;
});

// Straight from the approved script to the composer and the review player.
export const motion = (id: string) => compose(id);

// A synthetic voice saved into the project's media/ folder, ready to be added as an audio layer. Never called by a step: it spends the user's credits.
export async function speak(id: string, o: { provider: string; text: unknown; voice: unknown; language?: string }) {
  load(id);
  const audio = await synthesize(o.provider, o);
  const dir = join(projDir(id), 'media');
  mkdirSync(dir, { recursive: true });
  const file = `voz-${o.provider.replace(/\W/g, '')}-${Date.now()}.mp3`;
  writeFileSync(join(dir, file), audio);
  return { src: `media/${file}`, bytes: audio.length, duration: await duration(id, join(dir, file)).catch(() => 0) };
}

// B-roll fill: one cheap model call picks the beats that gain from a real-world picture and writes a search for each; the clips
// come from Pexels, Pixabay and Commons and are added as ordinary layers (layers.json) in the lower band of the frame, so it works
// for card reels and agent reels alike, shows on the timeline and can be moved, trimmed or deleted there.
// Asset library of a reel (v8): for each script moment that gains from a real image, an icon or a 3D object, Sonnet writes the
// search queries; the sources (broll.ts: Openverse, Iconify, Pexels, Pixabay, Commons, Poly Pizza) answer; the best candidate
// per query is downloaded to <project>/assets/{img,3d}/ and listed in assets/manifest.json (moment, query, license, author, url).
// composeScaffold copies the files to compose/assets/ and the brief prints the manifest, so the composer knows what each file shows.
// shortcut: first playable candidate per query, no image review; upgrade to a Read of the thumbnails if the picks come out off
export type AssetEntry = { file: string; moment: number; query: string; kind: Kind; provider: string; title: string; license: string; author: string; url: string };
// With st.broll ("Inserir b-roll") the same call also asks for named people, brands and events (a photo or a YouTube clip), stock
// footage and one music bed, and takes the first playable result whatever its license (editorial use, the user's call).
const DIR_OF: Record<Kind, string> = { image: 'img', model: '3d', video: 'video', audio: 'music' };
async function fetchAssets(id: string, st: State, moments: any[]) {
  const P = projDir(id), manifestFile = join(P, 'assets', 'manifest.json'), broll = !!st.broll;
  if (!moments.length) return;
  const max = Math.min(broll ? 16 : 12, Math.max(2, moments.length));
  const plan = await ask<{ wants: { moment: number; query: string; kind: 'image' | 'icon' | 'model' | 'art' | 'video' | 'clip' }[]; music?: string }>('broll', 'assets:queries', {
    system: `You pick the ready-made visual pieces a short talking-head reel needs, one search query per piece. Sources: photos and public-domain engravings (Openverse, Pexels, Pixabay, Commons), SVG icons (Iconify), low-poly 3D objects as .glb (Poly Pizza), museum open-access collections (Cleveland Museum of Art, the Met: paintings, engravings, old photographs, historical objects, all CC0)` +
      (broll ? `, stock footage (Pexels, Pixabay) and YouTube clips (yt-dlp, 15 s section). ` : `. `) +
      `At most ${max} pieces across the reel, only where a real picture, an icon, an object${broll ? ', a clip' : ''} shows what the words say better than typography would: an object the speaker names, a place, a situation, a device, a tool, a symbol${broll ? ', a person, a brand, a product, an event' : ''}. Skip moments about numbers, the speaker himself or pure typography. ` +
      (broll
        ? `"query": English words naming something concrete; for a named person, brand, product or event write the full name plus context so the first hit is the thing on camera (e.g. "Tim Cook keynote stage", "Steve Wozniak interview"). "kind": image for a photo or engraving (also of a named person: Wikimedia has them), icon for a simple symbol, model for a 3D object that could float next to the speaker, art for a painting, an engraving, an old photograph or a historical object from a museum (only when the words call for history, the past or a classical reference; query: the subject in 1 to 3 words), video for generic stock footage of a situation in motion, clip for a YouTube clip of a named person, brand, product or event. "moment": index in the list. ` +
          `"music": one or two English words (mood or genre, e.g. "upbeat corporate", "cinematic piano"; the search needs every word to match) for a music bed, or "" when the reel is better without music.`
        : `"query": 1 to 4 English words naming something concrete (never an abstract idea, a brand or a famous person); "kind": image for a photo or engraving, icon for a simple symbol, model for a 3D object that could float next to the speaker, art for a painting, an engraving, an old photograph or a historical object from a museum (only when the words call for history, the past or a classical reference); "moment": index in the list.`),
    content: JSON.stringify(moments.map((m, i) => ({ moment: i, t_start: m.t_start, t_end: m.t_end, texto: m.texto, visual_action: m.visual_action }))),
    schema: obj({ wants: { type: 'array', items: obj({ moment: num, query: str, kind: { type: 'string', enum: broll ? ['image', 'icon', 'model', 'art', 'video', 'clip'] : ['image', 'icon', 'model', 'art'] } }) }, ...(broll ? { music: str } : {}) }),
  }, logCost(st));
  for (const d of Object.values(DIR_OF)) mkdirSync(join(P, 'assets', d), { recursive: true });
  const old: AssetEntry[] = existsSync(manifestFile) ? readJSON(manifestFile) : [];
  for (const e of old) rmSync(join(P, 'assets', e.file), { force: true });   // a new script replaces the library of the old one
  const entries: AssetEntry[] = [];
  let n = 0;
  const wants = plan.wants.slice(0, max).map(w => ({ ...w, kind: broll || ['image', 'icon', 'model', 'art'].includes(w.kind) ? w.kind : 'image' }));
  if (broll && plan.music) wants.push({ moment: -1, query: plan.music, kind: 'music' as any });
  for (const w of wants) {
    const kind: Kind = w.kind === 'model' ? 'model' : w.kind === 'video' || w.kind === 'clip' ? 'video' : (w.kind as string) === 'music' ? 'audio' : 'image';
    const providers = w.kind === 'icon' ? ['iconify'] : w.kind === 'art' ? ['cleveland', 'met'] : w.kind === 'model' ? ['polypizza'] : w.kind === 'clip' ? ['youtube'] : w.kind === 'video' ? ['pexels', 'pixabay', 'commons']
      : kind === 'audio' ? ['openverse'] : ['openverse', 'pexels', 'pixabay', 'commons'];
    const { results, errors } = await brollSearch(w.query, { kind, providers, limit: 6 });
    const best = broll ? brollPick(kind === 'audio' ? results.filter(c => (c.duration ?? 60) >= 20) : results, 3)
      : results.find(c => extOf(c) && (c.provider !== 'commons' && c.provider !== 'openverse' || rightsOf(c).status === 'licensed'));
    if (!best) { appendProjectLog(id, `🖼 "${w.query}" (${w.kind}): nada encontrado${Object.keys(errors).length ? ` (${Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join('; ')})` : ''}`); continue; }
    const slug = w.query.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const file = `${DIR_OF[kind]}/lib${++n}-${w.kind}-${slug}${extOf(best)}`;
    try { await brollDownload(best, join(P, 'assets', file)); } catch (e) { appendProjectLog(id, `🖼 Falha ao baixar "${w.query}": ${(e as Error).message}`); n--; continue; }
    entries.push({ file, moment: w.moment, query: w.query, kind, provider: best.provider, title: best.title, license: best.license, author: best.author, url: best.pageUrl });
  }
  writeJSON(manifestFile, entries);
  emit(id, 'log', `🖼 Biblioteca do reel: ${entries.length} arquivo(s) baixado(s) de ${wants.length} pedido(s) (assets/manifest.json)${broll ? ', com b-roll' : ''}`);
}

// The b-roll step (button "Inserir b-roll"): turns st.broll on and refetches the library for the current script now; every later
// script run keeps the mode. Slower than the plain fetch (yt-dlp sections), which the button says before starting.
export const insertBroll = (id: string) => locked(id, 'broll', async st => {
  const script = join(projDir(id), 'script.json');
  if (!existsSync(script)) fail('gere o roteiro antes de inserir b-roll');
  st.broll = true; save(st);
  await fetchAssets(id, st, readJSON(script).moments ?? []);
  await commit(id, 'b-roll: internet assets (people, clips, music)');
  return { broll: true };
});

// ---- Step 5 review: the browser plays compose/index.html live (no render); notes pinned to a time and a spot on the frame ----
export type Note = { id: string; t: number; all?: boolean; end?: number; x?: number; y?: number; text: string; status: 'open' | 'done' | 'skipped'; reply?: string; round?: number };
type Review = { notes: Note[]; round: number; version?: number };   // version: bumped on every write; a PUT must send the one it read
const reviewFile = (id: string) => join(projDir(id), 'review.json');
const readReview = (id: string): Review => existsSync(reviewFile(id)) ? readJSON(reviewFile(id)) : { notes: [], round: 0 };
// the reel lives in compose/ (scenes.py writes its index.html)
const composedByAgent = (st: State) => existsSync(join(projDir(st.id), 'compose', 'scenes.py'));
const liveDir = (st: State) => join(projDir(st.id), 'compose');
// what the review player can show: the live composition, or the rendered preview of an agent reel composed before it stopped rendering
export function getReview(id: string) {
  const st = load(id), D = liveDir(st);
  return { ...readReview(id), mode: existsSync(join(D, 'index.html')) ? 'live' : existsSync(join(D, 'out.mp4')) ? 'video' : 'none' };
}

function checkNote(n: any): Note {
  const pct = (v: unknown) => v === undefined || v === null ? undefined : Number.isFinite(v) && (v as number) >= 0 && (v as number) <= 100 ? v as number : fail('note x/y must be 0-100');
  if (typeof n?.id !== 'string' || !/^[\w-]{1,40}$/.test(n.id)) fail('note id must be a short word');
  if (!Number.isFinite(n.t) || n.t < 0) fail('note t must be seconds >= 0');
  if (n.end !== undefined && n.end !== null && !(Number.isFinite(n.end) && n.end > n.t)) fail('note end must be seconds greater than t');
  const text = String(n.text ?? '').trim();
  if (!text || text.length > 2000) fail('note text must be 1-2000 characters');
  const status = n.status ?? 'open';
  if (!['open', 'done', 'skipped'].includes(status)) fail('note status must be open, done or skipped');
  return { id: n.id, t: n.t, ...(n.all === true ? { all: true } : {}), ...(n.end != null ? { end: n.end } : {}), x: pct(n.x), y: pct(n.y), text, status, ...(typeof n.reply === 'string' ? { reply: n.reply } : {}), ...(Number.isFinite(n.round) ? { round: n.round } : {}) };
}

// No lock: saving notes must not wait for or block a step. Only a running review round writes review.json too.
// The reviewer's approval: final() needs it. Manual edits (Edição) keep it; any AI pass clears it.
export function approveReview(id: string) {
  const st = load(id);
  if (getBusy(id)) fail('espere a etapa em execução terminar');
  const open = readReview(id).notes.filter(n => n.status === 'open').length;
  if (open) fail(`há ${open} anotação(ões) aberta(s): aplique ou remova antes de aprovar`);
  if (!existsSync(join(liveDir(st), 'index.html'))) fail('a composição ainda não foi montada: abra a Revisão primeiro');
  st.approvedAt = Date.now(); save(st);
  return getProject(id);
}
export function putReviewNotes(id: string, notes: unknown, version?: unknown) {
  load(id);
  if (getBusy(id)?.step === 'review') fail('as anotações estão sendo aplicadas; espere a rodada terminar');
  if (!Array.isArray(notes) || notes.length > 500) fail('notes must be an array (at most 500)');
  const cur = readReview(id);
  if ((cur.version ?? 0) !== (Number(version) || 0)) fail('as anotações mudaram em outra aba: recarregue a Revisão antes de salvar');
  writeReview(id, { ...cur, notes: (notes as unknown[]).map(checkNote) });
  return getReview(id);
}
const writeReview = (id: string, r: Review) => writeJSON(reviewFile(id), { ...r, version: (r.version ?? 0) + 1 });


export function liveFile(id: string, rel: string) {
  const base = liveDir(load(id)), p = resolve(base, rel);
  if (rel === 'index.html' && existsSync(p)) syncEdits(base, projDir(id));   // a new AI pass gets the manual edits again
  if (!p.startsWith(base + sep) || !existsSync(p) || !statSync(p).isFile()) fail(`no ${rel} in the live composition`);
  return p;
}
export const hfFile = (name: string) => ['hyperframes-player.global.js', 'hyperframe.runtime.iife.js'].includes(name) ? join(SKILL, 'engine/hf', name) : fail(`no ${name}`);

// ---- Edição: manual layers on top of the AI composition (server/edits.ts). Saving rewrites the live index.html at once. ----
export function getLayers(id: string) {
  const st = load(id), D = liveDir(st), P = projDir(id);
  if (!existsSync(join(D, 'index.html'))) fail('a composição ainda não foi montada: abra a Revisão (Etapa 3) primeiro');
  const { warnings } = syncEdits(D, P);
  const html = readFileSync(aiCopy(join(D, 'index.html')), 'utf8');
  const duration = Number(/data-composition-id="[^"]+"[^>]*data-duration="([\d.]+)"|data-duration="([\d.]+)"[^>]*data-composition-id=/.exec(html)?.slice(1).find(Boolean) ?? 0);
  const layers = listLayers(html);
  for (const l of layers.filter(l => l.comp)) {   // a scene's texts live in its own file (the AI's copy, as edits index into it)
    const f = resolve(D, l.comp!), ai = aiCopy(f);
    if (f.startsWith(D + sep) && existsSync(f)) {
      const src = readFileSync(existsSync(ai) ? ai : f, 'utf8');
      l.texts = textRuns(src).map(({ i, text }) => ({ i, text }));
      l.colors = colorsOf(src);
    }
  }
  return { duration, layers, edits: readLayers(P), warnings };
}
export async function putLayers(id: string, doc: unknown) {
  load(id);
  let d;
  try { d = checkLayers(doc); } catch (e) { fail((e as Error).message); }
  writeJSON(join(projDir(id), 'layers.json'), d);
  const out = getLayers(id);
  await commit(id, 'edição manual');
  return out;
}
// a dropped file (workspace/uploads) moves into <project>/media/; the composition gets a copy when the edits are applied
export async function addMedia(id: string, from: string) {
  load(id);
  const p = expandHome(from);
  if (!p?.startsWith(UPLOADS + sep) || !existsSync(p)) fail('envie o arquivo pelo upload primeiro');
  const ext = extname(p).toLowerCase();
  if (!MEDIA_EXT.includes(ext)) fail(`arquivo deve ser ${MEDIA_EXT.join(' ')}`);
  const dir = join(projDir(id), 'media'), name = basename(p).replace(/^\d+-/, '').replace(/[^\w.-]+/g, '_');
  mkdirSync(dir, { recursive: true });
  let file = name;
  for (let n = 2; existsSync(join(dir, file)); n++) file = name.replace(/(\.\w+)$/, `-${n}$1`);
  renameSync(p, join(dir, file));
  const kind = ext === '.glb' ? 'model' : ['.mp3', '.wav', '.m4a', '.aac'].includes(ext) ? 'audio' : ['.mp4', '.mov', '.webm'].includes(ext) ? 'video' : 'image';
  const dur = kind === 'audio' || kind === 'video' ? await duration(id, join(dir, file)).catch(() => 0) : 0;
  return { src: `media/${file}`, kind, duration: dur };
}
// the simple captions: phrases from the transcript
export function captionDraft(id: string) {
  load(id);
  const f = join(projDir(id), 'compose', 'assets', 'transcript.json');
  if (!existsSync(f)) fail('sem transcript.json na composição');
  return captionLines(readJSON(f));
}

const fmtT = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// One round: every open note goes to the composer in one call and the player reloads. No render: that waits for the approval.
export const applyReview = async (id: string) => {
  const st0 = load(id);
  const open = readReview(id).notes.filter(n => n.status === 'open');
  if (!open.length) fail('nenhuma anotação aberta para aplicar');
  const reply = (r: Review, done: Map<string, { done: boolean; reply: string }>) => {
    r.round += 1;
    for (const n of r.notes) {
      const a = done.get(n.id);
      if (n.status === 'open' && a) Object.assign(n, { status: a.done ? 'done' : 'skipped', reply: a.reply, round: r.round });
    }
    writeReview(id, r);
  };
  // an agent-composed reel is changed by its composer, which takes the notes as one adjustment and renders out.mp4 itself
  const note = open.map(n => n.all ? `[vídeo todo] ${n.text}` : `[${fmtT(n.t)}${n.end !== undefined ? `–${fmtT(n.end)}` : ''}${n.x !== undefined ? ` · ponto x=${n.x.toFixed(0)}% y=${n.y!.toFixed(0)}% do quadro` : ''}] ${n.text}`).join('\n');
  const r = await compose(id, `Anotações da revisão (tempo no vídeo · ponto marcado no quadro · pedido):\n${note}`);
  // an interrupted composer (summary starts with ⚠) may not have read the notes: they stay open for the next round
  if (r.summary.startsWith('⚠')) emit(id, 'log', `As ${open.length} anotação(ões) continuam abertas: ${r.summary}`);
  else {
    const last = r.summary.trim().split('\n').filter(Boolean).pop()?.slice(0, 300) || 'Aplicada pelo compositor.';
    reply(readReview(id), new Map(open.map(n => [n.id, { done: true, reply: last }])));
  }
  return { ...getReview(id), summary: r.summary };
};

// Step 5 - final render + QA for the formats picked here, one file each, in FORMATS order. Haiku only explains a failed QA.
// Only from the review screen: an open note means the reel is not approved yet.
export const setFormats = (id: string, formats: unknown) => {
  const P = projDir(id), st = readJSON(join(P, 'state.json'));
  st.formats = checkFormats(formats);
  save(st);
  return { ok: true, formats: st.formats };
};

export const final = (id: string, formats?: unknown) => locked(id, 'final', async st => {
  const P = projDir(id);
  const open = readReview(id).notes.filter(n => n.status === 'open').length;
  if (open) fail(`há ${open} anotação(ões) aberta(s) na revisão: aplique ou remova antes de renderizar o final`);
  if (!st.approvedAt) fail('o vídeo ainda não foi aprovado: assista na Revisão e clique em Aprovar antes de renderizar');
  const long = await overLength(id, P, writeBrand(st));
  if (long) fail(`${long}: corte o vídeo ou suba o limite antes de renderizar`);
  // an agent reel has one composition per aspect: compose/ (the format's own) and compose-<aspect>/ for the others
  const composed = composedByAgent(st);
  const primary = primaryAspect(st);
  st.formats = checkFormats(formats ?? st.formats);
  save(st);
  if (composed) {
    const missing = st.formats.filter(f => f !== primary && !existsSync(join(composeDirOf(P, st, f), 'index.html')));
    if (missing.length) fail(`ainda não há composição para ${missing.join(', ')}: gere-a na Entrega antes de renderizar`);
  }
  const runs: { format: string; pass: boolean; out: string }[] = [];
  for (const format of st.formats) {
    if (composed) {
      // the agent composition is the edit: re-rendering edit.json here would throw it away (it only exists in the primary aspect)
      const dir = composeDirOf(P, st, format);
      rmSync(join(dir, 'out.mp4'), { force: true });
      if (format === primary) for (const w of syncEdits(dir, P).warnings) emit(id, 'log', `edição: ${w}`);
      emit(id, 'log', `🎬 Renderizando a composição ${format}...`);
      const idx = join(dir, 'index.html'), full = readFileSync(idx, 'utf8');
      writeFileSync(idx, full.replace(/<video[^>]*\bdata-backup\b[^>]*><\/video>/g, ''));   // the backup layer (kit.py #pcam) is invisible: keep it out of the render
      try { await run(id, NPX[0], [...NPX.slice(1), '--yes', 'hyperframes@0.8.217', 'render', '-o', 'out.mp4', '--fps', '30', '--quality', 'delivery'], {}, false, dir); }
      finally { writeFileSync(idx, full); }
      // the composer mixes voice + sfx without a master loudness pass: bring it to the -14 LUFS that qa.py expects.
      // Two passes, like render.sh: a single loudnorm undershoots on speech (measured -15.8 LUFS, outside qa.py's -15..-12.5)
      const ln = join(P, 'final_ln.mp4');
      await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', join(dir, 'out.mp4'), '-c:v', 'copy',
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', ln]);
      await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', ln, '-c:v', 'copy',
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', join(P, 'final.mp4')]);
      rmSync(ln, { force: true });
    } else fail('a composição ainda não foi montada: abra a Revisão primeiro');
    const qa = await run(id, PYTHON, [join(S, 'qa.py'), P], { REEL_FORMAT: format }, true);
    runs.push({ format, pass: qa.code === 0, out: qa.out.trim() });
    renameSync(join(P, 'final.mp4'), join(P, finalName(format)));   // the render always writes final.mp4
  }
  st.qa = { pass: runs.every(r => r.pass), report: runs.map(r => `== ${r.format} ==\n${r.out}`).join('\n\n') };
  if (!st.qa.pass) {
    st.qa.summary = (await ask<{ summary: string }>('triage', 'final:qa-summary', {
      system: 'Explain to a video creator, in Brazilian Portuguese and in two or three short sentences, what failed in this QA report and what to change.',
      content: st.qa.report,
      schema: obj({ summary: str }),
    }, logCost(st))).summary;
  }
  Object.assign(st, { step: 'final' }); save(st);
  await commit(id, `step 5: final (${st.qa.pass ? 'QA pass' : 'QA fail'})`);
  if (st.formatId && st.formats.includes(primary)) sampleFormatFrames(id, st.formatId, join(P, finalName(primary))).catch(e => emit(id, 'log', `⚠ prévia do formato não atualizada: ${e.message}`));   // a thumbnail never fails the delivery
  return st;
});

// ---- After Effects & Embrulhos (Editor 7.0) --------------------------------------------------------------------------
export const exportAfterEffects = (id: string) => locked(id, "ae", async st => {
  const P = projDir(id);
  const aeDir = join(P, "after-effects");
  mkdirSync(aeDir, { recursive: true });
  // the export (ProRes clips, converted media) is output, not project history
  const gi = join(P, ".gitignore");
  if (existsSync(gi) && !/^after-effects\/$/m.test(readFileSync(gi, "utf8"))) appendFileSync(gi, "after-effects/\n");
  const scriptPath = join(ROOT, "server/ae/make_jsx.mjs");
  // the composition the review player plays (compose/), loaded in the HyperFrames runtime, manual edits included
  const htmlFile = join(liveDir(st), "index.html");
  if (!existsSync(htmlFile)) fail("O projeto precisa ter a composição montada (abra a Revisão) para exportar para o After Effects.");
  syncEdits(liveDir(st), P);

  const aepPath = join(aeDir, `${id}.aep`);
  // no catch: when make_jsx.mjs fails (missing puppeteer-core, Chrome or ffmpeg) the user must see it, not an "ok" with no .aep
  await run(id, "node", [scriptPath, "--html", htmlFile, "--out", aeDir, "--aep", aepPath, "--name", id]);
  // an export whose text all went into ProRes clips is a regression of make_jsx (new wrapper or text path in the kit), not a result
  const rel = readJSON(join(aeDir, "ae_report.json")).camadas ?? {};
  if (rel.textos === 0 && rel.textos_na_composicao > 0)
    fail(`Export do After sem nenhum texto editável (a composição tem ${rel.textos_na_composicao} textos): o exportador não reconheceu a estrutura do HTML. Veja server/test/ae_export.test.ts.`);
  
  const runJsxPath = join(aeDir, "run.jsx");
  let aepGenerated = existsSync(aepPath);
  const ae = afterEffectsCmd(runJsxPath);
  if (!aepGenerated && existsSync(runJsxPath) && ae) {
    await run(id, ae[0], ae.slice(1)).catch(() => null);
    aepGenerated = existsSync(aepPath);
  }
  
  await commit(id, "export: After Effects (.jsx e projeto)");
  emit(id, "ae:done", { outputDir: aeDir, aep: aepPath, aepGenerated });
  return { ok: true, outputDir: aeDir, aep: aepPath, aepGenerated };
});

// Embrulhos: the 9 static 9:16 frames from the editor's PDF (server/embrulhos/modelos). Sonnet picks up to 3 eligible models for this
// talk, fills their fields in conversational copy, and each pick is rendered as embrulho-<modelo>.mp4 with the reel inside the slot.
// shortcut: the angle library is a fixed file; `body.angulos` replaces it for one call, no per-brand list yet
const ANGULOS: { n: number; cat: string; angulo: string; explicacao: string; exemplo: string; modelos: string[] }[] = readJSON(join(ROOT, 'server/embrulhos/angulos.json')).angulos;
const angulosDe = (modelo: string) => ANGULOS.filter(a => a.modelos.includes(modelo)).map(a => a.angulo);
export const generateHooks = (id: string, body: { angulos?: string[] } = {}) => locked(id, 'embrulhos', async st => {
  const P = projDir(id);
  const video = [finalName('9:16'), 'master.mp4'].map(f => join(P, f)).find(existsSync) ?? fail('Sem vídeo: conclua a ingestão (master.mp4) ou o render 9:16.');
  const words: Word[] = existsSync(join(P, 'transcript.json')) ? readJSON(join(P, 'transcript.json')) : [];
  // the srt is the only source of prices; without one the Whisper transcript stands in for it
  const srt = existsSync(join(P, 'source.srt')) ? readFileSync(join(P, 'source.srt'), 'utf8').replace(/^\uFEFF/, '') : words.map(w => w.text).join(' ');
  const falas = srt.split(/\r?\n/).filter(l => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l)).join(' ');
  if (!falas.trim()) fail('Sem transcrição nem legenda: conclua a ingestão.');
  const dur = await duration(id, video), precos = precosDoSrt(srt), quadros = sugerirQuadros(video, 3);
  const modelos = listarEmbrulhos().map(mid => {
    const m = carregarEmbrulho(mid), faltas: string[] = [];
    if (m.perfil.exige.includes('preco_no_srt') && !precos.length) faltas.push('o .srt não tem preço (R$)');
    if (m.perfil.exige.includes('quadro_marcante') && !quadros.length) faltas.push('nenhuma cena candidata para o print');
    return { id: m.id, nome: m.nome, tipo: m.tipo, perfil: m.perfil, campos: m.campos, angulos: angulosDe(m.id), elegivel: !faltas.length, ...(faltas.length ? { motivo: faltas.join('; ') } : {}) };
  });
  const system = `Você escolhe "embrulhos" (molduras estáticas 9:16 com texto) para um vídeo curto e escreve o texto de cada campo.
Regras:
- Só modelos com elegivel:true. Até 3 sugestões, modelos diferentes, exatamente uma com rec:true.
- "angulo" é o nome de um dos "angulos" do modelo escolhido (biblioteca abaixo: explicação e exemplo de cada um); ângulos diferentes entre as sugestões. O texto dos campos segue a lógica do ângulo, adaptado ao que o vídeo diz.
- Texto estático, sem animação. Copy de conversação: tom de fala, coloquial, como alguém contando para um amigo. Nada de CAIXA ALTA.
- Tudo tem de ser compatível com o assunto do vídeo e sair do que ele diz: nenhum número, preço ou promessa que não esteja nas falas.
- Preencha todos os campos do modelo dentro de "max" caracteres. Campo com "fixo":true mantém o valor "padrao". Nunca repita os textos-exemplo do PDF.
- Oferta: preco_por (e preco_de, se houver) têm de ser um dos precosDoSrt, escritos igual.
- Fofoca (duplo): nome_pagina é o nome de uma página de fofoca fictícia inventada por você; titulo é a manchete; quadro_t é o instante (s) da cena marcante, de preferência um dos quadrosSugeridos.
- "copy" é a legenda/linha de conversa que acompanha o embrulho no post (1 a 2 frases). "porque" explica a escolha em uma frase.`;
  const campoSchema = { type: 'object', additionalProperties: { type: 'string' } };
  const schema = obj({ sugestoes: { type: 'array', items: obj({ embrulho: str, rec: { type: 'boolean' }, angulo: str, porque: str, copy: str, quadro_t: num, campos: campoSchema }) } });
  const contexto = { duracao: dur, falas, precosDoSrt: precos, quadrosSugeridos: quadros, modelos, biblioteca: body.angulos?.length ? body.angulos : ANGULOS.map(a => ({ angulo: a.angulo, explicacao: a.explicacao, exemplo: a.exemplo })) };
  type Sug = { embrulho: string; rec: boolean; angulo: string; porque: string; copy: string; quadro_t: number; campos: Record<string, string> };
  const checar = (s: Sug) => {
    const m = carregarEmbrulho(s.embrulho), itens = conferirCampos(m, { ...s.campos, ...(m.perfil.exige.includes('quadro_marcante') ? { quadro_t: s.quadro_t } : {}) }, { srt, duracao: dur, textoFonte: falas });
    if (!body.angulos?.length && !angulosDe(m.id).includes(s.angulo)) itens.push({ nivel: 'aviso', campo: 'angulo', msg: `"${s.angulo}" não está entre os ângulos de ${m.nome}` });
    return { m, itens };
  };
  let res = await ask<{ sugestoes: Sug[] }>('embrulhos', 'embrulhos:sugerir', { system, content: JSON.stringify(contexto), schema }, logCost(st));
  let checks = res.sugestoes.map(s => { try { return checar(s); } catch (e) { return { m: null, itens: [{ nivel: 'erro' as const, campo: 'embrulho', msg: (e as Error).message }] }; } });
  const erros = () => checks.flatMap((c, i) => c.itens.filter(x => x.nivel === 'erro').map(x => `#${i + 1} ${res.sugestoes[i].embrulho} · ${x.campo}: ${x.msg}`));
  if (erros().length) {   // one correction round, then whatever still fails is dropped
    emit(id, 'log', 'embrulhos: corrigindo ' + erros().length + ' erro(s)');
    res = await ask<{ sugestoes: Sug[] }>('embrulhos', 'embrulhos:corrigir', { system, content: JSON.stringify({ ...contexto, suaResposta: res, erros: erros() }) + '\nCorrija os erros e devolva as sugestões completas.', schema }, logCost(st));
    checks = res.sugestoes.map(s => { try { return checar(s); } catch (e) { return { m: null, itens: [{ nivel: 'erro' as const, campo: 'embrulho', msg: (e as Error).message }] }; } });
  }
  const dir = join(P, 'embrulhos'); mkdirSync(dir, { recursive: true });
  const gi = join(P, '.gitignore');
  if (!existsSync(gi) || !/^embrulhos\/$/m.test(readFileSync(gi, 'utf8'))) appendFileSync(gi, 'embrulhos/\n');
  const out: unknown[] = [];
  for (const [i, s] of res.sugestoes.entries()) {
    const { m, itens } = checks[i], falhas = itens.filter(x => x.nivel === 'erro').map(x => `${x.campo}: ${x.msg}`);
    const avisos = itens.filter(x => x.nivel === 'aviso').map(x => `${x.campo}: ${x.msg}`);
    if (!m || falhas.length) { out.push({ ...s, erros: falhas }); continue; }
    emit(id, 'log', `embrulho ${m.nome}: renderizando`);
    const quadro = m.perfil.exige.includes('quadro_marcante') ? extrairQuadro(video, s.quadro_t, join(dir, `${m.id}-quadro.jpg`)) : null;
    const camadas = await renderCamadas(m, s.campos, { quadroImg: quadro, destino: join(dir, m.id) });
    if (camadas.textoNaoCabe?.length) avisos.push(`texto não coube: ${camadas.textoNaoCabe.join(', ')}`);
    const arquivo = `embrulho-${m.id}.mp4`;
    compor(m, video, camadas, join(P, arquivo), { duracao: dur });
    out.push({ ...s, nome: m.nome, arquivo, avisos });
  }
  if (!out.some((o: any) => o.arquivo)) fail('Nenhum embrulho passou na conferência: ' + erros().join(' | '));
  writeJSON(join(P, 'embrulhos.json'), { generatedAt: Date.now(), embrulhos: out });
  await commit(id, `embrulhos: ${out.filter((o: any) => o.arquivo).length} moldura(s) renderizada(s)`);
  emit(id, 'embrulhos:done', { embrulhos: out });
  return { ok: true, embrulhos: out };
});

// ---- Cut-out (Apple Vision Segmentation) ----------------------------------------------------------------------------
// Writes cutout.webm (VP9 + alpha) next to master.mp4, cached by master size+mtime (like nose.json). The ~1 GB of PNGs is deleted.
// A character pose as the "speaker": the pose on the 1920x1080 stage, centred on x=980 with its base on the floor, breathing a little.
// shortcut: one pose for the whole reel; the other poses are offered to the composer as assets/char/ to swap in per scene.
function characterPose(st: State) {
  const c = (getBrand(st.brand).animation?.characters ?? []).find((x: any) => x.name === st.character!.name);
  const pose = c?.poses?.find((x: any) => x.name === st.character!.pose) ?? c?.poses?.[0];
  if (!pose || !existsSync(pose.file)) fail(`personagem ${st.character!.name}: pose não encontrada no brandkit`);
  return { c, pose };
}
async function characterCutout(id: string, st: State, out: string, dur: number) {
  const { c, pose } = characterPose(st);
  emit(id, 'log', `🧑‍🎨 Montando o locutor com o personagem ${c.name} (${pose.name})...`);
  await run(id, 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black@0:s=1920x1080:r=30,format=yuva420p`, '-loop', '1', '-i', pose.file,
    '-filter_complex', `[1:v]scale=-2:900,format=rgba[p];[0:v][p]overlay=x=980-w/2:y='H-h+3*sin(2*PI*t/3)':format=auto:eval=frame`,
    '-t', String(dur), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '32', '-row-mt', '1', out]);
}

// One cutout per project at a time: the ingest starts it in the background and compose() later waits on that same run instead of starting a second RVM.
type CutoutResult = { cached: boolean; framesCount?: number };
const cutoutJobs = new Map<string, Promise<CutoutResult>>();
export function ensureCutout(id: string, force = false): Promise<CutoutResult> {
  const running = cutoutJobs.get(id);
  if (running) return force ? running.catch(() => {}).then(() => ensureCutout(id, true)) : running;   // force: redo after the running one, never two RVMs on one cutout.webm
  const job = cutoutNow(id, force).finally(() => { if (cutoutJobs.get(id) === job) cutoutJobs.delete(id); });
  cutoutJobs.set(id, job);
  return job;
}
// Started right after ingest (master.mp4 exists) so the RVM pass overlaps the script step and the user's review of it.
function cutoutInBackground(id: string) {
  ensureCutout(id).then(() => ensureComposeMedia(id)).catch(e => emit(id, 'log', `⚠ Recorte em segundo plano falhou (será refeito na composição): ${(e as Error).message}`));
}
async function cutoutNow(id: string, force: boolean): Promise<CutoutResult> {
  const P = projDir(id);
  const master = join(P, 'master.mp4');
  const raw = rawClip(P);
  const videoInput = existsSync(master) ? master : raw;
  if (!existsSync(videoInput)) fail('Nenhum vídeo disponível no projeto para recorte');
  const st: State = readJSON(join(P, 'state.json'));
  const m = statSync(videoInput), key = `${m.size}:${Math.floor(m.mtimeMs / 1000)}${st.character ? `:${st.character.name}:${characterPose(st).pose.name}:${statSync(characterPose(st).pose.file).mtimeMs}` : ''}`;
  const out = join(P, 'cutout.webm'), meta = join(P, 'cutout.json');
  const win = cutWindowsOf(st, (await probeMedia(videoInput)).duration);   // Speech Screen: inference only where the cut-out shows; the rest is transparent
  const fullKey = win ? `${key}:${JSON.stringify(win)}` : key;
  if (!force && existsSync(out) && existsSync(meta) && readJSON(meta).key === fullKey) return { cached: true };
  if (st.character) {
    await characterCutout(id, st, out, (await probeMedia(videoInput)).duration);
    writeJSON(meta, { key: fullKey, engine: 'character' });
    return { cached: false };
  }

  const rvmPy = join(homedir(), '.cache/rvm-venv', WIN ? 'Scripts/python.exe' : 'bin/python'), rvmModel = join(homedir(), '.cache/rvm-model/rvm_mobilenetv3_fp32.onnx');
  if (existsSync(rvmPy) && existsSync(rvmModel)) {
    emit(id, 'log', win ? `✂ Recortando o locutor com RVM só nas janelas ${win.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} s`).join(', ')}...` : '✂ Recortando o locutor com RVM (≈5 min por minuto de vídeo)...');
    await run(id, rvmPy, [join(S, 'rvm.py'), rvmModel, videoInput, out, '0.4', ...win ? [`--windows=${win.map(([a, b]) => `${a}-${b}`).join(',')}`] : []]);
    writeJSON(meta, { key: fullKey, engine: 'rvm' });
    return { cached: false };
  }
  // fallback: Apple Vision when the RVM venv/model are missing. The guide requires RVM (Vision cut the arms in some scenes), so say so.
  if (process.platform !== 'darwin') fail('Recorte do locutor fora do macOS precisa do RVM (~/.cache/rvm-venv e ~/.cache/rvm-model): não há Apple Vision aqui.');
  emit(id, 'log', '⚠ RVM não instalado (~/.cache/rvm-venv e rvm-model): recortando com Apple Vision, que pode cortar os braços. Instale o RVM para o recorte de referência.');
  const framesDir = join(P, 'frames'), cutoutDir = join(P, 'cutout');
  for (const d of [framesDir, cutoutDir]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
  emit(id, 'log', '✂ Extraindo quadros do vídeo para recorte com Apple Vision...');
  try {
    // fps=30: a 60 fps master would give twice the frames, and the 30 fps encode below would play the cut-out at half speed
    await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', videoInput, '-vf', 'fps=30,' + FIT_STAGE, '-q:v', '2', join(framesDir, '%05d.jpg')]);
    const last = readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
    if (!last) fail('Nenhum quadro gerado pelo ffmpeg para recorte');
    emit(id, 'log', `✂ Acionando Apple Vision (VNGeneratePersonSegmentationRequest) em ${last} quadros...`);
    await run(id, 'swift', [join(ROOT, 'tools/vision_cutout.swift'), framesDir, cutoutDir, '1', String(last)]);
    emit(id, 'log', '✂ Codificando cutout.webm (VP9 com alfa)...');
    await run(id, 'ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', join(cutoutDir, '%05d.png'),
      '-vf', CUTOUT_SMOOTH, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '32', '-row-mt', '1', out]);
    writeJSON(meta, { key: fullKey, frames: last });
    return { cached: false, framesCount: last };
  } finally {
    rmSync(framesDir, { recursive: true, force: true }); rmSync(cutoutDir, { recursive: true, force: true });
  }
}

// Alpha smoothing: tmix steadies the mask over time, erosion drops the old-background fringe, gblur softens hair and glasses.
// Any source fits (never stretches) into the 1920x1080 stage the compose kit expects; a vertical one becomes a centred strip.
const FIT_STAGE = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
// Face centre on the 1920 stage: the nose track's mean (a fraction of the source width) placed by FIT_STAGE; 980 of a 1920 source when there is no track.
// Head centre as a fraction of the source width, measured on the cutout's alpha (the rows of the head, above the shoulders,
// same rows as layout_check's centroDaCabeca) at three instants; null without a cutout or when ffmpeg fails.
function headFracFromCutout(P: string): number | null {
  const cut = join(P, 'cutout.webm');
  if (!existsSync(cut)) return null;
  try {
    const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', cut]).toString());  // json: ffprobe 9 repeats csv lines
    const w = pr.streams[0].width, h = pr.streams[0].height, dur = Number(pr.format.duration);
    const y0 = Math.round(180 * h / 1080), y1 = Math.round(280 * h / 1080), xs: number[] = [];
    for (const t of [0.25, 0.5, 0.75].map(f => f * dur)) {
      const m = execFileSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', String(t), '-i', cut, '-frames:v', '1', '-vf', 'alphaextract,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
      if (m.length !== w * h) continue;
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > 127) { sum += x; n++; }
      if (n) xs.push(sum / n / w);
    }
    return xs.length ? xs.sort((a, b) => a - b)[xs.length >> 1] : null;
  } catch { return null; }
}

function faceXOf(P: string, width: number, height: number) {
  const track: number[][] = existsSync(join(P, 'nose.json')) ? readJSON(join(P, 'nose.json')).track : [];
  const fw = Math.min(1920, width * 1080 / height);
  const frac = track.length ? track.reduce((s, t) => s + t[1], 0) / track.length : headFracFromCutout(P) ?? 980 / 1920;
  return Math.round((1920 - fw) / 2 + frac * fw);
}
const CUTOUT_SMOOTH = "format=rgba,split[c][b];[b]alphaextract,tmix=frames=3:weights='1 2 1',erosion,gblur=sigma=1.2[m];[c][m]alphamerge";

// Normalized voice and the Speech Screen panel video for the agent composer. No blurred plate any more (rule: the speaker's video is
// never replicated as a background); the raw master goes in as a hidden backup layer (kit.py #pcam, data-backup).
const mediaJobs = new Map<string, Promise<void>>();
function ensureComposeMedia(id: string): Promise<void> {
  const running = mediaJobs.get(id);
  if (running) return running;
  const job = composeMediaNow(id).finally(() => { if (mediaJobs.get(id) === job) mediaJobs.delete(id); });
  mediaJobs.set(id, job);
  return job;
}
async function composeMediaNow(id: string) {
  const P = projDir(id), master = join(P, 'master.mp4');
  if (!existsSync(master)) return;
  const { width, height } = await probeMedia(master);
  if (!existsSync(join(P, 'voice.m4a'))) await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', master, '-vn', '-af', 'highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=9',
    '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', join(P, 'voice.m4a')]);
  // Speech Screen panel: the raw speaker, cropped to the panel's box around the face (no cut-out, no blur)
  const st: State = readJSON(join(P, 'state.json')), panel = fmtOf(st).panel;
  if (panel?.top) {
    const PW = fmtOf(st).width ?? 1080, PH = Math.round((fmtOf(st).height ?? 1920) * (panel.side === 'top' ? panel.top : 1 - panel.top)) & ~1;
    const sw = Math.max(PW, Math.round(width * PH / height)), fw = Math.min(1920, width * 1080 / height);
    const frac = width > height ? (faceXOf(P, width, height) - (1920 - fw) / 2) / fw : 0.5;
    const tx = Math.min(sw - PW, Math.max(0, Math.round(frac * sw - PW / 2)));
    const ms = statSync(master), tkey = `${PW}x${PH}:${tx}:${ms.size}:${Math.floor(ms.mtimeMs / 1000)}`, tmeta = join(P, 'talk.json');
    if (!existsSync(join(P, 'talk.mp4')) || !existsSync(tmeta) || readJSON(tmeta).key !== tkey) {   // cropped around the face: needs the cutout
      await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', master, '-vf', `scale=${PW}:${PH}:force_original_aspect_ratio=increase,crop=${PW}:${PH}:${tx}:0`,
        '-an', '-c:v', 'libx264', '-crf', '20', '-g', '30', '-pix_fmt', 'yuv420p', join(P, 'talk.mp4')]);
      writeJSON(tmeta, { key: tkey });
    }
  }
}

// Agent composer workspace: <project>/compose/ with the kit, the guide, assets and an auto-written brief.md. Safe to re-run: kit, assets and brief are refreshed, scenes.py is kept.
// Largura × altura de cada proporção: a composição de outro formato é feita nesse quadro
const ASPECT_SIZE: Record<string, [number, number]> = { '9:16': [1080, 1920], '16:9': [1920, 1080], '4:5': [1080, 1350], '1:1': [1080, 1080], '4:3': [1440, 1080] };
const primaryAspect = (st: State): string => { try { return getFormat(st.formatId || 'business-reels').aspectRatio ?? '9:16'; } catch { return '9:16'; } };
// compose/ holds the project's own aspect; every other aspect gets compose-<aspect> beside it (same assets, own scenes.py)
const composeDirName = (st: State, aspect?: string | null, motion = false) =>
  motion ? 'compose-motion' : aspect && aspect !== primaryAspect(st) ? `compose-${aspect.replace(':', '-')}` : 'compose';
export const composeDirOf = (P: string, st: State, aspect?: string | null) => join(P, composeDirName(st, aspect));

// media=false: scaffold without waiting for the cutout (treatment and illustrations need none of cut.webm, plate.mp4 or voice.m4a);
// the caller re-runs it with media=true before the compose call, which then gets the real faceX and the speaker files
export async function composeScaffold(id: string, motion = false, aspect?: string | null, media = true) {
  const P = projDir(id), st = load(id), C = join(P, composeDirName(st, aspect, motion)), A = join(C, 'assets');
  // no speaker on screen: the só-motion test, or a format with speaker: false (Só Motion); the folder name only follows the test
  const noSpeaker = motion || (() => { try { return getFormat(st.formatId || 'business-reels').speaker === false; } catch { return false; } })();
  await ensureComposeIgnored(id);
  for (const old of [join(P, composeDirName(st, aspect, motion), 'index.ai.html')]) if (existsSync(old)) { if (!existsSync(old.replace(/\.ai\.html$/, '.html.ai'))) renameSync(old, old.replace(/\.ai\.html$/, '.html.ai')); else rmSync(old); }   // old pristine name broke `hyperframes check`
  if (!noSpeaker && media) await ensureCutout(id);
  if (media) await ensureComposeMedia(id);
  for (const d of ['fonts', 'img', 'sfx', 'video', 'music']) mkdirSync(join(A, d), { recursive: true });
  const K = join(SKILL, 'compose');
  copyFileSync(join(K, 'kit.py'), join(C, 'kit.py'));
  copyFileSync(join(K, 'GUIDE.md'), join(C, 'GUIDE.md'));
  copyFileSync(join(K, 'DIRETOR.md'), join(C, 'DIRETOR.md'));
  mkdirSync(join(C, 'engines'), { recursive: true });
  for (const f of readdirSync(join(K, 'engines')).filter(f => f.endsWith('.js'))) copyFileSync(join(K, 'engines', f), join(C, 'engines', f));
  // v8: no illustration packs and no brand drawing guide. The reel's own library (assets/manifest.json, fetched at the script
  // step) and the shared one (workspace/library/{img,3d}/: 3D icon packs, brand objects the user drops there) go in instead.
  for (const f of ['ESTILO.md', 'ILUSTRACAO.md']) rmSync(join(C, f), { force: true });
  rmSync(join(C, 'estilos'), { recursive: true, force: true });
  const manifest: AssetEntry[] = existsSync(join(P, 'assets', 'manifest.json')) ? readJSON(join(P, 'assets', 'manifest.json')) : [];
  mkdirSync(join(A, '3d'), { recursive: true });
  for (const e of manifest) if (existsSync(join(P, 'assets', e.file))) copyFileSync(join(P, 'assets', e.file), join(A, e.file));
  const libLines: string[] = [];
  for (const sub of ['img', '3d', 'music']) {
    const from = join(WS, 'library', sub);
    if (!existsSync(from)) continue;
    mkdirSync(join(A, 'lib', sub), { recursive: true });
    for (const f of readdirSync(from).filter(f => !f.startsWith('.') && statSync(join(from, f)).isFile())) { copyFileSync(join(from, f), join(A, 'lib', sub, f)); libLines.push(`assets/lib/${sub}/${f}`); }
  }
  // the HyperFrames catalog motions cached in engine/hf, offered in GUIDE.md; kept out of compositions/, which render() empties
  const HF = join(SKILL, 'engine/hf/compositions');
  mkdirSync(join(C, 'motions'), { recursive: true });
  for (const d of [HF, join(HF, 'components')]) for (const f of readdirSync(d).filter(f => f.endsWith('.html'))) copyFileSync(join(d, f), join(C, 'motions', f));
  for (const f of readdirSync(join(K, 'sfx'))) copyFileSync(join(K, 'sfx', f), join(A, 'sfx', f));
  // the user's own effects (workspace/library/sfx/): merged into the manifest the kit reads, named by file name
  const sfxLib = join(WS, 'library', 'sfx'), sfxManifest = readJSON(join(A, 'sfx', 'manifest.json'));
  for (const f of existsSync(sfxLib) ? readdirSync(sfxLib).filter(f => /\.(wav|mp3|m4a|ogg|flac)$/i.test(f)) : []) {
    copyFileSync(join(sfxLib, f), join(A, 'sfx', f));
    sfxManifest[f.replace(/\.[^.]+$/, '')] = { file: f, duration: (await probeMedia(join(sfxLib, f)).catch(() => ({ duration: 1 }))).duration, description: `efeito do estúdio (${f})`, onset: 0, peak: 0, source: 'workspace/library/sfx' };
  }
  writeJSON(join(A, 'sfx', 'manifest.json'), sfxManifest);
  // react (SPEC-v9 §4): the reaction video (react.mp4, or the style reference's ref/ref.mp4 for old projects) goes beside the speaker; the kit lints a react scene without it
  const refMp4 = existsSync(join(P, 'react.mp4')) ? join(P, 'react.mp4') : join(P, 'ref', 'ref.mp4'), hasRef = !noSpeaker && !!fmtOf(st).refVideo && existsSync(refMp4);   // react.mp4 (the reaction video chosen at creation) wins over the style reference's clip
  if (hasRef) copyFileSync(refMp4, join(A, 'ref.mp4'));
  for (const [from, to] of [['cutout.webm', 'cut.webm'], ['master.mp4', 'raw.mp4'], ['voice.m4a', 'voice.m4a'], ['transcript.json', 'transcript.json'], ['talk.mp4', 'talk.mp4']].filter(([f]) => (!noSpeaker || f === 'voice.m4a' || f === 'transcript.json' || f === 'master.mp4') && (f !== 'talk.mp4' || existsSync(join(P, f))))) if (media || (existsSync(join(P, from)) && !cutoutJobs.has(id))) { const src = join(P, from), dst = join(A, to); if (!existsSync(dst) || statSync(dst).size !== statSync(src).size || statSync(dst).mtimeMs < statSync(src).mtimeMs) copyFileSync(src, dst); }   // deferred: RVM writes cutout.webm in place, so a running job means a partial file. Só Motion keeps master.mp4 too: the hidden layer 1 (kit.py #pcam) for Edição and the After export
  // the brand as it is now (global + this project's override): the copy in the project folder goes stale when the brand gains a font or colour
  const brand = writeBrand(st);
  const fontFile = brandFontFile(st, brand);
  if (fontFile) copyFileSync(fontFile, join(A, 'fonts/font.otf'));
  // a Black weight for the giant type (brand.fonts.giant.file): kit.py declares it as weight 900 when the file is there
  const giantFile = brand.fonts?.giant?.file && existsSync(expandHome(brand.fonts.giant.file)) ? expandHome(brand.fonts.giant.file) : '';
  if (giantFile) copyFileSync(giantFile, join(A, 'fonts/giant.otf')); else rmSync(join(A, 'fonts/giant.otf'), { force: true });
  const { duration, width, height } = await probeMedia(join(P, 'master.mp4'));
  const c = brand.colors ?? {}, faceX = faceXOf(P, width, height);

  // animation brandkit: poses go to assets/char/<character>-<pose>.<ext>, listed in the brief
  const chars = (brand.animation?.characters ?? []).filter((c: any) => c.poses?.length);
  const charLines: string[] = [];
  for (const c of chars) {
    mkdirSync(join(A, 'char'), { recursive: true });
    const lines = c.poses.filter((p: any) => existsSync(p.file)).map((p: any) => {
      const to = `char/${c.name}-${p.name}${extname(p.file)}`;
      copyFileSync(p.file, join(A, to));
      return `  - assets/${to}${p.tags?.length ? ` (${p.tags.join(', ')})` : ''}`;
    });
    charLines.push(`- ${c.name}${c.description ? `: ${c.description}` : ''}\n${lines.join('\n')}`);
  }

  // imagens que o usuário enviou no formulário entram em img/ junto das do site
  for (const p of st.userImages ?? []) copyFileSync(join(P, p), join(A, 'img', 'user-' + basename(p)));

  // Sincroniza imagens e documentação do site de referência para o compose
  // the site extractor writes to both; ref/img can be a partial older copy, so take assets/img too
  for (const refImgDir of [join(P, 'ref', 'img'), join(P, 'assets', 'img')]) if (existsSync(refImgDir)) {
    for (const f of readdirSync(refImgDir)) {
      if (!f.startsWith('.')) {
        try { copyFileSync(join(refImgDir, f), join(A, 'img', f)); } catch {}
      }
    }
  }
  const refSiteDir = join(P, 'ref_site');
  if (existsSync(refSiteDir)) {
    mkdirSync(join(C, 'ref_site'), { recursive: true });
    for (const f of readdirSync(refSiteDir)) {
      if (!f.startsWith('.')) {
        try { copyFileSync(join(refSiteDir, f), join(C, 'ref_site', f)); } catch {}
      }
    }
  }

  // Paleta: se houver siteColors na referência, prioriza para o só-motion
  const refJsonPath = join(P, 'reference.json');
  const refData = existsSync(refJsonPath) ? readJSON(refJsonPath) : null;
  const siteCol = refData?.siteColors;
  const colors = noSpeaker
    ? (siteCol ? { RED: siteCol.RED, RED2: siteCol.RED2, AMB: siteCol.AMB, BLK: siteCol.BLK, CRM: siteCol.CRM } : { RED: '#E61C1C', RED2: '#A61919', AMB: '#FFB600', BLK: '#000000', CRM: '#FFFAEA' })
    : { RED: siteCol?.RED ?? c.main ?? '#E61C1C', RED2: siteCol?.RED2 ?? c.main ?? '#A61919', AMB: siteCol?.AMB ?? c.caption_accent ?? '#FFB600', BLK: siteCol?.BLK ?? '#000000', CRM: siteCol?.CRM ?? c.light ?? '#FFFAEA' };

  const fmt: any = getFormat(st.formatId || 'business-reels');
  const other = aspect && aspect !== primaryAspect(st) && !noSpeaker ? aspect : null;
  const targetAspect = other ?? fmt.aspectRatio ?? '9:16';
  const [targetW, targetH] = other ? ASPECT_SIZE[other] ?? fail(`formato sem tamanho: ${other}`) : [fmt.width ?? 1080, fmt.height ?? 1920];
  const safeZones = !other && fmt.safeZones || {
    top: Math.round(targetH * 0.104),
    bottom: Math.round(targetH * 0.198),
    left: Math.round(targetW * 0.065),
    right: Math.round(targetW * 0.065),
  };

  // the motion style (workspace/styles/<id>/style.json): read here because compose.json takes giantCase and speakerShadow from it
  let style: any = null;
  if (st.styleId) try { style = getStyle(st.styleId); } catch { style = null; }
  // a skill locks the three drawers (SPEC-v9 §1): its format shots over the chosen format, its look instead of the style, its measured rhythm instead of the toggle
  let skill: any = null;
  if (st.skillId) try { skill = getSkill(st.skillId); } catch { skill = null; }
  if (skill) style = null;
  const ch = resolveChoices({ format: fmt, style, skill, pace: st.pace, site: !!siteRef(st) });
  const fmtR: any = ch.format, pc = effectivePace(st), look: any = skill ? skillAsStyle(skill) : style;
  // join times of the cut on the master clock: kit.py snaps the cutout to an alternating zoom there, so a jump cut reads as a change of shot
  const edl = existsSync(join(P, 'edl.json')) ? readJSON(join(P, 'edl.json')) : null, speed = edl?.speed ?? (edl ? (await pacing(id)).speed : 1);
  const cuts: number[] = []; let acc = 0;
  for (const [a, b] of (edl?.keep ?? []).slice(0, -1)) { acc += (b - a) / speed; cuts.push(Math.round(acc * 1000) / 1000); }
  writeJSON(join(C, 'compose.json'), {
    cuts,
    W: targetW,
    H: targetH,
    aspectRatio: targetAspect,
    safeZone: safeZones,
    DUR: Math.round(duration * 100) / 100,
    faceX,
    pace: pc,
    speaker: !noSpeaker && (media || (existsSync(join(A, 'cut.webm')) && !cutoutJobs.has(id))),
    ...(!noSpeaker && fmtR.planos ? { planos: fmtR.planos } : {}),
    ...(!noSpeaker && fmtR.panel ? { panel: fmtR.panel } : {}),
    ...(hasRef ? { refVideo: true } : {}),
    ...(!noSpeaker && fmtR.janelas?.cut ? { cutWindows: cutWindows(fmtR.janelas.cut, duration) } : {}),   // deferred scaffold: the illustrator's demo must not reference a cut.webm that is not there yet
    colors,
    fonte: { w: width, h: height },
    // from the motion style (set by hand in style.json): giantCase 'lower' and speakerShadow true for product styles like Insula Build
    ...(look?.giantCase ? { giantCase: look.giantCase } : {}),
    ...(look?.speakerShadow ? { speakerShadow: true } : {}),
    layoutCheck: join(ROOT, 'server/layout_check.mjs')
  });
  writeJSON(join(C, 'hyperframes.json'), { $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true }, authoringSkill: 'hyperframes' });
  const hf = (cmd: string) => `npx --yes hyperframes@0.8.217 ${cmd}`;
  writeJSON(join(C, 'package.json'), { name: id, private: true, type: 'module', scripts: { dev: hf('preview'), check: hf('check'), render: hf('render') } });
  if (!existsSync(join(C, 'scenes.py'))) {
    const origScenes = join(P, 'compose', 'scenes.py');
    if (other && existsSync(origScenes)) {
      copyFileSync(origScenes, join(C, 'scenes.py'));
    } else {
      writeFileSync(join(C, 'scenes.py'), 'from kit import *\n\n# scene(1, 0.0, 2.0, \'red\', (\'L\', \'snap\', \'XL\'), back=lambda p, d: (giant(p, ["TEXTO"], 30, 10.4, BLK), g_in(p, 1)))\n\nrender()\n');
    }
  }
  const words: Word[] = readJSON(join(P, 'transcript.json')), script = existsSync(join(P, 'script.json')) ? readJSON(join(P, 'script.json')) : {};
  const srtFile = ['master.srt', 'source.srt'].map(f => join(P, f)).find(existsSync);   // master.srt = cues moved to the cut (ingest)
  const srt = srtFile ? readFileSync(srtFile, 'utf8').replace(/^\uFEFF/, '') : '';
  const brandMd = existsSync(join(brandDir(st.brand), 'brand.md')) ? readFileSync(join(brandDir(st.brand), 'brand.md'), 'utf8') : '';
  const refFile = join(P, 'reference.json'), refAnalysis = existsSync(refFile) ? Object.entries(readJSON(refFile)).map(([k, v]) => `- ${k}: ${v}`).join('\n') : '';
  const imgFiles = existsSync(join(A, 'img')) ? readdirSync(join(A, 'img')).filter(f => !f.startsWith('.')) : [];
  // the noSpeaker style: chosen (followed to the letter, with the frames it came from) or, if none, the list the director picks from
  const styleList = style || skill || st.styleId === 'none' ? [] : listMotionStyles().map(sid => { try { return getStyle(sid); } catch { return null; } }).filter(Boolean);
  // illustration packs (SPEC-v9 §2.2): the chosen style's pack becomes ESTILO.md; with none chosen the director reads the ones listed in estilos/
  const packOf = (x: any): string | null => x?.pack && safeId(x.pack) && existsSync(join(K, 'estilos', x.pack)) ? join(K, 'estilos', x.pack) : null;
  if (style && packOf(style)) copyFileSync(packOf(style)!, join(C, 'ESTILO.md'));
  else if (!style && !skill) for (const x of styleList) if (packOf(x)) { mkdirSync(join(C, 'estilos'), { recursive: true }); copyFileSync(packOf(x)!, join(C, 'estilos', x.pack)); }
  // the bank of approved movements (Motion Think): helpers + photos into estilos/banco/ (kit.py loads them) and a section in the brief
  const banco = copyBancoTo(C);
  const bancoSection = bancoBrief(banco, recentBancoHelpers(st, banco.helpers.map(h => h.id)));
  const imgDesc = imgFiles.length ? `img/ (${imgFiles.length} imagens da referência disponíveis: ${imgFiles.join(', ')}; olhe cada uma com Read antes de usar, e mostre com <img src="assets/img/..."> em back/front)` : 'img/ (vazio)';

  const fmtBlock = `## Formato${skill?.format?.planos ? ' (travado pela skill)' : ` escolhido (${fmt.name})`}\nDecide quais planos do locutor existem e quando entram. Planos permitidos (o kit reprova outro): ${(fmtR.planos ?? ['cut', 'panel', 'none']).map((p: string) => `${p} = ${PLANO_CAM[p] ?? p}`).join('; ')}.${fmtR.regras ? `\nQuando: ${fmtR.regras}` : ''}\nAplique dentro das regras do GUIDE.md; o que ele proíbe sobre imagens não vale quando há site.`;
  const rhythmBlock = `## Ritmo (${skill ? 'medido na skill' : st.pace ?? 'dinamico'})\nAlgo novo na tela a cada ~${pc.every} s; cenas de ${pc.scene[0]} a ${pc.scene[1]} s${noSpeaker ? '' : `; enquadramento do locutor muda a cada ${pc.framing[0]} a ${pc.framing[1]} s e o kit avisa locutor parado por mais de ${pc.hold} s`}. Os mesmos números estão em compose.json (pace). Isto vale no lugar de qualquer número de ritmo dos outros guias.`;
  writeFileSync(join(C, 'brief.md'), [`# Briefing: ${st.name}`,
    `Formato ${targetAspect} (${targetW}×${targetH}), ${Math.round(duration * 100) / 100} s, 30 fps. Centro do rosto do locutor: x≈${faceX} de ${width} (já em compose.json).`,
    other && existsSync(join(P, 'compose', 'scenes.py')) ? `## Adaptação do Formato Original\nA composição original do formato primário já foi pré-carregada em scenes.py. Adapte enquadramentos de câmera (FR), tamanhos de fontes, margens, zonas de segurança e posições/tamanhos de texto e elementos para a resolução ${targetW}×${targetH} (${targetAspect}).` : '',
    st.referenceUrl || st.referenceNote ? `## Referência de estilo\n${st.referenceUrl ?? ''}\n${st.referenceNote ?? ''}\nOs quadros da referência (se houver) estão em ../ref/.` : '',
    noSpeaker ? `## Referência visual: site da marca\nSem locutor na tela. Leia ref_site/site.md e olhe as imagens de ref_site/ (Read). Paleta em compose.json (RED, RED2, AMB, BLK, CRM) já é a do site.`
      : siteRef(st) ? `## Marca (${st.brand}) e site\nPaleta em compose.json (RED, RED2, AMB, BLK, CRM) já é a do site, que é a campanha atual: ela vence as cores do brand.md. Do brand.md valem só o tom e a fonte.\nOlhe ../ref/top_mobile.png e ../ref/top_desktop.png com Read: o print mostra qual cor é fundo, destaque e botão.\n${referenceGuide(st)}\n\n${brandMd.replace(/## Cores[\s\S]*?(?=\n## |$)/, '')}`
      : `## Marca (${st.brand})\nPaleta mapeada em compose.json (RED, RED2, AMB, BLK, CRM; ajuste se o brand.md pedir outra).\n\n${brandMd}`,
    !noSpeaker && fmtR.janelas?.cut ? (() => { const w = cutWindows(fmtR.janelas.cut, duration) ?? [], top = Math.round(targetH * (fmtR.panel?.top ?? 0.42)); return `## Locutor: Speech Screen\nO recorte do locutor (cut.webm) só existe nas janelas ${w.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} s`).join(', ')} (fora delas o alfa é vazio). Cena dentro de uma janela: câmera normal (M/L/XL/XXL) com texto gigante atrás; a CTA (cta=True) fica na última janela. Toda outra cena usa \`cam='panel'\`: o vídeo bruto do locutor (assets/talk.mp4) ocupa o painel de baixo (de y=${top} até o rodapé, sem recorte) e TODA a animação (3D, ilustrações, tipografia, imagens do site) fica na área de cima, acima de y=${top}; ou \`cam=None\` para tela cheia sem locutor. O kit reprova recorte fora das janelas.`; })() : '',
    !noSpeaker ? `## Liberdade e limites\nSem cotas: quantas imagens, movimentos de câmera e tipografias cada cena tem é decisão sua pelo que a fala pede; uma cena limpa com a peça certa vale mais que três genéricas. O que não se negocia: fluidez (toda entrada com ease-out e saída com ease-in, algo sempre em movimento lento, passagens desenhadas entre cenas); texto inteiro dentro da zona segura (topo ${safeZones.top}, base ${safeZones.bottom}, laterais ${safeZones.left} px); nada sobre o rosto ou o queixo do locutor; o locutor reenquadrado com o rosto em faceX (centro do quadro) em toda troca de enquadramento, e enquadramento trocando com a fala (M, L, XL, XXL). Fundo das cenas: NUNCA o vídeo do locutor desfocado ou replicado (bg='plate' é erro no kit); use cor sólida ou gradiente da marca, imagem da biblioteca ou do site.` : '',
    skill ? `## Skill (${skill.name})\nUm vídeo clonado, travado inteiro: formato, visual e ritmo vêm dela e substituem as três escolhas do projeto. Siga à risca${ch.sources.colors === 'skill' ? '; as cores desta skill (paleta abaixo) valem no lugar da marca' : '; cores e fontes continuam da marca (ou do site de referência)'}.\n${fmtBlock}\n${rhythmBlock}\n${ch.sources.colors === 'skill' && look.palette?.length ? `Paleta travada (use estes hex no lugar dos da marca): ${look.palette.map((c: any) => `${c.hex} = ${c.role}`).join(', ')}\n` : ''}${styleBrief(look, skillRefs(skill.id), skillMd(skill.id))}` : '',
    skill ? '' : fmtBlock,
    skill ? '' : rhythmBlock,
    style ? `## Estilo escolhido (${style.name})\nSiga-o: tipografia, câmera, beats, sons e receitas vêm dele; o formato decide o layout e a marca decide cores e fontes.\n${styleBrief(style, styleRefs(style.id))}` : '',
    !skill && !style && styleList.length ? `## Estilos disponíveis\nNenhum foi escolhido: escolha o que serve ao assunto e à marca, diga qual e por quê no treatment e siga o style.json dele (Read). Para seguir um à risca em todos os renders, o usuário escolhe no projeto.\n${styleList.map((x: any) => `- ${x.id}: ${x.name}. ${x.description ?? ''}${x.motif ? ` Motivo: ${x.motif}.` : ''}${x.camera?.signature ? ` Câmera: ${x.camera.signature}.` : ''}${x.pack ? ` Pacote: estilos/${x.pack}${x.engine ? ` (engine='${x.engine}')` : ''}.` : ''} (${join(styleDir(x.id), 'style.json')})`).join('\n')}` : '',
    !noSpeaker && refAnalysis && !siteRef(st) ? `## Análise da referência (reference.json)\nÉ o estilo a reproduzir. Olhe os quadros em ../ref/ com Read antes de escrever.\n${refAnalysis}` : '',
    `## Imagens e objetos\nA peça visual de cada cena vem, nesta ordem: 1) a biblioteca do reel e a compartilhada (seções abaixo) e as imagens do site; 2) objetos 3D (\`obj3d\` com um .glb da biblioteca, ou os tipos prontos do kit); 3) desenho em código (\`canvas()\` / \`scene3d()\`) só quando nada pronto mostra o que a fala diz. Cada peça demonstra a frase em que entra (mockup, objeto, gravura, ícone com material e sombra), nunca enfeite. Proibido: emoji, balão ou card com texto de exemplo, texto em outra língua que a fala não diz, ícone de linha fina chapado sem sombra nem material. Decida a câmera de cada plano pelo DIRETOR.md e escreva treatment.md antes do scenes.py.`,
    manifest.length ? `## Biblioteca do reel (assets/manifest.json)\nBaixada da internet para os momentos do roteiro, com licença e autor. Abra cada imagem com Read antes de usar (o nome não diz o que ela mostra); .svg entra como <img> ou inline; .glb entra com obj3d(p, 'assets/3d/arquivo.glb', x, y, size, at, d).${manifest.some(e => e.kind === 'video') ? ` Vídeo (assets/video/, 15 s, mudo) entra com footage(p, src, x, y, w, h, d, at, start): janela com cantos redondos na cena do momento, nunca sobre o rosto; confira o trecho (start) com ffmpeg antes de usar.` : ''}${manifest.some(e => e.kind === 'audio') ? ` A trilha (assets/music/) entra uma vez no scenes.py com music('assets/music/arquivo.mp3', vol=.16): baixa, sob a voz.` : ''}\n${manifest.map(e => `- assets/${e.file} · ${e.kind === 'audio' ? 'trilha' : `momento ${e.moment}`} · "${e.query}" · ${e.provider} · ${e.license}${e.author ? ` · ${e.author}` : ''}`).join('\n')}` : '',
    libLines.length ? `## Biblioteca compartilhada (assets/lib/)\nObjetos, imagens e trilhas do estúdio (workspace/library/): ${libLines.slice(0, 80).join(', ')}${libLines.length > 80 ? ` e mais ${libLines.length - 80}` : ''}. PNG com alfa entra como floatimg; .glb com obj3d; música (assets/lib/music/) com music(src, vol=.16), uma por reel, só quando a biblioteca do reel não trouxe uma.` : '',
    !noSpeaker && script.moments?.length ? `## Momentos do roteiro\nUm bloco por momento: tempo, fala e ação visual sugerida. O kit.py é opcional: use um helper só quando ele for a melhor ideia para o momento.\n${script.moments.map((m: any) => `- ${m.t_start}s–${m.t_end}s · "${m.texto ?? ''}" · ${m.visual_action ?? ''}`).join('\n')}` : '',
    charLines.length || brand.animation?.style ? `## Brandkit de animação\n${brand.animation?.style ? `Estilo de movimento: ${brand.animation.style}\n` : ''}${charLines.length ? `Personagens (PNG com fundo transparente; olhe cada um com Read). Anime entrada, gesto e troca de pose em GSAP, escolhendo a pose pela emoção da fala. Sem boca sincronizada: o personagem é voz em off, só reage.${st.character ? ` O locutor (cut.webm) é o personagem ${st.character.name}, parado e respirando: faça-o reagir com câmera e com as outras poses por cima (front), nunca invente outro rosto.` : ''}\n${charLines.join('\n')}` : ''}` : '',
    bancoSection,
    script.accentWords?.length ? `## Palavras-chave sugeridas\n${script.accentWords.join(', ')}` : '',
    srt ? `## Roteiro e tempos (.srt)\n${srt}` : '',
    `## Transcript por palavra\nassets/transcript.json (${words.length} palavras).`,
    noSpeaker ? `## Assets\nvoice.m4a (narração), fonts/font.otf (peso 600)${giantFile ? ' e fonts/giant.otf (peso 900, a tipografia gigante já usa)' : ''}, ${imgDesc}, sfx/ (ver sfx/manifest.json). Sem locutor.`
      : `## Assets\ncut.webm (locutor, alfa), raw.mp4 (o vídeo original inteiro, escondido na camada 1 como backup: nunca o mostre nem o use como fundo), voice.m4a, fonts/font.otf (peso 600)${giantFile ? ' e fonts/giant.otf (peso 900, a tipografia gigante já usa)' : ''}, ${imgDesc}, sfx/ (ver sfx/manifest.json).`,
    `Siga GUIDE.md. Escreva scenes.py, valide, olhe os snapshots e corrija antes de renderizar.`].filter(Boolean).join('\n\n'));
  return { dir: C };
}

// Bank helpers called in the brand's last 3 composed reels (other projects): the brief asks for variation (DIRETOR §8, Motion Think §8).
function recentBancoHelpers(st: State, ids: string[]): string[] {
  if (!ids.length) return [];
  const used = new Set<string>();
  const others = listProjects().filter(p => p !== st.id).map(p => { try { const o = load(p); return o.brand === st.brand && existsSync(join(projDir(p), 'compose', 'scenes.py')) ? { p, t: statSync(join(projDir(p), 'compose', 'scenes.py')).mtimeMs } : null; } catch { return null; } })
    .filter((x): x is { p: string; t: number } => !!x).sort((a, b) => b.t - a.t).slice(0, 3);
  for (const { p } of others) { const src = readFileSync(join(projDir(p), 'compose', 'scenes.py'), 'utf8'); for (const id of ids) if (new RegExp(`\\b${id}\\(`).test(src)) used.add(id); }
  return [...used];
}
export { readBanco };

// Agent composer (formats with composer: "agent"): Opus writes compose/scenes.py, which writes compose/index.html, and loops check + snapshot.
// The review player plays that index.html live; only final() renders it. The motion-only test (mode "motion") still renders preview-motion.mp4.
// shortcut: no partial re-render; an adjustment ("ajuste") reruns the agent on the same compose/ folder
export const compose = (id: string, note?: string, mode?: string, aspect?: string) => locked(id, 'motion', async st => {
  writeFileSync(composeMarker(id), '');   // a server that dies mid-compose leaves it: getProject reports the interruption
  try { return await composeRun(id, st, note, mode, aspect); } finally { rmSync(composeMarker(id), { force: true }); }
});
const COMPOSE_MAX_TURNS = Number(process.env.COMPOSE_MAX_TURNS ?? 70);   // measured 69-88 turns for 16-27 min: the ceiling that keeps a 97 s reel near 12 min
async function composeRun(id: string, st: State, note?: string, mode?: string, aspect?: string) {
  const motion = mode === 'motion';
  const P = projDir(id);
  // another format: its own composition; the message names what came in, so a stale UI value is obvious in the log
  const other = aspect && aspect !== primaryAspect(st) && !motion ? pickFormats([aspect])?.[0] ?? fail(`formato ${JSON.stringify(aspect)} não existe: use ${FORMATS.join(', ')}`) : null;
  const full = !note && !other;   // the full run: the treatment first, so the cutout (started at ingest) finishes behind it
  const agentFmt: any = getFormat(st.formatId || 'business-reels');
  const noSpeaker = motion || agentFmt.speaker === false;   // the só-motion test, or the Só Motion format: no cutout, no speaker on screen
  if (full && !noSpeaker) ensureCutout(id).catch(() => {});   // started at ingest normally; after a restart it must run behind the treatment, not after it
  await composeScaffold(id, motion, other, !full);
  const C = composeDirOf(P, st, other);
  emit(id, 'log', motion ? '🎬 Claude está compondo o reel (escrita, check, snapshots e render)...' : `🎬 Claude está compondo o reel${other ? ` em ${other}` : ''} (escrita, check e snapshots, sem render)...`);
  const targetAspect = other ?? agentFmt.aspectRatio ?? '9:16';
  const [targetW, targetH] = other ? ASPECT_SIZE[other] : [agentFmt.width ?? 1080, agentFmt.height ?? 1920];
  const system = (noSpeaker ? `You are an elite motion designer composing a ${targetAspect} (${targetW}x${targetH}) motion-graphics and infographic reel with NO speaker on screen, as a HyperFrames project, working only inside the current folder. `
    : `You are an elite motion designer composing a ${targetAspect} (${targetW}x${targetH}) reel as a HyperFrames project, working only inside the current folder. `) +
    'Read brief.md, DIRETOR.md, treatment.md (when it exists) and GUIDE.md first. Follow brief.md: build each scene from the script moments listed there, with the pieces the brief lists (the reel library in assets/manifest.json, assets/lib/, the site images, 3D objects through obj3d with a .glb or a kit kind) and code drawing only when nothing ready shows what the words say. HELPERS FIRST: build every scene from the kit.py helpers (both(), lintel, hang, slam, cascade, count, platform, aperture, floatimg, obj3d, phrase, pill, morph, iris, flood, glass, island, widget... GUIDE.md "Estilos prontos do kit", signatures in kit.py); write HTML/CSS and GSAP tweens by hand ONLY for a motion no helper does. Measured on the same excerpt: hand-written GSAP took 2.2x the time and 3x the code for the same result. Keep scenes.py lean (about 16 KB for a 90 s reel).Tipografias gigantes e elementos descritos como atrás do locutor DEVEM ser colocados em back (nunca em front sobrepondo o locutor). Never use artificial thick text strokes (-webkit-text-stroke) over the speaker when the text was planned behind him. Follow GUIDE.md for technical execution, framing, and deterministic GSAP. ' +
    'Loop: write scenes.py, run it (it also runs the speaker layout check: its errors stop the render, its warnings must be fixed or justified; the check writes review/recorte.png, the green-screen cut sheet to Read), run hyperframes check (fix all errors), take snapshots and LOOK at the contact sheets with Read, fix what you see' +
    (motion ? ', then render out.mp4. ' : '. Do NOT render a video: the reviewer plays index.html live, and the final render happens later. ') +
    // a notes round touches only the noted scenes: the whole-reel scoring would send it to "fix the 3 worst" elsewhere
    (note ? 'Review rule (notes round): snapshot only the noted times (snapshot --at with those seconds; a [vídeo todo] note: three spread times), check that each note is done and that nothing else moved; do not score, improve or retime any scene outside the notes. '
      : 'Review rule: score the contact sheet 1-10 on hook (first 2 s), legibility at phone size, motion quality, variety, brand fidelity; fix the 3 worst; at most 2 review rounds, then stop and list what is still below 8 in your final paragraph. ') +
    'Every timed object must be hidden at the start of each seek so none lingers as a ghost. ' +
    'Never touch assets/ except to add files. Finish with one short paragraph: what you built and any known issue.';
  const prompt = note ? `Ajuste pedido sobre a composição atual (scenes.py já existe): ${note}\nPalavra vaga numa anotação ("mais dinâmico", "premium", "apagado"): traduza pela tabela "Palavra vaga vira decisão" do GUIDE.md e diga no resumo qual valor mudou.\nCada anotação vale só para a cena (ou cenas) que cobre o tempo marcado nela: edite essas cenas em scenes.py e deixe as outras, o treatment e os tempos das demais cenas exatamente como estão; nada de refazer o reel. Uma anotação [vídeo todo] é um ajuste global (grão, cor, fonte): faça no scenes.py, sem refazer cenas; o grão desliga com \`CFG['grain'] = 0\` antes de \`render()\` (compose.json é reescrito a cada rodada, não mexa nele). Depois edite scenes.py e rode \`${PYTHON} -B scenes.py\` de novo (o player e os snapshots leem o index.html que ele gera, não o scenes.py). Depois valide e olhe os snapshots. Não renderize vídeo.`
    : motion ? 'Componha o reel completo agora. Termine com out.mp4 renderizado (npx --yes hyperframes@0.8.217 render -o out.mp4 --fps 30 --quality delivery).'
    : other ? `Adapte a composição original (já pré-carregada em scenes.py a partir do formato primário) para o novo formato ${targetAspect} (${targetW}x${targetH}). Ajuste layouts, zonas de segurança, enquadramentos de câmera (FR) e posições/tamanhos de texto para esta proporção. Termine com scenes.py rodado (index.html gerado), check sem erros e snapshots revisados. Não renderize vídeo.`
    : 'Componha o reel completo agora. Termine com scenes.py rodado (index.html gerado), check sem erros e snapshots revisados. Não renderize vídeo.';
  const started = Date.now();
  rmSync(join(C, 'out.mp4'), { force: true });   // a stale out.mp4 from the last run must not pass as this run's result
  rmSync(join(C, 'review'), { recursive: true, force: true });   // snapshots of the last composition would be read as this one's (the agent and the user look at them)
  let buildFrom = started;   // index.html counts as this run's composition only after the scaffold that follows the treatment
  // Direction first, in its own call (DIRETOR.md §6): benchmark, structure, shot list with the world camera, signature shot, sound map.
  // A note or another aspect keeps the treatment the primary composition was built on.
  if (!note && !other) {
    setPhase(id, 'tratamento');
    emit(id, 'log', '🎬 Claude está escrevendo o tratamento (direção: benchmark, estrutura, shot list, som)...');
    const t = await agent('compose:treatment', { system: system + ' In this call you are the director only: write treatment.md and nothing else (no scenes.py, no render).',
      prompt: 'Leia brief.md, DIRETOR.md, GUIDE.md e assets/transcript.json; abra com Read as imagens da biblioteca do reel (assets/manifest.json), as do site e os quadros de referência (no máximo 10 imagens, as mais representativas). Escreva treatment.md (até ~120 linhas) com as seis seções do DIRETOR.md §6 (benchmark, três estruturas, logline e arco, shot list cena a cena com enquadramento, world= e motivo, mapa de som, o que difere do clichê). Na shot list, diga qual peça cada cena usa (arquivo da biblioteca, imagem do site, objeto 3D ou desenho em código) e o que ela demonstra da fala. Marque o plano-assinatura. Não escreva scenes.py.',
      cwd: C, noRender: true, step: 'composeTreatment' }, logCost(st));
    const tf = join(C, 'treatment.md');
    if (!existsSync(tf) || statSync(tf).mtimeMs < started) fail(`O diretor não escreveu treatment.md: ${t.slice(0, 300)}`);
    emit(id, 'log', '🎬 Tratamento pronto. Esperando o recorte do locutor, se ainda não acabou...');
    await composeScaffold(id, motion, other);   // now with cut.webm, talk.mp4, voice.m4a and the real faceX; treatment.md is kept
    buildFrom = Date.now();
    emit(id, 'log', '🎬 Claude está compondo o reel a partir do tratamento...');
  }
  // scenes.py edited but never run would leave the player on the old composition while the notes read as applied
  // index.html is also rewritten by the Edição step (marked): then its pristine copy index.ai.html says whether scenes.py ran
  const html = join(C, 'index.html'), ai = aiCopy(html), hadHtml = existsSync(html);
  const fresh = () => existsSync(html) && statSync(html).mtimeMs >= buildFrom && !isMarked(readFileSync(html, 'utf8')) || existsSync(ai) && statSync(ai).mtimeMs >= buildFrom;
  let summary: string;
  setPhase(id, note ? 'ajustes' : 'composição');
  try {
    summary = await agent('compose', { maxTurns: COMPOSE_MAX_TURNS, system: system + ` Orçamento: no máximo ${COMPOSE_MAX_TURNS} turnos de ferramenta (cerca de 12 min); ${note ? 'edite só as cenas das anotações' : 'escreva o scenes.py inteiro primeiro'} (helpers do kit, GSAP à mão só onde não há helper), rode, corrija os erros e só então revise snapshots.`, prompt: !note && existsSync(join(C, 'treatment.md')) ? `Siga treatment.md (shot list, world= de cada cena, plano-assinatura e mapa de som); se mudar algo, atualize o treatment antes.${existsSync(join(C, 'engines', 'marca.js')) ? ' Os objetos do roteiro já estão desenhados em engines/marca.js (IL.*, demo em engines/demos/marca.py): use-os com canvas(..., engine="<slug>,marca") em vez de redesenhar ou trocar por faixas e retângulos; um objeto da shot list que ainda não existe em IL, desenhe no mesmo motor dentro de marca.js.' : ''} ${prompt}` : prompt, cwd: C, noRender: !motion }, logCost(st));
    if ((other || motion) && summary.startsWith(MAX_TURNS_HIT)) throw new Error(summary);   // an unadapted copy or a missing out.mp4 is not a result
  } catch (e) {
    // A first adaptation runs the copied primary scenes.py before adapting it: that index.html is the wrong aspect, and left
    // behind it reads as a finished composition in the Entrega. The primary is the opposite: the agent usually has a playable
    // index.html when the timeout or the quota cuts it, and a step that never advanced left the project stuck in 'script'.
    if (other && !hadHtml) rmSync(html, { force: true });
    if (other || motion || !fresh()) throw e;
    summary = `⚠ Compositor interrompido (${(e as Error).message}): a composição que ele chegou a gerar abriu na Revisão.`;
    emit(id, 'log', summary);
  }
  if (summary.startsWith(MAX_TURNS_HIT)) emit(id, 'log', `${MAX_TURNS_HIT}: a composição que existir vai para a Revisão; anote o que faltar e aplique como ajuste.`);
  if (motion) {
    if (!existsSync(join(C, 'out.mp4'))) fail(`O compositor não gerou out.mp4: ${summary.slice(0, 300)}`);
    copyFileSync(join(C, 'out.mp4'), join(P, 'preview-motion.mp4'));   // o teste só motion não sobrescreve o preview com locutor
    emit(id, 'preview', { file: 'preview-motion.mp4' });
  } else {
    if (!fresh()) fail(`O compositor não gerou um index.html novo (rode scenes.py): ${summary.slice(0, 300)}`);
    emit(id, 'built', {});
  }
  if (!motion && stepRank(st.step) < stepRank('motion')) st.step = 'motion';
  if (other && !st.formats.includes(other)) st.formats.push(other);
  if (!motion) delete st.approvedAt;   // a new composition is not the approved one
  save(st);
  await commit(id, motion ? 'compose: versão só motion' : `compose: reel composto pelo agent${other ? ` (${other})` : ''}`);
  return { ok: true, summary };
}

export const cutoutPerson = (id: string, options?: { force?: boolean }) => locked(id, 'cutout', async () => {
  const r = await ensureCutout(id, !!options?.force);
  await ensureComposeMedia(id);
  emit(id, 'cutout:done', { ...r, file: `/projects/${id}/cutout.webm` });
  await commit(id, 'cutout: cutout.webm');
  return { ok: true, ...r };
});

