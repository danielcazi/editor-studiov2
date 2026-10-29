import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'editor-anim-'));
process.env.WORKSPACE = join(tmp, 'ws');
const P = await import('../pipeline.ts');

const png = join(tmp, 'pose.png');
writeFileSync(png, 'x');

test('poses are copied into the brand, stored relative, and listed with absolute paths', () => {
  P.createBrand('anim');
  const an = P.addPose('anim', 'zeca', 'feliz', ['alegria', 'abertura'], png, 'mascote barbudo');
  assert.equal(an.characters[0].description, 'mascote barbudo');
  assert.ok(existsSync(an.characters[0].poses[0].file) && an.characters[0].poses[0].file.startsWith(join(P.WS, 'brands', 'anim')));
  assert.equal(JSON.parse(readFileSync(join(P.WS, 'brands', 'anim', 'brand.json'), 'utf8')).animation.characters[0].poses[0].file, 'characters/zeca/feliz.png');
  P.addPose('anim', 'zeca', 'feliz', ['x'], png);   // same pose again replaces, never duplicates
  assert.equal(P.getBrand('anim').animation.characters[0].poses.length, 1);
  assert.throws(() => P.addPose('anim', 'zeca', 'bad', [], join(tmp, 'a.exe')), /pose/);
});

test('style and default voice are validated and saved with the brand; delete removes pose then character', () => {
  const b = P.getBrand('anim');
  assert.throws(() => P.updateBrand('anim', { ...b, animation: { voice: { provider: 'elevenlabs' } } }), /voice/);
  P.updateBrand('anim', { ...b, animation: { ...b.animation, style: 'snappy', voice: { provider: 'elevenlabs', voice: 'abc' } } });
  assert.equal(P.getBrand('anim').animation.voice.voice, 'abc');
  assert.equal(P.deleteCharacter('anim', 'zeca', 'feliz').characters[0].poses.length, 0);
  assert.equal(P.deleteCharacter('anim', 'zeca').characters.length, 0);
});

test('a character pose becomes a 1920x1080 alpha cutout the length of the master', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdirSync } = await import('node:fs');
  const pose = join(tmp, 'boneco.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=300x500', '-frames:v', '1', pose]);
  P.createBrand('cutbrand');
  P.addPose('cutbrand', 'zeca', 'feliz', [], pose);
  const id = 'pc', dir = join(P.WS, 'projects', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ id, name: id, brand: 'cutbrand', preEdited: true, formats: ['9:16'], override: {}, step: 'ingest', cost: [], character: { name: 'zeca' } }));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=30:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-shortest', join(dir, 'master.mp4')]);
  writeFileSync(join(dir, 'raw.mp4'), '');
  await P.ensureCutout(id);
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', join(dir, 'cutout.webm')]).toString());
  assert.deepEqual([info.streams[0].width, info.streams[0].height], [1920, 1080]);
  assert.ok(Number(info.format.duration) > 1.8);
  assert.equal(JSON.parse(readFileSync(join(dir, 'cutout.json'), 'utf8')).engine, 'character');
  assert.equal((await P.ensureCutout(id)).cached, true);
});
