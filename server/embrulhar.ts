// Aba Embrulhos (SPEC-embrulhos.md): uma sessão = um vídeo pronto, embrulhado nos modelos que o usuário escolhe. A IA só preenche os
// campos; o usuário edita tudo, vê a prévia (15 s) e exporta. Sessão em workspace/embrulhos/<id>/, sem git, no molde do Motion Think.
// Fica fora de embrulhos.ts porque pipeline.ts importa aquele módulo e este importa pipeline.ts.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { ask, type Cost } from './models.ts';
import { safeId, type Word } from './lib.ts';
import { type Caixa, type Extra, carregarEmbrulho, compor, EMB, encaixe, recortarQuadro, conferirCampos, extrairQuadro, type Item, listarEmbrulhos, type Modelo, precosDoSrt, renderCamadas, sugerirQuadros } from './embrulhos.ts';
import { emit, execP, expandHome, finalName, intake, probeMedia, py, SKILL, subscribe, UserError, WS } from './pipeline.ts';

// vídeo no slot: foco_x/foco_y (0 a 1) e video_zoom (1 a 3); imagem parada: quadro_t ou imagem, quadro_zoom/x/y; texto: deslocamento em px do quadro 1080×1920 e escala
type Ajustes = { quadro_t?: number; imagem?: string | null; foco_y?: number; foco_x?: number; video_zoom?: number; quadro_zoom?: number; quadro_x?: number; quadro_y?: number; texto_x?: number; texto_y?: number; texto_escala?: number; elementos?: Record<string, number[]> };   // elementos: peça da moldura → [dx px, dy px, escala]
const LIMITES: Record<string, [number, number]> = { foco_x: [0, 1], foco_y: [0, 1], video_zoom: [1, 3], quadro_zoom: [1, 3], quadro_x: [0, 1], quadro_y: [0, 1], texto_x: [-540, 540], texto_y: [-960, 960], texto_escala: [0.5, 1.8] };
// imagens: figuras que o usuário solta em qualquer lugar do quadro (arquivo dentro da sessão; centro x/y e largura em frações do quadro)
export type Formato = { selecionado: boolean; incluir: boolean; aprovado: boolean; campos: Record<string, string>; ajustes: Ajustes; imagens?: Extra[]; angulo?: string; caixas?: (Caixa & { k: string })[]; itens: Item[]; avisos: string[];
  editadoEm: number; previaEm: number; exportadoEm: number; arquivo?: string };
// quem assina os anúncios: foto, nome e @ dos modelos com perfil. `avatar` é o arquivo dentro da sessão.
export type Perfil = { nome: string; arroba: string; mostrarLogo: boolean; mostrarArroba: boolean; avatar?: string };
type Leitura = { oferta: string; publico: string; promessa: string; cta: string };
type State = { id: string; name: string; src: string; duracao: number; largura: number; altura: number; status: 'novo' | 'analisado' | 'error'; error?: string;
  quadros: number[]; perfil: Perfil; leitura?: Leitura; formatos: Record<string, Formato>; cost: Cost[]; version: number; createdAt: string };

const DIR = join(WS, 'embrulhos');
const KEY = (id: string) => `embrulhos/${id}`;   // canal de SSE
export const PREVIA_S = 15;
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm'], IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
const fail = (m: string): never => { throw new UserError(m); };
const dirOf = (id: string) => safeId(id) ? join(DIR, id) : fail('id inválido');
const readJSON = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const writeJSON = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));
const load = (id: string): State => existsSync(join(dirOf(id), 'state.json')) ? { perfil: { nome: '', arroba: '', mostrarLogo: true, mostrarArroba: true }, ...readJSON(join(dirOf(id), 'state.json')) } : fail(`não existe a sessão ${id}`);
const save = (st: State) => writeJSON(join(dirOf(st.id), 'state.json'), st);
const log = (id: string, line: string) => { emit(KEY(id), 'log', line); appendFileSync(join(dirOf(id), 'log.txt'), line + '\n'); };
const logCost = (st: State) => (c: Cost) => { st.cost.push(c); save(st); emit(KEY(st.id), 'cost', c); };
const modelo = (mid: string): Modelo => { try { return carregarEmbrulho(mid); } catch (e) { return fail((e as Error).message); } };
const usaPerfil = (m: Modelo) => (m.midia ?? []).some(x => x.id === 'avatar') || m.perfil.exige.some(x => x.startsWith('perfil_'));
const PADRAO = join(DIR, 'perfil.json'), PADRAO_IMG = join(DIR, 'perfil.png');
const pedeQuadro = (m: Modelo) => m.perfil.exige.includes('quadro_marcante');
const novo = (): Formato => ({ selecionado: true, incluir: true, aprovado: false, campos: {}, ajustes: {}, itens: [], avisos: [], editadoEm: 0, previaEm: 0, exportadoEm: 0 });

