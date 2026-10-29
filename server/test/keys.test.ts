import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEYS = join(mkdtempSync(join(tmpdir(), 'editor-keys-')), 'sub', 'keys.json');
process.env.EDITOR_KEYS_FILE = KEYS;
const K = await import('../keys.ts');

test('a saved key is readable by the server but the list only carries a mask', () => {
  const out = K.setKey('pexels', '  abcdef1234567890  ');
  assert.equal(K.getKey('pexels'), 'abcdef1234567890');
  const row = out.find(r => r.id === 'pexels')!;
  assert.equal(row.hasKey, true);
  assert.equal(row.masked, '••••7890');
  assert.ok(!JSON.stringify(K.listKeys()).includes('abcdef1234567890'));
});

test('the keys file is private to the user', () => {
  assert.equal(statSync(KEYS).mode & 0o777, 0o600);
  assert.equal(statSync(join(KEYS, '..')).mode & 0o777, 0o700);
  K.setKey('pixabay', 'zzzzzzzz9999');   // rewriting an existing file keeps the mode
  assert.equal(statSync(KEYS).mode & 0o777, 0o600);
});

test('bad input is refused', () => {
  assert.throws(() => K.setKey('nope', 'x'), /unknown provider/);
  assert.throws(() => K.setKey('pexels', '   '), /empty/);
  assert.throws(() => K.setKey('pexels', 'two words'), /spaces/);
  assert.throws(() => K.setKey('commons', 'abc'), /does not use a key/);
});

test('removing a key removes it from the file', () => {
  K.deleteKey('pexels');
  assert.equal(K.getKey('pexels'), undefined);
  assert.ok(!readFileSync(KEYS, 'utf8').includes('abcdef1234567890'));
  assert.equal(K.getKey('pixabay'), 'zzzzzzzz9999');
});

test('testing a provider without a key says so and makes no request', async () => {
  assert.deepEqual(await K.testKey('pexels'), { ok: false, message: 'sem chave salva' });
});
