// Embrulhos (só 9:16, texto estático): os 9 modelos do PDF do editor, em embrulhos/modelos/<id>/{manifest.json, 9x16/index.html}.
// O vídeo entra no slot "video"; as camadas são PNGs com alfa: "fundo" (tudo, com um furo no slot) vai por cima do vídeo e
// "frente" (ex.: avatar que invade a janela) por cima de tudo. Portado do kit antigo (compilador-studio/embrulhos.mjs).
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const EMB = join(dirname(fileURLToPath(import.meta.url)), 'embrulhos', 'modelos');
export const QUADRO = { w: 1080, h: 1920 };
const RESERVADAS = new Set(['quadro_t', 'avatar']);            // chaves de `campos` que não são texto
const lerJson = (f: string) => JSON.parse(readFileSync(f, 'utf8'));

export type Campo = { id: string; papel: string; max: number; padrao?: string; fixo?: boolean; opcional?: boolean };
export type Modelo = {
  id: string; nome: string; tipo: string;
  formatos: { '9x16': { film: string; slots: Record<string, { x: number; y: number; w: number; h: number; raio?: number }>; camadas: string[] } };
  campos: Campo[]; midia?: { id: string; tipo: string; opcional?: boolean }[];
  perfil: { tom: string[]; serveA: string[]; exige: string[]; evita: string[] };
};
export type Item = { nivel: 'erro' | 'aviso'; campo: string; msg: string };

export const listarEmbrulhos = () => readdirSync(EMB).filter(d => existsSync(join(EMB, d, 'manifest.json'))).sort();

export function carregarEmbrulho(id: string): Modelo {
  const f = join(EMB, id, 'manifest.json');
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(f)) throw new Error(`embrulho "${id}" não existe`);
  const m = lerJson(f) as Modelo;
  if (!m.formatos?.['9x16']?.slots?.video || !Array.isArray(m.campos) || !m.perfil) throw new Error(`manifesto de ${id} inválido`);
  return m;
}
/* slots em pixels do quadro 1080×1920 (pares, para o encoder) */
export function slotsPx(m: Modelo) {
  const par = (v: number) => Math.round(v / 2) * 2, out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const [k, s] of Object.entries(m.formatos['9x16'].slots)) out[k] = { x: par(s.x * QUADRO.w), y: par(s.y * QUADRO.h), w: par(s.w * QUADRO.w), h: par(s.h * QUADRO.h) };
  return out;
}

/* preços literais do .srt: "R$ 97", "R$197,00", "R$1.997" (valor e moeda; nada é inferido) */
export function precosDoSrt(srt: string) {
  const achados = String(srt || '').match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|R\$\s?\d+(?:,\d{1,2})?/g) || [];
  return [...new Set(achados.map(p => p.replace(/\s+/g, '')))];
}
const normPreco = (p: unknown) => String(p).replace(/\s+/g, '').toUpperCase();
const norm = (s: unknown) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/* Confere os campos de um embrulho. Devolve [{ nivel: 'erro'|'aviso', campo, msg }] */
export function conferirCampos(m: Modelo, campos: Record<string, unknown> = {}, { srt = '', duracao = null as number | null, textoFonte = '' } = {}): Item[] {
  const r: Item[] = [], add = (nivel: Item['nivel'], campo: string, msg: string) => r.push({ nivel, campo, msg });
  const modelo = new Set<string>(lerJson(join(EMB, '_shared', 'modelos-texto.json')).textos.map(norm));
  const ids = new Set(m.campos.map(c => c.id));
  for (const c of m.campos) {
    const v = campos[c.id] == null ? '' : String(campos[c.id]).trim();
    if (!v) { if (!c.opcional) add('erro', c.id, 'campo obrigatório vazio'); continue; }
    if (v.length > c.max) add('erro', c.id, `${v.length} caracteres (máximo ${c.max})`);
    if (modelo.has(norm(v)) && !(c.fixo && v === c.padrao)) add('erro', c.id, 'repete o texto-modelo do PDF; escreva o texto deste vídeo');
    if (c.padrao && v === c.padrao && !c.fixo) add('erro', c.id, `ainda está no valor padrão "${c.padrao}"`);
  }
  for (const k of Object.keys(campos)) if (!ids.has(k) && !RESERVADAS.has(k)) add('aviso', k, 'campo que o modelo não usa');
  // preço: só vale se estiver no .srt
  if (ids.has('preco_por')) {
    const precos = precosDoSrt(srt).map(normPreco);
    if (!precos.length) add('erro', 'preco_por', 'o .srt não tem preço (R$): o modelo Oferta não pode ser usado');
    for (const k of ['preco_por', 'preco_de']) if (campos[k] && !precos.includes(normPreco(campos[k]))) add('erro', k, `"${campos[k]}" não aparece literalmente no .srt (preços do .srt: ${precos.join(', ') || 'nenhum'})`);
    if (campos.preco_de && campos.preco_por && normPreco(campos.preco_de) === normPreco(campos.preco_por)) add('erro', 'preco_de', 'preco_de igual a preco_por');
  }
  // quadro marcante
  if ((m.perfil.exige || []).includes('quadro_marcante')) {
    const t = Number(campos.quadro_t);
    if (!Number.isFinite(t)) add('erro', 'quadro_t', 'defina o instante (s) da cena marcante para o print');
    else if (duracao != null && (t < 0 || t > duracao)) add('erro', 'quadro_t', `${t}s fora do vídeo (${duracao}s)`);
  }
  // números sem fonte no texto (fora preços): aviso para marcar como ilustrativo
  const fonte = norm(srt + ' ' + textoFonte), vistos: string[] = [];
  for (const c of m.campos) if (!/^preco_/.test(c.id)) for (const n of String(campos[c.id] || '').match(/\d+(?:[.,]\d+)?/g) || []) if (!fonte.includes(norm(n)) && !vistos.includes(n)) { vistos.push(n); add('aviso', c.id, `número "${n}" não aparece no texto do vídeo: marque como ilustrativo ou remova`); }
  return r;
}

