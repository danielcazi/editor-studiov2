import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from '../host.ts';

// alone (`node --test test/embrulhar.test.ts`) there is no WORKSPACE from run.mjs: never write sessions into the real one
process.env.WORKSPACE ??= mkdtempSync(join(tmpdir(), 'editor-test-'));
const tmp = mkdtempSync(join(tmpdir(), 'emb-'));
// stands in for the claude CLI: fills two models, the second one repeating the PDF's template text
const fake = join(tmp, 'claude.sh');
writeFileSync(fake, `#!/bin/bash\ncat >/dev/null\necho '${JSON.stringify({ is_error: false, result: '', usage: { input_tokens: 1, output_tokens: 1 },
  structured_output: { leitura: { oferta: 'o', publico: 'p', promessa: 'pr', cta: 'c' }, formatos: [
    { modelo: 'tarja', quadro_t: 0, campos: { headline: 'olá mundo, de novo', intruso: 'x' } },
    { modelo: 'pergunta', quadro_t: 0, campos: { rotulo: 'Faça uma pergunta', pergunta: 'Coloque aqui uma pergunta altamente forte ou polêmica' } }] } })}'\n`);
chmodSync(fake, 0o755);
process.env.CLAUDE_BIN = fake;
const E = await import('../embrulhar.ts');
const video = join(tmp, 'criativo.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=720x1280:r=30:d=3', '-f', 'lavfi', '-i', 'sine=d=3', '-pix_fmt', 'yuv420p', '-shortest', video]);
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' }));

test('a session takes a video, keeps edits with their checks and refuses a stale version', async () => {
  const s = await E.create({ video, name: 'Teste' });
  assert.equal(s.largura, 720); assert.ok(Math.abs(s.duracao - 3) < 0.2);
  assert.ok(E.list().some(x => x.id === s.id));
  // no AI: the user fills a format by hand
  let st = E.salvar(s.id, 'pergunta', { version: s.version, campos: { rotulo: 'Me pergunte', pergunta: 'x'.repeat(91) } });
  assert.ok(st.formatos.pergunta.itens.some(i => i.nivel === 'erro' && /máximo 90/.test(i.msg)));
  assert.throws(() => E.salvar(s.id, 'pergunta', { version: s.version, incluir: false }), /outra aba/);
  st = E.salvar(s.id, 'pergunta', { version: st.version, aprovado: true });
  assert.equal(st.formatos.pergunta.aprovado, false);   // cannot approve with an error
  st = E.salvar(s.id, 'pergunta', { version: st.version, campos: { pergunta: 'Dá mesmo pra começar do zero?' }, ajustes: { foco_y: 0.2 }, aprovado: true });
  assert.deepEqual(st.formatos.pergunta.itens.filter(i => i.nivel === 'erro'), []);
  assert.equal(st.formatos.pergunta.campos.rotulo, 'Me pergunte');   // fields not sent are kept
  assert.equal(st.formatos.pergunta.aprovado, true);
  assert.throws(() => E.salvar(s.id, 'pergunta', { version: st.version, ajustes: { foco_y: 2 } }), /foco_y/);
  assert.throws(() => E.salvar(s.id, 'nao-existe', { version: st.version }), /não existe/);
  await assert.rejects(E.gerar(s.id, { modelos: [] }), /ao menos um/);
  E.remove(s.id);
  assert.throws(() => E.get(s.id), /não existe/);
});

