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
// proporções de saída: um modelo só existe nas que o manifesto dele declara em `formatos` (a 9:16 é obrigatória)
export const PROPS = { '9x16': QUADRO, '4x5': { w: 1080, h: 1350 }, '16x9': { w: 1920, h: 1080 } };
export type Prop = keyof typeof PROPS;
type Desenho = { film: string; slots: Record<string, { x: number; y: number; w: number; h: number; raio?: number }>; camadas: string[]; zonasTexto?: Caixa[] };   // zonasTexto das proporções novas: medidas por scripts/zonas-embrulhos.ts
const RESERVADAS = new Set(['quadro_t', 'avatar']);            // chaves de `campos` que não são texto
const lerJson = (f: string) => JSON.parse(readFileSync(f, 'utf8'));

export type Campo = { id: string; papel: string; max: number; padrao?: string; fixo?: boolean; opcional?: boolean };
export type Modelo = {
  id: string; nome: string; tipo: string;
  formatos: { '9x16': Desenho } & Partial<Record<Prop, Desenho>>;
  textoGrupo?: boolean; textoFixo?: boolean;   // blocos de texto escalam juntos / não se movem (a barra da Live)
  zonasTexto?: Caixa[];   // o que a moldura desenha por cima do vídeo (frações do quadro): o encaixe confere se cobre o rosto
  campos: Campo[]; midia?: { id: string; tipo: string; opcional?: boolean }[];
  // exige: 'quadro_marcante', 'preco_no_srt', 'perfil_nome', 'perfil_arroba' (os dois últimos vêm da etapa Marca); dica: frase a mais para a IA
  perfil: { tom: string[]; serveA: string[]; exige: string[]; evita: string[]; dica?: string };
};
export type Caixa = { x: number; y: number; w: number; h: number };
export type Extra = { arquivo: string; x: number; y: number; largura: number; video?: boolean };
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
export function encaixe(m: Modelo, rostos: (Caixa | null)[], video: { largura: number; altura: number }, foco = { x: 0.5, y: 0.5 }, prop: Prop = '9x16'): { ok: boolean; motivo: string } {
  const F = m.formatos[prop]!, Q = PROPS[prop], zonas = F.zonasTexto ?? (prop === '9x16' ? m.zonasTexto : undefined) ?? [];
  const ar = video.largura / video.altura, sar = (F.slots.video.w * Q.w) / (F.slots.video.h * Q.h);
  // 16:9 com o vídeo inteiro e centralizado (zoomPadrao): nada é cortado, e o "slot" do rosto é só a coluna que o vídeo ocupa
  const z = zoomPadrao(m, prop, video.largura, video.altura), sv = F.slots.video, s = z < 1 ? { x: sv.x + sv.w * (1 - ar / sar) / 2, y: sv.y, w: sv.w * ar / sar, h: sv.h } : sv;
  // parte do vídeo que aparece no slot (frações do vídeo)
  const vw = z < 1 ? 1 : Math.min(1, sar / ar), vh = z < 1 ? 1 : Math.min(1, ar / sar), v = { x: (1 - vw) * foco.x, y: (1 - vh) * foco.y, w: vw, h: vh };
  const inter = (a: Caixa, b: Caixa) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  let n = 0, cortado = 0, coberto = 0;
  for (const r of rostos) {
    if (!r || r.w <= 0 || r.h <= 0) continue;
    n++;
    if (inter(r, v) / (r.w * r.h) < 0.8) { cortado++; continue; }
    // o rosto no quadro 9:16
    const q = { x: s.x + (r.x - v.x) / v.w * s.w, y: s.y + (r.y - v.y) / v.h * s.h, w: r.w / v.w * s.w, h: r.h / v.h * s.h };
    if (zonas.some(z => inter(q, z) / (q.w * q.h) > 0.15)) coberto++;
  }
  if (!n || (cortado + coberto) / n <= 0.2) return { ok: true, motivo: '' };
  return { ok: false, motivo: cortado >= coberto ? 'O rosto fica cortado em parte do vídeo.' : 'O rosto fica coberto em parte do vídeo.' };
}

/* Escala do vídeo quando a pessoa ainda não mexeu: 1 (cobre a janela), menos em 16:9 quando o vídeo é mais estreito que uma janela
   larga: aí ele entra inteiro e centralizado (o resto é a imagem de fundo da Marca ou ele mesmo desfocado). Janela quase quadrada
   ou em pé (Oferta, Notícia, POV, as de tela dividida): o vídeo cobre, como na 9:16. */