/* ---------- quadro marcante ---------- */
export function extrairQuadro(video: string, t: number, destino: string, largura = 1080) {
  mkdirSync(dirname(destino), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, t)), '-i', video, '-frames:v', '1', '-vf', `scale=${largura}:-2`, '-q:v', '2', destino], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(destino)) throw new Error('não consegui extrair o quadro em ' + t + 's: ' + (r.stderr || '').slice(-200));
  return destino;
}
/* instantes de maior movimento (candidatos a cena marcante; a IA escolhe pelo texto, o editor pode trocar) */
export function sugerirQuadros(video: string, n = 3) {
  const GW = 64, GH = 36, SR = 4;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', `fps=${SR},scale=${GW}:${GH}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const buf = r.stdout, FS = GW * GH, N = Math.floor(buf.length / FS), e = [0];
  for (let f = 1; f < N; f++) { let s = 0; for (let i = 0; i < FS; i++) s += Math.abs(buf[f * FS + i] - buf[(f - 1) * FS + i]); e.push(s / FS / 255); }
  const lo = Math.floor(N * 0.1), hi = Math.ceil(N * 0.9), cand: [number, number][] = [];
  for (let i = lo; i < hi; i++) cand.push([e[i], i / SR]);
  cand.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out: number[] = []; for (const [, t] of cand) { if (out.every(x => Math.abs(x - t) > 2)) out.push(+t.toFixed(2)); if (out.length === n) break; }
  return out;
}

/* ---------- camadas e composição ---------- */
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));

export async function renderCamadas(m: Modelo, campos: Record<string, unknown>, { quadroImg = null as string | null, avatarImg = null as string | null, destino = '' }) {
  if (!CHROME) throw new Error('Chrome não encontrado. Instale o Google Chrome ou defina CHROME_PATH.');
  const puppeteer = createRequire(import.meta.url)('puppeteer-core');
  mkdirSync(destino, { recursive: true });
  const base = pathToFileURL(join(EMB, m.id, m.formatos['9x16'].film)).href;
  const txt = Object.fromEntries(Object.entries(campos).filter(([k]) => !RESERVADAS.has(k)));
  const q = new URLSearchParams({ c: Buffer.from(JSON.stringify(txt)).toString('base64url') });
  if (quadroImg) q.set('quadro', pathToFileURL(quadroImg).href);
  if (avatarImg) q.set('avatar', pathToFileURL(avatarImg).href);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--allow-file-access-from-files'] });
  const out: { fundo?: string; frente?: string; textoNaoCabe?: string[] } = {};
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: QUADRO.w, height: QUADRO.h, deviceScaleFactor: 1 });
    const erros: string[] = []; page.on('pageerror', (e: Error) => erros.push(e.message));
    for (const camada of m.formatos['9x16'].camadas as ('fundo' | 'frente')[]) {
      await page.goto(base + '?' + q + '&layer=' + camada, { waitUntil: 'networkidle0' });
      await page.evaluate(() => (window as any).__ready);
      const sobra: string[] = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-fit]')].filter(e => e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2).map(e => e.dataset.c!));
      if (sobra.length && camada === 'fundo') out.textoNaoCabe = sobra;
      const f = join(destino, `${camada}.png`);
      await page.screenshot({ path: f, omitBackground: true });
      out[camada] = f;
    }
    if (erros.length) throw new Error('embrulho: ' + erros[0]);
  } finally { await browser.close(); }
  return out;
}

/* vídeo (qualquer proporção, com áudio) + camadas → mp4 1080×1920. O vídeo cobre o slot e é cortado ao centro.
   shortcut: foco fixo no centro; passar o foco do format.json quando um 16:9 cortar o rosto. */
export function compor(m: Modelo, video: string, camadas: { fundo?: string; frente?: string }, saida: string, { duracao, fps = 30 }: { duracao: number; fps?: number }) {
  const s = slotsPx(m).video;
  const ins = ['-f', 'lavfi', '-i', `color=c=black:s=${QUADRO.w}x${QUADRO.h}:r=${fps}:d=${duracao}`, '-i', video, '-loop', '1', '-framerate', String(fps), '-i', camadas.fundo!];
  let fc = `[1:v]scale=${s.w}:${s.h}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h},setsar=1[v];[0:v][v]overlay=${s.x}:${s.y}:shortest=1[a];[a][2:v]overlay=0:0:shortest=1[b]`, ult = 'b';
  if (camadas.frente) { ins.push('-loop', '1', '-framerate', String(fps), '-i', camadas.frente); fc += `;[b][3:v]overlay=0:0:shortest=1[c]`; ult = 'c'; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', fc, '-map', `[${ult}]`, '-map', '1:a?', '-t', String(duracao), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', saida], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('composição: ' + (r.stderr || '').slice(-300));
}
