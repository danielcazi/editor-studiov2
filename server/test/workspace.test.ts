// Everything here runs in a throw-away workspace: never the real one (a test once overwrote a real brand's font).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'editor-ws-'));
process.env.WORKSPACE = join(tmp, 'ws');
const P = await import('../pipeline.ts');
const brandJson = (b: string) => JSON.parse(readFileSync(join(P.WS, 'brands', b, 'brand.json'), 'utf8'));
P.createBrand('padrao');

test('addFont cleans the file name and keeps the path relative to the brand folder', async () => {
  const fonts = await P.addFont('padrao', { role: 'head', file: 'Aspekta Bold.otf', data: Buffer.from('OTTO12345678').toString('base64'), weight: 700 });
  assert.equal(fonts.head.family, 'Aspekta');
  assert.ok(fonts.head.file.endsWith('/brands/padrao/fonts/Aspekta-Bold.otf'));
  assert.equal(brandJson('padrao').fonts.head.file, 'fonts/Aspekta-Bold.otf');   // on disk: movable
  assert.ok(P.getBrand('padrao').fonts.head.file.startsWith(P.WS));              // in use: absolute
  assert.ok(P.listBrandFonts('padrao').some(f => f.file === 'Aspekta-Bold.otf'));
});

test('format ids cannot leave the formats folder', () => {
  mkdirSync(join(P.WS, 'victim'), { recursive: true });
  for (const bad of ['../victim', '..', 'a/b']) {
    assert.throws(() => P.deleteFormat(bad), /format id/, bad);
    assert.throws(() => P.getFormat(bad), /format id/, bad);
    assert.throws(() => P.updateFormat(bad, {}), /format id/, bad);
  }
  assert.ok(existsSync(join(P.WS, 'victim')));
});

test('updateFormat merges deeply: a partial safeZones keeps its siblings, and a bad shot is refused', () => {
  P.createFormat('deep');
  const next = P.updateFormat('deep', { safeZones: { top: 250 } });
  assert.equal(next.safeZones.top, 250);
  assert.equal(next.safeZones.bottom, 380);
  assert.deepEqual(next.planos, ['cut', 'none']);
  assert.throws(() => P.updateFormat('deep', { planos: ['zoom'] }), /plano desconhecido/);
  assert.throws(() => P.createFormat('bad', { name: 'x', planos: [] }), /planos/);
  assert.equal(existsSync(join(P.WS, 'formats', 'bad')), false);   // a refused create leaves no folder behind
});

test('a createProject that fails leaves no folder behind, so the name can be used again', async () => {
  const a = join(tmp, 'a.mp4'), b = join(tmp, 'b.mp4');
  writeFileSync(a, 'not a video'); writeFileSync(b, 'not a video');
  await assert.rejects(() => P.createProject({ name: 'Quebra', videos: [a, b], preEdited: true, brand: 'padrao' }));
  assert.deepEqual(P.listProjects(), []);
  assert.equal(existsSync(join(P.WS, 'projects')) ? readdirSync(join(P.WS, 'projects')).length : 0, 0);
});

test('syncBrandMarkdown keeps the Google fonts it downloaded', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: any) => String(u).includes('googleapis')
    ? new Response('/* latin */ @font-face { src: url(https://fonts.gstatic.com/x/p.woff2) format("woff2"); }')
    : new Response(Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(32)]))) as typeof fetch;
  try {
    P.createBrand('synced');
    await P.syncBrandMarkdown('synced', '# Brand\n\n**Font stack:** Poppins, sans-serif\n');
    const f = brandJson('synced').fonts;
    assert.equal(f.body.file, 'fonts/Poppins-500.woff2');
    assert.equal(f.head.file, 'fonts/Poppins-700.woff2');
    assert.equal(f.head.family, 'Poppins');
  } finally { globalThis.fetch = realFetch; }
});

