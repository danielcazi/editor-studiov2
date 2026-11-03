// Regressão do exportador do After (server/ae/make_jsx.mjs) na composição mínima de test/fixtures/ae: texto em DOM e em canvas
// têm de sair como camadas nativas, e a câmera de mundo (#world) como keyframes. Precisa do Chrome; sem ele o teste é pulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = resolve(import.meta.dirname);
const ROOT = resolve(HERE, '../..');
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));

test('make_jsx exporta texto de DOM, texto de canvas e câmera de mundo', { skip: CHROME ? false : 'Chrome não encontrado' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-fixture-'));
  copyFileSync(join(HERE, 'fixtures/ae/index.html'), join(dir, 'index.html'));
  copyFileSync(join(ROOT, 'claude-reel-editor/skills/reel-editor/engine/gsap.min.js'), join(dir, 'gsap.min.js'));
  const out = join(dir, 'after-effects');
  execFileSync('node', [join(ROOT, 'server/ae/make_jsx.mjs'), '--html', join(dir, 'index.html'), '--out', out, '--aep', join(out, 'f.aep'), '--name', 'fixture', '--sem-clipes', '--step', '5'], { stdio: 'pipe', timeout: 180000 });
  const r = JSON.parse(readFileSync(join(out, 'ae_report.json'), 'utf8'));
  assert.deepEqual(r.avisos, []);
  assert.equal(r.camadas.grupos, 1, 'a cena dentro do #world é um grupo');
  assert.ok(r.camadas.textos_na_composicao >= 2, 'a composição tem texto');
  assert.equal(r.camadas.textos_canvas, 1, 'a frase do canvas vira texto nativo');
  assert.equal(r.camadas.textos, 2, 'DOM + canvas');
  assert.ok(r.camadas.camera_mundo > 2, 'pose do #world em keyframes');
  assert.ok(r.nativas.some((n: string) => n.includes('Texto em DOM')) && r.nativas.some((n: string) => n.includes('Texto em canvas')), r.nativas.join('\n'));
  const jsx = readFileSync(join(out, 'build_comp.jsx'), 'utf8');
  assert.match(jsx, /"depths":\[\{"id":"mid","z":-110,"s":1\.0611\}\]/, 'profundidade lida do translateZ e da escala');
  assert.ok(r.clipes.some((c: string) => c.includes('cena-')), 'a decoração do canvas continua em clipe');
});
