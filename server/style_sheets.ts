// Contact sheet of an illustration pack: its engine demo (compose/engines/demos/<engine>.py) rendered in a scratch compose
// folder under workspace/cache/estilos/, snapshotted at the times the demo names and stacked side by side in one png.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { NPX, PYTHON } from './host.ts';
import { safeId } from './lib.ts';
import { UserError, WS } from './pipeline.ts';

const K = join(resolve(import.meta.dirname, '..'), 'claude-reel-editor/skills/reel-editor/compose');
const CACHE = join(WS, 'cache', 'estilos');

export function packFile(id: string) {
  const f = join(K, 'estilos', `${id}.md`);
  if (!safeId(id) || !existsSync(f)) throw new UserError(`estilo ${id} não existe`);
  return f;
}
// pack id -> engine slug, from the README table (`engine='silkscreen'`); packs without an engine have no sheet
const engineOf = (id: string) => readFileSync(join(K, 'estilos/README.md'), 'utf8').match(new RegExp(`^\\| \`${id}\` \\|.*engine='(\\w+)'`, 'm'))?.[1] ?? null;

const sh = (cmd: string, args: string[], cwd: string) => new Promise<void>((ok, ko) => {
  let out = '';
  const p = spawn(cmd, args, { cwd, env: { ...process.env, PYTHONPATH: '.' } });
  p.stdout.on('data', b => out += b); p.stderr.on('data', b => out += b);
  p.on('error', ko);
  p.on('close', code => code === 0 ? ok() : ko(new Error(`${cmd} ${args[0]} failed (${code}): ${out.trim().slice(-600)}`)));
});

async function build(id: string, engine: string) {
  const png = join(CACHE, `${id}.png`), demo = join(K, 'engines/demos', `${engine}.py`);
  const src = [packFile(id), demo, join(K, 'engines', `${engine}.js`), join(K, 'kit.py')];
  const missing = src.find(f => !existsSync(f));
  if (missing) throw new UserError(`estilo ${id}: falta ${basename(missing)}`);
  if (existsSync(png) && src.every(f => statSync(f).mtimeMs <= statSync(png).mtimeMs)) return png;
  const T = join(CACHE, id), A = join(T, 'assets');
  rmSync(T, { recursive: true, force: true });
  for (const d of ['engines', 'assets/fonts', 'assets/sfx', 'assets/img']) mkdirSync(join(T, d), { recursive: true });
  copyFileSync(join(K, 'kit.py'), join(T, 'kit.py'));
  for (const f of readdirSync(join(K, 'engines')).filter(f => f.endsWith('.js'))) copyFileSync(join(K, 'engines', f), join(T, 'engines', f));
  for (const f of readdirSync(join(K, 'sfx'))) copyFileSync(join(K, 'sfx', f), join(A, 'sfx', f));
  writeFileSync(join(A, 'transcript.json'), '[]');
  // any brand's otf/ttf serves as the demo's Aspekta; without one the browser falls back
  const font = readdirSync(join(WS, 'brands'), { withFileTypes: true }).flatMap(b => { const d = join(WS, 'brands', b.name, 'fonts'); return b.isDirectory() && existsSync(d) ? readdirSync(d).filter(f => /\.(otf|ttf)$/i.test(f)).map(f => join(d, f)) : []; })[0];
  if (font) copyFileSync(font, join(A, 'fonts/font.otf'));
  const py = readFileSync(demo, 'utf8');
  const end = Math.max(6, ...[...py.matchAll(/^scene\(\d+, [\d.]+, ([\d.]+),/gm)].map(m => Number(m[1])));   // the last scene (FIM) runs to DUR; 6 s when the demo has no numeric end
  const times = py.match(/snapshots em ([\d., ]+) s/)?.[1].split(',').map(Number) ?? [1, 3, 5, 7].map(k => Math.round(k * end / 8 * 10) / 10);
  writeFileSync(join(T, 'compose.json'), JSON.stringify({ cuts: [], W: 1080, H: 1920, aspectRatio: '9:16', safeZone: { top: 200, bottom: 380, left: 70, right: 70 }, DUR: Math.round(end + 1.5),
    faceX: 980, speaker: false, colors: { RED: '#E61C1C', RED2: '#A61919', AMB: '#FFB600', BLK: '#000000', CRM: '#FFFAEA' }, fonte: { w: 1920, h: 1080 } }));   // no layoutCheck: the Chrome lint is not wanted here
  copyFileSync(demo, join(T, 'demo.py'));
  await sh(PYTHON, ['-B', 'demo.py'], T);
  await sh(NPX[0], [...NPX.slice(1), '--yes', 'hyperframes@0.8.217', 'snapshot', '--at', times.join(','), '--no-end', '-o', 'snaps'], T);
  const frames = readdirSync(join(T, 'snaps')).filter(f => /^frame-.*\.png$/.test(f)).sort();
  if (!frames.length) throw new Error(`snapshot de ${id} não gerou quadros`);
  await sh('ffmpeg', ['-y', ...frames.flatMap(f => ['-i', join(T, 'snaps', f)]), '-filter_complex', `${frames.map((_, i) => `[${i}]scale=270:-1[s${i}]`).join(';')};${frames.map((_, i) => `[s${i}]`).join('')}hstack=${frames.length}`, png], T);
  rmSync(T, { recursive: true, force: true });
  return png;
}

let queue: Promise<unknown> = Promise.resolve();   // one render at a time: opening the tab asks for all packs at once
/** Png path of the pack's contact sheet, or '' when the pack has no engine (nothing to render). */
export function illustrationSheet(id: string): Promise<string> {
  packFile(id);
  const engine = engineOf(id);
  if (!engine) return Promise.resolve('');
  const job = queue.then(() => build(id, engine), () => build(id, engine));
  queue = job;
  return job;
}
