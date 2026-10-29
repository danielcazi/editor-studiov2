// Everything here runs in a throw-away workspace and a fake claude CLI: no model call, no real download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'editor-broll-'));
process.env.WORKSPACE = join(tmp, 'ws');
process.env.EDITOR_KEYS_FILE = join(tmp, 'keys.json');
const plan = { clips: [{ moment: 1, query: 'busy kitchen', kind: 'video' }, { moment: 0, query: 'unknown thing', kind: 'video' }] };
const fake = join(tmp, 'claude.sh');
writeFileSync(fake, `#!/bin/bash\ncat >/dev/null\necho '${JSON.stringify({ is_error: false, result: '', usage: { input_tokens: 1, output_tokens: 1 }, structured_output: plan })}'\n`);
chmodSync(fake, 0o755);
process.env.CLAUDE_BIN = fake;
const P = await import('../pipeline.ts');
const K = await import('../keys.ts');
const B = await import('../broll.ts');

const cand = (o: Partial<import('../broll.ts').Candidate> = {}) => ({ provider: 'pexels', id: '1', kind: 'video' as const, title: 't', author: 'Bo', license: 'Pexels License', pageUrl: 'https://p/1',
  previewUrl: '', downloadUrl: 'https://videos.pexels.com/v/a.mp4', width: 1920, height: 1080, duration: 8, ...o });

test('pick skips files the composition cannot play and clips that are too short, preferring a long enough one', () => {
  assert.equal(B.pick([cand({ downloadUrl: 'https://upload.wikimedia.org/a.ogv', provider: 'commons' })], 3), undefined);
  assert.equal(B.pick([cand({ duration: 1 })], 3), undefined);
  const best = B.pick([cand({ id: 'short', duration: 2 }), cand({ id: 'long', duration: 6, provider: 'pixabay', downloadUrl: 'https://cdn.pixabay.com/b.mp4' })], 4);
  assert.equal(best?.id, 'long');
});

test('rights: stated licenses count, a Commons file with an odd license stays flagged', () => {
  assert.equal(B.rightsOf(cand()).status, 'licensed');
  assert.equal(B.rightsOf(cand({ provider: 'commons', license: 'CC BY-SA 4.0' })).status, 'licensed');
  assert.equal(B.rightsOf(cand({ provider: 'commons', license: 'licença não informada' })).status, 'unlicensed');
});

test('band: lower part of the frame, above the bottom safe zone, never wider than the frame allows', () => {
  const r = B.band({ width: 1080, height: 1920, visualAssets: { safeZones: { bottom: 380 } } }, cand());
  assert.equal(r.w, 921);                       // 16:9 inside the 518 px band: the height decides, not the 929 px width
  assert.ok(r.y > 0 && r.y < 960);              // below the centre, inside the frame
  assert.ok(B.band({}, cand({ width: 1080, height: 1920 })).w < 300);   // a vertical source is limited by the band height
});

test('b-roll fill adds the clips as layers in the lower band, flags nothing it can license, and a second run replaces them', async () => {
  K.setKey('pexels', 'test-key');
  P.createFormat('t916');
  const id = 'p1', dir = join(P.WS, 'projects', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ id, name: 'p1', brand: 'x', formatId: 't916', preEdited: true, formats: ['9:16'], override: {}, step: 'motion', cost: [], brollFill: true }));
  writeFileSync(join(dir, 'script.json'), JSON.stringify({ moments: [{ t_start: 0, t_end: 2, texto: 'a' }, { t_start: 2, t_end: 6, texto: 'cozinha cheia' }] }));
  writeFileSync(join(dir, '.gitignore'), '*.mp4\n');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=8', '-pix_fmt', 'yuv420p', join(dir, 'master.mp4')]);
  execFileSync('git', ['init', '-q', dir]);
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes('api.pexels.com/videos/search')) return Response.json(u.includes('kitchen') ? { videos: [{ id: 7, url: 'https://www.pexels.com/video/7/', duration: 9, image: 'https://images.pexels.com/i.jpg', user: { name: 'Bo' },
      video_files: [{ file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/v/kitchen.mp4' }] }] } : { videos: [] });
    if (u.includes('commons.wikimedia.org')) return Response.json({ query: { pages: {} } });
    if (u.includes('videos.pexels.com/v/kitchen.mp4')) return new Response('MP4DATA');
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  try {
    for (let run = 0; run < 2; run++) {
      const out = await P.brollFill(id);
      assert.equal(out.clips, 1);
    }
  } finally { globalThis.fetch = real; }
  const layers = JSON.parse(readFileSync(join(dir, 'layers.json'), 'utf8'));
  assert.equal(layers.added.length, 1);                       // the second run replaced the first one's clip
  const a = layers.added[0];
  assert.equal(a.id, 'broll1'); assert.equal(a.kind, 'video'); assert.equal(a.src, 'media/broll1-pexels.mp4');
  assert.equal(a.start, 2); assert.equal(a.duration, 4);      // the beat's window, capped at 4.5 s
  assert.equal(a.rights.status, 'licensed'); assert.equal(a.rights.source, 'pexels');
  assert.ok(layers.layers.broll1.y > 0);
  assert.equal(readFileSync(join(dir, 'media', 'broll1-pexels.mp4'), 'utf8'), 'MP4DATA');
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /media\/broll/);
  assert.ok(existsSync(join(dir, 'activity.log')));
});