export function zoomPadrao(m: Modelo, prop: Prop, vw: number, vh: number) {
  const s = m.formatos[prop]!.slots.video, Q = PROPS[prop], w = s.w * Q.w, h = s.h * Q.h, cob = Math.max(w / vw, h / vh), cab = Math.min(w / vw, h / vh);
  return prop === '16x9' && cab < cob && w / h > 1.5 ? cab / cob : 1;
}

/* slots em pixels do quadro da proporção (pares, para o encoder) */
export function slotsPx(m: Modelo, prop: Prop = '9x16') {
  const QUADRO = PROPS[prop];
  const par = (v: number) => Math.round(v / 2) * 2, out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const [k, s] of Object.entries(m.formatos[prop]!.slots)) out[k] = { x: par(s.x * QUADRO.w), y: par(s.y * QUADRO.h), w: par(s.w * QUADRO.w), h: par(s.h * QUADRO.h) };
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
export function recortarQuadro(m: Modelo, origem: string, destino: string, { zoom = 1, x = 0.5, y = 0.5, prop = '9x16' as Prop } = {}) {
  const s = slotsPx(m, prop).quadro; if (!s) return origem;
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

let vez: Promise<void> = Promise.resolve();
export async function renderCamadas(m: Modelo, campos: Record<string, unknown>, { quadroImg = null as string | null, avatarImg = null as string | null, semAvatar = false, texto = null as { x?: number; y?: number; escala?: number } | null, pecas = null as Record<string, number[]> | null, contador = null as { campo: string; valores: string[] } | null, prop = '9x16' as Prop, destino = '' }) {
  mkdirSync(destino, { recursive: true });
  const F = m.formatos[prop], QUADRO = PROPS[prop];
  if (!F) throw new Error(`${m.nome} não tem desenho em ${prop}`);
  const base = pathToFileURL(join(EMB, m.id, F.film)).href;
  const txt = Object.fromEntries(Object.entries(campos).filter(([k]) => !RESERVADAS.has(k)));
  const q = new URLSearchParams({ c: Buffer.from(JSON.stringify(txt)).toString('base64url') });
  if (quadroImg) q.set('quadro', pathToFileURL(quadroImg).href);
  if (avatarImg) q.set('avatar', pathToFileURL(avatarImg).href);
  if (semAvatar) q.set('semavatar', '1');
  if (prop !== '9x16') q.set('p', prop);   // a mesma página, com a classe p-<prop> no <html>: o css do modelo reposiciona as peças
  if (texto && !m.textoFixo) { q.set('tx', String(texto.x ?? 0)); q.set('ty', String(texto.y ?? 0)); q.set('ts', String(texto.escala ?? 1)); if (m.textoGrupo) q.set('tg', '1'); }
  if (pecas && Object.keys(pecas).length) q.set('el', Buffer.from(JSON.stringify(pecas)).toString('base64url'));
  const out: { fundo?: string; frente?: string; textoNaoCabe?: string[]; caixas?: (Caixa & { k: string })[]; contador?: { padrao: string; x: number; y: number } } = {};
  // Uma página por vez no Chrome, aberta só quando chega a vez dela: uma aba em segundo plano não pinta (uma camada saiu em branco)
  // nem termina de decodificar imagem (o __ready da página travava). A composição no ffmpeg continua em paralelo.
  const antes = vez; let passar!: () => void; vez = new Promise<void>(r => { passar = r; }); await antes;
  const browser = await navegador().catch(e => { passar(); soltar(); throw e; });
  const page = await browser.newPage().catch((e: Error) => { passar(); soltar(); throw e; });
  try {
    await page.setViewport({ width: QUADRO.w, height: QUADRO.h, deviceScaleFactor: 1 });
    const erros: string[] = []; page.on('pageerror', (e: Error) => erros.push(e.message));
    for (const camada of F.camadas as ('fundo' | 'frente')[]) {
      await page.goto(base + '?' + q + '&layer=' + camada, { waitUntil: 'networkidle0' });
      await page.evaluate(() => (window as any).__ready);
      const sobra: string[] = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-fit]')].filter(e => e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2).map(e => e.dataset.c!));
      if (sobra.length && camada === 'fundo') out.textoNaoCabe = sobra;
      // onde cada peça ficou (já movida e escalada), em frações do quadro: a tela desenha as caixas de arrastar em cima disso
      if (camada === 'fundo') out.caixas = await page.evaluate(() => (window as any).CAIXAS ?? []);
      // contador que muda durante o vídeo: a peça que o mostra sai da camada e vira uma imagem pequena por valor (c00.png, c01.png...)
      if (camada === 'fundo' && contador) {
        const sel = `[data-c="${contador.campo}"]`;
        const cx = await page.evaluate((s: string) => { const p = document.querySelector(s)?.closest('body > *') as HTMLElement | null; if (!p) return null;
          const b = p.getBoundingClientRect(); if (!b.width) return null;
          [...document.body.children].forEach(x => { (x as HTMLElement).style.visibility = x === p ? '' : 'hidden'; });
          return { x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.width) + 1, height: Math.ceil(b.height) + 1 }; }, sel);
        if (cx) {
          for (const [i, v] of contador.valores.entries()) {
            await page.evaluate((s: string, t: string) => { document.querySelector(s)!.textContent = t; }, sel, v);
            await page.screenshot({ path: join(destino, `c${String(i).padStart(2, '0')}.png`), omitBackground: true, clip: cx });
          }
          await page.evaluate((s: string) => { const p = document.querySelector(s)!.closest('body > *'); [...document.body.children].forEach(x => { (x as HTMLElement).style.visibility = x === p ? 'hidden' : ''; }); }, sel);
          out.contador = { padrao: join(destino, 'c%02d.png'), x: cx.x, y: cx.y };
        }
      }
      const f = join(destino, `${camada}.png`);
      await page.screenshot({ path: f, omitBackground: true });
      out[camada] = f;
    }
    if (erros.length) throw new Error('embrulho: ' + erros[0]);
  } finally { await page.close().catch(() => {}); passar(); soltar(); }
  return out;
}

