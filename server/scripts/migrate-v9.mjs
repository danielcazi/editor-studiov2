// SPEC-v9 §7: rewrites workspace/formats/*/format.json to the planos + agenda schema. Run with the server stopped: node scripts/migrate-v9.mjs
// Idempotent (a format that already has `planos`, or a style folder that exists, is left alone). The skills part moves the four video clones out of styles/.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { styleToSkill } from '../lib.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WS = process.env.WORKSPACE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workspace');
const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'claude-reel-editor', 'skills', 'reel-editor', 'compose');
const SAFE = { top: 200, bottom: 380, left: 70, right: 70 };
const base = { aspectRatio: '9:16', width: 1080, height: 1920, speaker: true, refVideo: false, safeZones: SAFE };

// the visible set (phase 6 gave the kit panel-top, raw and react, so split-top and reacao are visible and business-reels has its split shot back)
export const NEW = {
  recorte: { ...base, name: 'Recorte tela cheia', order: 1, description: 'Locutor recortado em tela cheia, com a animação por trás e à frente.', planos: ['cut', 'none'], janelas: null,
    regras: 'Locutor recortado em tela cheia na maior parte do reel; cena sem locutor (none) só quando a ilustração precisa da tela toda.' },
  'business-reels': { ...base, name: 'Business Reels', order: 2, description: 'Locutor recortado em tela cheia só nos momentos marcantes; no resto, tela dividida (locutor em cima, apoio embaixo) ou só animação.', planos: ['cut', 'panel-top', 'none'], janelas: null, panel: { side: 'top', top: 0.5 },
    regras: 'Locutor recortado (cut) em tela cheia só nos momentos marcantes que pedem mais espaço em tela para o motion. Tela dividida (panel-top: locutor cru em cima, apoio embaixo) quando ele explica método, lista ou passo a passo. Animação em tela cheia (none) quando a ilustração precisa de tudo. Nunca o mesmo plano duas vezes seguidas.' },
  'speech-screen': { ...base, name: 'Speech Screen', order: 3, description: 'Locutor em vídeo no painel de baixo e a animação em cima; recorte só no gancho, no meio e na CTA.', planos: ['cut', 'panel', 'none'],
    janelas: { cut: [[0, 5], [15, 20], ['tail', 5]] }, panel: { side: 'bottom', top: 0.42 },
    regras: 'Recorte do locutor só nas janelas (gancho, meio e CTA); fora delas ele aparece cru no painel de baixo e a animação ocupa a parte de cima.' },
  'split-bottom': { ...base, name: 'Tela dividida (locutor embaixo)', order: 4, description: 'Locutor cru no painel de baixo o reel inteiro, animação em cima.', planos: ['panel', 'none'], janelas: null, panel: { side: 'bottom', top: 0.42 },
    regras: 'Locutor cru no painel de baixo, animação em cima; cena sem locutor (none) só quando a ilustração precisa da tela toda.' },
  'so-motion': { ...base, name: 'Só Motion', order: 5, description: 'Sem locutor na tela: só ilustrações, imagens, objetos e tipografia explicando a fala (a voz continua).', speaker: false, planos: ['none'], janelas: null, regras: '' },
  'split-top': { ...base, name: 'Tela dividida (locutor em cima)', order: 6, description: 'Locutor cru no painel de cima, animação embaixo.', planos: ['panel-top', 'none'], janelas: null, panel: { side: 'top', top: 0.5 },
    regras: 'Locutor cru no painel de cima, animação embaixo.' },
  reacao: { ...base, name: 'Reação', order: 7, description: 'Vídeo de referência numa metade, locutor cru na outra (precisa de um vídeo de referência no projeto).', planos: ['react', 'cut'], janelas: null, refVideo: true, panel: { side: 'bottom', top: 0.5 },
    regras: 'Vídeo de referência numa metade e o locutor reagindo na outra; o recorte entra para comentar.' },
};

export function migrateFormats(ws = WS) {
  const dir = join(ws, 'formats'), done = [];
  mkdirSync(dir, { recursive: true });
  const write = (id, f) => { mkdirSync(join(dir, id), { recursive: true }); writeFileSync(join(dir, id, 'format.json'), JSON.stringify({ id, ...f }, null, 2)); done.push(id); };
  for (const [id, f] of Object.entries(NEW)) if (!existsSync(join(dir, id, 'format.json')) || !JSON.parse(readFileSync(join(dir, id, 'format.json'), 'utf8')).planos) write(id, f);
  for (const id of readdirSync(dir)) {
    const file = join(dir, id, 'format.json');
    if (!existsSync(file) || id in NEW) continue;
    const old = JSON.parse(readFileSync(file, 'utf8'));
    if (old.planos) continue;
    // everything else stays on disk for old projects, hidden, with the new schema (the old promptGuide is in git history)
    write(id, { ...base, name: old.name ?? id, order: old.order ?? 99, description: old.description ?? '', aspectRatio: old.aspectRatio ?? '9:16', width: old.width ?? 1080, height: old.height ?? 1920,
      speaker: old.speaker !== false, planos: old.speaker === false ? ['none'] : ['cut', 'none'], janelas: null, regras: '', hidden: true, safeZones: old.visualAssets?.safeZones ?? SAFE });
  }
  return done;
}

