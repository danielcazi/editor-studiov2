// Everything here runs in a throw-away workspace: never the real one (a test once overwrote a real brand's font).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'editor-ws-'));
process.env.WORKSPACE = join(tmp, 'ws');
const fake = join(tmp, 'claude.sh');   // stands in for the claude CLI: always answers with 3 hooks
writeFileSync(fake, `#!/bin/bash\ncat >/dev/null\necho '${JSON.stringify({ is_error: false, result: '', usage: { input_tokens: 1, output_tokens: 1 },
  structured_output: { embrulhos: ['curiosidade', 'dor', 'promessa'].map(tipo => ({ tipo, titulo: 't', copy: 'c', texto_card: 'x', tempo_segundos: 3.5 })) } })}'\n`);
chmodSync(fake, 0o755);
process.env.CLAUDE_BIN = fake;
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

test('updateFormat merges deeply: a partial editingStyle keeps its siblings', () => {
  P.createFormat('deep');
  const next = P.updateFormat('deep', { editingStyle: { punchIns: { zoomScale: 1.4 } } });
  assert.equal(next.editingStyle.punchIns.zoomScale, 1.4);
  assert.deepEqual(next.editingStyle.punchIns.intervalSeconds, [4, 7]);
  assert.equal(next.editingStyle.pacing, 'dynamic');
});

test('a createProject that fails leaves no folder behind, so the name can be used again', async () => {
  const a = join(tmp, 'a.mp4'), b = join(tmp, 'b.mp4');
  writeFileSync(a, 'not a video'); writeFileSync(b, 'not a video');
  await assert.rejects(() => P.createProject({ name: 'Quebra', videos: [a, b], preEdited: true, brand: 'padrao' }));
  assert.deepEqual(P.listProjects(), []);
  assert.equal(existsSync(join(P.WS, 'projects')) ? readdirSync(join(P.WS, 'projects')).length : 0, 0);
});

test('generateHooks returns the hooks the model sent', async () => {
  const clip = join(tmp, 'clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st = await P.createProject({ name: 'Hooks', video: clip, preEdited: true, brand: 'padrao' });
  writeFileSync(join(P.WS, 'projects', st.id, 'script.json'), JSON.stringify({ moments: [{ texto: 'olá mundo' }] }));
  const out = await P.generateHooks(st.id);
  assert.equal(out.embrulhos.length, 3);
  assert.equal(JSON.parse(readFileSync(join(P.WS, 'projects', st.id, 'embrulhos.json'), 'utf8')).embrulhos[1].tipo, 'dor');
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

test('review notes are checked, live files stay inside proj/, and an open note blocks the final render', async () => {
  const clip = join(tmp, 'review.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st = await P.createProject({ name: 'Review', video: clip, preEdited: true, brand: 'padrao' });
  assert.equal(P.getReview(st.id).mode, 'none');
  assert.throws(() => P.putReviewNotes(st.id, [{ id: 'a', t: -1, text: 'x' }]), /seconds/);
  assert.throws(() => P.putReviewNotes(st.id, [{ id: 'a', t: 1, x: 140, y: 5, text: 'x' }]), /0-100/);
  assert.throws(() => P.putReviewNotes(st.id, [{ id: '../a', t: 1, text: 'x' }]), /short word/);
  const r = P.putReviewNotes(st.id, [{ id: 'a', t: 1.5, x: 40, y: 60, text: '  troca o texto  ' }]);
  assert.deepEqual(r.notes, [{ id: 'a', t: 1.5, x: 40, y: 60, text: 'troca o texto', status: 'open' }]);
  mkdirSync(join(P.WS, 'projects', st.id, 'proj'));
  writeFileSync(join(P.WS, 'projects', st.id, 'proj', 'index.html'), '<html></html>');
  assert.ok(P.liveFile(st.id, 'index.html').endsWith('/proj/index.html'));
  assert.throws(() => P.liveFile(st.id, '../state.json'), /no \.\.\/state\.json/);
  await assert.rejects(P.final(st.id, ['9:16']), /1 anotação/);
});

test('composerMode can be set at creation and toggled via setComposerMode', async () => {
  const clip = join(tmp, 'agent_mode.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const st1 = await P.createProject({ name: 'Agent Test', video: clip, preEdited: true, brand: 'padrao', composerMode: 'agent' });
  const p1 = P.getProject(st1.id);
  assert.equal(p1.composerMode, 'agent');
  assert.equal(p1.composed, true);

  const res1 = P.setComposerMode(st1.id, 'card');
  assert.equal(res1.ok, true);
  assert.equal(res1.composerMode, 'card');
  const p1Updated = P.getProject(st1.id);
  assert.equal(p1Updated.composerMode, 'card');
  assert.equal(p1Updated.composed, false);
});

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
  await assert.rejects(P.final(st.id, ['9:16']), /limite da marca é 0\.5 s/);
});
