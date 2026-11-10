// Embrulhos (só 9:16, texto estático): os 9 modelos do PDF do editor e os refeitos da gravação do Lateralizador, em embrulhos/modelos/<id>/{manifest.json, 9x16/index.html}.
// O vídeo entra no slot "video"; as camadas são PNGs com alfa: "fundo" (tudo, com um furo no slot) vai por cima do vídeo e
// "frente" (ex.: avatar que invade a janela) por cima de tudo. Portado do kit antigo (compilador-studio/embrulhos.mjs).
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { findChrome } from './host.ts';

export const EMB = join(dirname(fileURLToPath(import.meta.url)), 'embrulhos', 'modelos');
export const QUADRO = { w: 1080, h: 1920 };
const RESERVADAS = new Set(['quadro_t', 'avatar']);            // chaves de `campos` que não são texto
const lerJson = (f: string) => JSON.parse(readFileSync(f, 'utf8'));

export type Campo = { id: string; papel: string; max: number; padrao?: string; fixo?: boolean; opcional?: boolean };
export type Modelo = {
  id: string; nome: string; tipo: string;
  formatos: { '9x16': { film: string; slots: Record<string, { x: number; y: number; w: number; h: number; raio?: number }>; camadas: string[] } };
  textoGrupo?: boolean; textoFixo?: boolean;   // blocos de texto escalam juntos / não se movem (a barra da Live)
  zonasTexto?: Caixa[];   // o que a moldura desenha por cima do vídeo (frações do quadro): o encaixe confere se cobre o rosto
  campos: Campo[]; midia?: { id: string; tipo: string; opcional?: boolean }[];
  // exige: 'quadro_marcante', 'preco_no_srt', 'perfil_nome', 'perfil_arroba' (os dois últimos vêm da etapa Marca); dica: frase a mais para a IA
  perfil: { tom: string[]; serveA: string[]; exige: string[]; evita: string[]; dica?: string };
};
export type Caixa = { x: number; y: number; w: number; h: number };
export type Extra = { arquivo: string; x: number; y: number; largura: number };
export type Item = { nivel: 'erro' | 'aviso'; campo: string; msg: string };

export const listarEmbrulhos = () => readdirSync(EMB).filter(d => existsSync(join(EMB, d, 'manifest.json'))).sort();

export function carregarEmbrulho(id: string): Modelo {
  const f = join(EMB, id, 'manifest.json');
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(f)) throw new Error(`embrulho "${id}" não existe`);
  const m = lerJson(f) as Modelo;
  if (!m.formatos?.['9x16']?.slots?.video || !Array.isArray(m.campos) || !m.perfil) throw new Error(`manifesto de ${id} inválido`);
  return m;
}
/* O vídeo cabe no modelo sem estragar o rosto? `rostos` = a caixa do maior rosto em cada instante amostrado (frações do vídeo, origem
   em cima à esquerda; null = sem rosto). Em cada instante o rosto é "cortado" quando menos de 80% dele sobra no recorte que o
   `compor` faz para o slot, e "coberto" quando mais de 15% dele fica debaixo de uma `zonasTexto`. Com mais de 20% dos instantes
   ruins o modelo pede adaptação. Sem rosto nenhum, encaixa. */
export function encaixe(m: Modelo, rostos: (Caixa | null)[], video: { largura: number; altura: number }, foco = { x: 0.5, y: 0.5 }): { ok: boolean; motivo: string } {
  const s = m.formatos['9x16'].slots.video, ar = video.largura / video.altura, sar = (s.w * QUADRO.w) / (s.h * QUADRO.h);
  // parte do vídeo que aparece no slot (frações do vídeo)
  const vw = Math.min(1, sar / ar), vh = Math.min(1, ar / sar), v = { x: (1 - vw) * foco.x, y: (1 - vh) * foco.y, w: vw, h: vh };
  const inter = (a: Caixa, b: Caixa) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  let n = 0, cortado = 0, coberto = 0;
  for (const r of rostos) {
    if (!r || r.w <= 0 || r.h <= 0) continue;
    n++;
    if (inter(r, v) / (r.w * r.h) < 0.8) { cortado++; continue; }
    // o rosto no quadro 9:16
    const q = { x: s.x + (r.x - v.x) / v.w * s.w, y: s.y + (r.y - v.y) / v.h * s.h, w: r.w / v.w * s.w, h: r.h / v.h * s.h };
    if ((m.zonasTexto ?? []).some(z => inter(q, z) / (q.w * q.h) > 0.15)) coberto++;
  }
  if (!n || (cortado + coberto) / n <= 0.2) return { ok: true, motivo: '' };
  return { ok: false, motivo: cortado >= coberto ? 'O rosto fica cortado em parte do vídeo.' : 'O rosto fica coberto em parte do vídeo.' };
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
  for (const c of m.campos) if (!/^preco_/.test(c.id) && c.papel !== 'contador') for (const n of String(campos[c.id] || '').match(/\d+(?:[.,]\d+)?/g) || []) if (!fonte.includes(norm(n)) && !vistos.includes(n)) { vistos.push(n); add('aviso', c.id, `número "${n}" não aparece no texto do vídeo: marque como ilustrativo ou remova`); }
  return r;
}

