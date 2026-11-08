// Motion Think: Daniel teaches the editor one movement at a time. A reference excerpt comes in (upload or URL), a range is cut,
// Opus splits it into movements and the frames are shown; Daniel marks what he likes and why; Opus writes the movement as a
// kit helper and renders a demo with the stock speaker; Daniel validates (up to 3 rounds); approved helpers enter the bank (banco.ts).
// Lives in workspace/motion-think/<id>/ (third-party excerpts never leave it: the bank keeps the helper, the demo frame and an internal copy of one original frame).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync, appendFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { agent, ask, MAX_TURNS_HIT, type Cost } from './models.ts';
import { safeId } from './lib.ts';
import { PYTHON } from './host.ts';
import { addHelper, type Banco, type BancoHelper, CATEGORIAS, COMPOSE_DIR, copyBancoTo, dropNegativo, helperMd, helperName, helperParams, type Categoria, type Momento, MOMENTOS, readBanco, rollbackHelper, upsertNegativo } from './banco.ts';
import { duration, emit, execP, expandHome, intake, probeMedia, run, subscribe, UserError, WS } from './pipeline.ts';

export type Movimento = { m: number; a: number; b: number; nome: string; oque: string; elemento: string; camera: string; entrada: string; vida: string; saida: string;
  tipo: Record<string, string>; paleta: string[]; medidas: Record<string, number>; momentoSugerido: Momento; categoriaSugerida: Categoria };
export type Analysis = { movimentos: Movimento[] };
export type Pin = { t: number; x: number; y: number; text: string };
export type Nota = { veredito: 'gosto' | 'nao-gosto' | 'neutro'; momento?: Momento; categoria?: Categoria; tags: string[]; texto: string; pins: Pin[]; naoLevar: string };
export type Notes = { version: number; movimentos: Record<string, Nota> };
export type Veredito = { ok: boolean; texto: string; pins: Pin[]; at: string };
export type Round = { m: number; r: number; at: string; summary: string; helper?: string; veredito?: Veredito };
type MovState = { rodadas: number; status: 'novo' | 'sintetizando' | 'aguardando' | 'aprovado' | 'parado'; helper?: string; aprovadoEm?: string };
type State = { id: string; name: string; source: 'file' | 'url'; url?: string; src: string; duration?: number; in?: number; out?: number; thumbs?: number;
  status: 'baixando' | 'pronto' | 'cortado' | 'analisando' | 'analisado' | 'error'; error?: string; movimentos: Record<string, MovState>; cost: Cost[]; createdAt: string };

const DIR = join(WS, 'motion-think');
const KEY = (id: string) => `motion-think/${id}`;   // SSE channel (pipeline listeners are keyed by string; projects use their id)
const fail = (m: string): never => { throw new UserError(m); };
const dirOf = (id: string) => safeId(id) ? join(DIR, id) : fail('id inválido');
const readJSON = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const writeJSON = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));
const load = (id: string): State => existsSync(join(dirOf(id), 'state.json')) ? readJSON(join(dirOf(id), 'state.json')) : fail(`não existe o trecho ${id}`);
const save = (st: State) => writeJSON(join(dirOf(st.id), 'state.json'), st);
const log = (id: string, line: string) => { emit(KEY(id), 'log', line); appendFileSync(join(dirOf(id), 'log.txt'), line + '\n'); };
const logCost = (st: State) => (c: Cost) => { st.cost.push(c); save(st); emit(KEY(st.id), 'cost', c); };
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm'];
export const MAX_RANGE = 60, MAX_ROUNDS = 3, DEMO_DUR = 8;
const YT_DLP = process.env.YT_DLP ?? 'yt-dlp';
const ROOT = resolve(import.meta.dirname, '..');

// ---- one step at a time per session (in-process: the sessions are not shared between servers like the project locks) ----
const busy = new Map<string, { step: string; startedAt: number }>();
export const getBusy = (id: string) => busy.get(id) ?? null;
async function locked<T>(id: string, step: string, fn: (st: State) => Promise<T>): Promise<T> {
  const st = load(id);
  const cur = busy.get(id);
  if (cur) fail(`trecho ${id} ocupado (${cur.step} há ${Math.round((Date.now() - cur.startedAt) / 1000)} s)`);
  busy.set(id, { step, startedAt: Date.now() });
  emit(KEY(id), 'step', { step, status: 'start', startedAt: Date.now() });
  try { const r = await fn(st); emit(KEY(id), 'step', { step, status: 'done' }); return r; }
  catch (e) { emit(KEY(id), 'step', { step, status: 'error', error: (e as Error).message, quota: !!(e as { quota?: boolean }).quota }); log(id, `ERRO em ${step}: ${(e as Error).message}`); throw e; }
  finally { busy.delete(id); }
}
export const events = (id: string, fn: (ev: string, data: unknown) => void) => { load(id); return subscribe(KEY(id), fn); };

