import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'editor-voice-'));
process.env.WORKSPACE = join(tmp, 'ws');
process.env.EDITOR_KEYS_FILE = join(tmp, 'keys.json');
const K = await import('../keys.ts');
const V = await import('../voice.ts');
const P = await import('../pipeline.ts');

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
const seen: { url: string; init: any }[] = [];
const stub = (handler: (u: string) => Response) => { seen.length = 0; globalThis.fetch = (async (url: any, init: any) => { seen.push({ url: String(url), init }); return handler(String(url)); }) as typeof fetch; };

test('without a key the voice calls say where to put it and make no request', async () => {
  stub(() => { throw new Error('no request expected'); });
  await assert.rejects(() => V.listVoices('elevenlabs'), /Chaves de API/);
  await assert.rejects(() => V.synthesize('google_tts', { text: 'oi', voice: 'pt-BR-Standard-A' }), /Chaves de API/);
  assert.equal(seen.length, 0);
});

test('ElevenLabs lists voices and returns the mp3 bytes, key in the header only', async () => {
  K.setKey('elevenlabs', 'xi-secret-1234');
  stub(u => u.endsWith('/v1/voices') ? Response.json({ voices: [{ voice_id: 'abc', name: 'Rita', labels: { gender: 'female' }, preview_url: 'https://x/p.mp3' }] }) : new Response('MP3BYTES'));
  const list = await V.listVoices('elevenlabs');
  assert.deepEqual(list[0], { id: 'abc', name: 'Rita', gender: 'female', language: undefined, preview: 'https://x/p.mp3' });
  const audio = await V.synthesize('elevenlabs', { text: 'Olá', voice: 'abc' });
  assert.equal(audio.toString(), 'MP3BYTES');
  assert.ok(seen.every(s => !s.url.includes('xi-secret-1234')));
  assert.equal(seen[1].init.headers['xi-api-key'], 'xi-secret-1234');
  assert.equal(JSON.parse(seen[1].init.body).text, 'Olá');
});

test('Google lists voices and decodes the base64 audio; a rejected key never echoes the key', async () => {
  K.setKey('google_tts', 'g-secret-5678');
  stub(u => u.includes('/voices?') ? Response.json({ voices: [{ name: 'pt-BR-Standard-A', languageCodes: ['pt-BR'], ssmlGender: 'FEMALE' }] }) : Response.json({ audioContent: Buffer.from('G-MP3').toString('base64') }));
  assert.deepEqual(await V.listVoices('google_tts'), [{ id: 'pt-BR-Standard-A', name: 'pt-BR-Standard-A', gender: 'female', language: 'pt-BR' }]);
  const audio = await V.synthesize('google_tts', { text: 'Oi', voice: 'pt-BR-Standard-A' });
  assert.equal(audio.toString(), 'G-MP3');
  assert.equal(JSON.parse(seen[1].init.body).voice.languageCode, 'pt-BR');
  stub(() => new Response('bad key g-secret-5678', { status: 400 }));
  await assert.rejects(() => V.synthesize('google_tts', { text: 'Oi', voice: 'pt-BR-Standard-A' }), (e: Error) => !e.message.includes('g-secret-5678') && /erro 400/.test(e.message));
  stub(() => new Response('x', { status: 401 }));
  await assert.rejects(() => V.listVoices('google_tts'), /chave recusada/);
});

test('bad input is refused before any request', async () => {
  stub(() => { throw new Error('no request expected'); });
  await assert.rejects(() => V.synthesize('elevenlabs', { text: '  ', voice: 'abc' }), /empty/);
  await assert.rejects(() => V.synthesize('elevenlabs', { text: 'x'.repeat(5001), voice: 'abc' }), /longer/);
  await assert.rejects(() => V.synthesize('elevenlabs', { text: 'oi', voice: '../x' }), /voice is required/);
  await assert.rejects(() => V.synthesize('nope', { text: 'oi', voice: 'abc' }), /unknown voice provider/);
  assert.equal(seen.length, 0);
});

test('speak saves the mp3 into the project media folder and returns the layer src', async () => {
  const id = 'pv', dir = join(P.WS, 'projects', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ id, name: id, brand: 'x', preEdited: true, formats: ['9:16'], override: {}, step: 'created', cost: [] }));
  stub(() => new Response('MP3BYTES'));
  const out = await P.speak(id, { provider: 'elevenlabs', text: 'Olá', voice: 'abc' });
  assert.match(out.src, /^media\/voz-elevenlabs-\d+\.mp3$/);
  assert.equal(readFileSync(join(dir, out.src), 'utf8'), 'MP3BYTES');
  assert.equal(out.bytes, 8);
});

test('chunkText keeps sentences whole and every piece under the limit', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Frase número ${i} termina aqui.`).join(' ') + ' ' + 'palavra '.repeat(900);
  const parts = V.chunkText(text, 500);
  assert.ok(parts.length > 2 && parts.every((p: string) => p.length <= 500));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' ').trim());
});

test('synthesizeLong makes one call per chunk and joins the audio', async () => {
  K.setKey('elevenlabs', 'xi-secret-1234');
  stub(() => new Response('A'));
  const text = 'Uma frase. '.repeat(1000);   // 11k chars
  const audio = await V.synthesizeLong('elevenlabs', { text, voice: 'abc' });
  assert.equal(audio.length, seen.length);
  assert.ok(seen.length >= 3);
  await assert.rejects(() => V.synthesizeLong('elevenlabs', { text: 'x '.repeat(20000), voice: 'abc' }), /longer/);
});

test('createProject in text mode builds raw.mp4 from the synthetic voice, with no video given', async () => {
  const { execFileSync } = await import('node:child_process');
  const mp3 = join(tmp, 'tone.mp3');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', mp3]);
  K.setKey('elevenlabs', 'xi-secret-1234');
  stub(() => new Response(readFileSync(mp3)));
  P.createBrand('vozbrand');
  const st = await P.createProject({ name: 'Só texto', text: 'Olá, mundo.', voice: { provider: 'elevenlabs', voice: 'abc' }, brand: 'vozbrand', preEdited: false });
  const dir = join(P.WS, 'projects', st.id);
  assert.equal(st.preEdited, true);
  assert.ok((await P.probeMedia(join(dir, 'raw.mp4'))).duration > 0.8);
  assert.equal(readFileSync(join(dir, 'fala.txt'), 'utf8'), 'Olá, mundo.');
  await assert.rejects(() => P.createProject({ name: 'sem voz', text: 'oi', brand: 'vozbrand', preEdited: true }), /voz/);
});
