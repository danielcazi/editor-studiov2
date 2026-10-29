import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enfase, lines, loudLine, pick, snap, srt } from '../cortes.ts';

// 200 words, one every 0.5 s (100 s of speech), with a 1 s breath after every 20th word: phrases start at 0, 11, 22, ... s
const words = Array.from({ length: 200 }, (_, k) => { const t = k * 0.5 + Math.floor(k / 20); return { text: `w${k}`, start: t, end: t + 0.4 }; });

test('snap moves clip edges onto the nearest phrase edges and rejects bad lengths', () => {
  // asked 12.3 → phrase start at 11; asked 88 → phrase end 86.9 (word 159: 79.5 + 7 breaths + 0.4)
  assert.deepEqual(snap({ start: 12.3, end: 88, title: 'x' }, words), { start: 11, end: 86.9, title: 'x' });
  assert.equal(snap({ start: 0, end: 20 }, words), null);          // too short
  assert.equal(snap({ start: 500, end: 600 }, words), null);       // no words there
});

test('pick keeps the best of two overlapping clips and orders by score', () => {
  const out = pick([{ start: 0, end: 70, score: 5 }, { start: 60, end: 130, score: 8 }, { start: 200, end: 270, score: 6 }]);
  assert.deepEqual(out.map(c => c.score), [8, 6]);
});

test('srt is relative to the clip start and breaks lines', () => {
  const out = srt(words, 11, 21);   // words 20..39: one phrase of 20 words, 10 s
  assert.match(out, /^1\n00:00:00,000 --> 00:00:03,400\nw20 w21 w22 w23 w24 w25 w26\n/);
  assert.equal(out.trim().split('\n\n').length, 3);   // 7 + 7 + 6 (3.5 s per line)
});

test('lines break at pauses with a start second per line', () => {
  const l = lines(words);
  assert.equal(l.length, 10);
  assert.equal(l[1].slice(0, 9), '[11] w20 ');
});

test('emphasis: loud line is relative to the speaker and silence is left out', () => {
  const db = [-90, -90, ...Array(40).fill(-25), -10, -10, -90];   // 40 normal seconds, 2 loud ones, silence around
  const loud = loudLine(db);
  assert.ok(loud > -25 && loud < -10);
  assert.equal(enfase({ start: 0, end: db.length }, db), Math.round(100 * 2 / 42));
  const w = Array.from({ length: 50 }, (_, k) => ({ text: `w${k}`, start: k, end: k + 0.9 }));
  assert.ok(lines(w, 25, db)[1].startsWith('[25 ⚡] '));   // the loud seconds 42-43 fall in the second line
  assert.ok(!lines(w, 25, db)[0].includes('⚡'));
});