/* vídeo (qualquer proporção, com áudio) + camadas → mp4 na proporção `prop` (9:16 se não vier). O vídeo (9:16, 1:1, 16:9...) cobre o slot e o que sobra é cortado:
   `focoY` (0 topo, 1 base) escolhe a faixa quando ele é mais alto que o slot, `focoX` (0 esquerda, 1 direita) quando é mais largo.
   `slot` (frações do quadro) troca a janela do manifesto quando a pessoa moveu a peça `slot`; pode sair do quadro.
   `zoom` (0 a 3): 1 cobre o slot, acima aproxima, abaixo encolhe o vídeo (proporcional, até quase 0) e o resto do slot é preenchido
   por `fundoImg` ou, sem ela, pelo próprio vídeo desfocado; `vw`/`vh` são o tamanho do vídeo. Os dois focos valem sempre.
   `video2`/`trocar`: modelos com o slot `video2` (tela dividida) mostram o segundo vídeo ali, e `trocar` inverte os dois; `ate` limita o embrulho aos primeiros segundos.
   `previa` troca 1080×1920 em qualidade de entrega por 540×960 em codificação rápida: medido em 15 s de vídeo, 2,4 s e 1 MB contra
   28 s e 14 MB. As camadas entram como uma imagem só (o overlay repete o último quadro), não como vídeo em laço. */
