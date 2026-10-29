// The 5 steps of SPEC §3. Every heavy lift is a fork script; this file only sequences them, keeps state.json,
// and makes the model calls of models.ts. One project = one folder in workspace/projects/ with its own git history.
import { execFile, spawn, execSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline as pipe } from 'node:stream/promises';
import { homedir } from 'node:os';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { agent, ask, type Cost } from './models.ts';
import { applyDirectEdits, deleteCards, deepMerge, FORMATS, pickFormats, remapWords, safeId, shortcutPlan, spansFromWords, type Plan, type Word } from './lib.ts';
import { CAPTION_PRESETS, CARD_TYPES, formatCardTypes, validateCaptionStyle, validateCard, validateFont, validateIcon } from './validate.ts';
import { isVideoReference, processSiteReference } from './site_extractor.ts';
import { captionLines, checkLayers, colorsOf, listLayers, readLayers, syncEdits, textRuns } from './edits.ts';
import { synthesize, synthesizeLong } from './voice.ts';
import { band, download as brollDownload, extOf, pick as brollPick, rightsOf, search as brollSearch } from './broll.ts';

const ROOT = resolve(import.meta.dirname, '..');
const SKILL = join(ROOT, 'claude-reel-editor/skills/reel-editor');
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
}

type State = {
  id: string; name: string; brand: string; formatId?: string; preEdited: boolean; subtitle?: string; referenceUrl?: string; extraReferenceUrls?: string[]; referenceNote?: string; userImages?: string[]; formats: string[];
  override: Record<string, unknown>; step: string; plan?: Plan; cost: Cost[]; qa?: { pass: boolean; report: string; summary?: string };
  running?: BusyInfo | null;
  completed?: boolean;
  completedAt?: number;
  composerMode?: 'agent' | 'card';
  character?: { name: string; pose?: string };   // animation-brandkit character standing in for the speaker (cutout.webm is built from its pose)
  brollFill?: boolean;   // fill beats of the reel with stock b-roll in the lower band (see brollFill below)
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

const emit = (id: string, event: string, data: unknown) => {
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
  return st;
};
const save = (st: State) => writeJSON(join(projDir(st.id), 'state.json'), st);
const logCost = (st: State) => (c: Cost) => { st.cost.push(c); save(st); emit(st.id, 'cost', c); };

const STEP_ORDER = ['created', 'ingest', 'script', 'motion', 'final'];
const stepRank = (step: string) => STEP_ORDER.indexOf(step === 'brand' ? 'script' : step);
// The hex colours of a brand: the only ones a custom card may use.
const paletteOf = (brand: any): string[] => Object.values(brand.colors ?? {}).filter((v): v is string => typeof v === 'string');

// brand.json keeps font and icon files relative to the brand folder, so the workspace can move or the drive be renamed;
// whatever reads a brand (getBrand) sees absolute paths, and saveBrand turns the ones inside the brand folder back.
const brandFiles = (brand: any, to: (f: string) => string) => {
  const out = structuredClone(brand);
  const poses = (out.animation?.characters ?? []).flatMap((c: any) => c?.poses ?? []);
  for (const f of [...Object.values(out.fonts ?? {}), ...(Array.isArray(out.icons) ? out.icons : []), ...poses] as any[]) if (typeof f?.file === 'string') f.file = to(f.file);
  return out;
};
const saveBrand = (b: string, brand: any) => writeJSON(join(brandDir(b), 'brand.json'),
  brandFiles(brand, f => f.startsWith(brandDir(b) + '/') ? f.slice(brandDir(b).length + 1) : f));

function run(id: string, cmd: string, args: string[], env: Record<string, string> = {}, allowFail = false, cwd?: string): Promise<{ code: number; out: string }> {
  return new Promise((ok, ko) => {
    emit(id, 'log', `$ ${basename(cmd)} ${args.map(a => basename(a)).join(' ')}`);
    const workDir = cwd ?? (existsSync(projDir(id)) ? projDir(id) : ROOT);
    const p = spawn(cmd, args, { cwd: workDir, env: { ...process.env, REELS_HOME: projDir(id), REEL_LANG: process.env.REEL_LANG ?? 'pt', ...env } });
    let out = '';
    const take = (b: Buffer) => { const s = b.toString(); out += s; s.split('\n').filter(Boolean).forEach(l => emit(id, 'log', l)); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('error', ko);
    p.on('close', code => code === 0 || allowFail ? ok({ code: code ?? 1, out }) : ko(new Error(`${basename(['python3', 'bash', 'node'].includes(cmd) ? args[0] ?? cmd : cmd)} failed (${code}): ${out.trim().slice(-600)}`)));
  });
}
const py = (id: string, script: string, args: string[], env?: Record<string, string>) => run(id, 'python3', [join(S, script), ...args], env);

async function duration(id: string, file: string) {
  const { out } = await run(id, 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.trim());
}
async function pacing(id: string): Promise<{ speed: number; pause_min: number; air: number }> {
  const code = `import json,sys;sys.path.insert(0,${JSON.stringify(S)});from pacing import pacing;print(json.dumps(pacing(json.load(open(sys.argv[1])))))`;
  return JSON.parse((await run(id, 'python3', ['-c', code, join(projDir(id), 'brand.json')])).out);
}
const rawClip = (P: string) => join(P, readdirSync(P).find(f => f.startsWith('raw.')) ?? fail('raw clip missing'));

async function commit(id: string, msg: string) {
  await run(id, 'git', ['-C', projDir(id), 'add', '-A']);
  await run(id, 'git', ['-C', projDir(id), '-c', 'user.name=Editor 4.0', '-c', 'user.email=editor@localhost', 'commit', '-q', '-m', msg], {}, true);
}

// One step at a time per project: two renders into the same folder would corrupt it.
const busy = new Map<string, BusyInfo>();
export const getBusy = (id: string): BusyInfo | null => busy.get(id) ?? null;
async function locked<T>(id: string, step: string, fn: (st: State) => Promise<T>): Promise<T> {
  const st = load(id);
  if (busy.has(id)) {
    const cur = busy.get(id)!;
    const elapsed = Math.round((Date.now() - cur.startedAt) / 1000);
    fail(`project ${id} is busy (${cur.step} em execução há ${elapsed}s)`);
  }
  const startedAt = Date.now();
  busy.set(id, { step, startedAt });
  emit(id, 'step', { step, status: 'start', startedAt });
  try {
    const r = await fn(st);
    busy.delete(id);
    emit(id, 'step', { step, status: 'done' });
    return r;
  } catch (e) {
    busy.delete(id);
    emit(id, 'step', { step, status: 'error', error: String((e as Error).message) });
    emit(id, 'log', `ERRO na etapa ${step}: ${(e as Error).message}`);
    throw e;
  } finally { busy.delete(id); }
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
const COMPOSE_IGNORE = 'compose*/assets/\ncompose*/media/\ncompose*/motions/\ncompose*/.transcode-cache/\ncompose*/snaps*/\ncompose*/review/\n';
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

// "Testar no vídeo": render ~3 s of a real, already-edited project with this (unsaved) brand, no cards, no final pass.
// Output is the same build_reel.py + HyperFrames path as a real render, so it is the truth the DOM preview only approximates.
let testing = false;
export const testFile = (id: string) => safeId(id) ? join(WS, 'tests', id, 'final.mp4') : fail('bad id');
export async function testClip(brand: any, project?: string) {
  checkBrand(brand);
  if (testing) fail('já existe um teste em andamento');
  const ok = (p: string) => ['master.mp4', 'edit.json'].every(f => existsSync(join(projDir(p), f)));
  const id = (safeId(project) && ok(project) ? project : undefined) ?? listProjects().find(ok) ?? fail('nenhum projeto com vídeo editado para testar: rode até a etapa 4 uma vez');
  testing = true;
  try {
    const src = projDir(id), T = join(WS, 'tests', id), edit = readJSON(join(src, 'edit.json'));
    const caps = edit.captions as any[], t0 = Math.max(0, (caps[Math.floor(caps.length / 2)]?.start ?? 0) - 0.1), len = 3;
    rmSync(T, { recursive: true, force: true }); mkdirSync(T, { recursive: true });
    await run(id, 'ffmpeg', ['-v', 'error', '-y', '-ss', String(t0), '-t', String(len), '-i', join(src, 'master.mp4'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', join(T, 'master.mp4')]);
    const clip = caps.filter(c => c.end > t0 && c.start < t0 + len).map(c => ({ ...c, start: Math.max(0, +(c.start - t0).toFixed(2)), end: Math.min(len, +(c.end - t0).toFixed(2)),
      words: c.words.map((w: any) => ({ ...w, t: Math.max(0, +(w.t - t0).toFixed(2)) })).filter((w: any) => w.t < len) }));
    writeJSON(join(T, 'edit.json'), { captions: clip, punch: [], cards: [] });
    writeJSON(join(T, 'brand.json'), brand);
    await run(id, 'bash', [join(S, 'render.sh'), T], { REELS_HOME: T });
    return { file: `/tests/${id}/final.mp4`, project: id, from: t0 };
  } finally { testing = false; }
}

// ---- picking the source ---------------------------------------------------------------------------------------------
// The native macOS chooser returns the real path (no copy of a 2 GB clip); drops are streamed into workspace/uploads.
export const expandHome = (p: string) => typeof p === 'string' && /^~(\/|$)/.test(p) ? join(homedir(), p.slice(1)) : p;
const UPLOADS = join(WS, 'uploads');
export function pickFile(kind: string): Promise<{ path: string | null; paths: string[] }> {
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
const intake = (from: string, to: string) => from.startsWith(UPLOADS + '/') ? renameSync(from, to) : copyFileSync(from, to);   // uploads move, picked paths copy


// ---- formats (Editor 7.0) --------------------------------------------------------------------------------------------
// every format id comes from a URL or a request body, so the folder is only built from a safe id
const formatDir = (f: string) => safeId(f) ? join(WS, "formats", f) : fail('format id: letters, digits, - and _ only');
export function listFormats(): string[] {
  const p = join(WS, "formats");
  if (!existsSync(p)) return [];
  const dirs = readdirSync(p).filter(d => existsSync(join(p, d, "format.json")));
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
  return JSON.parse(readFileSync(file, "utf8"));
}

// Creative brief of the format picked on the first screen, appended to every model prompt that designs cards.
// Brand rules stay the authority on look (colours, fonts, icons, tone); the format owns structure and rhythm.
// reference.json of a landing-page reference, or null (video reference or none)
function siteRef(st: State): any {
  const f = join(projDir(st.id), 'reference.json');
  if (!existsSync(f)) return null;
  const r = readJSON(f);
  return r.isSite ? r : null;
}
// The agent composer (kit.py + HyperFrames, the hand-made workflow) runs for formats that ask for it, and for any cut-out
// format with a site reference: the card pipeline cannot show the site's images, so it loses the art direction the site gives.
function usesAgent(st: State): boolean {
  if (st.composerMode === 'agent') return true;
  if (st.composerMode === 'card') return false;
  let f: any;
  try { f = getFormat(st.formatId || 'business-reels'); } catch { return false; }
  return f.composer === 'agent' || (!!f.cutout && !!siteRef(st));
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

const formatSkill = (id: string): string => { try { const f = join(formatDir(id), 'skill.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; } catch { return ''; } };
function formatGuide(st: State): string {
  let f: any;
  try { f = getFormat(st.formatId || 'business-reels'); } catch { return ''; }
  const e = f.editingStyle ?? {}, c = f.camera ?? {}, z = f.visualAssets?.safeZones;
  const lines = [
    `Format: ${f.name} (${f.aspectRatio ?? '9:16'}${f.cutout ? ', presenter cut out with Apple Vision' : ''})`,
    f.promptGuide && `Creative guide: ${f.promptGuide}`,
    f.comments && `Direction notes (follow strictly): ${f.comments}`,
    f.layout && `Layout: ${f.layout}`,
    f.layout === 'split-horizontal' && 'Layout geometry (1080x1920 stage): the presenter always fills y 0-960 (top half, stable video); the bottom half is dark with a soft glow. ' +
      'Diagram animation style is ONETAKE: continuous virtual camera movement without visible cuts between revealed info (invisible cuts), always in fluid motion using pan, tilt, and rotation across the diagram canvas. ' +
      'Put every diagram/custom card inside x 70-1010, y 1040-1580 (strictly on the bottom half, never over the presenter). Captions sit on the seam (y ~900-1000) and stay on while cards play, so cards must not repeat the spoken words.',
    (f.id === 'feed-portrait-4-5' || f.id === 'youtube-16-9' || f.aspectRatio === '4:5' || f.aspectRatio === '16:9') &&
      'Lateral positioning rule: Animated texts, cards, graphics and images MUST NEVER cover the presenter\'s face or body. Position them strictly on the lateral sides (left or right) or safe lower-thirds, keeping the centered presenter completely unobstructed.',
    f.sfxRules?.length && `Sound effects of this style:\n- ${f.sfxRules.map((r: any) => `${r.when} → ${r.sfx || 'no matching sound'} (${r.level})`).join('\n- ')}`,
    (f.sfxGainDb || f.sfxForbidden?.length) && `Sound effects: ${f.sfxGainDb ? `overall gain ${f.sfxGainDb} dB. ` : ''}${f.sfxForbidden?.length ? `Never use: ${f.sfxForbidden.join(', ')}.` : ''}`,
    f.motionRecipes?.length && `Motion recipes of this style (GSAP, adapt SEL and values):\n- ${f.motionRecipes.map((r: any) => `${r.name} (${r.use}): ${r.gsap}`).join('\n- ')}`,
    formatSkill(f.id) && `Skill of this style (the user's own rules, they win):\n${formatSkill(f.id)}`,
    f.captionsStyle && `Captions style: ${f.captionsStyle}`,
    f.styleCatalog?.length && `Style catalog (vary between these):\n- ${f.styleCatalog.join('\n- ')}`,
    e.pacing && `Pacing: ${e.pacing}, a new screen about every ${e.screenPacingSeconds}s, cards last ${e.cardMinDuration}-${e.cardMaxDuration}s, transitions: ${e.transitions ?? 'cut'}`,
    e.punchIns && `Punch-in zooms: ${e.punchIns.enabled ? `yes, x${e.punchIns.zoomScale}` : 'no'}`,
    c.headroomPercent != null && `Presenter framing: ${c.mode}, headroom ${c.headroomPercent}%`,
    z && `Keep graphics inside the safe zones (px): top ${z.top}, bottom ${z.bottom}, left ${z.left}, right ${z.right}`,
  ].filter(Boolean);
  return `# Format brief (chosen by the user, follow it)\n${lines.join('\n')}\n` +
    (siteRef(st) ? 'A site reference is attached below: its palette, images and facts win over the brand colours and over any "text only" rule of this format; the brand keeps fonts and tone; the format decides structure and rhythm.\n\n'
      : 'The brand rules above always win on colours, fonts, icons, tone and caption look; the format decides layout, structure and rhythm.\n\n') +
    formatCards(f) + referenceGuide(st) + userImageGuide(st);
}
// Images the user sent with the form: an image card points at one of them (src = the path listed here).
function userImageGuide(st: State): string {
  if (!st.userImages?.length) return '';
  return `\n# Imagens enviadas pelo usuário - quando a fala citar o que uma delas mostra (produto, print, tela, logo, pessoa), use a imagem num card image {src: "<caminho>"}. Não invente outras imagens.\n` +
    st.userImages.map(p => `- ${p}`).join('\n') + '\n';
}

// Card types only some formats offer (formatCardTypes), with their fields; also given to the card-edit prompts.
function formatCards(f: any): string {
  const types = formatCardTypes(f), out: string[] = [];
  if (types.includes('tier')) out.push('tier {tier: "S"|"A"|"B"|"C"|"D"|"F", text: "short item name", icon?: "<brand icon>" or src?: "image path"}\n' +
    '  One ranked item. At start it appears as a card above the S-F table (captions step aside while it is on screen); at end, the moment ' +
    'the presenter says the grade, it shrinks into its row and stays there to the end of the video. One tier card per ranked item, in spoken ' +
    'order, start when the item is introduced, end exactly when the grade is said, at least 0.8 s apart, never overlapping another tier card. ' +
    'The table is always on screen: do not draw it with custom cards. Leave the 3 s hook free of tier cards.');
  if (types.includes('backdrop')) out.push('backdrop {src: "image path" or icon: "<brand icon>", dim?: 0-1}\n' +
    '  Puts a picture behind the presenter (the person is cut out and stays in front). Use it only when there is a real image for that moment ' +
    '(a brand icon or a file the user gave); it needs an explicit end and does not hide captions.');
  if (types.includes('broll')) out.push('broll {src: "video or image path"}\n' +
    '  The creator\'s own B-roll over the whole frame: the presenter disappears, the voice and captions stay. Only with a real file the user ' +
    'gave; without B-roll use custom illustrations instead, never an empty screen. Cuts on phrase ends, 1.8-3.5 s.');
  if (f?.layout === 'cutout-widgets') out.push('Any card may add "behind": true: it is drawn between the room and the cut-out presenter, so the ' +
    'head passes in front of it (depth). Use it for the progress widget (e.g. 23/30 dias) and big words placed around the head.');
  if (f?.layout === 'full-editorial') out.push('Any card may add "behind": true: it is drawn between the room and the cut-out presenter, so the ' +
    'head passes in front of the words. Alternate the giant-word cards between "behind": true and over everything.');
  if (f?.layout === 'cluster-floating') out.push('image {src: ["a.png", ...3-5 files]} becomes a floating cluster of 3-5 tilted photos over the ' +
    'black top of the frame (y 30-540); the presenter is framed in the bottom 1360 px. Swap the whole cluster at each new idea.');
  return out.length ? `# Card types of this format (also valid as tipo_card / type)\n${out.join('\n')}\n\n` : '';
}
function cardTypes(st: State): string[] {
  try { return formatCardTypes(getFormat(st.formatId || 'business-reels')); } catch { return [...CARD_TYPES]; }
}
function formatCardsOf(st: State): string {
  try { return formatCards(getFormat(st.formatId || 'business-reels')); } catch { return ''; }
}

// Env the render scripts read from the project's format: layout, punch-ins, camera zoom/mode, bottom safe zone (build_reel.py).
function formatEnv(st: State): Record<string, string> {
  let f: any;
  try { f = getFormat(st.formatId || 'business-reels'); } catch { return {}; }
  const p = f.editingStyle?.punchIns;
  const cam = f.camera, sb = f.visualAssets?.safeZones?.bottom;
  return {
    ...(f.layout ? { REEL_LAYOUT: f.layout } : {}),
    ...(p?.enabled && Array.isArray(p.intervalSeconds) ? { REEL_PUNCH: `${p.intervalSeconds.join(',')},${p.zoomScale ?? 1.25}` } : {}),
    ...(cam?.zoomFactor ? { REEL_ZOOM: String(cam.zoomFactor) } : {}),
    ...(cam?.mode ? { REEL_CAMERA_MODE: cam.mode } : {}),
    ...(sb ? { REEL_SAFE_BOTTOM: String(sb) } : {}),
  };
}

// formatEnv plus the person cut-out (cutout.webm) when the format wants one; without macOS Vision the render falls back to the plain layout.
async function renderEnv(id: string, st: State): Promise<Record<string, string>> {
  const env = formatEnv(st);
  let f: any;
  try { f = getFormat(st.formatId || 'business-reels'); } catch { return env; }
  if (!f.cutout) return env;
  try { await ensureCutout(id); return { ...env, REEL_CUTOUT: '1' }; }
  catch (e: any) { emit(id, 'log', `recorte indisponível, render sem recorte: ${e.message}`); return env; }
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
    camera: { mode: "face-center", headroomPercent: 18, zoomFactor: 1.15, smoothSamples: 5 },
    visualAssets: { safeZones: { top: 200, bottom: 380, left: 70, right: 70 }, backgroundStyle: "blur-extend" },
    editingStyle: { pacing: "dynamic", screenPacingSeconds: 1.5, cardMinDuration: 2.5, cardMaxDuration: 4.5, punchIns: { enabled: true, intervalSeconds: [4.0, 7.0], zoomScale: 1.25 }, transitions: "cut" }
  };
  base.id = id;
  writeFileSync(join(dir, "format.json"), JSON.stringify(base, null, 2));
  return base;
}

// Clone an animation style: reference videos (links or files) and images become a new format. Rhythm is measured here with ffmpeg;
// Opus only reads the frames and writes the visual direction, so numbers never come from the model's eye.
const execP = (cmd: string, args: string[]) => new Promise<string>((ok, ko) =>
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

export async function cloneFormat(body: { id: string; name?: string; urls?: string[]; paths?: string[]; note?: string; skill?: string }) {
  const id = body?.id, dir = formatDir(id);
  if (existsSync(dir)) fail(`formato ${id} já existe`);
  const urls = (body.urls ?? []).map(u => String(u).trim()).filter(Boolean), paths = (body.paths ?? []).map(expandHome);
  const videos = paths.filter(p => VIDEO_EXT.includes(extname(p).toLowerCase())), images = paths.filter(p => IMAGE_EXT.includes(extname(p).toLowerCase()));
  if (!urls.length && !videos.length && !images.length && !body.skill?.trim()) fail('envie ao menos um vídeo, link, imagem ou skill de referência');
  if (urls.length + videos.length > 5) fail('use no máximo 5 vídeos de referência');
  for (const p of [...videos, ...images]) if (!existsSync(p)) fail(`arquivo não encontrado: ${p}`);
  const skill = typeof body.skill === 'string' ? body.skill.trim().slice(0, 30_000) : '';
  const refs = join(dir, 'refs');
  mkdirSync(refs, { recursive: true });
  try {
    const clips = [...videos];
    for (const [i, u] of urls.entries()) {
      const f = join(refs, `dl${i}.mp4`);
      await execP(YT_DLP, ['-f', 'best[ext=mp4]/best', '--download-sections', '*0-60', '-o', f, '--', u]);
      clips.push(f);
    }
    const frames: string[] = [], stats: { clip: string; duration: number; cuts: number; secondsPerCut: number; size: string; sfxHits?: number[] }[] = [], hitFrames: string[] = [];
    for (const [i, clip] of clips.entries()) {
      const info = (await execP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', clip]));
      const j = JSON.parse(info), dur = Math.min(60, Number(j.format.duration) || 0), size = `${j.streams?.[0]?.width}x${j.streams?.[0]?.height}`;
      const cuts = [...(await execP('ffmpeg', ['-v', 'info', '-t', '60', '-i', clip, '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'])).matchAll(/pts_time:([\d.]+)/g)].map(m => +m[1]);
      stats.push({ clip: basename(clip), duration: +dur.toFixed(1), cuts: cuts.length, secondsPerCut: +(dur / (cuts.length + 1)).toFixed(2), size });
      // one frame just after each cut (at most 8 per video), so every distinct treatment is seen, plus the opening frame
      const step = Math.max(1, Math.ceil(cuts.length / 7)), times = [0.2, ...cuts.filter((_, k) => k % step === 0).map(t => t + 0.15)].slice(0, 8);
      // a continuous take has no cuts: sample evenly so the model still sees how the on-screen text and graphics change over time
      for (let k = 1; times.length < 6 && dur > 2; k++) times.push(dur * k / 6);
      const hits = await sfxOnsets(clip, dur).catch(() => [] as number[]);
      stats[stats.length - 1].sfxHits = hits.slice(0, 40);
      for (const [k, t] of hits.slice(0, 6).entries()) {   // the frame at a hit shows what the sound belongs to
        const f = join(refs, `h${i}_${k}.jpg`);
        await execP('ffmpeg', ['-v', 'error', '-y', '-ss', Math.max(0, t - 0.05).toFixed(2), '-i', clip, '-frames:v', '1', '-vf', 'scale=540:-2', f]);
        hitFrames.push(f);
      }
      for (const [k, t] of times.entries()) {
        const f = join(refs, `v${i}_${k}.jpg`);
        await execP('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', clip, '-frames:v', '1', '-vf', 'scale=540:-2', f]);
        frames.push(f);
      }
    }
    const imgs = images.map((p, k) => { const f = join(refs, `img${k}${extname(p).toLowerCase()}`); intake(p, f); return f; });
    const avg = stats.length ? +(stats.reduce((a, s) => a + s.secondsPerCut, 0) / stats.length).toFixed(2) : null;
    const res = await ask<any>('cloneFormat', 'format:clone', {
      system: 'You clone an animation style into a reusable format for a talking-head reel editor. Read every frame/image, then describe the style so another model can reproduce it ' +
        'with different content: typography (weight, case, size, position), colour use, card/graphic types, how elements enter and leave, text-versus-presenter layout, camera moves, captions. ' +
        'Be concrete (positions, sizes, colours, durations). Write in Brazilian Portuguese. Never copy the on-screen words of the references, only the design. ' +
        'Rhythm numbers and sound-hit times are measured by a script and given to you: use them, do not re-estimate. ' +
        'sfxRules: which visual event gets which sound (sfx = a name from the available list, or "" if the reference plays something not in the list); ignore hits that are speech; empty list if the video has no effects. ' +
        'motionRecipes: 3 to 6 reusable motions of this style as GSAP fragments (tween/timeline calls on the selector placeholder SEL, with from/to values, duration and ease), concrete enough to paste. ' +
        'safeZones: pixel margins (1080x1920) when the skill or user states them, else all 0. sfxGainDb: overall sound-effect gain in dB when stated (negative number), else 0. ' +
        'sfxForbidden: sounds the skill or user rejects (e.g. typing, riser), else empty. sceneSeconds: typical seconds one idea/scene stays on screen, from the skill or the frames; 0 if unknown.',
      readDir: refs,
      content: `Frames from reference videos (read each): ${frames.join(', ') || 'none'}\nFrames at detected sound hits (read each): ${hitFrames.join(', ') || 'none'}\nAvailable sound effects (use these names only): ${Object.keys(JSON.parse(readFileSync(join(SKILL, 'compose/sfx/manifest.json'), 'utf8'))).join(', ')}\nDesign reference images (the target look, not content): ${imgs.join(', ') || 'none'}\n` +
        `Measured: ${JSON.stringify(stats)}\n` + (body.note ? `What the user wants copied (priority): ${body.note}\n` : '') +
        (skill ? `\nA skill the user already uses with Claude for this style. Its rules WIN over what you infer from the frames; fold them into promptGuide, sfxRules and motionRecipes:\n<skill>\n${skill}\n</skill>\n` : ''),
      schema: obj({
        name: str, description: str, promptGuide: str, captionsStyle: { type: 'string', enum: ['one-word', 'two-words', 'phrase', 'none'] },
        cutout: { type: 'boolean' }, punchIns: { type: 'boolean' }, transitions: str, cardMinDuration: num, cardMaxDuration: num,
        sfxRules: { type: 'array', items: obj({ when: str, sfx: str, level: { type: 'string', enum: ['subtle', 'normal', 'loud'] } }) },
        sfxGainDb: num, sfxForbidden: { type: 'array', items: str },
        safeZones: obj({ top: num, bottom: num, left: num, right: num }), sceneSeconds: num,
        motionRecipes: { type: 'array', items: obj({ name: str, use: str, gsap: str }) },
      }),
    }, c => console.log(`[cloneFormat ${id}] ${c.model} in=${c.in} out=${c.out}`));
    // secondsPerCut only means something when the video has cuts; a continuous take has none, so the model's sceneSeconds stands in
    const cutCount = stats.reduce((a, x) => a + x.cuts, 0);
    const avgPace = cutCount && avg ? Math.min(6, Math.max(0.5, avg)) : res.sceneSeconds > 0 ? Math.min(12, Math.max(0.5, res.sceneSeconds)) : 2;
    const sz = res.safeZones, zonesOk = sz && [sz.top, sz.bottom, sz.left, sz.right].every((v: number) => v > 0);
    const base: any = {
      name: body.name?.trim() || res.name, order: 100 + listFormats().length, aspectRatio: '9:16', width: 1080, height: 1920, category: 'Clonado',
      cutout: !!res.cutout, description: res.description, promptGuide: res.promptGuide, comments: '', captionsStyle: res.captionsStyle,
      camera: { mode: 'face-center', headroomPercent: 18, zoomFactor: 1.15, smoothSamples: 5 },
      visualAssets: { safeZones: zonesOk ? sz : { top: 200, bottom: 380, left: 70, right: 70 }, backgroundStyle: 'blur-extend' },
      editingStyle: { pacing: avgPace < 2 ? 'fast-cut' : 'dynamic', screenPacingSeconds: avgPace, cardMinDuration: res.cardMinDuration, cardMaxDuration: res.cardMaxDuration,
        punchIns: { enabled: !!res.punchIns, intervalSeconds: [3, 6], zoomScale: 1.25 }, transitions: res.transitions },
      sfxRules: res.sfxRules, sfxGainDb: res.sfxGainDb || undefined, sfxForbidden: res.sfxForbidden?.length ? res.sfxForbidden : undefined, sfxPerMinute: stats.length ? Math.round(stats.reduce((a, x) => a + (x.sfxHits?.length ?? 0) / Math.max(1, x.duration), 0) / stats.length * 60) : 0, motionRecipes: res.motionRecipes,
      clonedFrom: { urls, measured: stats, note: body.note ?? '' },
    };
    base.id = id;
    if (skill) writeFileSync(join(dir, 'skill.md'), skill);   // also given verbatim to every project that uses the format
    writeFileSync(join(dir, 'format.json'), JSON.stringify(base, null, 2));   // refs/ stays beside it: the images and frames the style came from
    return base;
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

// Compares a render made with a cloned format (frames) against the frames the style was cloned from, and rewrites the guide where they differ.
// The render is made by the user in a normal project; the loop here is compare -> fix the format -> render again.
export async function refineFormat(id: string, body: { path?: string; note?: string }) {
  const dir = formatDir(id), file = join(dir, 'format.json'), refs = join(dir, 'refs');
  if (!existsSync(file) || !existsSync(refs)) fail(`formato ${id} não foi criado por clone`);
  const clip = expandHome(String(body?.path ?? ''));
  if (!VIDEO_EXT.includes(extname(clip).toLowerCase()) || !existsSync(clip)) fail('path: caminho de um vídeo (.mp4 .mov) renderizado com este formato');
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
  const cur = JSON.parse(readFileSync(file, 'utf8'));
  const res = await ask<any>('cloneFormat', 'format:refine', {
    system: 'You compare a render made with a cloned animation format against the reference it was cloned from. Read every frame of both sets, list concrete differences ' +
      '(typography, colours, layout, element types, motion you can infer, density), then rewrite the guide so the next render is closer. Keep what already matches. match is a 0-10 similarity score. Write in Brazilian Portuguese.',
    readDir: dir,
    content: `Reference frames (the target): ${orig.join(', ')}\nRender frames (what the format produced): ${test.join(', ')}\n\nCurrent promptGuide:\n${cur.promptGuide}\n` +
      (body.note ? `\nUser feedback on the render (priority): ${body.note}\n` : ''),
    schema: obj({ match: num, differences: { type: 'array', items: str }, promptGuide: str,
      motionRecipes: { type: 'array', items: obj({ name: str, use: str, gsap: str }) } }),
  }, c => console.log(`[refineFormat ${id}] ${c.model} in=${c.in} out=${c.out}`));
  const next = { ...cur, promptGuide: res.promptGuide, motionRecipes: res.motionRecipes,
    refineLog: [...(cur.refineLog ?? []), { at: new Date().toISOString(), match: res.match, differences: res.differences }] };
  writeFileSync(file, JSON.stringify(next, null, 2));
  return { match: res.match, differences: res.differences };
}

export function updateFormat(id: string, data: any) {
  const file = join(formatDir(id), "format.json");
  if (!existsSync(file)) fail(`formato ${id} não encontrado`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('format must be an object');
  const cur = JSON.parse(readFileSync(file, "utf8"));
  const next = { ...deepMerge(cur, data), id };   // deep: a partial editingStyle must not wipe the sibling fields the render needs
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
  composerMode?: 'agent' | 'card';
  brollFill?: boolean;
  /** Text → voice: the script is spoken as written; replaces the video. `voice` falls back to the brand's `voice`. */
  text?: string;
  voice?: { provider: string; voice: string; language?: string };
  /** Brand character name (optionally a pose) that plays the speaker in formats with a cut-out. */
  character?: { name: string; pose?: string };
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
  const take = (from: string, to: string) => { intake(from, to); if (from.startsWith(UPLOADS + '/')) moved.push([from, to]); };
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

    writeFileSync(join(P, '.gitignore'), '._*\nactivity.log\nraw.*\n*.mp4\n*.wav\nproj/\n*_whisper/\nqa_transcript/\nframes/\nref/\ncutout/\ncutout.webm\ncutout.json\nnose.json\nfillers.json\ncut_filter.txt\nafter-effects/\nref_extra/\nassets/user/\n' + COMPOSE_IGNORE);
    const composerMode = o.composerMode;
    const userImages = images.map((img, k) => {
      const name = `${k}-${basename(img).replace(/[^\w.-]+/g, '_')}`;
      mkdirSync(join(P, 'assets', 'user'), { recursive: true });
      copyFileSync(img, join(P, 'assets', 'user', name));
      return `assets/user/${name}`;
    });
    if (userImages.length) appendProjectLog(id, `🖼️ Imagens importadas: ${userImages.length}`);
    const st: State = { id, name: o.name, brand: o.brand, formatId: o.formatId || 'business-reels', preEdited: o.preEdited, subtitle: subName, referenceUrl, extraReferenceUrls: extraReferenceUrls.length ? extraReferenceUrls : undefined, referenceNote, userImages: userImages.length ? userImages : undefined, formats, override: {}, step: 'created', cost: [], composerMode, ...(o.character ? { character: o.character } : {}), ...(o.brollFill === true ? { brollFill: true } : {}) };
    save(st);
    await run(id, 'git', ['init', '-q', P]);
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
  return { ...st, composed: usesAgent(st) || composedByAgent(st), composedFormats, readyFinals, primaryFormat: primaryAspect(st), running: busy.get(id) ?? null };
};
export const setComposerMode = (id: string, mode: 'agent' | 'card') => {
  const st = load(id);
  st.composerMode = mode;
  save(st);
  return { ok: true, composerMode: mode, usesAgent: usesAgent(st) };
};
export const listProjects = () => existsSync(join(WS, 'projects')) ? readdirSync(join(WS, 'projects')).filter(p => safeId(p) && existsSync(join(projDir(p), 'state.json'))).sort().reverse() : [];

export interface ProjectOverview {
  id: string;
  name: string;
  brand: string;
  formatId?: string;
  step: string;
  stepLabel: string;
  running: BusyInfo | null;
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
      const running = busy.get(id) ?? null;
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
        requiresHumanConfirmation = true;
        humanConfirmationLabel = 'Iniciar Roteiro';
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
const PROJECT_FILES = ['script.json', 'edit.json', 'embrulhos.json', 'preview.mp4', 'final.mp4', ...FORMATS.map(finalName)];
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
  if (st.preEdited) {
    // Vídeo pré-editado: áudio original preservado, sem cortes automáticos nem silêncios
    await py(id, 'transcribe.py', [plan.transcribe === 'srt' ? join(P, st.subtitle!) : raw, join(P, 'transcript.json')]);
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
    return st;
  }

  await run(id, 'bash', [join(S, 'clean_audio.sh'), raw, join(P, 'voice.wav')]);
  await py(id, 'transcribe.py', [plan.transcribe === 'srt' ? join(P, st.subtitle!) : raw, join(P, 'transcript.json')]);
  const words: Word[] = readJSON(join(P, 'transcript.json')).filter((w: Word) => w.text.trim());
  if (!words.length) fail('no speech found in the transcript');
  const dur = await duration(id, raw), pace = await pacing(id);
  const keep = plan.cut === 'srt' ? spansFromWords(words, pace.pause_min, pace.air, dur) : [[0, dur]];
  writeJSON(join(P, 'edl.json'), { source: basename(raw), audio: 'voice.wav', keep });
  if (plan.cut === 'tighten') await py(id, 'tighten.py', [P]);
  await py(id, 'cut.py', [P], { REEL_PREVIEW: '1' });
  const long = await overLength(id, P, brand);
  if (long) emit(id, 'log', `⚠ ${long}: corte antes da entrega ou suba o limite`);
  // Whisper glues words across pauses, so after tighten its times can sit inside a cut: re-transcribe the master
  // (as the fork does). SRT and pre-edited times are exact, so they are just remapped.
  const edl = readJSON(join(P, 'edl.json'));
  if (plan.cut === 'tighten') await py(id, 'transcribe.py', [join(P, 'master.mp4'), join(P, 'master_transcript.json')]);
  else writeJSON(join(P, 'master_transcript.json'), remapWords(words, edl.keep, edl.speed ?? pace.speed));
  const master: Word[] = readJSON(join(P, 'master_transcript.json'));
  // qa.py's lost-words check compares Whisper with Whisper; SRT text would not match word for word
  if (plan.transcribe === 'whisper') writeFileSync(join(P, 'expected.txt'), master.map(w => w.text).join(' '));
  await py(id, 'auto_edit.py', [P]);
  Object.assign(st, { plan, step: 'ingest' }); save(st);
  await commit(id, `step 1: ingest (${plan.transcribe}, cut: ${plan.cut})`);
  emit(id, 'log', `✓ Ingestão concluída com sucesso (${master.length} palavras transcritas).`);
  return st;
});

// Step 2 - Haiku cleans and segments, Opus writes script.json.
const SEGMENTS = obj({ segments: { type: 'array', items: obj({ t_start: num, t_end: num, text: str }) } });
const MOMENT = (types: string[]) => obj({
  t_start: num,
  t_end: num,
  tipo_card: { type: 'string', enum: types },
  motion_style: str,
  visual_action: str,
  texto: str,
  icone: str,
  sfx: str,
  motivo: str
});
const SCRIPT = (types: string[]) => obj({ moments: { type: 'array', items: MOMENT(types) }, accentWords: { type: 'array', items: str } });

export const script = (id: string) => locked(id, 'script', async st => {
  const P = projDir(id), brand = writeBrand(st);
  const words: Word[] = readJSON(join(P, 'master_transcript.json'));
  const dur = await duration(id, join(P, 'master.mp4'));
  await ensureReference(id, st);
  const { segments } = await ask<{ segments: unknown[] }>('triage', 'script:segment', {
    system: 'You clean Brazilian Portuguese speech transcripts. Join the words into sentences, fix obvious transcription ' +
      'mistakes and punctuation, drop hesitations (hum, ahn, né used as filler). Keep each sentence\'s time from its first and last word. Do not invent content.',
    content: JSON.stringify(words.map(w => [w.text, w.start, w.end])),
    schema: SEGMENTS,
  }, logCost(st));
  const frames = await sampleFrames(id, dur, Math.min(8, Math.max(4, readJSON(join(P, 'edl.json')).keep.length)));
  emit(id, 'log', '✨ Concebendo roteiro e momentos com IA (Claude)...');
  const res = await ask<any>('script', 'script:moments', {
    system: `${vocabulary()}\n\n# Brand rules (brand.md)\n${readFileSync(join(P, 'brand.md'), 'utf8')}\n\n${formatGuide(st)}` +
      'You are an art director planning the graphics and motion design of a short talking-head reel. ' +
      'Return moments that each illustrate exactly what that line says, at the density the brand asks for ' +
      '("graphics": minimal 8-12 s, balanced 4-6 s, busy 2-4 s apart). Write texto in the language of the transcript.\n' +
      'Without a "graphics" value, follow the format pacing: a new moment every 2-3 s, and no moment over 3.5 s without an internal change written in visual_action. ' +
      'Split long sentences: each number, product, promise, list item and CTA gets its own moment. Read the whole script first and plan an arc (hook, offer/argument, proof, CTA).\n' +
      (siteRef(st) ? 'A site reference is attached (site in the content). Open the site screenshots and the images in assets/img/ with Read before planning. ' +
        'Tie each line to the site: when the speaker names something the site shows (a product, track, theme, testimonial, number, the brand on stage), that moment uses the site image ' +
        '(write its file name, e.g. "imagem: assets/img/12_tema-7.webp") or the site fact. Use at least one site image every ~10 s. In motivo, note when the speech and the site disagree on a number.\n' : '') +
      '- visual_action: Describe in Brazilian Portuguese, as a precise brief for the editor, in this order: fundo (cor sólida da paleta, vídeo desfocado ou imagem/B-roll do site), ' +
      'enquadramento do locutor (M, L, XL, XXL ou sem locutor), o destaque único da cena (palavra gigante atrás, número, card, imagem) com a cor, o apoio (ícone, pílula, imagem) e a troca interna se a cena passa de 2,5 s. ' +
      'Never two moments in a row with the same background or the same kind of highlight.\n' +
      '- motion_style: The visual motion category (a short free label for the visual idea, e.g. "Manchete editorial", "Diagrama orbital", "Tipografia gigante", "UI & Mockup"; not a fixed list, vary it across the reel).\n' +
      '- tipo_card: always "custom"; Opus 5.5 decides the motion later. visual_action and motion_style are only a brief: Opus redesigns each moment freely.\n' +
      '- icone: the name of one of the brand icons, or "". sfx: a sound name or "". motivo: why this moment, in one short sentence. accentWords: one key word per sentence.',
    readDir: projDir(id),
    content: `Frames: ${frames.join(', ')}. Read each one before planning.\n` + siteFiles(id) + JSON.stringify({ duration: dur, segments, graphics: brand.graphics, sfx: brand.sfx,
      icons: (brand.icons ?? []).map((i: any) => ({ name: i.name, tags: i.tags })) }),
    schema: SCRIPT(['custom']),
  }, logCost(st));
  writeJSON(join(P, 'script.json'), res);
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

// The card vocabulary is the header of build_reel.py and motions.md: one source of truth, read at runtime.
function vocabulary() {
  const header = readFileSync(join(S, 'build_reel.py'), 'utf8').split('"""')[1];
  return `# Card vocabulary (build_reel.py)\n${header}\n# Catalog motions (motions.md)\n${readFileSync(join(SKILL, 'references/motions.md'), 'utf8')}`;
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
  return brand;
});

// "Save as default": this project's override becomes the brand's.
export const saveBrandDefault = (id: string) => locked(id, 'brand:default', async st => {
  const merged = deepMerge(getBrand(st.brand), st.override);
  checkBrand(merged);
  saveBrand(st.brand, merged);
  st.override = {}; save(st);
  await commit(id, `brand ${st.brand}: project changes saved as default`);
  return merged;
});

// Step 4 - Opus turns script.json + brand into the cards of edit.json, then a 1080p preview.
const CARD = (types: string[]) => obj({ type: { type: 'string', enum: types }, start: num, end: num,
  props_json: { type: 'string', description: 'JSON object with the fields of this card type (vocabulary or custom {html, css, js}), e.g. {"text":"..."}' } });

function toCard(c: { type: string; start: number; end: number; props_json: string }, brand: any) {
  let props: any = {};
  try { props = JSON.parse(c.props_json || '{}'); } catch { props = { _error: 'props_json is not JSON' }; }
  const card = { ...props, type: c.type, start: c.start, end: c.end };
  const icon = (brand.icons ?? []).find((i: any) => i.name === card.icon);
  if (icon) { card.src = c.type === 'image' ? [icon.file] : icon.file; delete card.icon; }
  return card;
}
const SIZE_RULES = 'SCALE on the 1080x1920 canvas: the speaker\'s face must stay visible. Never use inset:0 with an opaque background. ' +
  'Default: titles up to 110px, big numbers up to 180px, secondary text up to 70px; cards/overlays up to 75% of the width and one third of the height, ' +
  'in the top or bottom third. For impact moments (hook, key number, punchline; at most 3 per reel) you may break the default: ' +
  'type up to 320px that bleeds off the frame edge, diagonal or asymmetric layouts, lines across the whole frame, elements around the speaker, ' +
  'as long as nothing opaque covers the face.\n';
const CUSTOM_RULES = SIZE_RULES + 'A "custom" card has html, css, js. css is scoped to the card, no @-rules. js is the body of ' +
  'function(tl, T, el): add GSAP tweens to tl at absolute times from T (the card start), find nodes with el.querySelector. ' +
  'No network, no images, no timers, no Math.random/Date, no window/document. Colours only var(--main), var(--pop), ' +
  'var(--light), var(--cap), var(--cap-accent), the brand hex values or, when a site is attached, the site palette hex values. Authored on a 1080x1920 stage.';

// Straight from the approved script to the review player.
// Formats with composer: "agent" skip the card pipeline; the composer works from the script and brief.
export const motion = async (id: string) => {
  const st = load(id);
  const out = st.formatId && usesAgent(st) ? await compose(id) : await motionCards(id);
  // b-roll is an extra: a search that finds nothing must not undo the motion pass that just succeeded
  if (st.brollFill) await brollFill(id).catch(e => appendProjectLog(id, `🎞️ B-roll não preenchido: ${(e as Error).message}`));
  return out;
};

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
const BROLL_ID = /^broll\d+$/;
export const brollFill = (id: string) => locked(id, 'broll', async st => {
  const P = projDir(id), scr = readJSON(join(P, 'script.json'));
  const moments: any[] = scr.moments ?? [];
  if (!moments.length) fail('o roteiro ainda não tem momentos');
  const fmt = getFormat(st.formatId || 'business-reels');
  const dur = Math.round((await duration(id, join(P, 'master.mp4')) - 0.02) * 100) / 100;
  const max = Math.min(8, Math.max(1, Math.ceil(dur / 5)));
  const plan = await ask<{ clips: { moment: number; query: string; kind: 'video' | 'image' }[] }>('broll', 'broll:queries', {
    system: `You choose where a short vertical reel gains from stock footage or a photo in the lower part of the frame, shown while the speaker keeps talking. ` +
      `Pick at most ${max} moments, spread through the reel, where a real-world picture helps: a place, a person at work, an object, a situation. ` +
      `Skip moments that are about interface, numbers, typography or the speaker himself. ` +
      `For each, write "query": 2 to 4 English words naming something concrete and filmable (never an abstract idea, never a brand or a famous person), and "kind": video unless a still is clearly better. ` +
      `"moment" is the index of the moment in the list.`,
    content: JSON.stringify(moments.map((m, i) => ({ moment: i, t_start: m.t_start, t_end: m.t_end, texto: m.texto, visual_action: m.visual_action }))),
    schema: obj({ clips: { type: 'array', items: obj({ moment: num, query: str, kind: { type: 'string', enum: ['video', 'image'] } }) } }),
  }, logCost(st));
  const d = readLayers(P);
  d.added = d.added.filter(a => !BROLL_ID.test(a.id));   // a second run replaces the first one's clips and keeps the user's own layers
  for (const k of Object.keys(d.layers)) if (BROLL_ID.test(k)) delete d.layers[k];
  const media = join(P, 'media');
  mkdirSync(media, { recursive: true });
  let n = 0;
  for (const c of plan.clips.slice(0, max)) {
    const m = moments[c.moment];
    if (!m || typeof c.query !== 'string') continue;
    const start = Math.max(0, Number(m.t_start)), need = Math.min(4.5, Math.max(1.5, Number(m.t_end) - start));
    const { results, errors } = await brollSearch(c.query, { kind: c.kind, limit: 8 });
    const best = brollPick(results, need);
    if (!best) { appendProjectLog(id, `🎞️ B-roll sem resultado para "${c.query}"${Object.keys(errors).length ? ` (${Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''}`); continue; }
    const file = `broll${++n}-${best.provider}${extOf(best)}`, bid = `broll${n}`;
    try { await brollDownload(best, join(media, file)); } catch (e) { appendProjectLog(id, `🎞️ Falha ao baixar "${c.query}": ${(e as Error).message}`); n--; continue; }
    const { w, y } = band(fmt, best);
    d.added.push({ id: bid, kind: best.kind, src: `media/${file}`, name: `b-roll: ${c.query}`.slice(0, 80), start, duration: best.kind === 'video' && best.duration ? Math.min(need, best.duration) : need,
      track: 5, w, rights: rightsOf(best) });
    d.layers[bid] = { y };
    appendProjectLog(id, `🎞️ B-roll ${best.provider}: "${c.query}" em ${start.toFixed(1)}s (${rightsOf(best).status === 'licensed' ? best.license : 'sem licença ainda'})`);
  }
  writeJSON(join(P, 'layers.json'), checkLayers(d));
  const ignore = join(P, '.gitignore');
  if (existsSync(ignore) && !/^media\/broll/m.test(readFileSync(ignore, 'utf8'))) appendFileSync(ignore, 'media/broll*\n');   // downloaded clips are big and re-fetchable
  await commit(id, `b-roll: ${n} clipes`);
  return { clips: n };
});
const motionCards = (id: string) => locked(id, 'motion', async st => {
  const P = projDir(id), brand = writeBrand(st);
  const edit = readJSON(join(P, 'edit.json'));
  const scr = readJSON(join(P, 'script.json'));
  const dur = Math.round((await duration(id, join(P, 'master.mp4')) - 0.02) * 100) / 100;
  const palette = [...paletteOf(brand), ...Object.values<string>(siteRef(st)?.siteColors ?? {})];
  const system = `${vocabulary()}\n\n# Brand rules (brand.md)\n${readFileSync(join(P, 'brand.md'), 'utf8')}\n\n${formatGuide(st)}` +
    'You are an elite motion designer using Claude Opus 5.5 to animate a short reel. Turn the ' +
    'approved script moments (their texto, tipo_card and t_start..t_end)' + ' into cards of edit.json. You have COMPLETE CREATIVE FREEDOM to build dynamic, bespoke GSAP/HTML/CSS animations ("custom" card type) ' +
    'or use standard card types when appropriate. Do not restrict yourself to rigid or basic card templates.\n' +
    'Prefer "custom" for most cards; use shot, image or sticker only where the script asks for that media or the format requires it.\n' +
    'One card per script moment, inside that moment\'s t_start..t_end. Never add a second card in the same window (a sticker, image or shot next to a title) unless the moment itself asks for it: those cards stack on the title in the timeline.\n' +
    'Bring the script moments to life with kinetic typography, interactive mockups, ' +
    'animated metric counters, smooth fades, 3D transforms, and glowing highlights.\n' +
    'For "custom" cards:\n' +
    `${CUSTOM_RULES}\n` +
    'Every card has an explicit end; keep text within the size hints. Sticker/image/shot cards may use a brand icon with ' +
    '{"icon": "<name>"} instead of src. Follow brand.json rules (e.g. require_carousel).';
  const data = {
    duration: dur,
    script: scr,
    brand,
    captions: edit.captions.map((c: any) => ({ start: c.start, end: c.end, text: c.words.map((w: any) => w.text).join(' ') }))
  };
  let cards: any[] = [], errors: string[] = [], accents: string[] = scr.accentWords ?? [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ask<{ cards: any[]; accentWords: string[] }>('motion', 'motion:cards', {
      system,
      content: JSON.stringify(data) + (errors.length ? `\n\nYour previous cards had these problems, return the full corrected list:\n${errors.join('\n')}` : ''),
      schema: obj({ cards: { type: 'array', items: CARD(cardTypes(st)) }, accentWords: { type: 'array', items: str } }),
    }, logCost(st));
    cards = res.cards.map(c => toCard(c, brand));
    if (res.accentWords?.length) accents = res.accentWords;
    errors = cards.flatMap((c, i) => validateCard(c, dur, palette).map(e => `card ${i} (${c.type}): ${e}`));
    if (!errors.length) break;
  }
  if (errors.length) {
    emit(id, 'log', `dropped invalid cards: ${errors.join(' | ')}`);
    cards = cards.filter(c => !validateCard(c, dur, palette).length);
  }
  const acc = new Set(accents.map(norm));
  for (const c of edit.captions) for (const w of c.words) w.accent = acc.has(norm(w.text));
  edit.cards = cards;
  writeJSON(join(P, 'edit.json'), edit);
  Object.assign(st, { step: 'motion' }); save(st);
  await commit(id, `step 4: ${cards.length} cards`);
  await buildLive(id, st);   // the review player plays it live: no render until the delivery step
  return edit;
});
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]/g, '');

async function preview(id: string, st: State) {
  const P = projDir(id);
  writeBrand(st);
  await run(id, 'bash', [join(S, 'render.sh'), P], { REEL_PREVIEW: '1', ...await renderEnv(id, st) });
  renameSync(join(P, 'final.mp4'), join(P, 'preview.mp4'));
  emit(id, 'preview', { file: 'preview.mp4' });
}

export const renderPreview = (id: string) => locked(id, 'preview', async st => {
  agentOnly(st);
  await preview(id, st);
  return { ok: true };
});

// edit.json does not drive an agent-composed reel: a card edit would overwrite its preview and never reach the final
function agentOnly(st: State) {
  if (composedByAgent(st))
    fail('Este reel foi composto pelo agente: peça ajustes pela composição (POST /projects/:id/compose com note), não pela timeline de cards');
}

// Visual edit from the timeline: validate, write, rebuild the preview. No model involved.
// shortcut: rebuilds the whole preview; HyperFrames has no partial render, so upgrade only if it gains one
export const putEdit = (id: string, edit: any) => locked(id, 'edit', async st => {
  agentOnly(st);
  const P = projDir(id), brand = writeBrand(st);
  if (!Array.isArray(edit?.captions) || !Array.isArray(edit?.cards)) fail('edit.json needs captions[] and cards[]');
  const dur = Math.round((await duration(id, join(P, 'master.mp4')) - 0.02) * 100) / 100;
  const palette = [...paletteOf(brand), ...Object.values<string>(siteRef(st)?.siteColors ?? {})];
  const errors = edit.cards.flatMap((c: any, i: number) => validateCard(c, dur, palette).map(e => `card ${i}: ${e}`));
  if (errors.length) fail(errors.join('; '));
  writeJSON(join(P, 'edit.json'), { punch: [], ...edit });
  await commit(id, 'edit: timeline');
  await preview(id, st);
  return readJSON(join(P, 'edit.json'));
});

const BATCH_CARD_ITEM = (types: string[]) => obj({
  index: num,
  type: { type: 'string', enum: types },
  start: num,
  end: num,
  props_json: { type: 'string', description: 'JSON object with the fields of this card type (vocabulary), e.g. {"text":"..."}' },
});
const BATCH_CARDS_SCHEMA = (types: string[]) => obj({
  cards: { type: 'array', items: BATCH_CARD_ITEM(types) },
});

export type BatchItem = {
  id?: string;
  type: 'ask' | 'card_edit' | 'card_delete' | 'word_accent';
  cardIndex?: number;
  card?: any;
  instruction?: string;
  captionIndex?: number;
  wordIndex?: number;
  accent?: boolean;
  summary?: string;
};

// Batch visual edit: applies non-LLM tweaks (props, accents, deletes) and groups AI calls (script, Opus), then one preview rebuild.
export const batchEdit = (id: string, body: { items?: BatchItem[]; edit?: any } | BatchItem[]) => locked(id, 'batch', async st => {
  const items: BatchItem[] = Array.isArray(body) ? body : (body?.items ?? []);
  const P = projDir(id), brand = writeBrand(st);
  const edit = readJSON(join(P, 'edit.json'));
  const dur = Math.round((await duration(id, join(P, 'master.mp4')) - 0.02) * 100) / 100;
  const palette = [...paletteOf(brand), ...Object.values<string>(siteRef(st)?.siteColors ?? {})];

  // 1. Edições sem LLM primeiro (destaque de palavras e edição de campos dos cards; lib.ts)
  applyDirectEdits(edit, items);

  // 2. Agrupamento de pedidos de IA (ask)
  const deleteSet = new Set(items.filter(it => it.type === 'card_delete').map(it => Number(it.cardIndex)));
  const askItems = items.filter(it => it.type === 'ask' && !deleteSet.has(Number(it.cardIndex)));

  const sonnetList: Array<{ cardIndex: number; instruction: string }> = [];
  const opusList: Array<{ cardIndex: number; instruction: string }> = [];

  for (const it of askItems) {
    const idx = Number(it.cardIndex);
    const card = edit.cards?.[idx];
    if (!card) fail(`no card ${idx} for ask`);
    const inst = String(it.instruction ?? '').trim();
    if (!inst) fail(`instruction is required for card ${idx}`);
    if (card.type === 'custom') opusList.push({ cardIndex: idx, instruction: inst });
    else sonnetList.push({ cardIndex: idx, instruction: inst });
  }

  // Chamada única ao Opus para cards padrão
  if (sonnetList.length > 0) {
    const res = await ask<{ cards: Array<{ index: number; type: string; start: number; end: number; props_json: string }> }>(
      'script',
      'script:ask-batch',
      {
        system: `${vocabulary()}\n\n${formatCardsOf(st)}You change the requested cards of a reel as asked. Return each modified card with its matching index. ${CUSTOM_RULES}`,
        content: JSON.stringify({
          duration: dur,
          brand,
          requests: sonnetList.map(r => ({ index: r.cardIndex, card: edit.cards[r.cardIndex], request: r.instruction })),
        }),
        schema: BATCH_CARDS_SCHEMA(cardTypes(st)),
      },
      logCost(st),
    );
    for (const rc of res.cards ?? []) {
      const next = toCard(rc, brand);
      const errors = validateCard(next, dur, palette);
      if (errors.length) fail(`card ${rc.index} rejected: ${errors.join('; ')}`);
      edit.cards[rc.index] = next;
    }
  }

  // Chamada única ao Opus para cards motion (custom)
  if (opusList.length > 0) {
    const res = await ask<{ cards: Array<{ index: number; type: string; start: number; end: number; props_json: string }> }>(
      'motion',
      'motion:ask-batch',
      {
        system: `${vocabulary()}\n\n# Brand rules (brand.md)\n${readFileSync(join(P, 'brand.md'), 'utf8')}\n\n${formatCardsOf(st)}You change the requested motion/custom cards of a reel as asked. Return each modified card with its matching index. ${CUSTOM_RULES}`,
        content: JSON.stringify({
          duration: dur,
          brand,
          requests: opusList.map(r => ({ index: r.cardIndex, card: edit.cards[r.cardIndex], request: r.instruction })),
        }),
        schema: BATCH_CARDS_SCHEMA(cardTypes(st)),
      },
      logCost(st),
    );
    for (const rc of res.cards ?? []) {
      const next = toCard(rc, brand);
      const errors = validateCard(next, dur, palette);
      if (errors.length) fail(`card ${rc.index} rejected: ${errors.join('; ')}`);
      edit.cards[rc.index] = next;
    }
  }

  // 3. Remoção de cards (card_delete) após resolução de IA
  deleteCards(edit, items);

  // 4. Validação final de todos os cards
  const allErrors = edit.cards.flatMap((c: any, i: number) => validateCard(c, dur, palette).map(e => `card ${i}: ${e}`));
  if (allErrors.length) fail(allErrors.join('; '));

  writeJSON(join(P, 'edit.json'), { punch: [], ...edit });
  await commit(id, `batch: ${items.length} alterations (${sonnetList.length} standard, ${opusList.length} custom)`);
  await preview(id, st);
  return readJSON(join(P, 'edit.json'));
});

// "Ask Claude" about one card: script model for a standard card, motion model (Opus) for a custom one.
export const askCard = (id: string, index: number, instruction: string) => locked(id, 'ask', async st => {
  const P = projDir(id), brand = writeBrand(st);
  const edit = readJSON(join(P, 'edit.json'));
  const card = edit.cards?.[index] ?? fail(`no card ${index}`);
  if (!String(instruction ?? '').trim()) fail('instruction is required');
  const custom = card.type === 'custom';
  const dur = Math.round((await duration(id, join(P, 'master.mp4')) - 0.02) * 100) / 100;
  const res = await ask<any>(custom ? 'motion' : 'script', custom ? 'motion:ask' : 'script:ask', {
    system: `${vocabulary()}\n\n${formatCardsOf(st)}You change one card of a reel as asked. Return the whole card. ${CUSTOM_RULES}`,
    content: JSON.stringify({ duration: dur, brand, card, request: instruction }),
    schema: CARD(cardTypes(st)),
  }, logCost(st));
  const next = toCard(res, brand);
  const palette = [...paletteOf(brand), ...Object.values<string>(siteRef(st)?.siteColors ?? {})];
  const errors = validateCard(next, dur, palette);
  if (errors.length) fail(`the new card was rejected: ${errors.join('; ')}`);
  edit.cards[index] = next;
  writeJSON(join(P, 'edit.json'), edit);
  await commit(id, `card ${index}: ${instruction.slice(0, 60)}`);
  await preview(id, st);
  return next;
});

// ---- Step 5 review: the browser plays proj/index.html live (no render); notes pinned to a time and a spot on the frame ----
export type Note = { id: string; t: number; end?: number; x?: number; y?: number; text: string; status: 'open' | 'done' | 'skipped'; reply?: string; round?: number };
type Review = { notes: Note[]; round: number };
const reviewFile = (id: string) => join(projDir(id), 'review.json');
const readReview = (id: string): Review => existsSync(reviewFile(id)) ? readJSON(reviewFile(id)) : { notes: [], round: 0 };
// an agent-composed reel lives in compose/ (scenes.py writes its index.html); every other reel in proj/ (build_reel.py)
const composedByAgent = (st: State) => usesAgent(st) && existsSync(join(projDir(st.id), 'compose', 'scenes.py'));
const liveDir = (st: State) => join(projDir(st.id), composedByAgent(st) ? 'compose' : 'proj');
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
  return { id: n.id, t: n.t, ...(n.end != null ? { end: n.end } : {}), x: pct(n.x), y: pct(n.y), text, status, ...(typeof n.reply === 'string' ? { reply: n.reply } : {}), ...(Number.isFinite(n.round) ? { round: n.round } : {}) };
}

// No lock: saving notes must not wait for or block a step. Only a running review round writes review.json too.
export function putReviewNotes(id: string, notes: unknown) {
  load(id);
  if (getBusy(id)?.step === 'review') fail('as anotações estão sendo aplicadas; espere a rodada terminar');
  if (!Array.isArray(notes) || notes.length > 500) fail('notes must be an array (at most 500)');
  writeJSON(reviewFile(id), { ...readReview(id), notes: (notes as unknown[]).map(checkNote) });
  return getReview(id);
}

// The composition alone, without capturing it: seconds instead of the minutes of a render.
async function buildLive(id: string, st: State) {
  writeBrand(st);
  if (!existsSync(join(SKILL, 'engine/hf/hyperframes-player.global.js'))) await run(id, 'bash', [join(S, 'setup_engine.sh')]);
  await py(id, 'build_reel.py', [projDir(id)], await renderEnv(id, st));
  emit(id, 'built', {});
}
export const buildReview = (id: string) => locked(id, 'build', async st => {
  agentOnly(st);
  await buildLive(id, st);
  return getReview(id);
});

export function liveFile(id: string, rel: string) {
  const base = liveDir(load(id)), p = resolve(base, rel);
  if (rel === 'index.html' && existsSync(p)) syncEdits(base, projDir(id));   // a new AI pass gets the manual edits again
  if (!p.startsWith(base + '/') || !existsSync(p) || !statSync(p).isFile()) fail(`no ${rel} in the live composition`);
  return p;
}
export const hfFile = (name: string) => ['hyperframes-player.global.js', 'hyperframe.runtime.iife.js'].includes(name) ? join(SKILL, 'engine/hf', name) : fail(`no ${name}`);

// ---- Edição: manual layers on top of the AI composition (server/edits.ts). Saving rewrites the live index.html at once. ----
const EDITS_CLI = join(ROOT, 'server/edits.ts');
export function getLayers(id: string) {
  const st = load(id), D = liveDir(st), P = projDir(id);
  if (!existsSync(join(D, 'index.html'))) fail('a composição ainda não foi montada: abra a Revisão (Etapa 3) primeiro');
  const { warnings } = syncEdits(D, P);
  const html = readFileSync(join(D, 'index.ai.html'), 'utf8');
  // a card reel: cards and captions are not clips, their windows come from edit.json
  const extra: { id: string; kind: string; start: number; end: number; track: number }[] = [];
  if (!composedByAgent(st) && existsSync(join(P, 'edit.json'))) {
    const edit = readJSON(join(P, 'edit.json'));
    (edit.cards ?? []).forEach((c: any, i: number) => extra.push({ id: `k${i}`, kind: 'card', start: c.start, end: c.end ?? c.start + 2, track: 20 }));
    (edit.captions ?? []).forEach((c: any, i: number) => extra.push({ id: `c${i}`, kind: 'caption', start: c.start, end: c.end, track: 21 }));
  }
  const duration = Number(/data-composition-id="[^"]+"[^>]*data-duration="([\d.]+)"|data-duration="([\d.]+)"[^>]*data-composition-id=/.exec(html)?.slice(1).find(Boolean) ?? 0);
  const layers = listLayers(html, extra);
  for (const l of layers.filter(l => l.comp)) {   // a scene's texts live in its own file (the AI's copy, as edits index into it)
    const f = resolve(D, l.comp!), ai = f.replace(/\.html$/, '.ai.html');
    if (f.startsWith(D + '/') && existsSync(f)) {
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
  if (!p?.startsWith(UPLOADS + '/') || !existsSync(p)) fail('envie o arquivo pelo upload primeiro');
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
// the simple captions: phrases from the transcript (agent reel) or the caption lines of edit.json (card reel)
export function captionDraft(id: string) {
  const st = load(id), P = projDir(id);
  if (composedByAgent(st)) {
    const f = join(P, 'compose', 'assets', 'transcript.json');
    if (!existsSync(f)) fail('sem transcript.json na composição');
    return captionLines(readJSON(f));
  }
  return (readJSON(join(P, 'edit.json')).captions ?? []).map((c: any) => ({ t: c.start, end: c.end, text: c.words.map((w: any) => w.text).join(' ') }));
}

const fmtT = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

// One round: every open note goes to the model in one call (motion model, as the cards are motion work), the cards and
// caption words change, the composition is rebuilt and the player reloads. No render: that waits for the approval.
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
    writeJSON(reviewFile(id), r);
  };
  // an agent-composed reel is changed by its composer, which takes the notes as one adjustment and renders out.mp4 itself
  if (composedByAgent(st0)) {
    const note = open.map(n => `[${fmtT(n.t)}${n.end !== undefined ? `–${fmtT(n.end)}` : ''}${n.x !== undefined ? ` · ponto x=${n.x.toFixed(0)}% y=${n.y!.toFixed(0)}% do quadro` : ''}] ${n.text}`).join('\n');
    const r = await compose(id, `Anotações da revisão (tempo no vídeo · ponto marcado no quadro · pedido):\n${note}`);
    reply(readReview(id), new Map(open.map(n => [n.id, { done: true, reply: 'Aplicada pelo compositor junto com as outras anotações da rodada.' }])));
    return { ...getReview(id), summary: r.summary };
  }
  return locked(id, 'review', async st => {
    agentOnly(st);
    const P = projDir(id), brand = writeBrand(st);
    const edit = readJSON(join(P, 'edit.json'));
    const dur = Math.round((await duration(id, join(P, 'master.mp4')) - 0.02) * 100) / 100;
    const palette = [...paletteOf(brand), ...Object.values<string>(siteRef(st)?.siteColors ?? {})];
    const system = `${vocabulary()}\n\n# Brand rules (brand.md)\n${readFileSync(join(P, 'brand.md'), 'utf8')}\n\n${formatCardsOf(st)}` +
      'You revise an edited reel from the reviewer\'s notes. Each note has t (seconds into the reel), end when it covers a stretch t..end instead of a single moment, and, when the reviewer pointed at ' +
      'the frame, x/y in % of the 1080x1920 frame from the top-left. What is on screen at t: the captions and cards whose start..end ' +
      'contain t. Apply every note you can: change, retime, add or remove cards, and fix caption words (wrong transcription, spelling) ' +
      'with caption_fixes. You cannot recut the source video or change the voice: answer those notes with done=false and say why.\n' +
      'Return only what changes: changes[] with index = the card index to replace, or -1 for a new card; remove[] with card indices; ' +
      'replies[] with one entry per note id: done, and one short sentence in Brazilian Portuguese of what you did.\n' + CUSTOM_RULES;
    const data = {
      duration: dur, brand,
      cards: edit.cards.map((c: any, index: number) => ({ index, ...c })),
      captions: edit.captions.map((c: any, caption: number) => ({ caption, start: c.start, end: c.end, words: c.words.map((w: any, word: number) => ({ word, t: w.t, text: w.text })) })),
      notes: open.map(({ id, t, end, x, y, text }) => ({ id, t, end, x, y, text })),
    };
    const schema = obj({
      changes: { type: 'array', items: BATCH_CARD_ITEM(cardTypes(st)) },
      remove: { type: 'array', items: num },
      caption_fixes: { type: 'array', items: obj({ caption: num, word: num, text: str }) },
      replies: { type: 'array', items: obj({ id: str, done: { type: 'boolean' }, reply: str }) },
    });
    type Res = { changes: { index: number; type: string; start: number; end: number; props_json: string }[]; remove: number[]; caption_fixes: { caption: number; word: number; text: string }[]; replies: { id: string; done: boolean; reply: string }[] };
    // remove[] holds indices of the cards as sent, so it applies after the replacements (new cards go past the end)
    const merge = (r: Res, skipInvalid: boolean) => {
      const out = edit.cards.slice();
      for (const ch of r.changes ?? []) {
        const card = toCard(ch, brand);
        if (skipInvalid && validateCard(card, dur, palette).length) continue;   // still invalid after the retry: old card stays, a new one is dropped
        if (Number.isInteger(ch.index) && ch.index >= 0 && ch.index < out.length) out[ch.index] = card; else out.push(card);
      }
      const gone = new Set(r.remove ?? []);
      return out.filter((_: any, i: number) => !gone.has(i));
    };
    let res!: Res, cards: any[] = [], errors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await ask<Res>('motion', 'review:apply', {
        system,
        content: JSON.stringify(data) + (errors.length ? `\n\nYour previous answer had these problems, return the full corrected answer:\n${errors.join('\n')}` : ''),
        schema,
      }, logCost(st));
      cards = merge(res, false);
      errors = cards.flatMap((c, i) => validateCard(c, dur, palette).map(e => `card ${i} (${c.type}): ${e}`));
      if (!errors.length) break;
    }
    if (errors.length) {
      emit(id, 'log', `cards inválidos descartados: ${errors.join(' | ')}`);
      cards = merge(res, true);
    }
    for (const f of res.caption_fixes ?? []) {
      const w = edit.captions[f.caption]?.words?.[f.word], text = String(f.text ?? '').trim();
      if (w && text) w.text = text;
    }
    edit.cards = cards.sort((a, b) => a.start - b.start);
    writeJSON(join(P, 'edit.json'), edit);
    const r = readReview(id);
    reply(r, new Map((res.replies ?? []).map(a => [a.id, a])));
    await commit(id, `review: round ${r.round}, ${open.length} notes`);
    await buildLive(id, st);
    return { ...getReview(id), warnings: errors };
  });
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
      await run(id, 'npx', ['--yes', 'hyperframes@0.8.192', 'render', '-o', 'out.mp4', '--fps', '30', '--quality', 'delivery'], {}, false, dir);
      // the composer mixes voice + sfx without a master loudness pass: bring it to the -14 LUFS that qa.py expects
      await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', join(dir, 'out.mp4'), '-c:v', 'copy',
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', join(P, 'final.mp4')]);
    } else await run(id, 'bash', [join(S, 'render.sh'), P, '--final'], { REEL_FORMAT: format, REEL_AFTER_BUILD: EDITS_CLI, ...await renderEnv(id, st) });
    const qa = await run(id, 'python3', [join(S, 'qa.py'), P], { REEL_FORMAT: format }, true);
    runs.push({ format, pass: qa.code === 0, out: qa.out.trim() });
    renameSync(join(P, 'final.mp4'), join(P, finalName(format)));   // render.sh always writes final.mp4
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
  // the composition the review player plays (proj/ or compose/), loaded in the HyperFrames runtime, manual edits included
  const htmlFile = join(liveDir(st), "index.html");
  if (!existsSync(htmlFile)) fail("O projeto precisa ter a composição montada (abra a Revisão) para exportar para o After Effects.");
  syncEdits(liveDir(st), P);

  const aepPath = join(aeDir, `${id}.aep`);
  // no catch: when make_jsx.mjs fails (missing puppeteer-core, Chrome or ffmpeg) the user must see it, not an "ok" with no .aep
  await run(id, "node", [scriptPath, "--html", htmlFile, "--out", aeDir, "--aep", aepPath, "--name", id]);
  
  const runJsxPath = join(aeDir, "run.jsx");
  let aepGenerated = existsSync(aepPath);
  if (!aepGenerated && existsSync(runJsxPath) && process.platform === "darwin") {
    try {
      const aeApp = existsSync("/Applications/Adobe After Effects 2026") ? "Adobe After Effects 2026"
        : existsSync("/Applications/Adobe After Effects 2025") ? "Adobe After Effects 2025"
        : existsSync("/Applications/Adobe After Effects 2024") ? "Adobe After Effects 2024"
        : "Adobe After Effects";
      await run(id, "osascript", ["-e", `tell application "${aeApp}" to DoScriptFile "${runJsxPath}"`]).catch(() => null);
      aepGenerated = existsSync(aepPath);
    } catch {}
  }
  
  await commit(id, "export: After Effects (.jsx e projeto)");
  emit(id, "ae:done", { outputDir: aeDir, aep: aepPath, aepGenerated });
  return { ok: true, outputDir: aeDir, aep: aepPath, aepGenerated };
});

export const generateHooks = (id: string) => locked(id, "embrulhos", async st => {
  const P = projDir(id);
  const scriptFile = join(P, "script.json");
  if (!existsSync(scriptFile)) fail("script.json não encontrado. Conclua a etapa de roteiro.");
  const scriptData = readJSON(scriptFile);
  const fullText = (scriptData.moments || []).map((m: any) => m.texto).join(" ");
  
  const prompt = `Analise o roteiro a seguir de um vídeo curto de alta retenção e gere EXATAMENTE 3 ganchos / embrulhos diferentes para os primeiros 3 a 4 segundos do vídeo.
Cada gancho deve explorar um ângulo psicológico forte:
1. Curiosidade / Pergunta (Quebra de padrão irresistível)
2. Dor / Urgência (Consequência direta de não agir)
3. Promessa / Benefício Rápido (Revelação imediata)

Roteiro completo:
"${fullText}"

Responda em formato JSON com o seguinte schema:
{
  "embrulhos": [
    { "tipo": "curiosidade", "titulo": "...", "copy": "...", "texto_card": "...", "tempo_segundos": 3.5 },
    { "tipo": "dor", "titulo": "...", "copy": "...", "texto_card": "...", "tempo_segundos": 3.5 },
    { "tipo": "promessa", "titulo": "...", "copy": "...", "texto_card": "...", "tempo_segundos": 3.5 }
  ]
}`;

  const res = await ask<any>("script", "embrulhos:generate", {
    system: "Você é um estrategista de conteúdo e copywriting especialista em ganchos e retenção para Reels/TikTok.",
    content: prompt,
    schema: obj({
      embrulhos: {
        type: "array",
        items: obj({
          tipo: str,
          titulo: str,
          copy: str,
          texto_card: str,
          tempo_segundos: num
        })
      }
    })
  }, logCost(st));

  const embrulhosData = res.embrulhos ?? [];
  writeJSON(join(P, "embrulhos.json"), { generatedAt: Date.now(), embrulhos: embrulhosData });
  await commit(id, "embrulhos: geradas 3 variações de gancho");
  emit(id, "embrulhos:done", { embrulhos: embrulhosData });
  return { ok: true, embrulhos: embrulhosData };
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

export async function ensureCutout(id: string, force = false) {
  const P = projDir(id);
  const master = join(P, 'master.mp4');
  const raw = rawClip(P);
  const videoInput = existsSync(master) ? master : raw;
  if (!existsSync(videoInput)) fail('Nenhum vídeo disponível no projeto para recorte');
  const st: State = readJSON(join(P, 'state.json'));
  const m = statSync(videoInput), key = `${m.size}:${Math.floor(m.mtimeMs / 1000)}${st.character ? `:${st.character.name}:${characterPose(st).pose.name}:${statSync(characterPose(st).pose.file).mtimeMs}` : ''}`;
  const out = join(P, 'cutout.webm'), meta = join(P, 'cutout.json');
  if (!force && existsSync(out) && existsSync(meta) && readJSON(meta).key === key) return { cached: true };
  if (st.character) {
    await characterCutout(id, st, out, (await probeMedia(videoInput)).duration);
    writeJSON(meta, { key, engine: 'character' });
    return { cached: false };
  }

  const rvmPy = join(homedir(), '.cache/rvm-venv/bin/python'), rvmModel = join(homedir(), '.cache/rvm-model/rvm_mobilenetv3_fp32.onnx');
  if (existsSync(rvmPy) && existsSync(rvmModel)) {
    emit(id, 'log', '✂ Recortando o locutor com RVM (≈5 min por minuto de vídeo)...');
    await run(id, rvmPy, [join(S, 'rvm.py'), rvmModel, videoInput, out, '0.4']);
    writeJSON(meta, { key, engine: 'rvm' });
    return { cached: false };
  }
  // fallback: Apple Vision when the RVM venv/model are missing. The guide requires RVM (Vision cut the arms in some scenes), so say so.
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
    writeJSON(meta, { key, frames: last });
    return { cached: false, framesCount: last };
  } finally {
    rmSync(framesDir, { recursive: true, force: true }); rmSync(cutoutDir, { recursive: true, force: true });
  }
}

// Alpha smoothing: tmix steadies the mask over time, erosion drops the old-background fringe, gblur softens hair and glasses.
// Any source fits (never stretches) into the 1920x1080 stage the compose kit expects; a vertical one becomes a centred strip.
const FIT_STAGE = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
// Face centre on the 1920 stage: the nose track's mean (a fraction of the source width) placed by FIT_STAGE; 980 of a 1920 source when there is no track.
function faceXOf(P: string, width: number, height: number) {
  const track: number[][] = existsSync(join(P, 'nose.json')) ? readJSON(join(P, 'nose.json')).track : [];
  const fw = Math.min(1920, width * 1080 / height);
  return Math.round((1920 - fw) / 2 + (track.length ? track.reduce((s, t) => s + t[1], 0) / track.length : 980 / 1920) * fw);
}
const CUTOUT_SMOOTH = "format=rgba,split[c][b];[b]alphaextract,tmix=frames=3:weights='1 2 1',erosion,gblur=sigma=1.2[m];[c][m]alphamerge";

// Background plate (blurred 9:16 centre crop of any orientation) and normalized voice, for the agent composer.
async function ensureComposeMedia(id: string) {
  const P = projDir(id), master = join(P, 'master.mp4');
  if (!existsSync(master)) return;
  // landscape: the plate is the 608 px strip centred on the face of the 1920 stage (GUIDE §2); other shapes keep the centre crop
  const { width, height } = await probeMedia(master);
  const x0 = width > height ? Math.min(1312, Math.max(0, faceXOf(P, width, height) - 304)) : null;
  const key = x0 === null ? 'centro' : String(x0), meta = join(P, 'plate.json');
  if (!existsSync(join(P, 'plate.mp4')) || !existsSync(meta) || readJSON(meta).key !== key) {
    const vf = x0 === null ? 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960,gblur=sigma=18,scale=1080:1920:flags=bicubic'
      : `${FIT_STAGE},crop=608:1080:${x0}:0,scale=540:960:flags=bicubic,gblur=sigma=18,scale=1080:1920:flags=bicubic`;
    await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', master, '-vf', vf,
      '-an', '-c:v', 'libx264', '-crf', '22', '-g', '30', '-pix_fmt', 'yuv420p', join(P, 'plate.mp4')]);
    writeJSON(meta, { key });
  }
  if (!existsSync(join(P, 'voice.m4a'))) await run(id, 'ffmpeg', ['-y', '-v', 'error', '-i', master, '-vn', '-af', 'highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=9',
    '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', join(P, 'voice.m4a')]);
}

// Agent composer workspace: <project>/compose/ with the kit, the guide, assets and an auto-written brief.md. Safe to re-run: kit, assets and brief are refreshed, scenes.py is kept.
// Largura × altura de cada proporção: a composição de outro formato é feita nesse quadro
const ASPECT_SIZE: Record<string, [number, number]> = { '9:16': [1080, 1920], '16:9': [1920, 1080], '4:5': [1080, 1350], '1:1': [1080, 1080], '4:3': [1440, 1080] };
const primaryAspect = (st: State): string => { try { return getFormat(st.formatId || 'business-reels').aspectRatio ?? '9:16'; } catch { return '9:16'; } };
// compose/ holds the project's own aspect; every other aspect gets compose-<aspect> beside it (same assets, own scenes.py)
const composeDirName = (st: State, aspect?: string | null, motion = false) =>
  motion ? 'compose-motion' : aspect && aspect !== primaryAspect(st) ? `compose-${aspect.replace(':', '-')}` : 'compose';
export const composeDirOf = (P: string, st: State, aspect?: string | null) => join(P, composeDirName(st, aspect));

export async function composeScaffold(id: string, motion = false, aspect?: string | null) {
  const P = projDir(id), st = readJSON(join(P, 'state.json')), C = join(P, composeDirName(st, aspect, motion)), A = join(C, 'assets');
  await ensureComposeIgnored(id);
  if (!motion) await ensureCutout(id);
  await ensureComposeMedia(id);
  for (const d of ['fonts', 'img', 'sfx']) mkdirSync(join(A, d), { recursive: true });
  const K = join(SKILL, 'compose');
  copyFileSync(join(K, 'kit.py'), join(C, 'kit.py'));
  copyFileSync(join(K, motion ? 'GUIDE-motion.md' : 'GUIDE.md'), join(C, 'GUIDE.md'));
  // the HyperFrames catalog motions cached in engine/hf, offered in GUIDE.md; kept out of compositions/, which render() empties
  const HF = join(SKILL, 'engine/hf/compositions');
  mkdirSync(join(C, 'motions'), { recursive: true });
  for (const d of [HF, join(HF, 'components')]) for (const f of readdirSync(d).filter(f => f.endsWith('.html'))) copyFileSync(join(d, f), join(C, 'motions', f));
  for (const f of readdirSync(join(K, 'sfx'))) copyFileSync(join(K, 'sfx', f), join(A, 'sfx', f));
  for (const [from, to] of [['cutout.webm', 'cut.webm'], ['plate.mp4', 'plate.mp4'], ['voice.m4a', 'voice.m4a'], ['transcript.json', 'transcript.json']].filter(([f]) => !motion || f === 'voice.m4a' || f === 'transcript.json')) copyFileSync(join(P, from), join(A, to));
  const brand = existsSync(join(P, 'brand.json')) ? readJSON(join(P, 'brand.json')) : getBrand(st.brand);
  const fontDir = join(brandDir(st.brand), 'fonts'), fontFile = brand.fonts?.head?.file && existsSync(brand.fonts.head.file) ? brand.fonts.head.file
    : existsSync(fontDir) ? (readdirSync(fontDir).filter(f => !f.startsWith('.') && /\.(otf|ttf|woff2?)$/i.test(f)).map(f => join(fontDir, f))[0] ?? '') : '';
  if (fontFile) copyFileSync(fontFile, join(A, 'fonts/font.otf'));
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

  // Paleta: se houver siteColors na referência, prioriza para o motion
  const refJsonPath = join(P, 'reference.json');
  const refData = existsSync(refJsonPath) ? readJSON(refJsonPath) : null;
  const siteCol = refData?.siteColors;
  const colors = motion
    ? (siteCol ? { RED: siteCol.RED, RED2: siteCol.RED2, AMB: siteCol.AMB, BLK: siteCol.BLK, CRM: siteCol.CRM } : { RED: '#E61C1C', RED2: '#A61919', AMB: '#FFB600', BLK: '#000000', CRM: '#FFFAEA' })
    : { RED: siteCol?.RED ?? c.main ?? '#E61C1C', RED2: siteCol?.RED2 ?? c.main ?? '#A61919', AMB: siteCol?.AMB ?? c.caption_accent ?? '#FFB600', BLK: siteCol?.BLK ?? '#000000', CRM: siteCol?.CRM ?? c.light ?? '#FFFAEA' };

  const fmt: any = getFormat(st.formatId || 'business-reels');
  const other = aspect && aspect !== primaryAspect(st) && !motion ? aspect : null;
  const targetAspect = other ?? fmt.aspectRatio ?? '9:16';
  const [targetW, targetH] = other ? ASPECT_SIZE[other] ?? fail(`formato sem tamanho: ${other}`) : [fmt.width ?? 1080, fmt.height ?? 1920];
  const safeZones = !other && fmt.visualAssets?.safeZones || {
    top: Math.round(targetH * 0.104),
    bottom: Math.round(targetH * 0.198),
    left: Math.round(targetW * 0.065),
    right: Math.round(targetW * 0.065),
  };

  writeJSON(join(C, 'compose.json'), {
    W: targetW,
    H: targetH,
    aspectRatio: targetAspect,
    safeZone: safeZones,
    DUR: Math.round(duration * 100) / 100,
    faceX,
    speaker: !motion,
    colors,
    fonte: { w: width, h: height },
    layoutCheck: join(ROOT, 'server/layout_check.mjs')
  });
  writeJSON(join(C, 'hyperframes.json'), { $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true }, authoringSkill: 'hyperframes' });
  const hf = (cmd: string) => `npx --yes hyperframes@0.8.192 ${cmd}`;
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
  const srt = existsSync(join(P, 'source.srt')) ? readFileSync(join(P, 'source.srt'), 'utf8').replace(/^﻿/, '') : '';
  const brandMd = existsSync(join(brandDir(st.brand), 'brand.md')) ? readFileSync(join(brandDir(st.brand), 'brand.md'), 'utf8') : '';
  const refFile = join(P, 'reference.json'), refAnalysis = existsSync(refFile) ? Object.entries(readJSON(refFile)).map(([k, v]) => `- ${k}: ${v}`).join('\n') : '';
  const imgFiles = existsSync(join(A, 'img')) ? readdirSync(join(A, 'img')).filter(f => !f.startsWith('.')) : [];
  const imgDesc = imgFiles.length ? `img/ (${imgFiles.length} imagens da referência disponíveis: ${imgFiles.join(', ')}; olhe cada uma com Read antes de usar, e mostre com <img src="assets/img/..."> em back/front)` : 'img/ (vazio)';

  writeFileSync(join(C, 'brief.md'), [`# Briefing: ${st.name}`,
    `Formato ${targetAspect} (${targetW}×${targetH}), ${Math.round(duration * 100) / 100} s, 30 fps. Centro do rosto do locutor: x≈${faceX} de ${width} (já em compose.json).`,
    other && existsSync(join(P, 'compose', 'scenes.py')) ? `## Adaptação do Formato Original\nA composição original do formato primário já foi pré-carregada em scenes.py. Adapte enquadramentos de câmera (FR), tamanhos de fontes, margens, zonas de segurança e posições/tamanhos de texto e elementos para a resolução ${targetW}×${targetH} (${targetAspect}).` : '',
    st.referenceUrl || st.referenceNote ? `## Referência de estilo\n${st.referenceUrl ?? ''}\n${st.referenceNote ?? ''}\nOs quadros da referência (se houver) estão em ../ref/.` : '',
    motion ? `## Referência visual: site da marca\nSem locutor na tela. Leia ref_site/site.md e olhe as imagens de ref_site/ (Read). Paleta em compose.json (RED, RED2, AMB, BLK, CRM) já é a do site.`
      : siteRef(st) ? `## Marca (${st.brand}) e site\nPaleta em compose.json (RED, RED2, AMB, BLK, CRM) já é a do site, que é a campanha atual: ela vence as cores do brand.md. Do brand.md valem só o tom e a fonte.\nOlhe ../ref/top_mobile.png e ../ref/top_desktop.png com Read: o print mostra qual cor é fundo, destaque e botão.\n${referenceGuide(st)}\n\n${brandMd.replace(/## Cores[\s\S]*?(?=\n## |$)/, '')}`
      : `## Marca (${st.brand})\nPaleta mapeada em compose.json (RED, RED2, AMB, BLK, CRM; ajuste se o brand.md pedir outra).\n\n${brandMd}`,
    !motion ? `## Estilo do formato escolhido (${fmt.name})\nAplique este estilo tipográfico dentro das regras do GUIDE.md; o que ele proíbe sobre imagens não vale quando há site.\n${(fmt.promptGuide ?? '').replace(/[^.]*(só texto|sem imagens)[^.]*\.\s*/gi, '')}\n${(fmt.styleCatalog ?? []).map((x: string) => `- ${x}`).join('\n')}\n${formatSkill(fmt.id) ? `## Skill do estilo (regras do usuário, valem sobre o resto)\n${formatSkill(fmt.id)}\n` : ''}${fmt.sfxRules?.length ? `## Efeitos sonoros do estilo (nomes em assets/sfx/manifest.json)${fmt.sfxGainDb ? `\nGanho geral dos SFX: ${fmt.sfxGainDb} dB.` : ''}${fmt.sfxForbidden?.length ? `\nProibido: ${fmt.sfxForbidden.join(', ')}.` : ''}\n${fmt.sfxRules.map((r: any) => `- ${r.when} → ${r.sfx || '(sem som equivalente)'} (${r.level})`).join('\n')}` : ''}\n${fmt.motionRecipes?.length ? `## Receitas de movimento do estilo (GSAP)\n${fmt.motionRecipes.map((r: any) => `- ${r.name} (${r.use}): ${r.gsap}`).join('\n')}` : ''}` : '',
    !motion && refAnalysis && !siteRef(st) ? `## Análise da referência (reference.json)\nÉ o estilo a reproduzir. Olhe os quadros em ../ref/ com Read antes de escrever.\n${refAnalysis}` : '',
    !motion && script.moments?.length ? `## Momentos do roteiro\nUm bloco por momento: tempo, fala e ação visual sugerida. O kit.py é opcional: use um helper só quando ele for a melhor ideia para o momento.\n${script.moments.map((m: any) => `- ${m.t_start}s–${m.t_end}s · "${m.texto ?? ''}" · ${m.visual_action ?? ''}`).join('\n')}` : '',
    charLines.length || brand.animation?.style ? `## Brandkit de animação\n${brand.animation?.style ? `Estilo de movimento: ${brand.animation.style}\n` : ''}${charLines.length ? `Personagens (PNG com fundo transparente; olhe cada um com Read). Anime entrada, gesto e troca de pose em GSAP, escolhendo a pose pela emoção da fala. Sem boca sincronizada: o personagem é voz em off, só reage.${st.character ? ` O locutor (cut.webm) é o personagem ${st.character.name}, parado e respirando: faça-o reagir com câmera e com as outras poses por cima (front), nunca invente outro rosto.` : ''}\n${charLines.join('\n')}` : ''}` : '',
    script.accentWords?.length ? `## Palavras-chave sugeridas\n${script.accentWords.join(', ')}` : '',
    srt ? `## Roteiro e tempos (.srt)\n${srt}` : '',
    `## Transcript por palavra\nassets/transcript.json (${words.length} palavras).`,
    motion ? `## Assets\nvoice.m4a (narração), fonts/font.otf (peso 600), ${imgDesc}, sfx/ (ver sfx/manifest.json). Sem locutor.`
      : `## Assets\ncut.webm (locutor, alfa), plate.mp4 (fundo desfocado), voice.m4a, fonts/font.otf (peso 600), ${imgDesc}, sfx/ (ver sfx/manifest.json).`,
    `Siga GUIDE.md. Escreva scenes.py, valide, olhe os snapshots e corrija antes de renderizar.`].filter(Boolean).join('\n\n'));
  return { dir: C };
}

// Agent composer (formats with composer: "agent"): Opus writes compose/scenes.py, which writes compose/index.html, and loops check + snapshot.
// The review player plays that index.html live; only final() renders it. The motion-only test (mode "motion") still renders preview-motion.mp4.
// shortcut: no partial re-render; an adjustment ("ajuste") reruns the agent on the same compose/ folder
export const compose = (id: string, note?: string, mode?: string, aspect?: string) => locked(id, 'motion', async st => {
  const motion = mode === 'motion';
  const P = projDir(id);
  if (!usesAgent(st)) fail('Este formato não usa o compositor agent');
  // another format: its own composition; the message names what came in, so a stale UI value is obvious in the log
  const other = aspect && aspect !== primaryAspect(st) && !motion ? pickFormats([aspect])?.[0] ?? fail(`formato ${JSON.stringify(aspect)} não existe: use ${FORMATS.join(', ')}`) : null;
  await composeScaffold(id, motion, other);
  const C = composeDirOf(P, st, other);
  emit(id, 'log', motion ? '🎬 Claude está compondo o reel (escrita, check, snapshots e render)...' : `🎬 Claude está compondo o reel${other ? ` em ${other}` : ''} (escrita, check e snapshots, sem render)...`);
  const agentFmt: any = getFormat(st.formatId || 'business-reels');
  const targetAspect = other ?? agentFmt.aspectRatio ?? '9:16';
  const [targetW, targetH] = other ? ASPECT_SIZE[other] : [agentFmt.width ?? 1080, agentFmt.height ?? 1920];
  const system = (motion ? `You are an elite motion designer composing a ${targetAspect} (${targetW}x${targetH}) motion-graphics and infographic reel with NO speaker on screen, as a HyperFrames project, working only inside the current folder. `
    : `You are an elite motion designer composing a ${targetAspect} (${targetW}x${targetH}) reel as a HyperFrames project, working only inside the current folder. `) +
    'Read brief.md and GUIDE.md first. Follow brief.md: build each scene from the script moments listed there.kit.py and the motions/ components in GUIDE.md are an optional library: invent the motion each moment deserves and use a helper or component only when it is the best idea.Tipografias gigantes e elementos descritos como atrás do locutor DEVEM ser colocados em back (nunca em front sobrepondo o locutor). Never use artificial thick text strokes (-webkit-text-stroke) over the speaker when the text was planned behind him. Follow GUIDE.md for technical execution, framing, and deterministic GSAP. ' +
    'Loop: write scenes.py, run it (it also runs the speaker layout check: its errors stop the render, its warnings must be fixed or justified; the check writes review/recorte.png, the green-screen cut sheet to Read), run hyperframes check (fix all errors), take snapshots and LOOK at the contact sheets with Read, fix what you see' +
    (motion ? ', then render out.mp4. ' : '. Do NOT render a video: the reviewer plays index.html live, and the final render happens later. ') +
    'Review rule: score the contact sheet 1-10 on hook (first 2 s), legibility at phone size, motion quality, variety, brand fidelity; fix the 3 worst and repeat until all are 8+. Every timed object must be hidden at the start of each seek so none lingers as a ghost. ' +
    'Never touch assets/ except to add files. Finish with one short paragraph: what you built and any known issue.';
  const prompt = note ? `Ajuste pedido sobre a composição atual (scenes.py já existe): ${note}\nEdite scenes.py e rode \`python3 -B scenes.py\` de novo (o player e os snapshots leem o index.html que ele gera, não o scenes.py). Depois valide e olhe os snapshots. Não renderize vídeo.`
    : motion ? 'Componha o reel completo agora. Termine com out.mp4 renderizado (npx --yes hyperframes@0.8.192 render -o out.mp4 --fps 30 --quality delivery).'
    : other ? `Adapte a composição original (já pré-carregada em scenes.py a partir do formato primário) para o novo formato ${targetAspect} (${targetW}x${targetH}). Ajuste layouts, zonas de segurança, enquadramentos de câmera (FR) e posições/tamanhos de texto para esta proporção. Termine com scenes.py rodado (index.html gerado), check sem erros e snapshots revisados. Não renderize vídeo.`
    : 'Componha o reel completo agora. Termine com scenes.py rodado (index.html gerado), check sem erros e snapshots revisados. Não renderize vídeo.';
  const started = Date.now();
  rmSync(join(C, 'out.mp4'), { force: true });   // a stale out.mp4 from the last run must not pass as this run's result
  const summary = await agent('compose', { system, prompt, cwd: C, noRender: !motion }, logCost(st));
  if (motion) {
    if (!existsSync(join(C, 'out.mp4'))) fail(`O compositor não gerou out.mp4: ${summary.slice(0, 300)}`);
    copyFileSync(join(C, 'out.mp4'), join(P, 'preview-motion.mp4'));   // o teste só motion não sobrescreve o preview com locutor
    emit(id, 'preview', { file: 'preview-motion.mp4' });
  } else {
    // scenes.py edited but never run would leave the player on the old composition while the notes read as applied
    // index.html is also rewritten by the Edição step (marked): then its pristine copy index.ai.html says whether scenes.py ran
    const html = join(C, 'index.html'), ai = join(C, 'index.ai.html');
    const fresh = existsSync(html) && statSync(html).mtimeMs >= started && !readFileSync(html, 'utf8').startsWith('<!--hf-edits-->') || existsSync(ai) && statSync(ai).mtimeMs >= started;
    if (!fresh) fail(`O compositor não gerou um index.html novo (rode scenes.py): ${summary.slice(0, 300)}`);
    emit(id, 'built', {});
  }
  if (!motion && stepRank(st.step) < stepRank('motion')) st.step = 'motion';
  if (other && !st.formats.includes(other)) st.formats.push(other);
  save(st);
  await commit(id, motion ? 'compose: versão só motion' : `compose: reel composto pelo agent${other ? ` (${other})` : ''}`);
  return { ok: true, summary };
});

export const cutoutPerson = (id: string, options?: { force?: boolean }) => locked(id, 'cutout', async () => {
  const r = await ensureCutout(id, !!options?.force);
  await ensureComposeMedia(id);
  emit(id, 'cutout:done', { ...r, file: `/projects/${id}/cutout.webm` });
  await commit(id, 'cutout: cutout.webm');
  return { ok: true, ...r };
});