/* ---------- quadro marcante ---------- */
/* imagem (frame do vídeo ou enviada) → recorte na proporção do slot "quadro", com zoom e posição. A página só encaixa o resultado. */
export function recortarQuadro(m: Modelo, origem: string, destino: string, { zoom = 1, x = 0.5, y = 0.5 } = {}) {
  const s = slotsPx(m).quadro; if (!s) return origem;
  const f01 = (v: number) => Math.min(1, Math.max(0, Number(v) || 0)), z = Math.min(3, Math.max(1, Number(zoom) || 1));
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', origem, '-frames:v', '1', '-vf', `scale=${Math.ceil(s.w * z / 2) * 2}:${Math.ceil(s.h * z / 2) * 2}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h}:(iw-ow)*${f01(x)}:(ih-oh)*${f01(y)}`, '-q:v', '2', destino], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(destino)) throw new Error('não consegui recortar a imagem: ' + (r.stderr || '').slice(-200));
  return destino;
}
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
const CHROME = findChrome();
// Um Chrome só para todos os renders: abrir um por render custava segundos e rebaixava a fonte do Google a cada vez (perfil novo,
// cache vazio). Fecha sozinho depois de 60 s parado; os testes chamam fecharNavegador() para o processo poder sair.
let nav: Promise<any> | null = null, ocioso: ReturnType<typeof setTimeout> | undefined, emUso = 0;
async function navegador() {
  if (!CHROME) throw new Error('Chrome não encontrado. Instale o Google Chrome ou defina CHROME_PATH.');
  clearTimeout(ocioso); emUso++;
  if (nav && !(await nav.catch(() => null))?.connected) nav = null;   // caiu ou não abriu: abre outro
  nav ??= createRequire(import.meta.url)('puppeteer-core').launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--allow-file-access-from-files'] });
  return nav;
}
function soltar() { if (--emUso <= 0) { emUso = 0; ocioso = setTimeout(fecharNavegador, 60_000); } }
export async function fecharNavegador() { clearTimeout(ocioso); const b = nav; nav = null; await (await b?.catch(() => null))?.close().catch(() => {}); }

export async function renderCamadas(m: Modelo, campos: Record<string, unknown>, { quadroImg = null as string | null, avatarImg = null as string | null, semAvatar = false, texto = null as { x?: number; y?: number; escala?: number } | null, destino = '' }) {
  mkdirSync(destino, { recursive: true });
  const base = pathToFileURL(join(EMB, m.id, m.formatos['9x16'].film)).href;
  const txt = Object.fromEntries(Object.entries(campos).filter(([k]) => !RESERVADAS.has(k)));
  const q = new URLSearchParams({ c: Buffer.from(JSON.stringify(txt)).toString('base64url') });
  if (quadroImg) q.set('quadro', pathToFileURL(quadroImg).href);
  if (avatarImg) q.set('avatar', pathToFileURL(avatarImg).href);
  if (semAvatar) q.set('semavatar', '1');
  if (texto && !m.textoFixo) { q.set('tx', String(texto.x ?? 0)); q.set('ty', String(texto.y ?? 0)); q.set('ts', String(texto.escala ?? 1)); if (m.textoGrupo) q.set('tg', '1'); }
  const out: { fundo?: string; frente?: string; textoNaoCabe?: string[]; textoBox?: Caixa | null } = {};
  const browser = await navegador().catch(e => { soltar(); throw e; });
  const page = await browser.newPage().catch((e: Error) => { soltar(); throw e; });
  try {
    await page.setViewport({ width: QUADRO.w, height: QUADRO.h, deviceScaleFactor: 1 });
    const erros: string[] = []; page.on('pageerror', (e: Error) => erros.push(e.message));
    for (const camada of m.formatos['9x16'].camadas as ('fundo' | 'frente')[]) {
      await page.goto(base + '?' + q + '&layer=' + camada, { waitUntil: 'networkidle0' });
      await page.evaluate(() => (window as any).__ready);
      const sobra: string[] = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-fit]')].filter(e => e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2).map(e => e.dataset.c!));
      if (sobra.length && camada === 'fundo') out.textoNaoCabe = sobra;
      // onde os blocos de texto ficaram (já movidos e escalados), em frações do quadro: a tela desenha a caixa de arrastar em cima disso
      if (camada === 'fundo') out.textoBox = await page.evaluate(() => {
        const r = [...document.querySelectorAll<HTMLElement>('.t, [data-mv]')].map(e => e.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0);
        if (!r.length) return null;
        const x = Math.min(...r.map(b => b.left)), y = Math.min(...r.map(b => b.top)), x1 = Math.max(...r.map(b => b.right)), y1 = Math.max(...r.map(b => b.bottom));
        return { x: x / 1080, y: y / 1920, w: (x1 - x) / 1080, h: (y1 - y) / 1920 };
      });
      const f = join(destino, `${camada}.png`);
      await page.screenshot({ path: f, omitBackground: true });
      out[camada] = f;
    }
    if (erros.length) throw new Error('embrulho: ' + erros[0]);
  } finally { await page.close().catch(() => {}); soltar(); }
  return out;
}