test('listProjectsOverview lists projects with step, elapsed time and human confirmation flags', async () => {
  const overview = P.listProjectsOverview();
  assert.ok(Array.isArray(overview));
  const found = overview.find(p => p.name === 'Hooks');
  if (found) {
    assert.equal(found.step, 'created');
    assert.equal(found.requiresHumanConfirmation, true);
    assert.equal(found.humanConfirmationLabel, 'Iniciar Ingestão');
    assert.ok(found.lastActivityAt > 0);
  }
});


test('completeProject marks project as completed and clears requiresHumanConfirmation', async () => {
  const clip = join(tmp, 'complete_test.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st = await P.createProject({ name: 'Complete Test', video: clip, preEdited: true, brand: 'padrao' });
  let overview = P.listProjectsOverview().find(p => p.id === st.id);
  assert.equal(overview?.requiresHumanConfirmation, true);
  assert.equal(overview?.completed, false);

  await P.completeProject(st.id, true);
  overview = P.listProjectsOverview().find(p => p.id === st.id);
  assert.equal(overview?.completed, true);
  assert.equal(overview?.requiresHumanConfirmation, false);
  assert.equal(overview?.stepLabel, 'Concluído');

  await P.completeProject(st.id, false);
  overview = P.listProjectsOverview().find(p => p.id === st.id);
  assert.equal(overview?.completed, false);
  assert.equal(overview?.requiresHumanConfirmation, true);
});

test('review notes are checked, live files stay inside compose/, and an open note blocks the final render', async () => {
  const clip = join(tmp, 'review.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st = await P.createProject({ name: 'Review', video: clip, preEdited: true, brand: 'padrao' });
  assert.equal(P.getReview(st.id).mode, 'none');
  assert.throws(() => P.putReviewNotes(st.id, [{ id: 'a', t: -1, text: 'x' }]), /seconds/);
  assert.throws(() => P.putReviewNotes(st.id, [{ id: 'a', t: 1, x: 140, y: 5, text: 'x' }]), /0-100/);
  assert.throws(() => P.putReviewNotes(st.id, [{ id: '../a', t: 1, text: 'x' }]), /short word/);
  const r = P.putReviewNotes(st.id, [{ id: 'a', t: 1.5, x: 40, y: 60, text: '  troca o texto  ' }]);
  assert.deepEqual(r.notes, [{ id: 'a', t: 1.5, x: 40, y: 60, text: 'troca o texto', status: 'open' }]);
  const g = P.putReviewNotes(st.id, [...r.notes, { id: 'g', t: 0, all: true, text: 'tire o grão' }], r.version);   // a whole-video note keeps its flag
  assert.deepEqual(g.notes[1], { id: 'g', t: 0, all: true, text: 'tire o grão', status: 'open' });
  P.putReviewNotes(st.id, r.notes, g.version);
  mkdirSync(join(P.WS, 'projects', st.id, 'compose'));
  writeFileSync(join(P.WS, 'projects', st.id, 'compose', 'index.html'), '<html></html>');
  assert.ok(P.liveFile(st.id, 'index.html').endsWith('/compose/index.html'));
  assert.throws(() => P.liveFile(st.id, '../state.json'), /no \.\.\/state\.json/);
  await assert.rejects(P.final(st.id, ['9:16']), /1 anotação/);
  // approval: refused with an open note; final refuses without it; a stale version (another tab) cannot overwrite the notes
  assert.throws(() => P.approveReview(st.id), /1 anotação/);
  assert.throws(() => P.putReviewNotes(st.id, [], 0), /outra aba/);
  P.putReviewNotes(st.id, [], P.getReview(st.id).version);
  await assert.rejects(P.final(st.id, ['9:16']), /não foi aprovado/);
  assert.ok((P.approveReview(st.id).approvedAt ?? 0) > 0);
  await assert.rejects(P.final(st.id, ['9:16']), /master\.mp4|ffprobe/);   // past the approval, failed on the missing master
});
// the approval the final render needs, written straight into state.json (approveReview needs a live composition)
const approve = (id: string) => { const f = join(P.WS, 'projects', id, 'state.json'); writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), approvedAt: 1 })); };

