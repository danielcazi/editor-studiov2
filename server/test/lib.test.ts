import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge, pickFormats, remapWords, safeId, shortcutPlan, spansFromWords } from '../lib.ts';

test('formats render in a fixed order and reject unknown ones', () => {
  assert.deepEqual(pickFormats(['4:5', '1:1', '9:16']), ['9:16', '1:1', '4:5']);
  assert.equal(pickFormats(['2:3']), null);
  assert.equal(pickFormats([]), null);
  assert.equal(pickFormats('16:9'), null);
});

test('shortcut matrix (SPEC §3 step 1)', () => {
  assert.deepEqual(shortcutPlan(false, false), { transcribe: 'whisper', cut: 'tighten' });
  assert.deepEqual(shortcutPlan(false, true), { transcribe: 'srt', cut: 'srt' });
  assert.deepEqual(shortcutPlan(true, false), { transcribe: 'whisper', cut: 'none' });
  assert.deepEqual(shortcutPlan(true, true), { transcribe: 'srt', cut: 'none' });
});

const w = (text: string, start: number, end: number) => ({ text, start, end });

test('SRT-guided spans split on long gaps and keep air', () => {
  const words = [w('olá', 0.5, 1), w('pessoal', 1.1, 1.6), w('hoje', 3, 3.4), w('vamos', 3.5, 4)];
  assert.deepEqual(spansFromWords(words, 0.6, 0.15, 4.05), [[0.35, 1.75], [2.85, 4.05]]);
});

test('remap follows spans in play order and the speed-up', () => {
  const words = [w('a', 1, 2), w('fora', 2.5, 2.9), w('b', 3, 4)];
  // span 2 plays first: a moved CTA stays moved
  const out = remapWords(words, [[3, 4], [1, 2]], 2);
  assert.deepEqual(out, [w('b', 0, 0.5), w('a', 0.5, 1)]);
});

test('brand override merges objects and replaces arrays', () => {
  const base = { colors: { main: '#111111', pop: '#222222' }, icons: [1, 2], pacing: 'tight' };
  assert.deepEqual(deepMerge(base, { colors: { pop: '#333333' }, icons: [3] }),
    { colors: { main: '#111111', pop: '#333333' }, icons: [3], pacing: 'tight' });
  assert.deepEqual(deepMerge(base, {}), base);
});

test('ids cannot escape the workspace', () => {
  assert.ok(safeId('2026-10-20-meu-reel'));
  for (const bad of ['..', '../x', 'a/b', '', '.hidden', 'a..b']) assert.equal(safeId(bad), false, bad);
});

test('~ expands to the home folder, other paths untouched', async () => {
  const { expandHome } = await import('../pipeline.ts');
  assert.match(expandHome('~/a.mp4'), /^\/.+\/a\.mp4$/);
  assert.equal(expandHome('/x/~y'), '/x/~y');
});