// ---- um passo por vez por sessão ----
const busy = new Map<string, { step: string; startedAt: number }>();
export const getBusy = (id: string) => busy.get(id) ?? null;
async function locked<T>(id: string, step: string, fn: (st: State) => Promise<T>): Promise<T> {
  const st = load(id), cur = busy.get(id);
  if (cur) fail(`sessão ocupada (${cur.step} há ${Math.round((Date.now() - cur.startedAt) / 1000)} s)`);
  busy.set(id, { step, startedAt: Date.now() });
  emit(KEY(id), 'step', { step, status: 'start', startedAt: Date.now() });
  try { const r = await fn(st); emit(KEY(id), 'step', { step, status: 'done' }); return r; }
  catch (e) { emit(KEY(id), 'step', { step, status: 'error', error: (e as Error).message, quota: !!(e as { quota?: boolean }).quota }); log(id, `ERRO em ${step}: ${(e as Error).message}`); throw e; }
  finally { busy.delete(id); }
}
export const events = (id: string, fn: (ev: string, data: unknown) => void) => { load(id); return subscribe(KEY(id), fn); };

// ---- sessões ----
export const modelos = () => listarEmbrulhos().map(mid => { const m = carregarEmbrulho(mid), f = m.formatos['9x16']; return { id: m.id, nome: m.nome, tipo: m.tipo, campos: m.campos, exige: m.perfil.exige, pedeQuadro: pedeQuadro(m), textoMovel: !m.textoFixo, usaPerfil: usaPerfil(m), mostraNome: m.perfil.exige.includes('perfil_nome'), film: f.film, slot: f.slots.video }; });
// Miniatura do catálogo: o modelo com textos de exemplo, renderizado uma vez e guardado (png com alfa, 270 px de largura). A chave
// é a data de alteração do modelo, então editar o html ou o manifesto refaz a imagem. Antes eram 14 <iframe> de 1080×1920 ao vivo.
const MINI = join(DIR, '.miniaturas'), fazendo = new Map<string, Promise<string>>();
export function miniatura(mid: string): Promise<string> {
  const m = modelo(mid), f = m.formatos['9x16'];
  const chave = Math.round(statSync(join(EMB, mid, 'manifest.json')).mtimeMs + statSync(join(EMB, mid, f.film)).mtimeMs + statSync(join(EMB, '_shared', 'embrulho.js')).mtimeMs);
  const png = join(MINI, `${mid}-${chave}.png`);
  if (existsSync(png)) return Promise.resolve(png);
  if (!fazendo.has(png)) fazendo.set(png, (async () => {
    const rot = (c: { id: string; papel: string; padrao?: string }) => c.padrao || (c.papel || c.id).replace(/_/g, ' ').replace(/^./, x => x.toUpperCase());
    const c = await renderCamadas(m, { ...Object.fromEntries(m.campos.map(x => [x.id, rot(x)])), perfil_nome: 'Sua marca', perfil_arroba: '@suamarca' }, { destino: join(MINI, mid) });
    for (const velho of readdirSync(MINI).filter(x => x.startsWith(mid + '-') && x.endsWith('.png'))) rmSync(join(MINI, velho));
    await execP('ffmpeg', ['-v', 'error', '-y', '-i', c.fundo!, ...(c.frente ? ['-i', c.frente, '-filter_complex', '[0][1]overlay,scale=270:-1'] : ['-vf', 'scale=270:-1']), png]);
    return png;
  })().finally(() => fazendo.delete(png)));
  return fazendo.get(png)!;
}
// the model pages (html, css, js), served so the Marca stage can show one in an <iframe> with the profile being edited
export function moldeFile(rel: string) {
  const f = resolve(EMB, rel);
  if (!f.startsWith(EMB + '/') || rel.split('/').includes('..') || !existsSync(f) || statSync(f).isDirectory()) fail(`sem ${rel}`);
  return f;
}
export const list = () => existsSync(DIR) ? readdirSync(DIR).filter(d => existsSync(join(DIR, d, 'state.json'))).map(d => {
  const s = load(d), f = Object.values(s.formatos).filter(x => x.selecionado);
  return { id: s.id, name: s.name, status: s.status, duracao: s.duracao, formatos: f.length, exportados: f.filter(x => x.exportadoEm).length, createdAt: s.createdAt };
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
export function get(id: string) {
  const st = load(id), L = join(dirOf(id), 'log.txt');
  return { ...st, busy: getBusy(id), encaixe: encaixes(id), analisado: existsSync(join(dirOf(id), 'words.json')), log: existsSync(L) ? readFileSync(L, 'utf8').split('\n').filter(Boolean).slice(-60) : [] };
}
export function remove(id: string) { load(id); if (busy.has(id)) fail('sessão ocupada'); rmSync(dirOf(id), { recursive: true, force: true }); return { ok: true }; }
export function file(id: string, rel: string) {
  load(id);
  const f = resolve(dirOf(id), rel);
  if (!f.startsWith(dirOf(id) + '/') || rel.split('/').includes('..') || !existsSync(f) || statSync(f).isDirectory()) fail(`sem ${rel}`);
  return f;
}

const slugOf = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// { video } = arquivo enviado pelo /upload (movido) ou caminho local (copiado); { projeto } = o render 9:16 de um projeto (copiado)
export async function create(o: { name?: string; video?: string; projeto?: string }) {
  let video = o?.video ? expandHome(String(o.video)) : '';
  if (!video && o?.projeto) {
    const P = safeId(o.projeto) ? join(WS, 'projects', o.projeto) : fail('projeto inválido');
    video = [finalName('9:16'), 'final.mp4', 'master.mp4'].map(f => join(P, f)).find(existsSync) ?? fail('o projeto ainda não tem vídeo renderizado');
  }
  if (!video) fail('envie um vídeo');
  if (!VIDEO_EXT.includes(extname(video).toLowerCase()) || !existsSync(video)) fail(`vídeo inválido ou não encontrado: ${video}`);
  const name = String(o.name || o.projeto || basename(video, extname(video)).replace(/^\d{13}-/, '')).trim().replace(/[\\/:]+/g, ' ');
  const id = `${new Date().toISOString().slice(0, 10)}-${slugOf(name) || 'video'}-${Date.now().toString(36).slice(-4)}`;
  mkdirSync(dirOf(id), { recursive: true });
  const src = join(dirOf(id), 'src' + extname(video).toLowerCase());
  try {
    if (o.projeto && !o.video) copyFileSync(video, src); else intake(video, src);
    const info = await probeMedia(src);
    const perfil: Perfil = { nome: '', arroba: '', mostrarLogo: true, mostrarArroba: true, ...(existsSync(PADRAO) ? readJSON(PADRAO) : {}) };
    if (perfil.avatar && existsSync(PADRAO_IMG)) { copyFileSync(PADRAO_IMG, join(dirOf(id), 'avatar.png')); perfil.avatar = 'avatar.png'; } else delete perfil.avatar;
    save({ id, name, src, duracao: info.duration, largura: info.width, altura: info.height, status: 'novo', perfil, quadros: [], formatos: {}, cost: [], version: 0, createdAt: new Date().toISOString() });
  } catch (e) { rmSync(dirOf(id), { recursive: true, force: true }); throw e; }
  log(id, `✓ ${name}: ${Math.round(load(id).duracao)} s`);
  return get(id);
}

// ---- análise (sem IA): transcrição, quadros candidatos e o rosto ao longo do vídeo ----
// Caixa do maior rosto a cada segundo, pelo Vision do macOS (scripts/face_boxes.swift). shortcut: fora do macOS, ou se o Swift falhar,
// não há rosto.json e os formatos ficam sem selo; trocar por um detector portátil quando o Windows precisar do selo.
async function rastrearRosto(st: State) {
  const D = join(dirOf(st.id), 'rosto');
  rmSync(D, { recursive: true, force: true }); mkdirSync(D, { recursive: true });
  try {
    if (process.platform !== 'darwin') return;
    await execP('ffmpeg', ['-v', 'error', '-y', '-i', st.src, '-vf', 'fps=1,scale=480:-2', '-q:v', '4', join(D, '%04d.jpg')]);
    const frames = readdirSync(D).filter(f => f.endsWith('.jpg')).sort();
    if (!frames.length) return;
    const out = await execP('swift', [join(SKILL, 'scripts', 'face_boxes.swift'), ...frames.map(f => join(D, f))]);
    const por = new Map(out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)).map(j => [basename(j.path), j.face as number[] | null]));
    const rostos: (Caixa | null)[] = frames.map(f => { const b = por.get(f); return b ? { x: b[0], y: b[1], w: b[2], h: b[3] } : null; });
    writeJSON(join(dirOf(st.id), 'rosto.json'), { fps: 1, rostos });
  } catch (e) { log(st.id, `rosto: não consegui rastrear (${(e as Error).message.slice(0, 120)}); os formatos ficam sem selo`); }
  finally { rmSync(D, { recursive: true, force: true }); }
}
// selo de cada modelo para este vídeo; null quando não houve rastreio
export function encaixes(id: string): Record<string, { ok: boolean; motivo: string }> | null {
  const st = load(id), f = join(dirOf(id), 'rosto.json');
  if (!existsSync(f)) return null;
  const rostos: (Caixa | null)[] = readJSON(f).rostos;
  return Object.fromEntries(listarEmbrulhos().map(mid => [mid, encaixe(carregarEmbrulho(mid), rostos, st)]));
}
const falasDe = (id: string) => existsSync(join(dirOf(id), 'words.json')) ? (readJSON(join(dirOf(id), 'words.json')) as Word[]).map(w => w.text).join(' ') : '';
async function analisarSt(st: State) {
  log(st.id, '▶ Transcrevendo o vídeo...');
  await py(KEY(st.id), 'transcribe.py', [st.src, join(dirOf(st.id), 'words.json')]);
  st.quadros = sugerirQuadros(st.src, 3);
  log(st.id, '▶ Procurando o rosto no vídeo...');
  await rastrearRosto(st);
  st.status = 'analisado'; save(st);
}
export const analisar = (id: string) => locked(id, 'analisar', async st => { await analisarSt(st); return get(id); });