export function compor(m: Modelo, video: string, camadas: { fundo?: string; frente?: string }, saida: string, { duracao, fps = 30, focoY = 0.5, focoX = 0.5, zoom = 1, previa = false, extras = [], slot = null, contador = null, vw = 0, vh = 0, fundoImg = null, video2 = null, trocar = false, ate = null, prop = '9x16' }: { prop?: Prop; video2?: { arquivo: string; w: number; h: number } | null; trocar?: boolean; ate?: number | null; vw?: number; vh?: number; fundoImg?: string | null; contador?: { padrao: string; x: number; y: number } | null; duracao: number; fps?: number; focoY?: number; focoX?: number; zoom?: number; previa?: boolean; extras?: Extra[]; slot?: Caixa | null }) {
  const QUADRO = PROPS[prop], k = previa ? 0.5 : 1, par = (v: number) => Math.round(v * k / 2) * 2, W = par(QUADRO.w), H = par(QUADRO.h);
  const px = (r: Caixa) => ({ x: par(r.x), y: par(r.y), w: par(r.w), h: par(r.h) }), SL = slotsPx(m, prop);
  const f01 = (v: number) => Math.min(1, Math.max(0, Number(v) || 0)), fy = f01(focoY), fx = f01(focoX);
  const z = Math.min(3, Math.max(0, Number(zoom ?? 1)));
  const ins = ['-t', String(duracao), '-i', video, '-i', camadas.fundo!];   // a entrada 0 só dá o áudio; cada janela abre a sua
  let n = 2;
  // uma janela: o vídeo na escala pedida dentro do slot s, e o que sobra preenchido pela imagem de fundo ou por ele mesmo desfocado
  const jan = (src: { arquivo: string; w: number; h: number; loop?: boolean }, s: { x: number; y: number; w: number; h: number }, t: number) => {
    ins.push('-t', String(duracao), ...(src.loop ? ['-stream_loop', '-1'] : []), '-i', src.arquivo); const i = n++, ok = src.w > 0 && src.h > 0, cob = ok ? Math.max(s.w / src.w, s.h / src.h) : 1;
    // sem o tamanho do vídeo só dá para cobrir o slot, como antes
    const w = ok ? Math.max(2, Math.round(src.w * cob * z / 2) * 2) : Math.ceil(s.w * Math.max(1, z) / 2) * 2, h = ok ? Math.max(2, Math.round(src.h * cob * z / 2) * 2) : Math.ceil(s.h * Math.max(1, z) / 2) * 2;
    const sobra = w < s.w || h < s.h, cobre = `scale=${s.w}:${s.h}:force_original_aspect_ratio=increase,crop=${s.w}:${s.h}`;
    let bg = `color=black:s=${s.w}x${s.h}:r=${fps}[bg${t}]`, vv = `[${i}:v]fps=${fps},scale=${w}:${h},setsar=1[vv${t}]`;
    if (sobra && fundoImg) { ins.push('-loop', '1', '-i', fundoImg); bg = `[${n++}:v]fps=${fps},${cobre},setsar=1[bg${t}]`; }
    else if (sobra) { const r = Math.max(1, Math.min(Math.round(40 * k), Math.floor(s.w / 2) - 1, Math.floor(s.h / 2) - 1)); vv = `[${i}:v]fps=${fps},split[s0${t}][s1${t}];[s1${t}]${cobre},boxblur=${r}:3,setsar=1[bg${t}];[s0${t}]scale=${w}:${h},setsar=1[vv${t}]`; bg = ''; }
    // negativo = o vídeo passa do slot e o overlay corta
    return `${vv};${bg ? bg + ';' : ''}[bg${t}][vv${t}]overlay=${Math.round((s.w - w) * fx)}:${Math.round((s.h - h) * fy)}:shortest=1[j${t}]`;
  };
  const principal = { arquivo: video, w: vw, h: vh }, outro = video2 ? { arquivo: video2.arquivo, w: video2.w, h: video2.h, loop: true } : principal;
  const rects = [slot ? px({ x: slot.x * QUADRO.w, y: slot.y * QUADRO.h, w: slot.w * QUADRO.w, h: slot.h * QUADRO.h }) : px(SL.video), ...(SL.video2 ? [px(SL.video2)] : [])];
  const fontes = trocar ? [outro, principal] : [principal, outro];   // sem segundo vídeo a segunda janela repete o principal
  let fc = `color=black:s=${W}x${H}:r=${fps}[bk]`, cur = 'bk';
  rects.forEach((r, t) => { fc += `;${jan(fontes[t], r, t)};[${cur}][j${t}]overlay=${r.x}:${r.y}:shortest=1[v${t}]`; cur = `v${t}`; });
  fc += `;[1:v]scale=${W}:${H}[f];[${cur}][f]overlay=0:0[b]`; let ult = 'b';
  if (camadas.frente) { ins.push('-i', camadas.frente); fc += `;[${n++}:v]scale=${W}:${H}[g];[b][g]overlay=0:0[c]`; ult = 'c'; }
  // o contador troca de imagem a cada 1,5 s, em laço
  if (contador) { ins.push('-stream_loop', '-1', '-framerate', '2/3', '-i', contador.padrao); fc += `;[${n++}:v]scale=iw*${k}:ih*${k}[ct];[${ult}][ct]overlay=${contador.x * k}:${contador.y * k}[d]`; ult = 'd'; }
  // imagens e vídeos soltos do usuário, por cima de tudo: centro em (x, y) e largura, em frações do quadro (vídeo em laço, sem som)
  extras.forEach((e, i) => { if (e.video) ins.push('-stream_loop', '-1'); ins.push('-i', e.arquivo); fc += `;[${n++}:v]scale=${Math.max(2, Math.round(W * e.largura / 2) * 2)}:-2[x${i}];[${ult}][x${i}]overlay=${W * e.x}-w/2:${H * e.y}-h/2[y${i}]`; ult = `y${i}`; });
  // o embrulho só fica `ate` segundos: depois o vídeo aparece limpo, cobrindo o quadro todo
  if (ate && ate < duracao) { ins.push('-t', String(duracao), '-i', video); fc += `;[${n++}:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-ow)*${fx}:(ih-oh)*${fy},setsar=1[rw];[${ult}][rw]overlay=0:0:enable='gte(t,${ate})'[rr]`; ult = 'rr'; }
  const enc = previa ? ['-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k'] : ['-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'];
  return new Promise<void>((ok, ko) => execFile('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', fc, '-map', `[${ult}]`, '-map', '0:a?', '-t', String(duracao), '-c:v', 'libx264', ...enc, '-movflags', '+faststart', saida],
    { maxBuffer: 1 << 24 }, (e, _o, err) => e ? ko(new Error('composição: ' + String(err || e.message).slice(-300))) : ok()));
}
