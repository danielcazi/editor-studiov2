// Motion Think: the pure parts (movement split, notes, helper parsing, the brief section) and the approval path writing a temp bank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'editor-mt-'));
process.env.WORKSPACE = tmp;
process.env.BANCO_DIR = join(tmp, 'banco');
const MT = await import('../motionthink.ts');
const BK = await import('../banco.ts');

test('splitMovements: cuts become 1-10 s movements covering the excerpt', () => {
  assert.deepEqual(MT.splitMovements([], 7), [[0, 7]]);
  assert.deepEqual(MT.splitMovements([2, 5], 7), [[0, 2], [2, 5], [5, 7]]);
  assert.deepEqual(MT.splitMovements([0.3, 2, 2.4, 5], 7), [[0, 2.4], [2.4, 5], [5, 7]]);   // the 0.3 s and 0.4 s pieces join the shorter neighbour
  assert.deepEqual(MT.splitMovements([], 25), [[0, 8.33], [8.33, 16.67], [16.67, 25]]);   // over 10 s: split evenly
  const segs = MT.splitMovements([3, 9.5, 30, 31, 44], 60);
  for (const [a, b] of segs) assert.ok(b - a >= MT.MIN_MOVE - 0.01 && b - a <= MT.MAX_MOVE + 0.01, `${a}-${b}`);
  for (let k = 1; k < segs.length; k++) assert.equal(segs[k][0], segs[k - 1][1]);
  assert.equal(segs[0][0], 0); assert.equal(segs[segs.length - 1][1], 60);
});

test('checkNota: verdict, moment and category are validated, pins and tags cleaned', () => {
  const n = MT.checkNota({ veredito: 'gosto', momento: 'gancho', categoria: 'tipografia', tags: [' remate', '', 'cantos'], texto: 'x', pins: [{ t: '1.2', x: 50, y: 70, text: 'aqui' }, null], naoLevar: 'a fonte' });
  assert.deepEqual(n, { veredito: 'gosto', momento: 'gancho', categoria: 'tipografia', tags: ['remate', 'cantos'], texto: 'x', pins: [{ t: 1.2, x: 50, y: 70, text: 'aqui' }], naoLevar: 'a fonte' });
  assert.throws(() => MT.checkNota({ veredito: 'amei' }), /veredito/);
  assert.throws(() => MT.checkNota({ veredito: 'gosto', momento: 'intro' }), /momento/);
  assert.throws(() => MT.checkNota({ veredito: 'gosto', categoria: 'som' }), /categoria/);
  assert.equal(MT.checkNota({ veredito: 'neutro', momento: '' }).momento, undefined);
});

test('helperName/helperParams: the kit convention (p first, everything else defaulted)', () => {
  const src = `from kit import *\n\ndef cluster_gigante(p, giant='X', cantos=('a','b'), color=None, at=0.0, d=None, k='cg'):\n    return '', ''\n`;
  assert.equal(BK.helperName(src), 'cluster_gigante');
  assert.deepEqual(BK.helperParams(src), ['giant', 'cantos', 'color']);
  assert.throws(() => BK.helperName('def _x(p): pass'), /não define/);
  assert.throws(() => BK.helperName('def x(sel, a): pass'), /`p`/);
  assert.throws(() => BK.helperName('def x(p, giant, at=0): pass'), /sem valor padrão \(giant\)/);
});