const conferir = (st: State, m: Modelo, f: Formato) => {
  const falas = falasDe(st.id);
  // com imagem enviada o instante do quadro não é usado
  const itens = conferirCampos(m, { ...f.campos, ...(pedeQuadro(m) ? { quadro_t: f.ajustes.imagem ? 0 : f.ajustes.quadro_t } : {}) }, { srt: falas, duracao: st.duracao, textoFonte: falas });
  // o que o modelo mostra do perfil tem de estar preenchido na etapa Marca (o @ pode ser desligado lá)
  if (m.perfil.exige.includes('perfil_nome') && !st.perfil.nome) itens.push({ nivel: 'erro', campo: 'marca', msg: 'preencha o nome da marca na etapa Marca' });
  if (m.perfil.exige.includes('perfil_arroba') && st.perfil.mostrarArroba && !st.perfil.arroba) itens.push({ nivel: 'erro', campo: 'marca', msg: 'preencha o @ na etapa Marca (ou desligue "Mostrar @")' });
  return itens;
};
const temErro = (f: Formato) => f.itens.some(i => i.nivel === 'erro');

// O campo de papel "contador" (espectadores da Live) varia durante o vídeo: 12 valores entre o indicado e 5% acima, sempre os mesmos
// para o mesmo número (a prévia e a exportação saem iguais). Só quando o campo é um número ("1.284", "980").
function contadorDe(m: Modelo, f: Formato) {
  const c = m.campos.find(x => x.papel === 'contador'), txt = c && (f.campos[c.id] ?? '').trim();
  if (!c || !txt || !/^\d[\d.]*$/.test(txt)) return null;
  const n = Number(txt.replace(/\./g, ''));
  return { campo: c.id, valores: Array.from({ length: 12 }, (_, i) => { const v = Math.round(n * (1 + 0.05 * (i ? Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1 : 0))); return txt.includes('.') ? v.toLocaleString('pt-BR') : String(v); }) };
}

