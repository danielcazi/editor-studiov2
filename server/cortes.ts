// Cortes: a long talk (about 1 h) in, up to 10 candidate 1-2 min passages out, then an mp4 + srt per chosen passage.
// Lives beside the reel projects in workspace/cortes/<id>/ (source path, transcript.json, state.json, out/). No SSE: the UI polls GET /cortes/:id.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { ask, type Cost } from './models.ts';
import { safeId, type Word } from './lib.ts';
import { duration, expandHome, intake, py, run, subscribe, UserError, WS } from './pipeline.ts';

export type Corte = { n: number; start: number; end: number; title: string; hook: string; quote: string; why: string; tipo: string; score: number };
type Analysis = { tema: string; publico: string; estrutura: { start: number; titulo: string }[]; momentos: { start: number; tipo: string; resumo: string }[] };
type State = { id: string; name: string; source: string; subtitle?: string; analysis?: Analysis; status: 'transcribing' | 'analysing' | 'ready' | 'exporting' | 'error'; error?: string;
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
    log(id, `▶ ${words.length} palavras. Sonnet mapeando a palestra e escolhendo os 10 melhores trechos...`);
    const r = await ask<{ analysis: Analysis; cortes: Omit<Corte, 'n'>[] }>('cortes', 'cortes', {
      system: 'You are a short-form editor picking clips out of a long Brazilian Portuguese talk for Instagram/TikTok/YouTube Shorts.\n' +
        'Work in two passes and fill the output in that order.\n' +
        'PASS 1 - analysis (map the talk before choosing anything): tema (what the talk is about), publico (who it speaks to), estrutura (the sections ' +
        'of the talk with the second each starts), and momentos: every candidate moment, where the speaker makes a strong claim, tells a story with a payoff, ' +
        'gives a number or a concrete example, teaches a step, says something polemic, or shows emotion. Note its tipo and the second it starts.\n' +
        `PASS 2 - cortes: from the momentos choose up to 10 passages of ${MIN}-${MAX} seconds. Rules: a passage must stand alone with zero context ` +
        '(no "como eu disse", "isso", "esse ponto" pointing to something outside it); it starts at the start of a phrase that works as a hook ' +
        '(claim, question, "a maior mentira é...", a number) and ends where the idea closes (the payoff, lesson or punchline), never mid-thought; ' +
        'no overlaps; spread the picks over the whole talk; vary the tipos; a passage that needs the hook rephrased is a worse pick than one whose first ' +
        'sentence already hooks. Score 1-10 = hook strength + self-contained + payoff + emotion. Order best first.\n' +
        'Each line of the transcript is one phrase between pauses, prefixed with its start second: use those seconds for start and end. ' +
        'Write everything in Portuguese. quote = the single most impactful sentence, copied verbatim; hook = the opening phrase of the clip, verbatim.',
      content: `Transcript as "[seconds] phrase" lines:\n${lines(words).join('\n')}\n\nReturn the analysis, then up to 10 cortes (fewer only if the talk is too short).`,
      schema: { type: 'object', additionalProperties: false, required: ['analysis', 'cortes'], properties: {
        analysis: { type: 'object', additionalProperties: false, required: ['tema', 'publico', 'estrutura', 'momentos'], properties: { tema: { type: 'string' }, publico: { type: 'string' },
          estrutura: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['start', 'titulo'], properties: { start: { type: 'number' }, titulo: { type: 'string' } } } },
          momentos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['start', 'tipo', 'resumo'], properties: { start: { type: 'number' }, tipo: { type: 'string' }, resumo: { type: 'string' } } } } } },
        cortes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['start', 'end', 'title', 'hook', 'quote', 'why', 'tipo', 'score'],
          properties: { start: { type: 'number' }, end: { type: 'number' }, title: { type: 'string' }, hook: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' }, tipo: { type: 'string' }, score: { type: 'number' } } } } } },
    }, c => { st.cost.push(c); save(st); });
    st.analysis = r.analysis;
    st.cortes = pick(r.cortes.map(c => snap(c, words)).filter((c): c is Omit<Corte, 'n'> => !!c)).map((c, k) => ({ n: k + 1, ...c }));
    if (!st.cortes.length) fail('o modelo não devolveu nenhum trecho válido');
    st.status = 'ready'; save(st);
    log(id, `✓ ${st.cortes.length} trechos prontos. Escolha quais exportar.`);
  } finally { off(); }
}

