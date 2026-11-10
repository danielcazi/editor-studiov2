import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from '../host.ts';

// alone (`node --test test/embrulhar.test.ts`) there is no WORKSPACE from run.mjs: never write sessions into the real one
process.env.WORKSPACE ??= mkdtempSync(join(tmpdir(), 'editor-test-'));
const tmp = mkdtempSync(join(tmpdir(), 'emb-'));
// stands in for the claude CLI: fills two models, the second one repeating the PDF's template text
const fake = join(tmp, 'claude.sh');
const pedido = join(tmp, 'pedido.json'), lerPedido = () => JSON.parse(readFileSync(pedido, 'utf8').split('\n')[0]);   // what the server sent to the model in the last call (the correction round adds a line of text after the JSON)
writeFileSync(fake, `#!/bin/bash\ncat > '${pedido}'\necho '${JSON.stringify({ is_error: false, result: '', usage: { input_tokens: 1, output_tokens: 1 },
  structured_output: { leitura: { oferta: 'o', publico: 'p', promessa: 'pr', cta: 'c' }, formatos: [
    { modelo: 'tarja', quadro_t: 0, campos: { headline: 'olá mundo, de novo', intruso: 'x' } },
    { modelo: 'pergunta', quadro_t: 0, campos: { rotulo: 'Faça uma pergunta', pergunta: 'Coloque aqui uma pergunta altamente forte ou polêmica' } }] } })}'\n`);
