// Banco de movimentos (Motion Think): tested kit helpers with an approved photo, kept in compose/estilos/banco/ beside the engines.
// kit.py loads every banco/*.py on `from kit import *`; composeScaffold copies the folder into compose/ and lists it in the brief.
// Nothing here is a git repo: a ZIP install keeps it across updates because the tarball never ships banco.json (only README.md).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export class UserError extends Error {}   // same name as pipeline's: server.ts maps both to 400

export const COMPOSE_DIR = resolve(import.meta.dirname, '..', 'claude-reel-editor/skills/reel-editor/compose');
export const BANCO_DIR = process.env.BANCO_DIR ?? join(COMPOSE_DIR, 'estilos', 'banco');   // env: the tests point it at a temp folder

export const MOMENTOS = ['gancho', 'contexto', 'problema', 'definicao', 'exemplo', 'historia', 'prova', 'numero', 'lista', 'comparacao', 'passo-a-passo', 'virada', 'resumo', 'cta'] as const;
export const CATEGORIAS = ['tipografia', 'infografico', 'grafico', 'ilustracao', 'icone', 'foto', 'foto-antiga', 'colagem', 'exemplo', 'broll', '3d', 'transicao', 'camera'] as const;
export type Momento = typeof MOMENTOS[number];
export type Categoria = typeof CATEGORIAS[number];

export type BancoHelper = { id: string; nome: string; momento: Momento; categoria: Categoria; tags?: string[]; params: string[]; medidas: Record<string, number>; origem: string; aprovadoEm: string; rodadas: number };
export type BancoNegativo = { id: string; motivo: string; origem: string; frame?: string };
export type Banco = { helpers: BancoHelper[]; negativo: BancoNegativo[] };

const JSON_FILE = join(BANCO_DIR, 'banco.json');
export const readBanco = (): Banco => {
  if (!existsSync(JSON_FILE)) return { helpers: [], negativo: [] };
  const b = JSON.parse(readFileSync(JSON_FILE, 'utf8'));
  return { helpers: Array.isArray(b.helpers) ? b.helpers : [], negativo: Array.isArray(b.negativo) ? b.negativo : [] };
};
export function writeBanco(b: Banco) {
  mkdirSync(BANCO_DIR, { recursive: true });
  writeFileSync(JSON_FILE, JSON.stringify(b, null, 1));
  // negativo.md: what was refused and why, for the brief and for the synthesis prompt
  writeFileSync(join(BANCO_DIR, 'negativo.md'), b.negativo.length
    ? `# Banco negativo\n\nMovimentos que o Daniel reprovou. Não reproduza.\n\n${b.negativo.map(n => `- ${n.id}: ${n.motivo} (origem ${n.origem}${n.frame ? `, frame negativo/${n.frame}` : ''})`).join('\n')}\n`
    : '# Banco negativo\n\nNada reprovado ainda.\n');
}