// Styles (SPEC-v9 §2.2): the 12 illustration packs of compose/estilos/*.md become workspace/styles/<id>/style.json with `pack` (and `engine`
// when engines/<name>.js draws it). The name and description come from the pack's own first heading and blockquote.
export const ENGINES = { 'silkscreen-poster': 'silkscreen', 'briefing-board': 'briefing', 'swiss-motion': 'swiss', 'art-deco': 'deco', sketchnote: 'sketch', launch: 'launch', diorama: 'diorama', cinetic: 'cinetic' };
// the old image-cluster format was a visual language, not a shot plan: it becomes a style (its text is the format's old promptGuide)
const IMAGE_CLUSTER = { name: 'Cluster de imagens', description: 'Grupos de imagens acima da cabeça do locutor e legendas pequenas e discretas.',
  guide: 'Acima da cabeça do locutor, um cluster de 3 a 5 imagens com leve rotação e sombra suave que ilustram o conceito da fala completa daquela ideia (não palavras soltas, nem decoração). O cluster inteiro troca a cada nova ideia; no gancho e na CTA o locutor fica sozinho, sem cluster. Legenda pequena e discreta na parte inferior, com sombra para garantir contraste. Texto que precisa ser lido fica até a fala terminar.' };

export function migrateStyles(ws = WS, kit = KIT) {
  const dir = join(ws, 'styles'), done = [];
  mkdirSync(dir, { recursive: true });
  const write = (id, st) => { if (existsSync(join(dir, id, 'style.json'))) return; mkdirSync(join(dir, id), { recursive: true }); writeFileSync(join(dir, id, 'style.json'), JSON.stringify({ id, ...st }, null, 2)); done.push(id); };
  for (const f of readdirSync(join(kit, 'estilos')).filter(f => f.endsWith('.md') && f !== 'README.md').sort()) {
    const id = f.slice(0, -3), md = readFileSync(join(kit, 'estilos', f), 'utf8').split('\n');
    const name = (md[0] ?? '').replace(/^#\s*/, '').replace(/\s*\(.*\)\s*$/, '') || id;
    const description = (md.find(l => l.startsWith('> ')) ?? '').slice(2).split(/(?<=\.)\s/)[0];
    write(id, { name, description, pack: f, ...(ENGINES[id] ? { engine: ENGINES[id] } : {}),
      guide: 'Pacote de ilustração: leia ESTILO.md inteiro antes do treatment e desenhe as ilustrações como ele descreve' + (ENGINES[id] ? ` (motor engine='${ENGINES[id]}').` : '.') });
  }
  write('image-cluster', IMAGE_CLUSTER);
  return done;
}

// Skills (SPEC-v9 §2.3, §7.3): the four clones of one video leave styles/ for skills/<id>/skill.json. refs/ and skill.md go along; the old
// style.json stays in refs/style-v8.json so the refine `match` can be compared with the old schema's.
export const CLONES = ['build', 'black-rd', 'didatico', 'textos-dinamicos-flat'];
export function migrateSkills(ws = WS) {
  const done = [];
  for (const id of CLONES) {
    const from = join(ws, 'styles', id), to = join(ws, 'skills', id);
    if (!existsSync(join(from, 'style.json')) || existsSync(to)) continue;
    const flat = JSON.parse(readFileSync(join(from, 'style.json'), 'utf8'));
    mkdirSync(to, { recursive: true });
    if (existsSync(join(from, 'refs'))) renameSync(join(from, 'refs'), join(to, 'refs')); else mkdirSync(join(to, 'refs'));
    if (existsSync(join(from, 'skill.md'))) renameSync(join(from, 'skill.md'), join(to, 'skill.md'));
    copyFileSync(join(from, 'style.json'), join(to, 'refs', 'style-v8.json'));
    writeFileSync(join(to, 'skill.json'), JSON.stringify(styleToSkill({ ...flat, id }), null, 2));
    rmSync(from, { recursive: true, force: true });
    done.push(id);
  }
  return done;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('formatos migrados:', migrateFormats().join(', ') || 'nenhum (já estavam no esquema novo)');
  console.log('estilos criados:', migrateStyles().join(', ') || 'nenhum (já existiam)');
  console.log('skills migradas:', migrateSkills().join(', ') || 'nenhuma');
}
