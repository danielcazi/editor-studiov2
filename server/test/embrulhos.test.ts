import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { carregarEmbrulho, conferirCampos, encaixe, listarEmbrulhos, precosDoSrt, slotsPx } from '../embrulhos.ts';

test('the 15 models load and every slot is even-sized', () => {
  assert.equal(listarEmbrulhos().length, 15);
  for (const id of listarEmbrulhos()) for (const s of Object.values(slotsPx(carregarEmbrulho(id)))) assert.equal((s.w % 2) + (s.h % 2), 0, id);
});

test('prices come only from the srt, literally', () => {
  assert.deepEqual(precosDoSrt('de R$ 197,00 por R$97. Sem R$ 1.997'), ['R$197,00', 'R$97', 'R$1.997']);
  const m = carregarEmbrulho('oferta');
  const sem = conferirCampos(m, { promessa: 'x', preco_por: 'R$97', cta: 'Toque' }, { srt: 'sem preço' });
  assert.ok(sem.some(i => i.nivel === 'erro' && i.campo === 'preco_por'));
  const ok = conferirCampos(m, { promessa: 'x', preco_por: 'R$ 97', cta: 'Toque' }, { srt: 'custa R$97' });
  assert.deepEqual(ok.filter(i => i.nivel === 'erro'), []);
});

test('template texts from the PDF, max length and quadro_t are rejected', () => {
  const p = carregarEmbrulho('pergunta');
  const r = conferirCampos(p, { rotulo: 'Faça uma pergunta', pergunta: 'Coloque aqui uma pergunta altamente forte ou polêmica' });
  assert.deepEqual(r.map(i => i.campo), ['pergunta']);   // rotulo is fixo, so its default is fine
  assert.ok(conferirCampos(p, { rotulo: 'x', pergunta: 'a'.repeat(91) }).some(i => /máximo 90/.test(i.msg)));
  const f = carregarEmbrulho('fofoca-duplo');
  assert.ok(conferirCampos(f, { nome_pagina: 'a', titulo: 'b', quadro_t: 99 }, { duracao: 30 }).some(i => i.campo === 'quadro_t'));
  assert.ok(conferirCampos(f, { nome_pagina: 'a', titulo: '3 dicas', quadro_t: 5 }, { duracao: 30, srt: 'oi' }).some(i => i.nivel === 'aviso' && /"3"/.test(i.msg)));
});

test('every angle of the library names a real model', () => {   // the library is no longer read by the server; kept for its content
  const lib = JSON.parse(readFileSync(new URL('../embrulhos/angulos.json', import.meta.url), 'utf8')).angulos as { angulo: string; modelos: string[] }[];
  const ids = listarEmbrulhos();
  for (const a of lib) for (const m of a.modelos) assert.ok(ids.includes(m), `${a.angulo} → ${m}`);
});

test('encaixe: a face under the model text or cut by the crop asks for adaptation', () => {
  const v916 = { largura: 1080, altura: 1920 }, rosto = (x: number, y: number) => ({ x, y, w: 0.3, h: 0.17 });
  const tarja = carregarEmbrulho('tarja');   // band across the middle of a full-frame video
  assert.deepEqual(encaixe(tarja, [rosto(0.35, 0.2)], v916), { ok: true, motivo: '' });
  assert.match(encaixe(tarja, [rosto(0.35, 0.42)], v916).motivo, /coberto/);
  assert.equal(encaixe(tarja, [rosto(0.35, 0.42), ...Array(9).fill(rosto(0.35, 0.2))], v916).ok, true);   // 1 bad instant in 10 is tolerated
  assert.equal(encaixe(tarja, [null, null], v916).ok, true);                                              // no face at all
  // a 9:16 video in the meme's wide window keeps only the middle band: a face at the top is cut, and the focus slider brings it back
  const meme = carregarEmbrulho('meme-pov');
  assert.match(encaixe(meme, [rosto(0.35, 0.05)], v916).motivo, /cortado/);
  assert.equal(encaixe(meme, [rosto(0.35, 0.05)], v916, { x: 0.5, y: 0 }).ok, true);
  // a 16:9 video in a full 9:16 frame keeps only the middle column
  assert.match(encaixe(carregarEmbrulho('live'), [{ x: 0.05, y: 0.3, w: 0.15, h: 0.3 }], { largura: 1920, altura: 1080 }).motivo, /cortado/);
  // per proportion: in 16:9 a vertical video goes in whole (nothing cut) and the band sits at the middle of the frame
  assert.equal(encaixe(meme, [rosto(0.35, 0.05)], v916, undefined, '16x9').ok, true);
  assert.match(encaixe(tarja, [rosto(0.35, 0.42)], v916, undefined, '16x9').motivo, /coberto/);
  assert.equal(encaixe(tarja, [rosto(0.35, 0.1)], v916, undefined, '16x9').ok, true);
  // 4:5 cuts a vertical video in height: a face at the very top is lost
  assert.match(encaixe(tarja, [rosto(0.35, 0.02)], v916, undefined, '4x5').motivo, /cortado/);
  for (const id of listarEmbrulhos()) for (const z of carregarEmbrulho(id).zonasTexto ?? []) assert.ok([z.x, z.y, z.w, z.h].every(n => n >= 0 && n <= 1) && z.x + z.w <= 1.001 && z.y + z.h <= 1.001, id);
});
