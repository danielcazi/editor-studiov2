import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lines, snap, srt } from '../cortes.ts';

// 200 words, one every 0.5 s: 100 s of speech
const words = Array.from({ length: 200 }, (_, k) => ({ text: `w${k}`, start: k * 0.5, end: k * 0.5 + 0.4 }));

test('snap moves clip edges onto words (1 s tolerance: the model sees whole seconds) and rejects bad lengths', () => {
  assert.deepEqual(snap({ start: 10.2, end: 80.1, title: 'x' }, words), { start: 9.5, end: 80.9, title: 'x' });
  assert.equal(snap({ start: 0, end: 20 }, words), null);          // too short
  assert.equal(snap({ start: 500, end: 600 }, words), null);       // no words there
});

test('srt is relative to the clip start and breaks lines', () => {
  const out = srt(words, 10, 20);
  assert.match(out, /^1\n00:00:00,000 --> 00:00:03,400\nw20 w21 w22 w23 w24 w25 w26\n/);
  assert.equal(out.trim().split('\n\n').length, 3);   // 20 words → 7 + 7 + 6 (3.5 s per line)
});

test('lines pack the transcript with a start time per line', () => {
  const l = lines(words, 50);
  assert.equal(l.length, 4);
  assert.equal(l[1].slice(0, 9), '[25] w50 ');
});
