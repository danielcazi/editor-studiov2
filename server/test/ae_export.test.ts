// Regressão do exportador do After (server/ae/make_jsx.mjs) na composição mínima de test/fixtures/ae: texto em DOM e em canvas
// têm de sair como camadas nativas, a câmera de mundo (#world) como keyframes e o blur() animado como Gaussian Blur, não clipe. Precisa do Chrome; sem ele o teste é pulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { findChrome } from '../host.ts';

const HERE = resolve(import.meta.dirname);
const ROOT = resolve(HERE, '../..');
const CHROME = findChrome();

test('make_jsx exporta texto de DOM, texto de canvas e câmera de mundo', { skip: CHROME ? false : 'Chrome não encontrado' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-fixture-'));
  copyFileSync(join(HERE, 'fixtures/ae/index.html'), join(dir, 'index.html'));
  copyFileSync(join(ROOT, 'claude-reel-editor/skills/reel-editor/engine/gsap.min.js'), join(dir, 'gsap.min.js'));
  writeFileSync(join(dir, 'foto.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));   // 1×1 png
  const out = join(dir, 'after-effects');
  execFileSync('node', [join(ROOT, 'server/ae/make_jsx.mjs'), '--html', join(dir, 'index.html'), '--out', out, '--aep', join(out, 'f.aep'), '--name', 'fixture', '--step', '5'], { stdio: 'pipe', timeout: 180000 });
  const r = JSON.parse(readFileSync(join(out, 'ae_report.json'), 'utf8'));
  assert.deepEqual(r.avisos, []);
  assert.equal(r.camadas.grupos, 1, 'a cena dentro do #world é um grupo');
  assert.ok(r.camadas.textos_na_composicao >= 2, 'a composição tem texto');
  assert.equal(r.camadas.textos_canvas, 1, 'a frase do canvas vira texto nativo');
  assert.equal(r.camadas.textos, 3, 'DOM (2) + canvas');
  assert.ok(r.camadas.camera_mundo > 2, 'pose do #world em keyframes');
  assert.ok(r.nativas.some((n: string) => n.includes('Texto em DOM')) && r.nativas.some((n: string) => n.includes('Texto em canvas')), r.nativas.join('\n'));
  const jsx = readFileSync(join(out, 'build_comp.jsx'), 'utf8');
  assert.match(jsx, /"depths":\[\{"id":"mid","z":-110,"s":1\.0611\}\]/, 'profundidade lida do translateZ e da escala');
  assert.ok(r.clipes.some((c: string) => c.includes('cena-')), 'a decoração do canvas continua em clipe');
  // o clipe é recortado pelo alfa visível: o canvas tem 540×400, mas o retângulo roxo desenhado é 460×200 (484×210 com o push-in de 5%) e a caixa da peça tinha folga de 70 px
  const mov = join(out, 'V/clips/cena-3.mov');
  const [cw, ch] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', mov], { encoding: 'utf8' }).trim().split(',').map(Number);
  assert.ok(cw <= 490 && ch <= 220, `clipe recortado pelo alfa, não pela caixa da peça: ${cw}×${ch}`);
  assert.match(r.clipes[0], new RegExp(`${cw}×${ch}`), 'o relatório e a posição usam o tamanho recortado');
  assert.equal(r.camadas.clipes_prores, 1, 'só o canvas vira clipe: a palavra com blur() é nativa');
  assert.match(jsx, /"bl":[1-9]/, 'blur medido por quadro nos keyframes da peça');
  assert.equal(r.camadas.degrades, 3, 'sombra (wipe), vinheta (vig) e fundo com luz (ramp) nativos');
  assert.equal(r.camadas.imagens, 1, 'a <img> entra como o próprio arquivo');
  for (const k of ['"kind":"wipe"', '"kind":"vig"', '"kind":"ramp"', '"blend":"screen"', '"file":"V/img/0-foto.png"', '"fit":"cover"']) assert.ok(jsx.includes(k), k);
  assert.ok(existsSync(join(out, 'V/img/0-foto.png')), 'imagem copiada para o pacote');
  // push-in da cena (#cena 1 → 1,05): a null do título termina com escala ~105 e a origem medida no espaço local da cena
  const D = JSON.parse(/var DATA = (.*);\n/.exec(jsx)![1]);
  const tit = D.pieces.find((p: any) => p.kind === 'native' && p.texts.some((t: any) => t.text === 'Texto em DOM'));
  const s1 = tit.keys.at(-1).s[0];
  assert.ok(tit.keys[0].s[0] < 100.1 && s1 > 104 && s1 < 105.1, `escala da cena na null: ${tit.keys[0].s[0]} → ${s1}`);
  assert.equal(tit.texts[0].size, 48, 'texto medido sem a escala da cena');
});
