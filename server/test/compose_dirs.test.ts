// Each aspect ratio of an agent reel has its own composition folder; the format's own aspect keeps compose/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'editor-compose-'));
process.env.WORKSPACE = tmp;   // no formats here: the primary aspect falls back to 9:16
const { composeDirOf, setFormats, createProject, getProject, createBrand, createSkill, createStyle, setChoices, effectivePace, WS } = await import('../pipeline.ts');
createBrand('padrao');

test('compose/ is the primary aspect, other aspects get their own folder', () => {
  const P = '/p', st = { formatId: 'nao-existe' } as any;
  assert.equal(composeDirOf(P, st, '9:16'), join(P, 'compose'));
  assert.equal(composeDirOf(P, st, null), join(P, 'compose'));
  assert.equal(composeDirOf(P, st, '16:9'), join(P, 'compose-16-9'));
  assert.equal(composeDirOf(P, st, '1:1'), join(P, 'compose-1-1'));
});

test('setFormats updates project formats and persists to state.json', async () => {
  const clip = join(tmp, 'clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const p = await createProject({ name: 'test-fmts', video: clip, preEdited: true, brand: 'padrao' });
  setFormats(p.id, ['16:9', '1:1']);
  const updated = getProject(p.id);
  assert.deepEqual(updated.formats, ['16:9', '1:1']);
});

test('pace toggle: dinamico is the default, setPace persists it, anything else is refused', async () => {
  const { PACE, paceOf, checkPace, setPace } = await import('../pipeline.ts');
  assert.deepEqual(paceOf({}), { every: 1.5, scene: [1.2, 3], framing: [2, 4], hold: 4 });   // the pace every reel had before the toggle
  assert.ok(PACE.lento.every > PACE.normal.every && PACE.normal.every > PACE.dinamico.every);
  assert.throws(() => checkPace('rapido'));
  const clip = join(tmp, 'clip-pace.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const p = await createProject({ name: 'test-pace', video: clip, preEdited: true, brand: 'padrao', pace: 'lento' });
  assert.equal(getProject(p.id).pace, 'lento');
  setPace(p.id, 'normal');
  assert.equal(getProject(p.id).pace, 'normal');
  assert.throws(() => setPace(p.id, 'rapido'));
});

test('choices: setChoices validates each selector, and a style that became a skill still opens as that skill', async () => {
  const { writeFileSync, readFileSync } = await import('node:fs');
  const clip = join(tmp, 'clip-choices.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=160x120:r=30', '-y', clip]);
  const p = await createProject({ name: 'test-choices', video: clip, preEdited: true, brand: 'padrao' });
  createStyle('look-a', { name: 'A' });
  createSkill('clone-a', { name: 'Clone A', rhythm: { pace: 2.4 } });
  assert.deepEqual(setChoices(p.id, { styleId: 'look-a', skillId: 'clone-a', pace: 'lento' }), { ok: true, formatId: getProject(p.id).formatId, styleId: 'look-a', skillId: 'clone-a', pace: 'lento' });
  assert.equal(effectivePace(getProject(p.id)).every, 2.4);   // the skill's measured pace wins over the toggle
  assert.equal(setChoices(p.id, { skillId: null }).skillId, null);
  assert.equal(effectivePace(getProject(p.id)).every, 3.5);   // without it the toggle (lento) applies
  assert.throws(() => setChoices(p.id, { skillId: 'nope' }));
  assert.throws(() => setChoices(p.id, { pace: 'rapido' }));
  assert.throws(() => setChoices(p.id, { formatId: 'nope' }));
  // the shim: state.styleId pointing at something that now lives in skills/ reads as skillId
  const file = join(WS, 'projects', p.id, 'state.json'), st = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...st, styleId: 'clone-a', skillId: undefined }));
  const shimmed = getProject(p.id);
  assert.equal(shimmed.skillId, 'clone-a'); assert.equal(shimmed.styleId, undefined);
});