test('bancoBrief lists helpers by moment with photo, params and the negative list', () => {
  assert.equal(BK.bancoBrief({ helpers: [], negativo: [] }), '');
  const b = { helpers: [{ id: 'cg', nome: 'palavra gigante', momento: 'gancho' as const, categoria: 'tipografia' as const, params: ['giant', 'cantos'], medidas: {}, origem: 'o', aprovadoEm: 'd', rodadas: 1 }], negativo: [{ id: 'n1', motivo: 'novelo rabiscado lê como rascunho', origem: 'x' }] };
  const s = BK.bancoBrief(b, ['cg']);
  assert.match(s, /### gancho\n- `cg\(p, giant=, cantos=, at=, d=\)` · tipografia · foto estilos\/banco\/cg.jpg/);
  assert.match(s, /Já usados nos últimos reels.*cg/);
  assert.match(s, /### Negativo[\s\S]*novelo rabiscado/);
});

test('approve: a validated round enters the bank (files, banco.json, the bank test) and a bad helper is rolled back', async () => {
  // a fake session: analysis, notes, one approved round with a helper and a frame
  const id = '2026-11-07-ref-tipo-01', D = join(tmp, 'motion-think', id), R = join(D, 'rounds', '1', '1');
  mkdirSync(R, { recursive: true }); mkdirSync(join(D, 'frames', '1'), { recursive: true });
  writeFileSync(join(D, 'state.json'), JSON.stringify({ id, name: 'ref', source: 'file', src: '', status: 'analisado', movimentos: { 1: { rodadas: 1, status: 'aguardando' } }, cost: [], createdAt: 'x' }));
  writeFileSync(join(D, 'analysis.json'), JSON.stringify({ movimentos: [{ m: 1, a: 0, b: 3.4, nome: 'palavra gigante com remate nos cantos', oque: 'uma palavra ocupa 85% da largura', elemento: 'tipografia', camera: 'parada', entrada: 'scaleY', vida: 'nenhuma', saida: 'corte', tipo: {}, paleta: [], medidas: { larguraPalavra: 0.85 }, momentoSugerido: 'gancho', categoriaSugerida: 'tipografia' }] }));
  writeFileSync(join(D, 'notes.json'), JSON.stringify({ version: 1, movimentos: { 1: { veredito: 'gosto', momento: 'gancho', categoria: 'tipografia', tags: ['remate'], texto: 'a palavra grande antes de tudo', pins: [], naoLevar: 'a fonte, o laranja' } } }));
  writeFileSync(join(R, 'round.json'), JSON.stringify({ m: 1, r: 1, at: 'x', summary: 's', helper: 'cluster_gigante' }));
  writeFileSync(join(R, 'veredito.json'), JSON.stringify({ ok: true, texto: 'bom', pins: [], at: 'x' }));
  writeFileSync(join(R, 'helper.py'), `from kit import *\n\ndef cluster_gigante(p, giant='PALAVRA', cantos=('um', 'dois', 'tres'), color=None, at=0.0, d=None, k='cg'):\n    """Palavra gigante a 85% da largura, três pequenas nos cantos."""\n    i = f'{p}-{k}'\n    html = f'<div id="{i}" class="giant" style="top:{H*.2:.0f}px;color:{color or AMB}">{giant}</div>'\n    js = f'tl.fromTo("#{i}",{{scaleY:.12}},{{scaleY:1,duration:.5,ease:"expo.out"}},{at});'\n    return html, js\n`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=0.1', '-frames:v', '1', join(R, 'sheet.jpg')]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=0.1', '-frames:v', '1', join(D, 'frames', '1', 'mid.jpg')]);
  const r = await MT.approve(id, { m: 1, r: 1 });
  assert.equal(r.helper.id, 'cluster_gigante');
  assert.deepEqual(r.helper.params, ['giant', 'cantos', 'color']);
  assert.equal(r.helper.medidas.duracao, 3.4);
  const B = process.env.BANCO_DIR!;
  for (const f of ['cluster_gigante.py', 'cluster_gigante.jpg', 'cluster_gigante.orig.jpg', 'cluster_gigante.md', 'banco.json', 'negativo.md']) assert.ok(existsSync(join(B, f)), f);
  assert.match(readFileSync(join(B, 'cluster_gigante.md'), 'utf8'), /Momento: gancho \(tipografia\)\.\nNão fazer: a fonte, o laranja/);
  assert.equal(BK.readBanco().helpers.length, 1);
  assert.equal(MT.get(id).movimentos['1'].status, 'aprovado');
  assert.equal(BK.listBanco().helpers[0].jpg, true);
  // a second approval of the same name is refused; a broken helper never stays in the bank
  await assert.rejects(MT.approve(id, { m: 1, r: 1 }), /já aprovado|já existe/);
  const R2 = join(D, 'rounds', '2', '1'); mkdirSync(R2, { recursive: true });
  const st = JSON.parse(readFileSync(join(D, 'state.json'), 'utf8')); st.movimentos[2] = { rodadas: 1, status: 'aguardando' }; writeFileSync(join(D, 'state.json'), JSON.stringify(st));
  const an = JSON.parse(readFileSync(join(D, 'analysis.json'), 'utf8')); an.movimentos.push({ ...an.movimentos[0], m: 2, nome: 'quebrado' }); writeFileSync(join(D, 'analysis.json'), JSON.stringify(an));
  const no = JSON.parse(readFileSync(join(D, 'notes.json'), 'utf8')); no.movimentos[2] = no.movimentos[1]; writeFileSync(join(D, 'notes.json'), JSON.stringify(no));
  writeFileSync(join(R2, 'round.json'), JSON.stringify({ m: 2, r: 1, at: 'x', summary: 's', helper: 'quebrado' }));
  writeFileSync(join(R2, 'veredito.json'), JSON.stringify({ ok: true, texto: '', pins: [], at: 'x' }));
  writeFileSync(join(R2, 'helper.py'), `from kit import *\n\ndef quebrado(p, at=0.0, d=None, k='q'):\n    return 1 / 0\n`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=0.1', '-frames:v', '1', join(R2, 'sheet.jpg')]);
  await assert.rejects(MT.approve(id, { m: 2, r: 1 }), /reprovou no teste do banco/);
  assert.ok(!existsSync(join(B, 'quebrado.py')));
  assert.equal(BK.readBanco().helpers.length, 1);
  // out of the bank: the .py is kept in _removidos/
  BK.removeHelper('cluster_gigante');
  assert.ok(existsSync(join(B, '_removidos', 'cluster_gigante.py')) && !existsSync(join(B, 'cluster_gigante.jpg')));
  assert.equal(BK.readBanco().helpers.length, 0);
});

test('verdict: the third refusal parks the movement; notes keep a version', () => {
  const id = 'veredito-x', D = join(tmp, 'motion-think', id);
  mkdirSync(join(D, 'rounds', '1', '3'), { recursive: true });
  writeFileSync(join(D, 'state.json'), JSON.stringify({ id, name: 'v', source: 'file', src: '', status: 'analisado', movimentos: { 1: { rodadas: 3, status: 'aguardando' } }, cost: [], createdAt: 'x' }));
  writeFileSync(join(D, 'analysis.json'), JSON.stringify({ movimentos: [{ m: 1, a: 0, b: 2, nome: 'n', oque: '', elemento: '', camera: '', entrada: '', vida: '', saida: '', tipo: {}, paleta: [], medidas: {}, momentoSugerido: 'prova', categoriaSugerida: '3d' }] }));
  writeFileSync(join(D, 'rounds', '1', '3', 'round.json'), JSON.stringify({ m: 1, r: 3, at: 'x', summary: '' }));
  const r = MT.verdict(id, 1, 3, { ok: false, texto: 'ainda não' });
  assert.equal(r.movimentos['1'].status, 'parado');
  assert.equal(r.rounds[0].veredito?.texto, 'ainda não');
  const n1 = MT.putNotes(id, { movimentos: { 1: { veredito: 'nao-gosto', texto: 'novelo rabiscado' } }, version: 0 });
  assert.equal(n1.version, 1);
  assert.throws(() => MT.putNotes(id, { movimentos: {}, version: 0 }), /outra aba/);
  assert.ok(BK.readBanco().negativo.some(n => n.motivo === 'novelo rabiscado' && n.origem === `${id}/m1`));
  MT.putNotes(id, { movimentos: { 1: { veredito: 'neutro' } }, version: 1 });
  assert.ok(!BK.readBanco().negativo.some(n => n.origem === `${id}/m1`));
});