// ---- sessions --------------------------------------------------------------------------------------------------------
export const list = () => existsSync(DIR) ? readdirSync(DIR).filter(d => existsSync(join(DIR, d, 'state.json'))).map(d => {
  const s = load(d), an = analysisOf(d);
  return { id: s.id, name: s.name, status: s.status, in: s.in, out: s.out, movimentos: an?.movimentos.length ?? 0, aprovados: Object.values(s.movimentos).filter(x => x.status === 'aprovado').length, createdAt: s.createdAt };
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
const analysisOf = (id: string): Analysis | null => existsSync(join(dirOf(id), 'analysis.json')) ? readJSON(join(dirOf(id), 'analysis.json')) : null;
const notesOf = (id: string): Notes => existsSync(join(dirOf(id), 'notes.json')) ? readJSON(join(dirOf(id), 'notes.json')) : { version: 0, movimentos: {} };
function roundsOf(id: string): Round[] {
  const out: Round[] = [], R = join(dirOf(id), 'rounds');
  if (!existsSync(R)) return out;
  for (const m of readdirSync(R)) for (const r of existsSync(join(R, m)) ? readdirSync(join(R, m)) : []) if (existsSync(join(R, m, r, 'round.json'))) {
    const j: Round = readJSON(join(R, m, r, 'round.json'));
    if (existsSync(join(R, m, r, 'veredito.json'))) j.veredito = readJSON(join(R, m, r, 'veredito.json'));
    out.push(j);
  }
  return out.sort((a, b) => a.m - b.m || a.r - b.r);
}
export function get(id: string) {
  const st = load(id), an = analysisOf(id);
  const frames = (m: number) => { const d = join(dirOf(id), 'frames', String(m)); return existsSync(d) ? readdirSync(d).filter(f => /^\d+\.jpg$/.test(f)).sort() : []; };
  return { ...st, busy: getBusy(id), analysis: an ? { movimentos: an.movimentos.map(x => ({ ...x, frames: frames(x.m), sheet: existsSync(join(dirOf(id), 'frames', String(x.m), 'sheet.jpg')) })) } : null,
    notes: notesOf(id), rounds: roundsOf(id).map(r => ({ ...r, demo: existsSync(join(dirOf(id), 'rounds', String(r.m), String(r.r), 'demo.mp4')), sheet: existsSync(join(dirOf(id), 'rounds', String(r.m), String(r.r), 'sheet.jpg')),
      proposta: existsSync(join(dirOf(id), 'rounds', String(r.m), String(r.r), 'proposta.md')) ? readFileSync(join(dirOf(id), 'rounds', String(r.m), String(r.r), 'proposta.md'), 'utf8') : '' })),
    log: existsSync(join(dirOf(id), 'log.txt')) ? readFileSync(join(dirOf(id), 'log.txt'), 'utf8').split('\n').filter(Boolean).slice(-60) : [] };
}
export function remove(id: string) { load(id); if (busy.has(id)) fail('trecho ocupado'); rmSync(dirOf(id), { recursive: true, force: true }); return { ok: true }; }
// frames, trecho, thumbnails and demos: any file under the session folder, no `..`
export function file(id: string, rel: string) {
  load(id);
  const f = resolve(dirOf(id), rel);
  if (!f.startsWith(dirOf(id) + '/') || rel.split('/').includes('..') || !existsSync(f) || statSync(f).isDirectory()) fail(`sem ${rel}`);
  return f;
}

const slugOf = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export async function create(o: { name?: string; video?: string; url?: string }) {
  const url = typeof o?.url === 'string' ? o.url.trim() : '';
  const video = o?.video ? expandHome(String(o.video)) : '';
  if (!url && !video) fail('envie um vídeo ou um link');
  if (video && (!VIDEO_EXT.includes(extname(video).toLowerCase()) || !existsSync(video))) fail(`vídeo inválido ou não encontrado: ${video}`);
  if (url && !/^https?:\/\//i.test(url)) fail('link inválido');
  const name = String(o.name || (video ? basename(video, extname(video)) : url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))).trim();
  const id = `${new Date().toISOString().slice(0, 10)}-${slugOf(name) || 'trecho'}-${Date.now().toString(36).slice(-4)}`;
  mkdirSync(dirOf(id), { recursive: true });
  const st: State = { id, name, source: video ? 'file' : 'url', url: url || undefined, src: '', status: 'baixando', movimentos: {}, cost: [], createdAt: new Date().toISOString() };
  save(st);
  try {
    if (video) { st.src = join(dirOf(id), 'src' + extname(video).toLowerCase()); log(id, `▶ Guardando ${basename(video)}...`); intake(video, st.src); }
    else { st.src = join(dirOf(id), 'src.mp4'); log(id, `▶ Baixando ${url} (yt-dlp)...`); await execP(YT_DLP, ['-f', 'best[ext=mp4][height<=1080]/best[height<=1080]/best', '--force-overwrites', '-o', st.src, '--', url]); if (!existsSync(st.src)) fail('o yt-dlp não baixou o vídeo'); }
    st.duration = await duration(KEY(id), st.src);
    // a strip of thumbnails every 2 s for the range picker
    mkdirSync(join(dirOf(id), 'thumbs'), { recursive: true });
    await run(KEY(id), 'ffmpeg', ['-v', 'error', '-y', '-i', st.src, '-vf', 'fps=1/2,scale=160:-2', '-q:v', '4', join(dirOf(id), 'thumbs', '%03d.jpg')]);
    st.thumbs = readdirSync(join(dirOf(id), 'thumbs')).length;
    st.status = 'pronto'; save(st);
    log(id, `✓ ${Math.round(st.duration)} s. Escolha o trecho (início e fim, até ${MAX_RANGE} s).`);
  } catch (e) { st.status = 'error'; st.error = (e as Error).message; save(st); throw e; }
  return get(id);
}

// in/out → trecho.mp4 (30 fps, 1080 px wide at most). A new range drops the analysis, frames, notes and rounds: they belonged to the old excerpt.
export const setRange = (id: string, o: { in?: unknown; out?: unknown }) => locked(id, 'range', async st => {
  const a = Number(o?.in), b = Number(o?.out), dur = st.duration ?? 0;
  if (!(a >= 0 && b > a && b <= dur + 0.05)) fail('trecho inválido: início e fim em segundos, dentro do vídeo');
  if (b - a > MAX_RANGE) fail(`trecho de no máximo ${MAX_RANGE} s (mais que isso é outro trecho)`);
  if (b - a < 1) fail('trecho de pelo menos 1 s');
  for (const f of ['trecho.mp4', 'analysis.json', 'notes.json', 'frames', 'rounds']) rmSync(join(dirOf(id), f), { recursive: true, force: true });
  await run(KEY(id), 'ffmpeg', ['-y', '-v', 'error', '-ss', a.toFixed(2), '-to', b.toFixed(2), '-i', st.src, '-vf', "fps=30,scale='min(1080,iw)':-2", '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', '-movflags', '+faststart', join(dirOf(id), 'trecho.mp4')]);
  st.in = +a.toFixed(2); st.out = +b.toFixed(2); st.status = 'cortado'; st.movimentos = {}; save(st);
  log(id, `✓ Trecho ${st.in}–${st.out} s pronto. Clique em Analisar.`);
  return get(id);
});

// Movements from the scene cuts: a segment under MIN_MOVE s joins its neighbour, one over MAX_MOVE s is split evenly. Pure, tested.
export const MIN_MOVE = 1, MAX_MOVE = 10;
export function splitMovements(cuts: number[], dur: number): [number, number][] {
  const ts = [0, ...cuts.filter(t => t > 0.05 && t < dur - 0.05).sort((x, y) => x - y), dur];
  let segs: [number, number][] = [];
  for (let k = 0; k + 1 < ts.length; k++) if (ts[k + 1] - ts[k] > 1e-3) segs.push([ts[k], ts[k + 1]]);
  // merge short ones into the shorter neighbour until none is short (or only one remains)
  for (;;) {
    const k = segs.findIndex(s => s[1] - s[0] < MIN_MOVE);
    if (k < 0 || segs.length < 2) break;
    const left = k > 0 ? segs[k - 1][1] - segs[k - 1][0] : Infinity, right = k + 1 < segs.length ? segs[k + 1][1] - segs[k + 1][0] : Infinity;
    if (left <= right) { segs[k - 1][1] = segs[k][1]; segs.splice(k, 1); } else { segs[k + 1][0] = segs[k][0]; segs.splice(k, 1); }
  }
  const out: [number, number][] = [];
  for (const [a, b] of segs) { const n = Math.ceil((b - a) / MAX_MOVE); for (let i = 0; i < n; i++) out.push([a + (b - a) * i / n, a + (b - a) * (i + 1) / n]); }
  return out.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
}

// frames of one movement: 8 fps jpgs, a contact sheet (sheet.jpg, up to 24 tiles) and one full-width frame from the middle (mid.jpg)
async function extractFrames(id: string, trecho: string, dir: string, a: number, b: number) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const d = Math.max(0.2, b - a);
  await run(KEY(id), 'ffmpeg', ['-y', '-v', 'error', '-ss', a.toFixed(3), '-t', d.toFixed(3), '-i', trecho, '-vf', 'fps=8,scale=540:-2', '-q:v', '3', join(dir, '%03d.jpg')]);
  const fps = Math.min(4, 24 / d), cols = 6, rows = Math.max(1, Math.min(4, Math.ceil(fps * d / cols)));
  await run(KEY(id), 'ffmpeg', ['-y', '-v', 'error', '-ss', a.toFixed(3), '-t', d.toFixed(3), '-i', trecho, '-vf', `fps=${fps.toFixed(3)},scale=270:-2,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', join(dir, 'sheet.jpg')]);
  await run(KEY(id), 'ffmpeg', ['-y', '-v', 'error', '-ss', (a + d / 2).toFixed(3), '-i', trecho, '-frames:v', '1', '-q:v', '2', join(dir, 'mid.jpg')]);
}
const sampleList = (dir: string, every = 4) => existsSync(dir) ? readdirSync(dir).filter(f => /^\d+\.jpg$/.test(f)).sort().filter((_, k) => k % every === 0).map(f => join(dir, f)) : [];

const str = { type: 'string' }, num = { type: 'number' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const MOV_SCHEMA = obj({ movimentos: { type: 'array', items: obj({ a: num, b: num, nome: str, oque: str, elemento: str, camera: str, entrada: str, vida: str, saida: str,
  tipo: { type: 'array', items: obj({ papel: str, desc: str }) }, paleta: { type: 'array', items: str }, medidas: { type: 'array', items: obj({ nome: str, valor: num }) },
  momentoSugerido: { type: 'string', enum: [...MOMENTOS] }, categoriaSugerida: { type: 'string', enum: [...CATEGORIAS] } }) } });

// Etapa mtAnalyze: scene cuts → candidate movements → frames → Opus reads them and describes each movement (it may join or split) → analysis.json + final frames.
export const analyze = (id: string) => locked(id, 'mtAnalyze', async st => {
  const trecho = join(dirOf(id), 'trecho.mp4');
  if (!existsSync(trecho)) fail('escolha o trecho (início e fim) antes de analisar');
  st.status = 'analisando'; save(st);
  const dur = await duration(KEY(id), trecho);
  log(id, '▶ Procurando as trocas de cena (ffmpeg scene > 0.3)...');
  const cuts = [...(await execP('ffmpeg', ['-v', 'info', '-i', trecho, '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'])).matchAll(/pts_time:([\d.]+)/g)].map(m => +m[1]);
  const cand = splitMovements(cuts, dur);
  log(id, `▶ ${cand.length} candidato(s) a movimento. Extraindo quadros a 8 fps...`);
  const pre = join(dirOf(id), 'frames', 'pre');
  for (const [k, [a, b]] of cand.entries()) await extractFrames(id, trecho, join(pre, String(k + 1)), a, b);
  log(id, '🧠 Opus lendo os quadros e separando os movimentos...');
  const r = await ask<{ movimentos: any[] }>('mtAnalyze', 'mt:analyze', {
    system: 'You are a motion designer taking apart a short reference excerpt (a reel or a piece of one) into MOVEMENTS: a movement is 1 to 10 s in which one thing happens on screen ' +
      '(a word lands and gets its satellites, a counter climbs, a card flips into the next, a camera push reveals). Read every contact sheet and frame you are given (Read), across the whole excerpt. ' +
      'You get candidate segments from a scene-change detector: keep, join or split them so each movement is one thing happening; cover the whole excerpt without gaps (a and b in seconds of the excerpt, ' +
      'contiguous, the last b = the excerpt duration). For each movement describe only what MOVES and how, so another designer can rebuild the motion with other words, fonts and colours: ' +
      'nome (short title), oque (what happens, with proportions: "one upper-case word fills 85% of the width; three small words enter the corners one per beat"), elemento (tipografia, forma, imagem, 3d, locutor...), ' +
      'camera (parada, push, pan, orbit...), entrada / vida / saida (how it enters, what it does while on screen, how it leaves: property, from-to, ease, duration), tipo (the typography roles seen: ' +
      'papel = gigante|pequeno|legenda|numero..., desc = weight/case/size as a fraction of the frame height), paleta (approximate hex), medidas (numbers you can read off the frames: larguraPalavra as a fraction of the width, ' +
      'duracao in s, elementos count, alturaTexto as a fraction of the height, whatever is measurable), momentoSugerido (where in a talk this movement serves: gancho, prova, numero, lista, virada, cta) and ' +
      'categoriaSugerida (tipografia, infografico, 3d, transicao, camera). Ignore the sound. Never transcribe the on-screen words as content: they are data about size and rhythm only. Write in Brazilian Portuguese.',
    readDir: pre,
    content: `Excerpt: ${dur.toFixed(2)} s, ${cand.length} candidate segment(s) from the scene detector.\n` + cand.map(([a, b], k) => `Segment ${k + 1}: ${a}–${b} s. Contact sheet: ${join(pre, String(k + 1), 'sheet.jpg')}. Mid frame (full width): ${join(pre, String(k + 1), 'mid.jpg')}. Frames at 8 fps (every 4th listed; read more from the folder if a motion is unclear): ${sampleList(join(pre, String(k + 1))).join(', ')}`).join('\n') +
      '\n\nReturn the movements in time order.',
    schema: MOV_SCHEMA,
  }, logCost(st));
  // fix the timeline the model returned: sorted, clamped, contiguous
  const movs = r.movimentos.map(x => ({ ...x, a: Math.max(0, Math.min(dur, +Number(x.a).toFixed(2))), b: Math.max(0, Math.min(dur, +Number(x.b).toFixed(2))) })).filter(x => x.b - x.a >= 0.3).sort((x, y) => x.a - y.a);
  if (!movs.length) fail('o modelo não devolveu nenhum movimento');
  for (let k = 0; k < movs.length; k++) { if (k > 0) movs[k].a = movs[k - 1].b; if (k === movs.length - 1) movs[k].b = +dur.toFixed(2); }
  const analysis: Analysis = { movimentos: movs.filter(x => x.b - x.a >= 0.3).map((x, k) => ({ m: k + 1, a: x.a, b: x.b, nome: x.nome, oque: x.oque, elemento: x.elemento, camera: x.camera, entrada: x.entrada, vida: x.vida, saida: x.saida,
    tipo: Object.fromEntries((x.tipo ?? []).map((t: any) => [t.papel, t.desc])), paleta: x.paleta ?? [], medidas: Object.fromEntries((x.medidas ?? []).map((t: any) => [t.nome, t.valor])), momentoSugerido: x.momentoSugerido, categoriaSugerida: x.categoriaSugerida })) };
  log(id, `▶ ${analysis.movimentos.length} movimento(s). Extraindo os quadros finais...`);
  for (const mv of analysis.movimentos) await extractFrames(id, trecho, join(dirOf(id), 'frames', String(mv.m)), mv.a, mv.b);
  rmSync(pre, { recursive: true, force: true });
  writeJSON(join(dirOf(id), 'analysis.json'), analysis);
  rmSync(join(dirOf(id), 'notes.json'), { force: true }); rmSync(join(dirOf(id), 'rounds'), { recursive: true, force: true });
  st.movimentos = Object.fromEntries(analysis.movimentos.map(mv => [mv.m, { rodadas: 0, status: 'novo' as const }]));
  st.status = 'analisado'; save(st);
  log(id, `✓ ${analysis.movimentos.length} movimento(s): ${analysis.movimentos.map(mv => `${mv.m}. ${mv.nome} (${mv.a}–${mv.b} s)`).join('; ')}. Aponte o que gosta.`);
  return get(id);
});

// ---- notes (Daniel's marks per movement), versioned like review.json: a stale version is refused (two tabs) ----
const asPins = (v: unknown): Pin[] => Array.isArray(v) ? v.filter(p => p && typeof p === 'object').map(p => ({ t: Number(p.t) || 0, x: Number(p.x) || 0, y: Number(p.y) || 0, text: String(p.text ?? '').slice(0, 500) })) : [];
export function checkNota(v: any): Nota {
  if (!v || typeof v !== 'object') fail('apontamento inválido');
  if (!['gosto', 'nao-gosto', 'neutro'].includes(v.veredito)) fail('veredito: gosto, nao-gosto ou neutro');
  if (v.momento != null && v.momento !== '' && !MOMENTOS.includes(v.momento)) fail(`momento: ${MOMENTOS.join(', ')}`);
  if (v.categoria != null && v.categoria !== '' && !CATEGORIAS.includes(v.categoria)) fail(`categoria: ${CATEGORIAS.join(', ')}`);
  return { veredito: v.veredito, momento: v.momento || undefined, categoria: v.categoria || undefined, tags: Array.isArray(v.tags) ? v.tags.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 12) : [],
    texto: String(v.texto ?? '').slice(0, 4000), pins: asPins(v.pins), naoLevar: String(v.naoLevar ?? '').slice(0, 1000) };
}
export function putNotes(id: string, body: { movimentos?: unknown; version?: unknown }) {
  const st = load(id), an = analysisOf(id) ?? fail('analise o trecho antes de apontar');
  const cur = notesOf(id);
  if (body?.version !== undefined && Number(body.version) !== cur.version) fail(`apontamentos mudaram em outra aba (versão ${cur.version}): recarregue`);
  const movs = body?.movimentos && typeof body.movimentos === 'object' ? body.movimentos as Record<string, unknown> : fail('movimentos: objeto por número do movimento');
  const out: Notes = { version: cur.version + 1, movimentos: {} };
  for (const [k, v] of Object.entries(movs)) {
    const mv = an.movimentos.find(x => String(x.m) === k) ?? fail(`movimento ${k} não existe`);
    const n = checkNota(v);
    out.movimentos[k] = n;
    // the negative bank: what Daniel refuses, with his words and one frame of the original (internal reference only)
    const origem = `${id}/m${mv.m}`;
    if (n.veredito === 'nao-gosto') upsertNegativo({ id: `n-${slugOf(origem)}`, motivo: n.texto || mv.nome, origem }, join(dirOf(id), 'frames', String(mv.m), 'mid.jpg'));
    else dropNegativo(origem);
  }
  writeJSON(join(dirOf(id), 'notes.json'), out);
  save(st);
  return out;
}

// ---- demo scaffold: a light compose/ with the stock speaker (workspace/library/locutor/) and no project ------------------
// locutor/: cut.webm (RVM cutout, 1920x1080 alpha), talk.mp4 (raw), voice.m4a, transcript.json, faceX (a number in a text file or locutor.json {faceX}); copied from an approved project by hand.
export const LOCUTOR_DIR = join(WS, 'library', 'locutor');
function stockFont(): { head?: string; giant?: string } {
  const out: { head?: string; giant?: string } = {};
  for (const f of ['font.otf', 'font.ttf']) if (existsSync(join(LOCUTOR_DIR, f))) out.head = join(LOCUTOR_DIR, f);
  for (const f of ['giant.otf', 'giant.ttf']) if (existsSync(join(LOCUTOR_DIR, f))) out.giant = join(LOCUTOR_DIR, f);
  if (out.head) return out;
  const brands = join(WS, 'brands');
  for (const b of existsSync(brands) ? readdirSync(brands).sort() : []) {
    const fd = join(brands, b, 'fonts');
    const fonts = existsSync(fd) ? readdirSync(fd).filter(f => /\.(otf|ttf)$/i.test(f)) : [];
    if (fonts.length) { out.head = join(fd, fonts[0]); out.giant = fonts.map(f => join(fd, f)).find(f => /black|heavy|900/i.test(f)); return out; }
  }
  return out;
}
export async function composeScaffoldDemo(C: string, id: string): Promise<{ speaker: boolean; faceX: number; dur: number }> {
  const A = join(C, 'assets');
  for (const d of ['fonts', 'img', 'sfx', 'video', 'music'] ) mkdirSync(join(A, d), { recursive: true });
  for (const f of ['kit.py', 'GUIDE.md', 'DIRETOR.md']) copyFileSync(join(COMPOSE_DIR, f), join(C, f));
  mkdirSync(join(C, 'engines'), { recursive: true });
  for (const f of readdirSync(join(COMPOSE_DIR, 'engines')).filter(f => f.endsWith('.js'))) copyFileSync(join(COMPOSE_DIR, 'engines', f), join(C, 'engines', f));
  for (const f of readdirSync(join(COMPOSE_DIR, 'sfx'))) copyFileSync(join(COMPOSE_DIR, 'sfx', f), join(A, 'sfx', f));
  copyBancoTo(C);
  const speaker = existsSync(join(LOCUTOR_DIR, 'cut.webm'));
  let dur = DEMO_DUR, faceX = 980;
  if (speaker) {
    for (const f of ['cut.webm', 'talk.mp4', 'voice.m4a', 'transcript.json']) if (existsSync(join(LOCUTOR_DIR, f))) copyFileSync(join(LOCUTOR_DIR, f), join(A, f));
    try { dur = Math.min(DEMO_DUR, Math.floor((await probeMedia(join(A, 'cut.webm'))).duration * 10) / 10) || DEMO_DUR; } catch {}
    if (existsSync(join(LOCUTOR_DIR, 'locutor.json'))) faceX = Number(readJSON(join(LOCUTOR_DIR, 'locutor.json')).faceX) || faceX;
    else if (existsSync(join(LOCUTOR_DIR, 'faceX'))) faceX = Number(readFileSync(join(LOCUTOR_DIR, 'faceX'), 'utf8').trim()) || faceX;
    if (existsSync(join(A, 'cut.webm')) && !existsSync(join(A, 'raw.mp4'))) copyFileSync(join(A, existsSync(join(A, 'talk.mp4')) ? 'talk.mp4' : 'cut.webm'), join(A, 'raw.mp4'));   // kit's hidden backup layer
  }
  if (!existsSync(join(A, 'voice.m4a'))) await run(KEY(id), 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(dur), '-c:a', 'aac', join(A, 'voice.m4a')]);
  if (!existsSync(join(A, 'transcript.json'))) writeJSON(join(A, 'transcript.json'), []);
  const fonts = stockFont();
  if (fonts.head) copyFileSync(fonts.head, join(A, 'fonts', 'font.otf'));
  if (fonts.giant) copyFileSync(fonts.giant, join(A, 'fonts', 'giant.otf'));
  const W = 1080, H = 1920;
  writeJSON(join(C, 'compose.json'), { cuts: [], W, H, aspectRatio: '9:16', safeZone: { top: 200, bottom: 380, left: 70, right: 70 }, DUR: dur, faceX, pace: { every: 1.5, scene: [1.2, 3], framing: [2, 4], hold: 4 },
    speaker, colors: { RED: '#E61C1C', RED2: '#A61919', AMB: '#FFB600', BLK: '#000000', CRM: '#FFFAEA' }, fonte: { w: 1920, h: 1080 }, layoutCheck: join(ROOT, 'server/layout_check.mjs') });
  writeJSON(join(C, 'hyperframes.json'), { $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true }, authoringSkill: 'hyperframes' });
  const hf = (cmd: string) => `npx --yes hyperframes@0.8.217 ${cmd}`;
  writeJSON(join(C, 'package.json'), { name: `mt-demo`, private: true, type: 'module', scripts: { dev: hf('preview'), check: hf('check'), render: hf('render') } });
  return { speaker, faceX, dur };
}

// ---- synthesis: one movement → helper.py + proposta.md + demo (scenes.py, rendered) in rounds/<m>/<r>/ ------------------
const MT_MAX_TURNS = Number(process.env.MT_MAX_TURNS ?? 30);
export const synthesize = (id: string, body: { m?: unknown }) => locked(id, 'mtSynthesize', async st => {
  const m = Number(body?.m), an = analysisOf(id) ?? fail('analise o trecho antes');
  const mv = an.movimentos.find(x => x.m === m) ?? fail(`movimento ${body?.m} não existe`);
  const nota = notesOf(id).movimentos[String(m)];
  if (nota?.veredito !== 'gosto') fail('só um movimento marcado como "gosto" vai para a síntese');
  const ms = st.movimentos[String(m)] ?? (st.movimentos[String(m)] = { rodadas: 0, status: 'novo' });
  if (ms.status === 'aprovado') fail('este movimento já está no banco');
  if (ms.status === 'parado') fail(`movimento parado depois de ${MAX_ROUNDS} rodadas reprovadas; mude os apontamentos e peça de novo`);
  const prev = roundsOf(id).filter(r => r.m === m);
  const last = prev[prev.length - 1];
  if (last && !last.veredito) fail(`a rodada ${last.r} ainda espera o veredito`);
  const r = prev.length + 1;
  if (r > MAX_ROUNDS) fail(`limite de ${MAX_ROUNDS} rodadas`);
  const C = join(dirOf(id), 'rounds', String(m), String(r));
  rmSync(C, { recursive: true, force: true }); mkdirSync(C, { recursive: true });
  ms.status = 'sintetizando'; ms.rodadas = r; save(st);
  log(id, `▶ Rodada ${r}/${MAX_ROUNDS} do movimento ${m}: montando a demo com o locutor de acervo...`);
  const demo = await composeScaffoldDemo(C, id);
  if (!demo.speaker) log(id, `⚠ Sem locutor de acervo em ${LOCUTOR_DIR} (cut.webm, talk.mp4, voice.m4a, faceX): a demo sai sem locutor.`);
  // the frames of the original go beside the demo as reference (never into a client render: they stay in the session and the round)
  mkdirSync(join(C, 'ref'), { recursive: true });
  for (const f of readdirSync(join(dirOf(id), 'frames', String(m)))) copyFileSync(join(dirOf(id), 'frames', String(m), f), join(C, 'ref', f));
  const banco = readBanco();
  const momento = nota.momento ?? mv.momentoSugerido, categoria = nota.categoria ?? mv.categoriaSugerida;
  const fb = prev.filter(p => p.veredito).map(p => `- Rodada ${p.r} (reprovada): ${p.veredito!.texto}${p.veredito!.pins.length ? ` · pontos: ${p.veredito!.pins.map(x => `${x.t.toFixed(1)} s @(${x.x},${x.y}) "${x.text}"`).join('; ')}` : ''}`);
  writeFileSync(join(C, 'brief.md'), [`# Síntese de movimento · ${mv.nome}`,
    `Trecho ${id}, movimento ${m} (${mv.a}–${mv.b} s do trecho), rodada ${r} de ${MAX_ROUNDS}. Demo ${demo.dur} s, 1080×1920, 30 fps${demo.speaker ? `, locutor de acervo (cut.webm, rosto em faceX=${demo.faceX})` : ', sem locutor'}.`,
    `## O que aprender (movimento, ritmo, proporção)\n- Nome: ${mv.nome}\n- O que acontece: ${mv.oque}\n- Elemento: ${mv.elemento} · Câmera: ${mv.camera}\n- Entrada: ${mv.entrada}\n- Vida: ${mv.vida}\n- Saída: ${mv.saida}\n- Tipografia vista: ${Object.entries(mv.tipo).map(([k, v]) => `${k} = ${v}`).join('; ') || 'n/a'}\n- Medidas: ${JSON.stringify(mv.medidas)}\n- Momento: ${momento} · Categoria: ${categoria}${nota.tags.length ? ` · Tags: ${nota.tags.join(', ')}` : ''}`,
    `## O que o Daniel disse\n${nota.texto || '(sem texto)'}${nota.pins.length ? `\nPontos marcados sobre o quadro (t em s do movimento, x/y em % do quadro): ${nota.pins.map(x => `${x.t.toFixed(1)} s @(${x.x},${x.y}) "${x.text}"`).join('; ')}` : ''}`,
    `## O que NÃO levar\n${nota.naoLevar || 'A fonte, as cores e qualquer mascote ou marca do original. Paleta original só como referência: ${mv.paleta.join(', ')}.'}\nO helper usa a fonte da marca (assets/fonts/font.otf, peso 600; giant.otf peso 900 se existir) e as cores de compose.json (RED, RED2, AMB, BLK, CRM).`,
    fb.length ? `## Vereditos das rodadas anteriores (corrija isto primeiro)\n${fb.join('\n')}` : '',
    `## Referência\nQuadros do original em ref/ (sheet.jpg = folha de contato, mid.jpg = quadro do meio em largura inteira, NNN.jpg a 8 fps). Abra com Read antes de escrever.`,
    banco.helpers.length ? `## Banco atual (não duplique; se o movimento já existe, melhore o nome e a diferença em proposta.md)\n${banco.helpers.map(h => `- ${h.id} (${h.momento}, ${h.categoria}): ${h.nome}`).join('\n')}` : '',
    existsSync(join(C, 'estilos', 'banco', 'negativo.md')) ? readFileSync(join(C, 'estilos', 'banco', 'negativo.md'), 'utf8') : '',
    `## Entregáveis (nesta pasta)\n1. \`helper.py\`: um helper no padrão do kit.py: \`def <nome_curto>(p, <2 a 4 parâmetros livres com valor padrão>, at=0.0, d=None, k='<sigla>') -> (html, js)\`, geometria FIXA (as medidas acima viram constantes), \`from kit import *\` no topo, ids com \`f'{p}-{k}'\`, tempos relativos ao início da cena (\`at\`), saída em \`d\` quando dado. Só \`p\` sem valor padrão. Docstring de 2 linhas.\n2. \`proposta.md\`: o que fixou (medidas), o que deixou livre (parâmetros), o que mediu no original e o que mudou das rodadas anteriores.\n3. \`scenes.py\`: demo de ${demo.dur} s, \`from kit import *\` e \`from helper import *\`, uma cena por variação de parâmetro (até 3), ${demo.speaker ? "câmera do locutor variando (M, L, XL) e o texto gigante em back" : 'câmera None'}, \`render()\` no fim.\n4. Rodar \`${PYTHON} -B scenes.py\`, \`npx --yes hyperframes@0.8.217 check\`, snapshots (\`npx --yes hyperframes@0.8.217 snapshot --at "<meio de cada cena>" --no-end -o snaps\`), olhar com Read, corrigir, e renderizar \`npx --yes hyperframes@0.8.217 render -o demo.mp4 --fps 30 --quality delivery\`.`,
  ].filter(Boolean).join('\n\n'));
  log(id, `🧠 Opus sintetizando o movimento ${m} (helper, demo, check, render; até ${MT_MAX_TURNS} turnos)...`);
  const summary = await agent('mt:synthesize', { step: 'mtSynthesize', maxTurns: MT_MAX_TURNS, cwd: C,
    system: 'You are an elite motion designer turning ONE reference movement into a reusable helper of a HyperFrames + GSAP kit (kit.py), working only inside the current folder. ' +
      'Read brief.md first, then kit.py (the helper conventions: `def name(p, ..., at=0.0, d=None, k=...)` returning (html, js), ids f"{p}-{k}", tweens on `tl` at times relative to the scene), GUIDE.md and the frames in ref/ (Read). ' +
      'Learn the MOVEMENT (what moves, rhythm, proportions, eases) and never the look (font, colours, mascots): the helper uses the brand font and compose.json colours. Fix the geometry as constants measured from the frames; expose 2 to 4 free parameters with defaults (the words, a colour, a count). ' +
      `Budget: at most ${MT_MAX_TURNS} tool turns. Write helper.py and proposta.md first, then scenes.py, run it, fix errors, run hyperframes check, snapshot once and look, fix, then render demo.mp4. Finish with one short paragraph: what the helper does and any known issue.`,
    prompt: `Sintetize o movimento descrito em brief.md: escreva helper.py, proposta.md e scenes.py, valide e renderize demo.mp4 nesta pasta.` }, logCost(st));
  const helperSrc = existsSync(join(C, 'helper.py')) ? readFileSync(join(C, 'helper.py'), 'utf8') : '';
  let helper = '';
  try { helper = helperName(helperSrc); } catch (e) { ms.status = 'novo'; save(st); fail(`a síntese não deixou um helper válido: ${(e as Error).message}${summary.startsWith(MAX_TURNS_HIT) ? ` (${MAX_TURNS_HIT})` : ''}`); }
  if (!existsSync(join(C, 'demo.mp4'))) { ms.status = 'novo'; save(st); fail(`a síntese não renderizou demo.mp4: ${summary.slice(0, 300)}`); }
  // contact sheet and a mid frame of the demo, beside the ones of the original
  const dd = (await probeMedia(join(C, 'demo.mp4'))).duration || demo.dur;
  await run(KEY(id), 'ffmpeg', ['-y', '-v', 'error', '-i', join(C, 'demo.mp4'), '-vf', `fps=${(24 / dd).toFixed(3)},scale=270:-2,tile=6x4`, '-frames:v', '1', '-q:v', '3', join(C, 'sheet.jpg')]);
  await run(KEY(id), 'ffmpeg', ['-y', '-v', 'error', '-ss', (dd / 2).toFixed(2), '-i', join(C, 'demo.mp4'), '-frames:v', '1', '-q:v', '2', join(C, 'demo.jpg')]);
  for (const d of ['compositions', 'snaps', 'node_modules', '.transcode-cache']) rmSync(join(C, d), { recursive: true, force: true });   // the round keeps what the UI and the approval read
  writeJSON(join(C, 'round.json'), { m, r, at: new Date().toISOString(), summary, helper } satisfies Round);
  ms.status = 'aguardando'; ms.helper = helper; save(st);
  log(id, `✓ Rodada ${r} pronta: helper ${helper}(). Compare original × demo e dê o veredito.`);
  return get(id);
});

