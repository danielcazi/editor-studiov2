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
  const mov = join(out, r.clipes.find((c: string) => c.includes('cena-3-'))!.split(' ')[0]);
  const [cw, ch] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', mov], { encoding: 'utf8' }).trim().split(',').map(Number);
  assert.ok(cw <= 490 && ch <= 220, `clipe recortado pelo alfa, não pela caixa da peça: ${cw}×${ch}`);
  assert.match(r.clipes[0], new RegExp(`${cw}×${ch}`), 'o relatório e a posição usam o tamanho recortado');
  // o selo só aparece de 0,5 s a 1,2 s: o clipe dele dura isso, não a cena, e o nome do arquivo diz qual peça é
  const selo = r.clipes.find((c: string) => c.includes('selo'));
  assert.ok(selo, r.clipes.join('\n'));
  const [, ta, tb] = /\(([\d.]+)–([\d.]+) s/.exec(selo)!.map(Number);
  assert.ok(ta >= 0.45 && ta <= 0.55 && tb >= 1.15 && tb <= 1.3, `clipe do selo no tempo em que aparece: ${ta}–${tb}`);
  assert.equal(r.camadas.clipes_prores, 2, 'só o canvas e o selo inclinado viram clipe: a palavra com blur() e o traço que se desenha são nativos');
  assert.match(jsx, /"bl":[1-9]/, 'blur medido por quadro nos keyframes da peça');
  assert.equal(r.camadas.degrades, 3, 'sombra (wipe), vinheta (vig) e fundo com luz (ramp) nativos');
  assert.equal(r.camadas.imagens, 1, 'a <img> entra como o próprio arquivo');
  // o ícone <svg> sai como arquivo .svg com a cor do CSS resolvida (currentColor) e o traço, e vira camada de forma no After
  assert.equal(r.camadas.vetores, 2, 'o <svg> do ícone e o do traço que se desenha são nativos, não clipe');
  // traço que se desenha (pathLength=1, dasharray 1 1.2, offset 1,1 → 0 de 0,2 s a 1,2 s): Trim Paths no 2º filho, Fim de 0 a 100
  const D = JSON.parse(/var DATA = (.*);\n/.exec(jsx)![1]);
  const tr = D.pieces.flatMap((p: any) => (p.shapes || []).filter((x: any) => x.trims?.length).map((x: any) => ({ p, x })))[0];
  assert.ok(tr, 'svg com traço animado vira forma com trims');
  assert.deepEqual(tr.x.trims, [{ k: 1, j: 0 }], 'trim no 2º filho (o 1º é a linha fixa)');
  const fins = tr.p.keys.filter((k: any) => k.tr).map((k: any) => k.tr[0]);
  assert.ok(fins[0] === 0 && fins.at(-1) === 100 && fins.some((v: number) => v > 0 && v < 100), `Fim do Trim Paths anima de 0 a 100: ${fins.join(' ')}`);
  assert.doesNotMatch(readFileSync(join(out, tr.x.file), 'utf8'), /stroke-dasharray="1/, 'o traço sai inteiro no arquivo');
  const svg = [...jsx.matchAll(/"file":"(V\/svg\/[^"]+\.svg)"/g)].map((m) => readFileSync(join(out, m[1]), 'utf8')).find((x) => x.includes('M12 2s5'))!;
  assert.match(svg, /fill="rgb\(243, 152, 75\)"/, 'currentColor resolvido para a cor do CSS');
  assert.match(svg, /stroke-linecap="round"/, 'traço e ponta preservados');
  assert.match(svg, /<svg (xmlns="[^"]+" )?width="80" height="80" viewBox="0 0 24 24">/, 'raiz só com tamanho em px e viewBox');
  assert.match(svg.slice(svg.indexOf('width=') - 1), /^ width="80"/, 'o primeiro width= do arquivo é o da raiz (o After lê esse, e stroke-width virava largura 1)');
  for (const k of ['"kind":"wipe"', '"kind":"vig"', '"kind":"ramp"', '"blend":"screen"', '"file":"V/img/0-foto.png"', '"fit":"cover"']) assert.ok(jsx.includes(k), k);
  assert.ok(existsSync(join(out, 'V/img/0-foto.png')), 'imagem copiada para o pacote');
  // push-in da cena (#cena 1 → 1,05): a null do título termina com escala ~105 e a origem medida no espaço local da cena
  const tit = D.pieces.find((p: any) => p.kind === 'native' && p.texts.some((t: any) => t.text === 'Texto em DOM'));
  const s1 = tit.keys.at(-1).s[0];
  assert.ok(tit.keys[0].s[0] < 100.1 && s1 > 104 && s1 < 105.1, `escala da cena na null: ${tit.keys[0].s[0]} → ${s1}`);
  assert.equal(tit.texts[0].size, 48, 'texto medido sem a escala da cena');
});