test('compose copies are gitignored at creation, and an old project drops its tracked copies from the index', async () => {
  const clip = join(tmp, 'ignore.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st = await P.createProject({ name: 'Ignore', video: clip, preEdited: true, brand: 'padrao' });
  const dir = join(P.WS, 'projects', st.id), ignore = join(dir, '.gitignore');
  assert.match(readFileSync(ignore, 'utf8'), /^compose\*\/assets\/$/m);
  // an old project: no compose lines, and a copy already committed
  writeFileSync(ignore, '*.mp4\n');
  mkdirSync(join(dir, 'compose', 'assets'), { recursive: true });
  writeFileSync(join(dir, 'compose', 'assets', 'cut.webm'), 'x');
  const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-q', '-m', 'old');
  assert.match(git('ls-files'), /compose\/assets\/cut\.webm/);
  await P.ensureComposeIgnored(st.id);
  assert.match(readFileSync(ignore, 'utf8'), /^compose\*\/snaps\*\/$/m);
  assert.doesNotMatch(git('ls-files'), /cut\.webm/);
  assert.ok(existsSync(join(dir, 'compose', 'assets', 'cut.webm')));   // only untracked, never deleted
});

test('final refuses a master longer than the brand max_seconds before any render', async () => {
  P.createBrand('curta', { max_seconds: 0.5 });
  const clip = join(tmp, 'long.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st = await P.createProject({ name: 'Long', video: clip, preEdited: true, brand: 'curta' });
  execFileSync('cp', [clip, join(P.WS, 'projects', st.id, 'master.mp4')]);
  approve(st.id);
  await assert.rejects(P.final(st.id, ['9:16']), /limite da marca é 0\.5 s/);
});

test('the step lock is a file: another live server holds it, a dead one does not', async () => {
  const clip = join(tmp, 'lock.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st = await P.createProject({ name: 'Lock', video: clip, preEdited: true, brand: 'padrao' });
  const lock = join(P.WS, 'locks', `${st.id}.lock`);
  approve(st.id);
  mkdirSync(join(P.WS, 'locks'), { recursive: true });
  writeFileSync(lock, JSON.stringify({ step: 'compose', startedAt: Date.now() - 5000, pid: process.pid }));   // "another server", still alive
  assert.equal(P.getBusy(st.id)?.step, 'compose');
  await assert.rejects(P.final(st.id, ['9:16']), /busy \(compose em execução/);
  writeFileSync(lock, JSON.stringify({ step: 'compose', startedAt: Date.now(), pid: 2147483000 }));   // a server that died: the lock is stale
  assert.equal(P.getBusy(st.id), null);
  await assert.rejects(P.final(st.id, ['9:16']), /master\.mp4|ffprobe/);   // got past the lock, failed later on the missing master
  assert.ok(!existsSync(lock), 'the lock is released after the step');
});

test('getFormat lists the preview frames beside format.json, serves only those, and updateFormat never writes them', () => {
  P.createFormat('com-previa', { name: 'Prévia', planos: ['cut', 'none'] });
  assert.deepEqual(P.getFormat('com-previa').frames, []);
  const dir = join(P.WS, 'formats', 'com-previa', 'frames');
  mkdirSync(dir);
  for (const f of ['2.jpg', '0.jpg', '1.jpg', 'notes.txt']) writeFileSync(join(dir, f), '');
  assert.deepEqual(P.getFormat('com-previa').frames, ['0.jpg', '1.jpg', '2.jpg']);
  assert.equal(P.formatFrameFile('com-previa', '1.jpg'), join(dir, '1.jpg'));
  assert.throws(() => P.formatFrameFile('com-previa', 'notes.txt'), /no frame/);
  assert.throws(() => P.formatFrameFile('com-previa', '../format.json'), /no frame/);
  P.updateFormat('com-previa', { frames: ['x.jpg'], regras: 'r' });
  assert.ok(!('frames' in JSON.parse(readFileSync(join(P.WS, 'formats', 'com-previa', 'format.json'), 'utf8'))));
});