export function verdict(id: string, m: number, r: number, body: { ok?: unknown; texto?: unknown; pins?: unknown }) {
  const st = load(id), C = join(dirOf(id), 'rounds', String(m), String(r));
  if (!existsSync(join(C, 'round.json'))) fail(`não existe a rodada ${r} do movimento ${m}`);
  if (busy.has(id)) fail('trecho ocupado');
  const ms = st.movimentos[String(m)] ?? fail(`movimento ${m} não existe`);
  if (ms.status === 'aprovado') fail('movimento já aprovado');
  const v: Veredito = { ok: !!body?.ok, texto: String(body?.texto ?? '').slice(0, 4000), pins: asPins(body?.pins), at: new Date().toISOString() };
  writeJSON(join(C, 'veredito.json'), v);
  if (!v.ok && r >= MAX_ROUNDS) { ms.status = 'parado'; log(id, `⏸ Movimento ${m} parado depois de ${MAX_ROUNDS} rodadas reprovadas; as notas ficam para retomar.`); }
  else if (!v.ok) { ms.status = 'novo'; log(id, `✗ Rodada ${r} do movimento ${m} reprovada: ${v.texto}`); }
  else log(id, `✓ Rodada ${r} do movimento ${m} aprovada: clique em "Entrar no banco".`);
  save(st);
  return get(id);
}