test('preview is 15 s at most and the export is a 1080x1920 mp4 with audio', { skip: !findChrome() && 'Chrome not found' }, async () => {
  const s = await E.create({ video, name: 'Render' });
  let st = E.salvar(s.id, 'pergunta', { version: s.version, campos: { rotulo: 'Me pergunte', pergunta: 'Dá mesmo pra começar do zero?' } });
  // a model with a still frame from the video, and one left out of the delivery
  st = E.salvar(s.id, 'fofoca-duplo', { version: st.version, campos: { nome_pagina: 'Página do Teste', titulo: 'Olha o que aconteceu nesse vídeo' }, ajustes: { quadro_t: 1 } });
  st = E.salvar(s.id, 'cinema', { version: st.version, incluir: false });
  st = await E.previa(s.id, 'pergunta');
  assert.ok(st.formatos.pergunta.previaEm >= st.formatos.pergunta.editadoEm);
  assert.ok(existsSync(E.file(s.id, 'previa/pergunta.mp4')));
  const out = await E.exportar(s.id);
  assert.deepEqual(out.falhas, []);
  assert.equal(out.formatos.cinema.exportadoEm, 0);
  for (const k of ['pergunta', 'fofoca-duplo']) {
    const p = probe(E.file(s.id, out.formatos[k].arquivo!)), v = p.streams.find((x: any) => x.codec_type === 'video');
    assert.deepEqual([v.width, v.height], [1080, 1920], k);
    assert.ok(p.streams.some((x: any) => x.codec_type === 'audio'), k);
    assert.ok(Math.abs(Number(p.format.duration) - 3) < 0.3, k);
  }
  // 16:9 and 1:1 sources fill the same 9:16 frame; foco_x picks which side survives the crop
  for (const [nome, size] of [['paisagem', '1280x720'], ['quadrado', '720x720']]) {
    const v = join(tmp, nome + '.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=s=${size}:r=30:d=2`, '-pix_fmt', 'yuv420p', v]);
    const o = await E.create({ video: v, name: nome });
    const e = E.salvar(o.id, 'pergunta', { version: o.version, campos: { rotulo: 'Me pergunte', pergunta: 'Dá mesmo pra começar do zero?' }, ajustes: { foco_x: 0 } });
    assert.equal(e.formatos.pergunta.ajustes.foco_x, 0);
    await E.previa(o.id, 'pergunta');
    const pv = probe(E.file(o.id, 'previa/pergunta.mp4')).streams[0];
    assert.deepEqual([pv.width, pv.height], [1080, 1920], nome);
  }
  // an edit after the export marks it stale
  st = E.salvar(s.id, 'pergunta', { version: out.version, campos: { pergunta: 'E se der errado?' } });
  assert.ok(st.formatos.pergunta.editadoEm > st.formatos.pergunta.exportadoEm);
});

test('gerar fills the chosen models, previews the valid one, keeps the rejected one with its errors and never rewrites an edited one', { skip: !findChrome() && 'Chrome not found' }, async () => {
  const s = await E.create({ video, name: 'IA' });
  writeFileSync(join(process.env.WORKSPACE!, 'embrulhos', s.id, 'words.json'), JSON.stringify([{ text: 'olá', start: 0, end: 0.5 }, { text: 'mundo', start: 0.5, end: 1 }]));   // no Whisper in tests
  let st = await E.gerar(s.id, { modelos: ['tarja', 'pergunta'] });
  assert.equal(st.leitura!.oferta, 'o');
  assert.deepEqual(st.formatos.tarja.campos, { headline: 'olá mundo, de novo' });   // only the model's own fields
  assert.ok(st.formatos.tarja.previaEm > 0 && existsSync(E.file(s.id, 'previa/tarja.mp4')));
  assert.match(st.formatos.pergunta.itens.map(i => i.msg).join(' '), /texto-modelo do PDF/);
  assert.equal(st.formatos.pergunta.previaEm, 0);
  assert.equal(st.cost.length, 2);   // the call and its one correction round
  st = E.salvar(s.id, 'tarja', { version: st.version, campos: { headline: 'texto do usuário' } });
  st = await E.gerar(s.id, { modelos: ['tarja'] });
  assert.equal(st.formatos.tarja.campos.headline, 'texto do usuário');
  assert.equal(st.formatos.pergunta.selecionado, false);
  assert.equal(st.cost.length, 2);   // nothing new to write: no model call
});

test('the profile is saved, becomes the default of the next session and reaches the render', { skip: !findChrome() && 'Chrome not found' }, async () => {
  const foto = join(tmp, 'foto.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=400x400', '-frames:v', '1', foto]);
  // a model that shows the name or the handle is blocked until the Marca stage has them; the viewer counter is not a "number from the video"
  // (before any default profile exists)
  const vazio = await E.create({ video, name: 'Sem marca' });
  let v = E.salvar(vazio.id, 'tweet', { version: vazio.version, campos: { texto: 'um post qualquer' } });
  assert.match(v.formatos.tweet.itens.map(i => i.msg).join(' '), /nome da marca/);
  v = E.salvar(vazio.id, 'live', { version: v.version, campos: { espectadores: '10.084', rodape: 'Os comentários foram desabilitados.' } });
  assert.deepEqual(v.formatos.live.itens.map(i => i.campo), ['marca']);
  v = E.perfil(vazio.id, { version: v.version, mostrarArroba: false });
  assert.deepEqual(v.formatos.live.itens, []);   // the handle was switched off on purpose
  v = E.perfil(vazio.id, { version: v.version, nome: 'Marca' });
  assert.deepEqual(v.formatos.tweet.itens, []);
  const s = await E.create({ video, name: 'Perfil' });
  assert.deepEqual(s.perfil, { nome: '', arroba: '', mostrarLogo: true, mostrarArroba: true });
  let st = E.salvar(s.id, 'fofoca-headline', { version: s.version, campos: { titulo: 'Olha o que aconteceu nesse vídeo' } });
  st = E.salvar(s.id, 'pergunta', { version: st.version, campos: { rotulo: 'Me pergunte', pergunta: 'Dá mesmo pra começar do zero?' } });
  st = await E.previa(s.id, 'fofoca-headline');
  const [antes, pergunta] = [st.formatos['fofoca-headline'].editadoEm, st.formatos.pergunta.editadoEm];
  assert.throws(() => E.perfil(s.id, { version: 0, nome: 'x' }), /outra aba/);
  st = E.perfil(s.id, { version: st.version, nome: '  Gui Teste ', arroba: 'gui teste', avatar: foto, mostrarArroba: false, padrao: true });
  assert.deepEqual(st.perfil, { nome: 'Gui Teste', arroba: '@guiteste', mostrarLogo: true, mostrarArroba: false, avatar: 'avatar.png' });
  assert.ok(st.formatos['fofoca-headline'].editadoEm > antes);        // its preview is now stale
  assert.equal(st.formatos.pergunta.editadoEm, pergunta);             // this model shows no profile
  st = await E.previa(s.id, 'fofoca-headline');                       // renders with the photo
  assert.ok(st.formatos['fofoca-headline'].previaEm >= st.formatos['fofoca-headline'].editadoEm);
  const outro = await E.create({ video, name: 'Seguinte' });
  assert.equal(outro.perfil.nome, 'Gui Teste');
  assert.ok(existsSync(E.file(outro.id, 'avatar.png')));
  st = E.perfil(outro.id, { version: outro.version, avatar: null, mostrarLogo: false });
  assert.equal(st.perfil.avatar, undefined);
  await E.previa(outro.id, 'pergunta').catch(() => {});   // a format that is not in this session: refused, nothing rendered
  assert.equal(E.get(s.id).perfil.nome, 'Gui Teste');     // the default is a copy: the first session is untouched
});
