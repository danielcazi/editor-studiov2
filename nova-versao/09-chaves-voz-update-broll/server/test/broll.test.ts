import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'editor-broll-'));
process.env.EDITOR_KEYS_FILE = join(DIR, 'keys.json');
const K = await import('../keys.ts');
const B = await import('../broll.ts');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const stub = (routes: Record<string, unknown>) => {
  const seen: { url: string; headers: any }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url); seen.push({ url: u, headers: init?.headers });
    const hit = Object.keys(routes).find(k => u.includes(k));
    if (!hit) return new Response('{}', { status: 404 });
    const body = routes[hit];
    return typeof body === 'string' ? new Response(body, { status: 200 }) : Response.json(body);
  }) as typeof fetch;
  return seen;
};

test('Commons is searched without a key and keeps the license and author of each file', async () => {
  const seen = stub({ 'commons.wikimedia.org': { query: { pages: { 1: { pageid: 1, title: 'File:Rio.webm', imageinfo: [{ url: 'https://upload.wikimedia.org/a/Rio.webm', thumburl: 'https://upload.wikimedia.org/t.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Rio.webm', width: 1920, height: 1080, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Ana</a>' } } }] } } } } });
  const { results, errors } = await B.search('rio', { providers: ['commons'] });
  assert.deepEqual(errors, {});
  assert.equal(results[0].title, 'Rio.webm');
  assert.equal(results[0].license, 'CC BY-SA 4.0');
  assert.equal(results[0].author, 'Ana');
  assert.match(seen[0].url, /filetype%3Avideo/);
});

test('a source with no key is reported, the others still answer', async () => {
  stub({ 'commons.wikimedia.org': { query: { pages: {} } } });
  const { errors } = await B.search('sea', {});
  assert.equal(errors.pexels, 'sem chave salva');
  assert.equal(errors.pixabay, 'sem chave salva');
  assert.equal(errors.commons, undefined);
});

test('Pexels sends the key in the header and picks the biggest mp4 under 4K', async () => {
  K.setKey('pexels', 'pexels-key-123');
  const seen = stub({ 'api.pexels.com/videos/search': { videos: [{ id: 7, url: 'https://www.pexels.com/video/7/', duration: 9, image: 'https://images.pexels.com/p.jpg', user: { name: 'Bo' },
    video_files: [{ file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://videos.pexels.com/4k.mp4' }, { file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://videos.pexels.com/hd.mp4' }] }] } });
  const { results } = await B.search('city', { providers: ['pexels'] });
  assert.equal(seen[0].headers.Authorization, 'pexels-key-123');
  assert.equal(results[0].downloadUrl, 'https://videos.pexels.com/hd.mp4');
  assert.equal(results[0].duration, 9);
});

test('Pixabay puts the key in the query and a rejected key becomes a readable error', async () => {
  K.setKey('pixabay', 'pix-key-456');
  stub({ 'pixabay.com/api/videos': { hits: [{ id: 3, tags: 'beach', user: 'Li', duration: 12, pageURL: 'https://pixabay.com/v/3', picture_id: 'abc', videos: { large: { url: 'https://cdn.pixabay.com/v.mp4', width: 1920, height: 1080 } } }] } });
  const ok = await B.search('beach', { providers: ['pixabay'] });
  assert.equal(ok.results[0].downloadUrl, 'https://cdn.pixabay.com/v.mp4');
  globalThis.fetch = (async () => new Response('x', { status: 401 })) as typeof fetch;
  const bad = await B.search('beach', { providers: ['pixabay'] });
  assert.equal(bad.errors.pixabay, 'chave recusada');
  assert.ok(!JSON.stringify(bad).includes('pix-key-456'));
});

test('an empty query and an unknown provider are refused', async () => {
  await assert.rejects(() => B.search('  '), /empty/);
  await assert.rejects(() => B.search('x', { providers: ['nope'] }), /no known provider/);
});

test('download refuses a URL that is not the provider\'s own host over https', async () => {
  const c = { provider: 'pexels', id: '1', kind: 'video' as const, title: '', author: '', license: '', pageUrl: '', previewUrl: '', downloadUrl: 'https://evil.example/x.mp4' };
  await assert.rejects(() => B.download(c, join(DIR, 'a.mp4')), /not from pexels/);
  await assert.rejects(() => B.download({ ...c, downloadUrl: 'http://videos.pexels.com/x.mp4' }, join(DIR, 'a.mp4')), /not from pexels/);
  await assert.rejects(() => B.download({ ...c, downloadUrl: 'https://videos.pexels.com.evil.example/x.mp4' }, join(DIR, 'a.mp4')), /not from pexels/);
});

test('download writes the file from the provider host', async () => {
  stub({ 'videos.pexels.com/ok.mp4': 'VIDEO-BYTES' });
  const c = { provider: 'pexels', id: '1', kind: 'video' as const, title: '', author: '', license: '', pageUrl: '', previewUrl: '', downloadUrl: 'https://videos.pexels.com/ok.mp4' };
  const dest = join(DIR, 'ok.mp4');
  await B.download(c, dest);
  assert.equal(readFileSync(dest, 'utf8'), 'VIDEO-BYTES');
});
