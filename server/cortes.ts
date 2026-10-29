// Cortes: a long talk (about 1 h) in, up to 10 candidate 1-2 min passages out, then an mp4 + srt per chosen passage.
// Lives beside the reel projects in workspace/cortes/<id>/ (source path, transcript.json, state.json, out/). No SSE: the UI polls GET /cortes/:id.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { ask, type Cost } from './models.ts';
import { safeId, type Word } from './lib.ts';
import { duration, expandHome, intake, py, run, subscribe, UserError, WS } from './pipeline.ts';

export type Corte = { n: number; start: number; end: number; title: string; quote: string; why: string; score: number };
type State = { id: string; name: string; source: string; subtitle?: string; status: 'transcribing' | 'analysing' | 'ready' | 'exporting' | 'error'; error?: string;
  duration?: number; cortes: Corte[]; exported: Record<number, { mp4: string; srt: string }>; cost: Cost[] };

const DIR = join(WS, 'cortes');
const dirOf = (id: string) => safeId(id) ? join(DIR, id) : fail('id inválido');
const fail = (m: string): never => { throw new UserError(m); };
const readJSON = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const load = (id: string): State => existsSync(join(dirOf(id), 'state.json')) ? readJSON(join(dirOf(id), 'state.json')) : fail(`não existe corte ${id}`);
const save = (st: State) => writeFileSync(join(dirOf(st.id), 'state.json'), JSON.stringify(st, null, 1));
const log = (id: string, line: string) => appendFileSync(join(dirOf(id), 'log.txt'), line + '\n');
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm'];
const MIN = 60, MAX = 120, SLACK = 15;   // seconds: what the user asked for, with room to end on a sentence

export const list = () => existsSync(DIR) ? readdirSync(DIR).filter(d => existsSync(join(DIR, d, 'state.json'))).map(d => { const s = load(d); return { id: s.id, name: s.name, status: s.status, n: s.cortes.length }; }) : [];
export const get = (id: string) => ({ ...load(id), log: existsSync(join(dirOf(id), 'log.txt')) ? readFileSync(join(dirOf(id), 'log.txt'), 'utf8').split('\n').filter(Boolean).slice(-40) : [] });
export function remove(id: string) { load(id); rmSync(dirOf(id), { recursive: true, force: true }); return { ok: true }; }
export function file(id: string, name: string) {
  const st = load(id);
  if (name === 'source') return st.source;
  const f = join(dirOf(id), 'out', basename(name));
  return /^\d+\.(mp4|srt)$/.test(name) && existsSync(f) ? f : fail(`sem ${name}`);
}

export async function create(o: { name?: string; video?: string; subtitle?: string }) {
  const video = expandHome(String(o?.video ?? ''));
  if (!VIDEO_EXT.includes(extname(video).toLowerCase()) || !existsSync(video)) fail(`vídeo inválido ou não encontrado: ${video}`);
  const subtitle = o.subtitle ? expandHome(String(o.subtitle)) : undefined;
  if (subtitle && (!['.srt', '.vtt'].includes(extname(subtitle).toLowerCase()) || !existsSync(subtitle))) fail(`legenda inválida ou não encontrada: ${subtitle}`);
  const slug = String(o.name || basename(video, extname(video))).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fail('nome obrigatório');
  const id = `${slug}-${Date.now().toString(36)}`;
  mkdirSync(join(dirOf(id), 'out'), { recursive: true });
  const st: State = { id, name: o.name || basename(video), source: video, subtitle, status: 'transcribing', cortes: [], exported: {}, cost: [] };
  save(st);
  analyse(st).catch(e => { st.status = 'error'; st.error = e.message; save(st); log(id, 'ERRO: ' + e.message); });
  return st;
}

