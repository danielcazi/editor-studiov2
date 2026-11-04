// One-time migration: the motion fields a cloned format carried (guide, refs/, skill.md, sfx, GSAP recipes, catalog) move to
// workspace/styles/<id>/, the format keeps the editing fields, and projects on those formats point at the new style.
// Idempotent: a style that already exists is left alone. Run from the repo root: node tools/split_styles.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WS = process.env.WORKSPACE || join(import.meta.dirname, '..', 'workspace');
const MOTION = ['motionRecipes', 'styleCatalog', 'sfxRules', 'sfxForbidden', 'sfxGainDb', 'sfxPerMinute', 'clonedFrom', 'refineLog'];
const rd = f => JSON.parse(readFileSync(f, 'utf8')), wr = (f, o) => writeFileSync(f, JSON.stringify(o, null, 2));
const paragraphs = (text, heads) => text.split(/\n\s*\n/).filter(p => heads.some(h => p.trim().startsWith(h))).join('\n\n');

// format id -> style id, which paragraph headers of the promptGuide are motion (the rest stays with the format), hand-written camera
const SPLIT = {
  'darkrd-clone': { id: 'darkrd', motion: ['LOOK', 'TIPOGRAFIA', 'CARTÕES', 'CÂMERA', 'SOM'], camera: {
    world: [{ kind: 'pan', amount: 120, when: 'passagem entre cenas, no respiro da fala, com desfoque de velocidade (na referência as cenas ficam a ~1300 px: use o máximo do kit)' },
      { kind: 'push', amount: 1.1, when: 'dentro de cada cena, zoom 1.03 a 1.1 em 2 a 3 s, com balanço leve de câmera na mão' }],
    framing: 'Versão A: rosto do apresentador na metade de cima (~860 px) com borda de papel rasgado; o painel sobe junto com a 1ª passagem. Versão B: título Anton no lugar do rosto.',
    transitions: 'nenhum corte seco: só passagens de câmera, de 0,8 s no mínimo, que andam no silêncio e chegam logo depois da 1ª palavra da frase nova',
    depth: 'mesa de papel plana; parallax leve entre os cartões colados (sombra, fita) e o fundo pontilhado; tudo nítido, sem desfoque de profundidade; ponto focal na imagem do cartão e depois na legenda',
    signature: 'a passagem de câmera com desfoque de velocidade entre duas cenas, segurando a conclusão por até 0,4 s antes de andar' } },
  'fitted-captions': { id: 'fitted-captions', motion: [], camera: { world: [], framing: 'locutor recortado; o texto alterna entre atrás do recorte, por cima de tudo e contornando o rosto', transitions: 'corte seco a cada frase', depth: 'duas camadas: texto atrás do recorte e texto na frente', signature: 'palavra gigante passando atrás da cabeça' },
    guide: 'Tipografia cinética estilo revista, só texto. Só a palavra gigante usa a cor de destaque da marca. Varie o estilo tipográfico entre os do catálogo, mantendo a legibilidade e as fontes da marca.',
    dropSentence: /\s*Varie o estilo tipográfico entre os do catálogo \(styleCatalog\), mantendo a legibilidade e as fontes da marca\./ },
};

for (const [fid, cfg] of Object.entries(SPLIT)) {
  const fdir = join(WS, 'formats', fid), ffile = join(fdir, 'format.json');
  if (!existsSync(ffile)) { console.log(`skip ${fid}: no format`); continue; }
  const sdir = join(WS, 'styles', cfg.id);
  if (existsSync(join(sdir, 'style.json'))) { console.log(`skip ${fid}: style ${cfg.id} exists`); continue; }
  const f = rd(ffile);
  mkdirSync(sdir, { recursive: true });
  for (const sub of ['refs', 'refs-test', 'skill.md']) if (existsSync(join(fdir, sub))) renameSync(join(fdir, sub), join(sdir, sub));
  const guide = cfg.guide ?? paragraphs(f.promptGuide ?? '', cfg.motion);
  const style = { id: cfg.id, name: f.name, description: f.description, guide, camera: cfg.camera,
    pace: f.editingStyle?.screenPacingSeconds, ...Object.fromEntries(MOTION.filter(k => f[k] !== undefined).map(k => [k, f[k]])) };
  wr(join(sdir, 'style.json'), style);
  for (const k of MOTION) delete f[k];
  if (cfg.dropSentence) f.promptGuide = (f.promptGuide ?? '').replace(cfg.dropSentence, '');
  else if (cfg.motion.length) f.promptGuide = (f.promptGuide ?? '').split(/\n\s*\n/).filter(p => !cfg.motion.some(h => p.trim().startsWith(h))).join('\n\n');
  wr(ffile, f);
  console.log(`${fid} -> style ${cfg.id} (${guide.length} chars of guide)`);
  const pdir = join(WS, 'projects');
  for (const p of existsSync(pdir) ? readdirSync(pdir) : []) {
    const sf = join(pdir, p, 'state.json');
    if (!existsSync(sf)) continue;
    const st = rd(sf);
    if (st.formatId === fid && !st.styleId) { st.styleId = cfg.id; wr(sf, st); console.log(`  project ${p}: styleId=${cfg.id}`); }
  }
}
