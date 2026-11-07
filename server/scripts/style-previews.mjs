// Prévias dos estilos de ilustração: roda o demo do motor de cada estilo (compose/engines/demos/<engine>.py) numa pasta de compose
// descartável (workspace/cache/previews/<id>/), tira 4 quadros com `hyperframes snapshot` e grava workspace/styles/<id>/refs/demo-N.jpg,
// que o formulário de criação e a aba Estilos já mostram. Estilo sem motor fica sem prévia. Rode: node scripts/style-previews.mjs [id ...]
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WS = process.env.WORKSPACE || join(ROOT, 'workspace');
const KIT = join(ROOT, 'claude-reel-editor', 'skills', 'reel-editor', 'compose');
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const AT = '1.2,2.6,4.4,5.8';   // dentro das duas cenas de motor de cada demo (a terceira é o "FIM")
const home = p => p.replace(/^~(?=$|\/)/, process.env.HOME || '');
const isImg = f => /\.(webp|png|jpe?g)$/i.test(f);

// fonte da marca (a primeira que existir) e imagens para os demos que montam fotos (briefing, launch): biblioteca ou um projeto
const font = readdirSync(join(WS, 'brands'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => { try { return home(JSON.parse(readFileSync(join(WS, 'brands', d.name, 'brand.json'), 'utf8')).fonts?.head?.file ?? ''); } catch { return ''; } }).find(f => f && existsSync(f));
const imgDirs = [join(WS, 'library', 'img'), ...(existsSync(join(WS, 'projects')) ? readdirSync(join(WS, 'projects')).map(p => join(WS, 'projects', p, 'assets', 'img')) : [])];
const imgDir = imgDirs.find(d => existsSync(d) && readdirSync(d).some(isImg));

const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(WS, 'styles')).filter(d => existsSync(join(WS, 'styles', d, 'style.json')));
for (const id of ids) {
  const style = JSON.parse(readFileSync(join(WS, 'styles', id, 'style.json'), 'utf8'));
  const demo = style.engine && join(KIT, 'engines', 'demos', `${style.engine}.py`);
  if (!demo || !existsSync(demo)) { console.log(`${id}: sem motor com demo, sem prévia`); continue; }
  const C = join(WS, 'cache', 'previews', id), A = join(C, 'assets');
  rmSync(C, { recursive: true, force: true });
  for (const d of ['sfx', 'fonts', 'img']) mkdirSync(join(A, d), { recursive: true });
  mkdirSync(join(C, 'engines'));
  for (const f of ['kit.py', 'GUIDE.md']) copyFileSync(join(KIT, f), join(C, f));
  for (const f of readdirSync(join(KIT, 'engines')).filter(f => f.endsWith('.js'))) copyFileSync(join(KIT, 'engines', f), join(C, 'engines', f));
  copyFileSync(join(KIT, 'sfx', 'manifest.json'), join(A, 'sfx', 'manifest.json'));
  if (font) copyFileSync(font, join(A, 'fonts', 'font.otf'));
  if (imgDir) for (const f of readdirSync(imgDir).filter(isImg).slice(0, 4)) copyFileSync(join(imgDir, f), join(A, 'img', f));
  writeFileSync(join(C, 'compose.json'), JSON.stringify({ cuts: [], W: 1080, H: 1920, aspectRatio: '9:16', safeZone: { top: 200, bottom: 380, left: 70, right: 70 }, DUR: 9, faceX: 540, speaker: false,
    pace: { every: 2.2, scene: [2, 4], framing: [3, 6], hold: 6 }, colors: { RED: '#d9001b', RED2: '#d9001b', AMB: '#f47b20', BLK: '#000000', CRM: '#fff9e6' }, fonte: { w: 1920, h: 1080 } }));
  writeFileSync(join(C, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true } }));
  copyFileSync(demo, join(C, 'scenes.py'));
  console.log(`${id}: demo do motor ${style.engine}...`);
  execFileSync(PY, ['-B', 'scenes.py'], { cwd: C, stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('npx', ['--yes', 'hyperframes@0.8.217', 'snapshot', '--at', AT, '--no-end', '-o', 'snaps', '.'], { cwd: C, stdio: ['ignore', 'ignore', 'inherit'] });
  const refs = join(WS, 'styles', id, 'refs');
  mkdirSync(refs, { recursive: true });
  for (const f of readdirSync(refs).filter(f => f.startsWith('demo-'))) rmSync(join(refs, f));
  readdirSync(join(C, 'snaps')).filter(f => f.startsWith('frame-')).sort().forEach((f, k) =>
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(C, 'snaps', f), '-vf', 'scale=270:-2', join(refs, `demo-${k}.jpg`)]));
  rmSync(C, { recursive: true, force: true });
  console.log(`${id}: 4 quadros em ${refs}`);
}