// ---- render: a prévia e a exportação são a mesma função, a prévia só é mais curta ----
async function render(st: State, mid: string, previa: boolean) {
  const m = modelo(mid), f = st.formatos[mid] ?? fail(`formato ${mid} não está na sessão`), D = dirOf(st.id);
  f.itens = conferir(st, m, f);
  if (temErro(f)) { save(st); fail(`${m.nome}: ` + f.itens.filter(i => i.nivel === 'erro').map(i => `${i.campo}: ${i.msg}`).join('; ')); }
  log(st.id, `▶ ${m.nome}: ${previa ? 'prévia' : 'exportando'}...`);
  const a = f.ajustes, bruto = !pedeQuadro(m) ? null : a.imagem ? join(D, a.imagem) : extrairQuadro(st.src, a.quadro_t!, join(D, 'camadas', `${mid}-quadro.jpg`));
  const quadro = bruto && recortarQuadro(m, bruto, join(D, 'camadas', `${mid}-quadro-c.jpg`), { zoom: a.quadro_zoom, x: a.quadro_x ?? 0.5, y: a.quadro_y ?? 0.5 });
  // nome e @ entram como campos `perfil_*` (um modelo os mostra com data-c="perfil_nome"); a foto, pelo parâmetro avatar
  const p = st.perfil, foto = p.mostrarLogo && p.avatar ? join(D, p.avatar) : null;
  const camadas = await renderCamadas(m, { ...f.campos, perfil_nome: p.nome, perfil_arroba: p.mostrarArroba ? p.arroba : '' }, { quadroImg: quadro, avatarImg: foto, semAvatar: !p.mostrarLogo, texto: { x: a.texto_x, y: a.texto_y, escala: a.texto_escala }, pecas: a.elementos, contador: contadorDe(m, f), destino: join(D, 'camadas', mid) });
  f.caixas = camadas.caixas ?? [];
  f.avisos = camadas.textoNaoCabe?.length ? [`texto não coube: ${camadas.textoNaoCabe.join(', ')}`] : [];
  const rel = previa ? join('previa', `${mid}.mp4`) : join('saida', `${m.nome} - ${st.name}.mp4`);
  mkdirSync(join(D, previa ? 'previa' : 'saida'), { recursive: true });
  await compor(m, st.src, camadas, join(D, rel), { duracao: previa ? Math.min(PREVIA_S, st.duracao) : st.duracao, focoY: a.foco_y ?? 0.5, focoX: a.foco_x ?? 0.5, zoom: a.video_zoom, previa, contador: camadas.contador, slot: a.elementos?.slot ? f.caixas.find(c => c.k === 'slot') : null, extras: (f.imagens ?? []).map(e => ({ ...e, arquivo: join(D, e.arquivo) })) });
  // capa da prévia: a tela mostra esta imagem e só baixa o vídeo quando a pessoa dá play
  if (previa) await execP('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.min(1, st.duracao / 2)), '-i', join(D, rel), '-frames:v', '1', '-q:v', '4', join(D, 'previa', `${mid}.jpg`)]).catch(() => {});
  if (previa) f.previaEm = Date.now(); else { f.exportadoEm = Date.now(); f.arquivo = rel; }
  save(st);
}

// ---- o que dá direção à copy: a biblioteca de ângulos e o que o usuário já aprovou ----
// Não há treino de modelo: a cada chamada a IA recebe os ângulos que cabem em cada moldura (embrulhos/angulos.json) e os últimos textos
// que o usuário marcou como Aprovado naquele modelo, em outros vídeos, como exemplo de estilo.
type Angulo = { angulo: string; explicacao: string; exemplo: string; modelos: string[] };
const ANGULOS: Angulo[] = readJSON(join(EMB, '..', 'angulos.json')).angulos;
type Aprovada = { sessao: string; campos: Record<string, string>; angulo?: string; em: number };
const APROVADAS = join(DIR, 'aprovadas.json'), MAX_APROVADAS = 8, EXEMPLOS = 3;
const lerAprovadas = (): Record<string, Aprovada[]> => existsSync(APROVADAS) ? readJSON(APROVADAS) : {};
// uma entrada por sessão e modelo: aprovar grava (ou troca), desaprovar ou editar tira
function registrarAprovada(mid: string, st: State, f: Formato) {
  const a = lerAprovadas(), l = (a[mid] ?? []).filter(x => x.sessao !== st.id);
  if (f.aprovado) l.push({ sessao: st.id, campos: f.campos, ...(f.angulo ? { angulo: f.angulo } : {}), em: Date.now() });
  a[mid] = l.slice(-MAX_APROVADAS);
  writeJSON(APROVADAS, a);
}

// ---- gerar: uma chamada de IA lê o vídeo e preenche os campos dos modelos escolhidos; depois as prévias ----
const str = { type: 'string' }, num = { type: 'number' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const SYSTEM = `Você escreve o texto de "embrulhos": molduras estáticas 9:16 com texto que envolvem um vídeo curto de anúncio. O usuário já escolheu os modelos; você preenche os campos de cada um.
Regras:
- "leitura": o que o vídeo vende, em uma frase cada: oferta, publico, promessa, cta. Só o que as falas dizem.
- Devolva um item em "formatos" para cada modelo de "modelos", com o mesmo id em "modelo".
- Preencha todos os campos do modelo dentro de "max" caracteres. Campo com "fixo":true mantém o valor "padrao". Nunca repita o "padrao" de um campo que não é fixo.
- Copy de conversa: tom de fala, coloquial, como alguém contando para um amigo. Cada modelo com uma abordagem diferente dos outros.
- "angulo": para cada modelo, escolha um dos "angulos" dele (a explicação e um exemplo de cada um estão em "biblioteca") e escreva os campos seguindo a lógica desse ângulo, adaptada ao que o vídeo diz. Ângulos diferentes entre os modelos sempre que der. Modelo sem "angulos": "angulo" vazio.
- "aprovados", quando o modelo traz: textos que o usuário aprovou para esse modelo em outros vídeos. Copie o jeito (tom, tamanho, pontuação, uso de maiúsculas), nunca o assunto.
- Tudo sai do que o vídeo diz: nenhum número, preço ou promessa que não esteja nas falas.
- Oferta: preco_por (e preco_de, se houver) têm de ser um dos precos, escritos igual.
- Fofoca (duplo): nome_pagina é o nome de uma página de fofoca fictícia inventada por você.
- Quando o modelo traz "dica", siga-a.
- quadro_t: o instante (s) da cena mais marcante do vídeo, de preferência um dos quadrosSugeridos; 0 nos modelos com pedeQuadro:false.`;
const SCHEMA = obj({ leitura: obj({ oferta: str, publico: str, promessa: str, cta: str }),
  formatos: { type: 'array', items: obj({ modelo: str, angulo: str, quadro_t: num, campos: { type: 'object', additionalProperties: { type: 'string' } } }) } });
type Resp = { leitura: Leitura; formatos: { modelo: string; angulo?: string; quadro_t: number; campos: Record<string, string> }[] };

// Um modelo que já está na sessão guarda o que o usuário editou: a IA só escreve os novos (ou todos com `refazer`).
export const gerar = (id: string, body: { modelos?: unknown; refazer?: unknown }) => locked(id, 'embrulhos', async st => {
  const ids = Array.isArray(body?.modelos) ? [...new Set(body.modelos.map(String))] : [];
  if (!ids.length) fail('escolha ao menos um formato');
  const todos = ids.map(modelo), ms = todos.filter(m => body.refazer === true || !st.formatos[m.id]);
  for (const m of todos) if (st.formatos[m.id]) st.formatos[m.id].selecionado = true;
  for (const k of Object.keys(st.formatos)) if (!ids.includes(k)) st.formatos[k].selecionado = false;
  if (!ms.length) { st.version++; save(st); return get(id); }
  if (!existsSync(join(dirOf(id), 'words.json'))) await analisarSt(st);
  const falas = falasDe(id);
  if (!falas.trim()) fail('o vídeo não tem fala para a IA ler; preencha os campos à mão');
  const aprovadas = lerAprovadas(), angulosDe = (mid: string) => ANGULOS.filter(a => a.modelos.includes(mid));
  const contexto = { duracao: st.duracao, falas, precos: precosDoSrt(falas), quadrosSugeridos: st.quadros,
    modelos: ms.map(m => { const ex = (aprovadas[m.id] ?? []).filter(x => x.sessao !== id).slice(-EXEMPLOS).map(x => x.campos);
      return { id: m.id, nome: m.nome, tom: m.perfil.tom, campos: m.campos, pedeQuadro: pedeQuadro(m), angulos: angulosDe(m.id).map(a => a.angulo), ...(m.perfil.dica ? { dica: m.perfil.dica } : {}), ...(ex.length ? { aprovados: ex } : {}) }; }),
    biblioteca: ANGULOS.filter(a => ms.some(m => a.modelos.includes(m.id))).map(a => ({ angulo: a.angulo, explicacao: a.explicacao, exemplo: a.exemplo })) };
  const aplicar = (r: Resp) => {
    st.leitura = r.leitura;
    for (const m of ms) {
      const s = r.formatos.find(x => x.modelo === m.id), f = { ...novo(), editadoEm: Date.now() };
      // a IA só escreve os campos que o modelo tem; o instante do quadro é preso ao vídeo
      f.campos = Object.fromEntries(m.campos.map(c => [c.id, String(s?.campos?.[c.id] ?? (c.fixo ? c.padrao ?? '' : ''))]));
      if (pedeQuadro(m)) f.ajustes.quadro_t = Math.min(st.duracao, Math.max(0, Number(s?.quadro_t) || st.quadros[0] || 0));
      if (s?.angulo && angulosDe(m.id).some(a => a.angulo === s.angulo)) f.angulo = s.angulo;
      f.itens = conferir(st, m, f);
      st.formatos[m.id] = f;
    }
    return ms.flatMap(m => st.formatos[m.id].itens.filter(i => i.nivel === 'erro').map(i => `${m.id} · ${i.campo}: ${i.msg}`));
  };
  log(id, `▶ A IA está lendo o vídeo e escrevendo ${ms.length} formato(s)...`);
  let res = await ask<Resp>('embrulhos', 'embrulhos:gerar', { system: SYSTEM, content: JSON.stringify(contexto), schema: SCHEMA }, logCost(st));
  let erros = aplicar(res);
  if (erros.length) {   // uma rodada de correção; o que sobrar aparece no cartão para o usuário corrigir
    log(id, `embrulhos: corrigindo ${erros.length} erro(s)`);
    res = await ask<Resp>('embrulhos', 'embrulhos:corrigir', { system: SYSTEM, content: JSON.stringify({ ...contexto, suaResposta: res, erros }) + '\nCorrija os erros e devolva a resposta completa.', schema: SCHEMA }, logCost(st));
    erros = aplicar(res);
  }
  st.version++; save(st);
  // três prévias por vez: cada uma é uma página do Chrome e um ffmpeg leve
  const fila = ms.filter(m => !temErro(st.formatos[m.id]));
  await Promise.all(Array.from({ length: 3 }, async () => { for (let m = fila.shift(); m; m = fila.shift()) { const mm = m; await render(st, mm.id, true).catch(e => log(id, `prévia de ${mm.nome} falhou: ${(e as Error).message}`)); } }));
  emit(KEY(id), 'embrulhos:done', {});
  return get(id);
});

// ---- edição: salva campos, ajustes e marcações de um formato (cria o formato se a IA não o gerou). Não renderiza. ----
const MAX_IMAGENS = 6;
export function salvar(id: string, mid: string, body: { campos?: unknown; ajustes?: any; imagemNova?: unknown; imagens?: unknown; incluir?: unknown; aprovado?: unknown; selecionado?: unknown; version?: unknown }) {
  const st = load(id), m = modelo(mid);
  if (busy.has(id)) fail('sessão ocupada: espere o render terminar');
  if (Number(body?.version) !== st.version) fail('esta sessão mudou em outra aba: recarregue');
  const f = st.formatos[mid] ??= novo(), aprovadoAntes = f.aprovado;
  f.selecionado = body.selecionado !== false;   // false = tirado da tela (a lixeira do cartão); o texto fica guardado
  let editou = false;
  if (body.campos && typeof body.campos === 'object') {
    f.campos = Object.fromEntries(m.campos.map(c => [c.id, String((body.campos as Record<string, unknown>)[c.id] ?? f.campos[c.id] ?? '')]));
    editou = true;
  }
  const a = body.ajustes;
  if (a && typeof a === 'object') {
    if (a.quadro_t != null) f.ajustes.quadro_t = Number.isFinite(Number(a.quadro_t)) ? Number(a.quadro_t) : fail('quadro_t: número de segundos');
    for (const [k, [min, max]] of Object.entries(LIMITES)) if (a[k] != null) (f.ajustes as Record<string, number>)[k] = Number(a[k]) >= min && Number(a[k]) <= max ? Number(a[k]) : fail(`${k}: entre ${min} e ${max}`);
    if (a.elementos === null) delete f.ajustes.elementos;
    else if (a.elementos && typeof a.elementos === 'object') for (const [k, v] of Object.entries(a.elementos)) {
      const [x, y, s] = (Array.isArray(v) ? v : []).map(Number);
      if (!/^[\w-]{1,40}$/.test(k) || !(Math.abs(x) <= 1080 && Math.abs(y) <= 1920 && s >= 0.2 && s <= 4)) fail(`elementos.${k}: posição até 1080×1920 px e escala entre 0.2 e 4`);
      (f.ajustes.elementos ??= {})[k] = [x, y, s];
    }
    if (a.imagem === null) f.ajustes.imagem = null;
    else if (a.imagem != null) {   // caminho devolvido pelo /upload (ou local); guardado na sessão
      const de = expandHome(String(a.imagem)), ext = extname(de).toLowerCase();
      if (!IMG_EXT.includes(ext) || !existsSync(de)) fail('imagem: envie um png, jpg ou webp');
      mkdirSync(join(dirOf(id), 'img'), { recursive: true });
      f.ajustes.imagem = join('img', mid + ext);
      intake(de, join(dirOf(id), f.ajustes.imagem));
    }
    editou = true;
  }
  // imagens soltas: `imagemNova` (caminho do /upload) entra no centro; `imagens` é a lista inteira de volta, com as posições novas
  // (uma que não veio é removida, e o arquivo apagado). Só arquivos que já são deste formato são aceitos na lista.
  if (Array.isArray(body.imagens)) {
    const antes = f.imagens ?? [], n01 = (v: unknown, min: number, max: number, nome: string) => Number(v) >= min && Number(v) <= max ? Number(v) : fail(`${nome}: entre ${min} e ${max}`);
    f.imagens = (body.imagens as any[]).map(e => ({ arquivo: antes.find(x => x.arquivo === e?.arquivo)?.arquivo ?? fail('imagem desconhecida'), x: n01(e.x, 0, 1, 'x'), y: n01(e.y, 0, 1, 'y'), largura: n01(e.largura, 0.03, 1.5, 'largura') }));
    for (const x of antes) if (!f.imagens.some(e => e.arquivo === x.arquivo)) rmSync(join(dirOf(id), x.arquivo), { force: true });
    editou = true;
  }
  if (body.imagemNova != null) {
    const de = expandHome(String(body.imagemNova)), ext = extname(de).toLowerCase();
    if (!IMG_EXT.includes(ext) || !existsSync(de)) fail('imagem: envie um png, jpg ou webp');
    if ((f.imagens ?? []).length >= MAX_IMAGENS) fail(`no máximo ${MAX_IMAGENS} imagens por formato`);
    mkdirSync(join(dirOf(id), 'img'), { recursive: true });
    const arquivo = join('img', `${mid}-x${Date.now().toString(36)}${ext}`);
    intake(de, join(dirOf(id), arquivo));
    (f.imagens ??= []).push({ arquivo, x: 0.5, y: 0.5, largura: 0.4 });
    editou = true;
  }
  if (typeof body.incluir === 'boolean') f.incluir = body.incluir;
  if (editou) { f.editadoEm = Date.now(); f.aprovado = false; f.itens = conferir(st, m, f); }
  if (typeof body.aprovado === 'boolean') f.aprovado = body.aprovado && !temErro(f);
  if (f.aprovado !== aprovadoAntes) registrarAprovada(mid, st, f);
  st.version++; save(st);
  return get(id);
}

// ---- marca: foto, nome e @. Mudar o perfil deixa desatualizadas as prévias dos modelos que o mostram. ----
export function perfil(id: string, body: { nome?: unknown; arroba?: unknown; mostrarLogo?: unknown; mostrarArroba?: unknown; avatar?: unknown; padrao?: unknown; version?: unknown }) {
  const st = load(id), p = st.perfil;
  if (busy.has(id)) fail('sessão ocupada: espere o render terminar');
  if (Number(body?.version) !== st.version) fail('esta sessão mudou em outra aba: recarregue');
  if (body.nome != null) p.nome = String(body.nome).trim().slice(0, 40);
  if (body.arroba != null) { const a = String(body.arroba).trim().replace(/^@+/, '').replace(/\s+/g, '').slice(0, 30); p.arroba = a ? '@' + a : ''; }
  if (typeof body.mostrarLogo === 'boolean') p.mostrarLogo = body.mostrarLogo;
  if (typeof body.mostrarArroba === 'boolean') p.mostrarArroba = body.mostrarArroba;
  if (body.avatar === null) delete p.avatar;
  else if (body.avatar != null) {   // png já recortado pela tela, vindo do /upload
    const de = expandHome(String(body.avatar));
    if (!IMG_EXT.includes(extname(de).toLowerCase()) || !existsSync(de)) fail('foto: envie um png, jpg ou webp');
    p.avatar = 'avatar' + extname(de).toLowerCase();
    intake(de, join(dirOf(id), p.avatar));
  }
  for (const [mid, f] of Object.entries(st.formatos)) { const m = modelo(mid); if (usaPerfil(m)) { f.editadoEm = Date.now(); f.itens = conferir(st, m, f); if (temErro(f)) f.aprovado = false; } }
  if (body.padrao === true) {
    writeJSON(PADRAO, p);
    if (p.avatar) copyFileSync(join(dirOf(id), p.avatar), PADRAO_IMG);
  }
  st.version++; save(st);
  return get(id);
}

export const previa = (id: string, mid: string) => locked(id, 'previa', async st => { await render(st, mid, true); return get(id); });

// Renderiza inteiro cada formato marcado para a entrega. Um que falha não derruba os outros: o erro fica no log e no retorno.
export const exportar = (id: string) => locked(id, 'exportar', async st => {
  const alvos = Object.entries(st.formatos).filter(([, f]) => f.selecionado && f.incluir).map(([k]) => k);
  if (!alvos.length) fail('nenhum formato marcado para a entrega');
  const falhas: string[] = [];
  for (const mid of alvos) await render(st, mid, false).catch(e => { falhas.push((e as Error).message); log(id, `✗ ${(e as Error).message}`); });
  if (falhas.length === alvos.length) fail('nenhum formato exportou: ' + falhas.join(' | '));
  log(id, `✓ ${alvos.length - falhas.length} vídeo(s) em ${join(dirOf(id), 'saida')}`);
  return { ...get(id), falhas };
});