const PAUSE = 0.6;   // seconds of silence that end a phrase (Whisper gives no punctuation, so breaths are the sentence marks)
const phraseStarts = (words: Word[]) => words.map((w, k) => k === 0 || w.start - words[k - 1].end >= PAUSE);

// One line per phrase (a pause of PAUSE s or 25 words) with its start second: 1 h fits in one prompt and the model picks real phrase edges.
export function lines(words: Word[], max = 25): string[] {
  const out: string[][] = [], starts = phraseStarts(words);
  words.forEach((w, k) => { const cur = out[out.length - 1]; if (!cur || starts[k] || cur.length >= max) out.push([w.text]); else cur.push(w.text); });
  let k = 0;
  return out.map(l => { const t = Math.floor(words[k].start); k += l.length; return `[${t}] ${l.join(' ')}`; });
}

// Move the clip edges onto the nearest phrase edges (within REACH s) and drop what is not 1-2 min (with slack) or has no words.
const REACH = 4;
export function snap<T extends { start: number; end: number }>(c: T, words: Word[]): T | null {
  const starts = phraseStarts(words);
  const near = (t: number, ok: (k: number) => boolean) => { let best = -1; words.forEach((w, k) => { if (ok(k) && Math.abs(w.start - t) <= REACH && (best < 0 || Math.abs(w.start - t) < Math.abs(words[best].start - t))) best = k; }); return best; };
  const a = near(c.start, k => starts[k]);
  const z = near(c.end, k => k === words.length - 1 || starts[k + 1]);   // a phrase end is the word before the next phrase start
  let i = a, j = z;
  if (i < 0) i = words.findIndex(w => w.start >= c.start - 1);
  if (j < 0) { j = words.length - 1; while (j >= 0 && words[j].end > c.end + 1) j--; }
  if (i < 0 || j < i) return null;
  const start = +words[i].start.toFixed(2), end = +words[j].end.toFixed(2);
  return end - start >= MIN - SLACK && end - start <= MAX + SLACK ? { ...c, start, end } : null;
}

// Best first, no overlaps (the better scored one wins), at most 10.
export const pick = <T extends { start: number; end: number; score: number }>(cs: T[]): T[] =>
  [...cs].sort((a, b) => b.score - a.score).filter((c, _, all) => !all.some(o => o !== c && o.score > c.score && o.start < c.end && c.start < o.end)).slice(0, 10);

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
      log(id, `▶ Exportando corte ${c.n} (${fmt(c.start)}–${fmt(c.end)}), Haiku revisa a legenda...`);
      const mp4 = join(dirOf(id), 'out', `${c.n}.mp4`), s = join(dirOf(id), 'out', `${c.n}.srt`);
      // re-encode: a stream copy can only cut on keyframes and would start seconds early
      await run(id, 'ffmpeg', ['-y', '-v', 'error', '-ss', String(c.start), '-to', String(c.end), '-i', st.source, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4]);
      writeFileSync(s, await reviseSrt(st, srt(words, c.start, c.end)));
      st.exported[c.n] = { mp4: `${c.n}.mp4`, srt: `${c.n}.srt` };
      save(st);
    }
    log(id, `✓ ${chosen.length} corte(s) exportado(s) em ${join(dirOf(id), 'out')}`);
  } finally { st.status = 'ready'; save(st); }
  return st;
}
// Haiku fixes transcription slips, accents and names in the cue texts; the timing and the cue count stay. On any doubt the raw srt is kept.
async function reviseSrt(st: State, raw: string): Promise<string> {
  const cues = raw.trim().split('\n\n'), texts = cues.map(c => c.split('\n').slice(2).join(' '));
  try {
    const r = await ask<{ cues: string[] }>('cortesSrt', 'cortes-srt', {
      system: 'You proofread Brazilian Portuguese subtitles from an automatic transcript. Fix misheard words, accents, names and obvious slips; add commas and periods; ' +
        'keep every cue in the same order with the same meaning and roughly the same length; never merge, split, drop or add cues. Return exactly as many cues as given.',
      content: texts.map((t, k) => `${k + 1}: ${t}`).join('\n'),
      schema: { type: 'object', additionalProperties: false, required: ['cues'], properties: { cues: { type: 'array', items: { type: 'string' } } } },
    }, c => { st.cost.push(c); save(st); });
    if (r.cues.length !== cues.length) return raw;
    return cues.map((c, k) => c.split('\n').slice(0, 2).concat(r.cues[k].trim() || texts[k]).join('\n')).join('\n\n') + '\n';
  } catch (e) { log(st.id, `⚠ legenda sem revisão do Haiku: ${(e as Error).message}`); return raw; }
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