// run() emits its lines as project log events: keep them in log.txt so the UI can show progress while polling
async function analyse(st: State) {
  const { id } = st, off = subscribe(id, (ev, data) => ev === 'log' && log(id, String(data)));
  try {
    // uploads move here; a picked file is copied (in the background: a 1 h file takes a while) so the export still works if the original moves
    const kept = join(dirOf(id), 'source' + extname(st.source).toLowerCase());
    log(id, `▶ Guardando ${basename(st.source)}...`);
    intake(st.source, kept);
    st.source = kept; save(st);
    if (st.subtitle) { const k = join(dirOf(id), 'source' + extname(st.subtitle).toLowerCase()); intake(st.subtitle, k); st.subtitle = k; save(st); }
    st.duration = await duration(id, st.source);
    log(id, st.subtitle ? `▶ Lendo os tempos da legenda ${basename(st.subtitle)} (sem Whisper)...` : `▶ Transcrevendo ${Math.round(st.duration / 60)} min de vídeo (Whisper local)...`);
    await py(id, 'transcribe.py', [st.subtitle ?? st.source, join(dirOf(id), 'transcript.json')]);
    const words: Word[] = readJSON(join(dirOf(id), 'transcript.json')).filter((w: Word) => w.text.trim());
    if (!words.length) fail('nenhuma fala encontrada');
    st.status = 'analysing'; save(st);
    log(id, `▶ ${words.length} palavras. Opus escolhendo os 10 melhores trechos...`);
    const r = await ask<{ cortes: Omit<Corte, 'n'>[] }>('cortes', 'cortes', {
      system: 'You pick the best short clips out of a long Brazilian Portuguese talk for Instagram/TikTok. Each clip must be a self-contained passage of ' +
        `${MIN}-${MAX} seconds with an impactful statement (a strong claim, story, lesson, controversy, number or emotion), starting at the beginning of a ` +
        'sentence and ending at the end of one. Prefer passages that open strong (the first sentence is the hook). Spread the picks across the whole talk, ' +
        'no overlaps. Write title, quote and why in Portuguese: quote is the most impactful sentence, copied verbatim from the transcript.',
      content: `Transcript as "[seconds] text" lines:\n${lines(words).join('\n')}\n\nReturn exactly 10 cortes (fewer only if the talk is too short), best first, score 1-10.`,
      schema: { type: 'object', additionalProperties: false, required: ['cortes'], properties: { cortes: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['start', 'end', 'title', 'quote', 'why', 'score'], properties: { start: { type: 'number' }, end: { type: 'number' }, title: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' }, score: { type: 'number' } } } } } },
    }, c => { st.cost.push(c); save(st); });
    st.cortes = r.cortes.map(c => snap(c, words)).filter((c): c is Omit<Corte, 'n'> => !!c).slice(0, 10).map((c, k) => ({ n: k + 1, ...c }));
    if (!st.cortes.length) fail('o modelo não devolveu nenhum trecho válido');
    st.status = 'ready'; save(st);
    log(id, `✓ ${st.cortes.length} trechos prontos. Escolha quais exportar.`);
  } finally { off(); }
}

// One line per ~12 words with its start time: 1 h of speech fits in one prompt and the model answers in seconds it can see.
export const lines = (words: Word[], per = 12) => Array.from({ length: Math.ceil(words.length / per) }, (_, k) => {
  const w = words.slice(k * per, (k + 1) * per);
  return `[${Math.floor(w[0].start)}] ${w.map(x => x.text).join(' ')}`;
});

// Move the clip edges onto word edges and drop what is not 1-2 min (with slack) or has no words.
export function snap<T extends { start: number; end: number }>(c: T, words: Word[]): T | null {
  const inside = words.filter(w => w.start >= c.start - 1 && w.end <= c.end + 1);
  if (!inside.length) return null;
  const start = +inside[0].start.toFixed(2), end = +inside[inside.length - 1].end.toFixed(2);
  return end - start >= MIN - SLACK && end - start <= MAX + SLACK ? { ...c, start, end } : null;
}

// SubRip from the words of a clip, times relative to the clip start; a line breaks every ~8 words, 3.5 s or a pause.
export function srt(words: Word[], start: number, end: number): string {
  const ws = words.filter(w => w.start >= start && w.end <= end);
  const cues: Word[][] = [];
  for (const w of ws) {
    const cur = cues[cues.length - 1];
    if (!cur || cur.length >= 8 || w.end - cur[0].start > 3.5 || w.start - cur[cur.length - 1].end > 0.7) cues.push([w]); else cur.push(w);
  }
  const ts = (t: number) => { const ms = Math.max(0, Math.round((t - start) * 1000)); const d = new Date(ms); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return cues.map((c, k) => `${k + 1}\n${ts(c[0].start)} --> ${ts(c[c.length - 1].end)}\n${c.map(w => w.text).join(' ')}\n`).join('\n');
}

export async function exportCortes(id: string, picks: unknown) {
  const st = load(id);
  if (st.status !== 'ready') fail(`ainda não dá para exportar (${st.status})`);
  const ns = Array.isArray(picks) ? picks.map(Number) : [];
  const chosen = st.cortes.filter(c => ns.includes(c.n));
  if (!chosen.length) fail('escolha pelo menos um trecho');
  const words: Word[] = readJSON(join(dirOf(id), 'transcript.json'));
  st.status = 'exporting'; save(st);
  try {
    for (const c of chosen) {
      log(id, `▶ Exportando corte ${c.n} (${fmt(c.start)}–${fmt(c.end)})...`);
      const mp4 = join(dirOf(id), 'out', `${c.n}.mp4`), s = join(dirOf(id), 'out', `${c.n}.srt`);
      // re-encode: a stream copy can only cut on keyframes and would start seconds early
      await run(id, 'ffmpeg', ['-y', '-v', 'error', '-ss', String(c.start), '-to', String(c.end), '-i', st.source, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4]);
      writeFileSync(s, srt(words, c.start, c.end));
      st.exported[c.n] = { mp4: `${c.n}.mp4`, srt: `${c.n}.srt` };
      save(st);
    }
    log(id, `✓ ${chosen.length} corte(s) exportado(s) em ${join(dirOf(id), 'out')}`);
  } finally { st.status = 'ready'; save(st); }
  return st;
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