chmodSync(fake, 0o755);
process.env.CLAUDE_BIN = fake;
const E = await import('../embrulhar.ts');
after(async () => (await import('../embrulhos.ts')).fecharNavegador());   // the shared Chrome would keep this process alive for a minute
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
  const pp = probe(E.file(s.id, 'previa/pergunta.mp4')).streams.find((x: any) => x.codec_type === 'video');
  assert.deepEqual([pp.width, pp.height], [540, 960]);   // previews are half size; the export below is full size
  assert.ok(existsSync(E.file(s.id, 'previa/pergunta.jpg')));
  const out = await E.exportar(s.id);
  assert.deepEqual(out.falhas, []);
  assert.equal(out.formatos.cinema.exportadoEm, 0);
  for (const k of ['pergunta', 'fofoca-duplo']) {
    const p = probe(E.file(s.id, out.formatos[k].arquivo!)), v = p.streams.find((x: any) => x.codec_type === 'video');
    assert.deepEqual([v.width, v.height], [1080, 1920], k);
    assert.ok(p.streams.some((x: any) => x.codec_type === 'audio'), k);
    assert.ok(Math.abs(Number(p.format.duration) - 3) < 0.3, k);
  }
  // position and scale: the video inside its window, the still image inside its own, and the text blocks
  st = E.salvar(s.id, 'fofoca-duplo', { version: E.get(s.id).version, ajustes: { video_zoom: 2, foco_x: 0, quadro_zoom: 1.5, quadro_y: 1, texto_y: 40, texto_escala: 1.2 } });
  assert.equal(st.formatos['fofoca-duplo'].ajustes.video_zoom, 2);
  assert.throws(() => E.salvar(s.id, 'fofoca-duplo', { version: st.version, ajustes: { video_zoom: 9 } }), /video_zoom: entre 1 e 3/);
  assert.throws(() => E.salvar(s.id, 'fofoca-duplo', { version: st.version, ajustes: { texto_escala: 0 } }), /texto_escala/);
  st = await E.previa(s.id, 'fofoca-duplo');
  // where the text ended up, for the drag box of the enlarged preview: it follows the offset the user set
  const cx0 = st.formatos['fofoca-duplo'].textoBox!;
  st = E.salvar(s.id, 'fofoca-duplo', { version: st.version, ajustes: { texto_y: 232, texto_escala: 1 } });
  st = await E.previa(s.id, 'fofoca-duplo');
  const cx1 = st.formatos['fofoca-duplo'].textoBox!;
  assert.ok(Math.abs((cx1.y - cx0.y) * 1920 - 192) < 40 && cx1.w > 0.5, JSON.stringify([cx0, cx1]));   // moved by about 232 - 40 px, minus what the 1.2 scale had added
  const rec = probe(E.file(s.id, 'camadas/fofoca-duplo-quadro-c.jpg')).streams[0];   // the still is cut to its window before the page sees it
  assert.deepEqual([rec.width, rec.height], [468, 762]);
  // a free image dropped on the frame: added at the centre, moved, rendered on top, then removed with its file
  const figura = join(tmp, 'figura.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x00ff00:s=200x100', '-frames:v', '1', figura]);
  st = E.salvar(s.id, 'pergunta', { version: E.get(s.id).version, imagemNova: figura });
  const img = st.formatos.pergunta.imagens![0];
  assert.deepEqual([img.x, img.y, img.largura], [0.5, 0.5, 0.4]);
  assert.throws(() => E.salvar(s.id, 'pergunta', { version: st.version, imagens: [{ arquivo: 'src.mp4', x: 0, y: 0, largura: 1 }] }), /desconhecida/);
  st = E.salvar(s.id, 'pergunta', { version: st.version, imagens: [{ ...img, x: 0.5, y: 0.9, largura: 0.5 }] });
  st = await E.previa(s.id, 'pergunta');
  const cor = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', E.file(s.id, 'previa/pergunta.mp4'), '-frames:v', '1', '-vf', 'crop=4:4:268:862', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);   // centre of the image, in the 540x960 preview
  assert.ok(cor[1] > 180 && cor[0] < 90 && cor[2] < 90, `green at the image's place, got ${[...cor.subarray(0, 3)]}`);
  st = E.salvar(s.id, 'pergunta', { version: st.version, imagens: [] });
  assert.throws(() => E.file(s.id, img.arquivo), /sem /);
  // 16:9 and 1:1 sources fill the same 9:16 frame; foco_x picks which side survives the crop
  for (const [nome, size] of [['paisagem', '1280x720'], ['quadrado', '720x720']]) {
    const v = join(tmp, nome + '.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=s=${size}:r=30:d=2`, '-pix_fmt', 'yuv420p', v]);
    const o = await E.create({ video: v, name: nome });
    const e = E.salvar(o.id, 'pergunta', { version: o.version, campos: { rotulo: 'Me pergunte', pergunta: 'Dá mesmo pra começar do zero?' }, ajustes: { foco_x: 0 } });
    assert.equal(e.formatos.pergunta.ajustes.foco_x, 0);
    await E.previa(o.id, 'pergunta');
    const pv = probe(E.file(o.id, 'previa/pergunta.mp4')).streams[0];
    assert.deepEqual([pv.width, pv.height], [540, 960], nome);
  }
  // an edit after the export marks it stale
  st = E.salvar(s.id, 'pergunta', { version: E.get(s.id).version, campos: { pergunta: 'E se der errado?' } });
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
  // what steers the copy: the angles that fit each model, and what the user approved for it in other videos (never this one)
  let ctx = lerPedido();
  assert.ok(ctx.modelos.find((m: any) => m.id === 'tarja').angulos.includes('Custo oculto'));
  assert.ok(ctx.biblioteca.some((a: any) => a.angulo === 'Custo oculto' && a.exemplo));
  assert.equal(ctx.modelos.find((m: any) => m.id === 'tarja').aprovados, undefined);
  st = E.salvar(s.id, 'tarja', { version: st.version, aprovado: true });
  const outro = await E.create({ video, name: 'IA 2' });
  writeFileSync(join(process.env.WORKSPACE!, 'embrulhos', outro.id, 'words.json'), JSON.stringify([{ text: 'olá', start: 0, end: 0.5 }]));
  await E.gerar(outro.id, { modelos: ['tarja'] });
  ctx = lerPedido();
  assert.deepEqual(ctx.modelos[0].aprovados, [{ headline: 'texto do usuário' }]);
  st = E.salvar(s.id, 'tarja', { version: st.version, campos: { headline: 'mudei depois de aprovar' } });   // an edit withdraws the approval
  await E.gerar(outro.id, { modelos: ['tarja'], refazer: true });
  assert.equal(lerPedido().modelos[0].aprovados, undefined);
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

test('the catalogue thumbnail is rendered once and then served from the cache', { skip: !findChrome() && 'Chrome not found' }, async () => {
  const [a, b] = await Promise.all([E.miniatura('tweet'), E.miniatura('tweet')]);   // two requests at once share one render
  assert.equal(a, b);
  assert.equal(probe(a).streams[0].width, 270);
  assert.equal(await E.miniatura('tweet'), a);
  assert.throws(() => E.miniatura('../x'), /não existe/);
});
