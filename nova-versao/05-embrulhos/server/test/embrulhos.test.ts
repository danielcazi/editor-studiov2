import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { carregarEmbrulho, conferirCampos, listarEmbrulhos, precosDoSrt, slotsPx } from '../embrulhos.ts';

test('the 9 PDF models load and every slot is even-sized', () => {
  assert.equal(listarEmbrulhos().length, 9);
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

test('every model has angles in the library and every angle names a real model', () => {
  const lib = JSON.parse(readFileSync(new URL('../embrulhos/angulos.json', import.meta.url), 'utf8')).angulos as { angulo: string; modelos: string[] }[];
  const ids = listarEmbrulhos();
  for (const a of lib) for (const m of a.modelos) assert.ok(ids.includes(m), `${a.angulo} → ${m}`);
  for (const id of ids) assert.ok(lib.some(a => a.modelos.includes(id)), id);
});
