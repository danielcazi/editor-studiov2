// Each aspect ratio of an agent reel has its own composition folder; the format's own aspect keeps compose/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'editor-compose-'));
process.env.WORKSPACE = tmp;   // no formats here: the primary aspect falls back to 9:16
const { composeDirOf, setFormats, createProject, getProject, createBrand } = await import('../pipeline.ts');
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
