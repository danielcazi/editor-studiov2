// SPEC-v9 §7: rewrites workspace/formats/*/format.json to the planos + agenda schema. Run with the server stopped: node scripts/migrate-v9.mjs
// Idempotent (a format that already has `planos` is left alone). Phases 4 and 5 add the styles and skills parts here.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WS = process.env.WORKSPACE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workspace');
const SAFE = { top: 200, bottom: 380, left: 70, right: 70 };
const base = { aspectRatio: '9:16', width: 1080, height: 1920, speaker: true, refVideo: false, safeZones: SAFE };

// the visible set. split-top and reacao need the kit's panel-top / react shots (phase 6), so they stay hidden until then;
// business-reels loses its split shot (panel-top) for the same reason and keeps the full-screen cut-out at the striking moments
export const NEW = {
  recorte: { ...base, name: 'Recorte tela cheia', order: 1, description: 'Locutor recortado em tela cheia, com a animação por trás e à frente.', planos: ['cut', 'none'], janelas: null,
    regras: 'Locutor recortado em tela cheia na maior parte do reel; cena sem locutor (none) só quando a ilustração precisa da tela toda.' },
  'business-reels': { ...base, name: 'Business Reels', order: 2, description: 'Locutor recortado em tela cheia só nos momentos marcantes; no resto a animação ocupa a tela.', planos: ['cut', 'none'], janelas: null,
    regras: 'Locutor recortado (cut) em tela cheia só nos momentos marcantes que pedem mais espaço em tela para o motion; fora deles a animação ocupa a tela (none). Nunca o mesmo plano duas vezes seguidas.' },
  'speech-screen': { ...base, name: 'Speech Screen', order: 3, description: 'Locutor em vídeo no painel de baixo e a animação em cima; recorte só no gancho, no meio e na CTA.', planos: ['cut', 'panel', 'none'],
    janelas: { cut: [[0, 5], [15, 20], ['tail', 5]] }, panel: { side: 'bottom', top: 0.42 },
    regras: 'Recorte do locutor só nas janelas (gancho, meio e CTA); fora delas ele aparece cru no painel de baixo e a animação ocupa a parte de cima.' },
  'split-bottom': { ...base, name: 'Tela dividida (locutor embaixo)', order: 4, description: 'Locutor cru no painel de baixo o reel inteiro, animação em cima.', planos: ['panel', 'none'], janelas: null, panel: { side: 'bottom', top: 0.42 },
    regras: 'Locutor cru no painel de baixo, animação em cima; cena sem locutor (none) só quando a ilustração precisa da tela toda.' },
  'so-motion': { ...base, name: 'Só Motion', order: 5, description: 'Sem locutor na tela: só ilustrações, imagens, objetos e tipografia explicando a fala (a voz continua).', speaker: false, planos: ['none'], janelas: null, regras: '' },
  'split-top': { ...base, name: 'Tela dividida (locutor em cima)', order: 6, hidden: true, description: 'Locutor cru no painel de cima, animação embaixo. Precisa do plano panel-top (fase 6).', planos: ['panel-top', 'none'], janelas: null, panel: { side: 'top', top: 0.5 },
    regras: 'Locutor cru no painel de cima, animação embaixo.' },
  reacao: { ...base, name: 'Reação', order: 7, hidden: true, description: 'Vídeo de referência numa metade, locutor cru na outra. Precisa do plano react (fase 6).', planos: ['react', 'cut'], janelas: null, refVideo: true,
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

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log('formatos migrados:', migrateFormats().join(', ') || 'nenhum (já estavam no esquema novo)');