/* vídeo (qualquer proporção, com áudio) + camadas → mp4 9:16. O vídeo (9:16, 1:1, 16:9...) cobre o slot e o que sobra é cortado:
   `focoY` (0 topo, 1 base) escolhe a faixa quando ele é mais alto que o slot, `focoX` (0 esquerda, 1 direita) quando é mais largo.
   `zoom` (1 a 3) aproxima o vídeo dentro do slot, e então os dois focos valem sempre.
   `previa` troca 1080×1920 em qualidade de entrega por 540×960 em codificação rápida: medido em 15 s de vídeo, 2,4 s e 1 MB contra
   28 s e 14 MB. As camadas entram como uma imagem só (o overlay repete o último quadro), não como vídeo em laço. */
export function compor(m: Modelo, video: string, camadas: { fundo?: string; frente?: string }, saida: string, { duracao, fps = 30, focoY = 0.5, focoX = 0.5, zoom = 1, previa = false, extras = [] }: { duracao: number; fps?: number; focoY?: number; focoX?: number; zoom?: number; previa?: boolean; extras?: Extra[] }) {
  const k = previa ? 0.5 : 1, par = (v: number) => Math.round(v * k / 2) * 2, W = QUADRO.w * k, H = QUADRO.h * k;
  const p = slotsPx(m).video, s = { x: par(p.x), y: par(p.y), w: par(p.w), h: par(p.h) };
  const f01 = (v: number) => Math.min(1, Math.max(0, Number(v) || 0)), fy = f01(focoY), fx = f01(focoX);
  const ins = ['-t', String(duracao), '-i', video, '-i', camadas.fundo!];
  const z = Math.min(3, Math.max(1, Number(zoom) || 1)), zw = Math.ceil(s.w * z / 2) * 2, zh = Math.ceil(s.h * z / 2) * 2;
  let fc = `[0:v]fps=${fps},scale=${zw}:${zh}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h}:(iw-ow)*${fx}:(ih-oh)*${fy},setsar=1,pad=${W}:${H}:${s.x}:${s.y}:black[v];[1:v]scale=${W}:${H}[f];[v][f]overlay=0:0[b]`, ult = 'b';
  if (camadas.frente) { ins.push('-i', camadas.frente); fc += `;[2:v]scale=${W}:${H}[g];[b][g]overlay=0:0[c]`; ult = 'c'; }
  // imagens soltas do usuário, por cima de tudo: centro em (x, y) e largura, em frações do quadro
  extras.forEach((e, i) => { const n = (camadas.frente ? 3 : 2) + i; ins.push('-i', e.arquivo); fc += `;[${n}:v]scale=${Math.max(2, Math.round(W * e.largura / 2) * 2)}:-2[x${i}];[${ult}][x${i}]overlay=${W * e.x}-w/2:${H * e.y}-h/2[y${i}]`; ult = `y${i}`; });
  const enc = previa ? ['-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k'] : ['-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'];
  return new Promise<void>((ok, ko) => execFile('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', fc, '-map', `[${ult}]`, '-map', '0:a?', '-t', String(duracao), '-c:v', 'libx264', ...enc, '-movflags', '+faststart', saida],
    { maxBuffer: 1 << 24 }, (e, _o, err) => e ? ko(new Error('composição: ' + String(err || e.message).slice(-300))) : ok()));
}