// Into the bank: helper.py, the approved demo frame (the sheet is the default; `frame` can name demo.jpg) and the 3-line card; then the bank test must pass.
export const approve = (id: string, body: { m?: unknown; r?: unknown; frame?: unknown; id?: unknown }) => locked(id, 'approve', async st => {
  const m = Number(body?.m), r = Number(body?.r), C = join(dirOf(id), 'rounds', String(m), String(r));
  if (!existsSync(join(C, 'round.json'))) fail(`não existe a rodada ${r} do movimento ${m}`);
  const round: Round = readJSON(join(C, 'round.json')), ver: Veredito | null = existsSync(join(C, 'veredito.json')) ? readJSON(join(C, 'veredito.json')) : null;
  if (!ver?.ok) fail('aprove a rodada (veredito ok) antes de entrar no banco');
  const an = analysisOf(id)!, mv = an.movimentos.find(x => x.m === m)!, nota = notesOf(id).movimentos[String(m)] ?? fail('sem apontamento');
  const src = readFileSync(join(C, 'helper.py'), 'utf8');
  const wanted = typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : helperName(src);
  if (!/^[a-z][a-z0-9_]*$/.test(wanted)) fail('id do helper: minúsculas, dígitos e _');
  if (wanted !== helperName(src)) fail(`o id precisa ser o nome da função do helper.py (${helperName(src)})`);
  const frame = body?.frame === 'demo.jpg' ? 'demo.jpg' : 'sheet.jpg';
  const h: BancoHelper = { id: wanted, nome: mv.nome, momento: nota.momento ?? mv.momentoSugerido, categoria: nota.categoria ?? mv.categoriaSugerida, tags: nota.tags, params: helperParams(src),
    medidas: { ...mv.medidas, duracao: mv.medidas.duracao ?? +(mv.b - mv.a).toFixed(2) }, origem: `${id}/m${m}`, aprovadoEm: new Date().toISOString().slice(0, 10), rodadas: r };
  addHelper(h, { py: join(C, 'helper.py'), jpg: join(C, frame), md: helperMd(h, mv.oque, nota.naoLevar), orig: join(dirOf(id), 'frames', String(m), 'mid.jpg') });
  log(id, `▶ ${wanted} copiado para o banco; rodando test/banco.test.ts...`);
  // NODE_TEST_CONTEXT is dropped: inside `node --test` (motionthink.test.ts) a nested runner would otherwise report to the parent and exit 0
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  try { await new Promise<void>((ok, ko) => execFile(process.execPath, ['--test', join(ROOT, 'server', 'test', 'banco.test.ts')], { env, maxBuffer: 16 << 20 }, (e, out, err) => e ? ko(new Error(String(out + err).slice(-800))) : ok())); }
  catch (e) { rollbackHelper(wanted); fail(`o helper ${wanted} reprovou no teste do banco e foi retirado: ${(e as Error).message.slice(-600)}`); }
  const ms = st.movimentos[String(m)]!; ms.status = 'aprovado'; ms.helper = wanted; ms.aprovadoEm = h.aprovadoEm; save(st);
  log(id, `✓ ${wanted} está no banco (${h.momento}, ${h.categoria}). O compositor passa a preferi-lo nesse momento.`);
  return { ok: true, helper: h, banco: readBanco() as Banco };
});