// The name of the helper a .py defines: the first top-level `def` not starting with `_`; it must take `p` first and only defaulted params after
// (the demo and the bank test call it as name('b01')).
// parameters of a def, split on the commas at depth 0 (a tuple default like cantos=('a', 'b') has its own commas)
function defParams(src: string): { name: string; params: string[] } | null {
  const m = /^def ([a-z][a-z0-9_]*)\(/m.exec(src);
  if (!m) return null;
  let depth = 0, cur = '', k = m.index + m[0].length;
  const params: string[] = [];
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === "'" || c === '"') { const e = src.indexOf(c, k + 1); if (e < 0) break; cur += src.slice(k, e + 1); k = e; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    if (c === ',' && depth === 0) { params.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) params.push(cur.trim());
  return { name: m[1], params: params.filter(Boolean) };
}
export function helperName(src: string): string {
  const m = defParams(src);
  if (!m) throw new Error('helper.py não define nenhuma função (def nome(p, ...))');
  const params = m.params;
  if (params[0] !== 'p') throw new Error(`o helper ${m.name} precisa receber \`p\` como primeiro parâmetro`);
  const bad = params.slice(1).filter(x => !x.includes('=') && !x.startsWith('*'));
  if (bad.length) throw new Error(`o helper ${m.name} tem parâmetros sem valor padrão (${bad.join(', ')}): só \`p\` é obrigatório`);
  return m.name;
}
export const helperParams = (src: string): string[] => (defParams(src)?.params ?? []).map(s => s.split('=')[0].trim()).filter(x => x && x !== 'p' && !x.startsWith('*') && !['at', 'd', 'k'].includes(x));

// The 3-line card of a helper (what it is, for which moment, what not to do), written at approval from the analysis and the notes.
export const helperMd = (h: { nome: string; momento: string; categoria: string }, oque: string, naoFazer: string) =>
  `${h.nome}: ${oque}\nMomento: ${h.momento} (${h.categoria}).\nNão fazer: ${naoFazer || 'copiar a fonte, a cor ou o mascote do original; o movimento é o que vale.'}\n`;

export function addHelper(h: BancoHelper, files: { py: string; jpg: string; md: string; orig?: string }) {
  const b = readBanco();
  if (b.helpers.some(x => x.id === h.id)) throw new Error(`já existe o helper ${h.id} no banco`);
  mkdirSync(BANCO_DIR, { recursive: true });
  copyFileSync(files.py, join(BANCO_DIR, `${h.id}.py`));
  copyFileSync(files.jpg, join(BANCO_DIR, `${h.id}.jpg`));
  if (files.orig && existsSync(files.orig)) copyFileSync(files.orig, join(BANCO_DIR, `${h.id}.orig.jpg`));
  writeFileSync(join(BANCO_DIR, `${h.id}.md`), files.md);
  b.helpers.push(h);
  writeBanco(b);
  return b;
}
export function rollbackHelper(id: string) {
  const b = readBanco();
  b.helpers = b.helpers.filter(x => x.id !== id);
  for (const f of [`${id}.py`, `${id}.jpg`, `${id}.orig.jpg`, `${id}.md`]) rmSync(join(BANCO_DIR, f), { force: true });
  writeBanco(b);
}
// Out of the bank: the .py goes to banco/_removidos/ (the helper may be wanted back), photo and card are deleted.
export function removeHelper(id: string) {
  const b = readBanco();
  if (!b.helpers.some(x => x.id === id)) throw new Error(`não existe o helper ${id} no banco`);
  mkdirSync(join(BANCO_DIR, '_removidos'), { recursive: true });
  if (existsSync(join(BANCO_DIR, `${id}.py`))) renameSync(join(BANCO_DIR, `${id}.py`), join(BANCO_DIR, '_removidos', `${id}.py`));
  for (const f of [`${id}.jpg`, `${id}.orig.jpg`, `${id}.md`]) rmSync(join(BANCO_DIR, f), { force: true });
  b.helpers = b.helpers.filter(x => x.id !== id);
  writeBanco(b);
  return b;
}
export function upsertNegativo(n: BancoNegativo, frame?: string) {
  const b = readBanco();
  if (frame && existsSync(frame)) { mkdirSync(join(BANCO_DIR, 'negativo'), { recursive: true }); n.frame = `${n.id}.jpg`; copyFileSync(frame, join(BANCO_DIR, 'negativo', n.frame)); }
  const k = b.negativo.findIndex(x => x.origem === n.origem);
  if (k >= 0) b.negativo[k] = { ...b.negativo[k], ...n }; else b.negativo.push(n);
  writeBanco(b);
  return b;
}
export function dropNegativo(origem: string) {
  const b = readBanco();
  const gone = b.negativo.filter(x => x.origem === origem);
  if (!gone.length) return b;
  for (const g of gone) if (g.frame) rmSync(join(BANCO_DIR, 'negativo', g.frame), { force: true });
  b.negativo = b.negativo.filter(x => x.origem !== origem);
  writeBanco(b);
  return b;
}

// GET /banco: the json, each helper's card and whether its files are there
export const listBanco = () => {
  const b = readBanco();
  return { ...b, helpers: b.helpers.map(h => ({ ...h, md: existsSync(join(BANCO_DIR, `${h.id}.md`)) ? readFileSync(join(BANCO_DIR, `${h.id}.md`), 'utf8') : '', jpg: existsSync(join(BANCO_DIR, `${h.id}.jpg`)), orig: existsSync(join(BANCO_DIR, `${h.id}.orig.jpg`)) })) };
};
export function bancoFile(name: string) {
  const f = /^negativo\/[\w-]+\.jpg$/.test(name) ? join(BANCO_DIR, name) : /^[\w-]+(\.orig)?\.jpg$/.test(name) ? join(BANCO_DIR, name) : '';
  if (!f || !existsSync(f)) throw new UserError(`sem ${name} no banco`);
  return f;
}

// Into a compose folder: the helpers, their photos and the json (kit.py imports estilos/banco/*.py; the brief points at the jpgs).
export function copyBancoTo(composeDir: string) {
  const b = readBanco();
  if (!b.helpers.length && !b.negativo.length) return b;
  const to = join(composeDir, 'estilos', 'banco');
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(BANCO_DIR)) if (/\.(py|jpg|md|json)$/.test(f)) copyFileSync(join(BANCO_DIR, f), join(to, f));
  return b;
}

// The "Banco de movimentos" section of brief.md: per moment, each helper with its photo (relative to compose/), card line and params; then the negative list.
// `recent` = helper ids used in the brand's last reels, asked to vary (DIRETOR §8).
export function bancoBrief(b: Banco = readBanco(), recent: string[] = []): string {
  if (!b.helpers.length && !b.negativo.length) return '';
  const por = MOMENTOS.filter(m => b.helpers.some(h => h.momento === m)).map(m => `### ${m}\n${b.helpers.filter(h => h.momento === m).map(h => {
    const md = existsSync(join(BANCO_DIR, `${h.id}.md`)) ? readFileSync(join(BANCO_DIR, `${h.id}.md`), 'utf8').trim().split('\n')[0] : h.nome;
    return `- \`${h.id}(p${h.params.map(x => `, ${x}=`).join('')}, at=, d=)\` · ${h.categoria} · foto estilos/banco/${h.id}.jpg (abra com Read: é o que se espera na tela) · ${md}`;
  }).join('\n')}`).join('\n');
  return [`## Banco de movimentos (estilos/banco/)`,
    `Movimentos aprovados pelo Daniel, com geometria fixa e foto. Quando o banco tem um helper para o momento de uma cena, use-o (passe \`momento='...'\` em \`scene()\`: o render avisa a cena de momento coberto que não usou o banco); invente só onde o banco não cobre. Os helpers já estão carregados pelo \`from kit import *\`.`,
    por,
    recent.length ? `Já usados nos últimos reels desta marca (varie: prefira outros do mesmo momento quando houver): ${recent.join(', ')}.` : '',
    b.negativo.length ? `### Negativo (reprovado, não reproduza)\n${b.negativo.map(n => `- ${n.motivo}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
}
