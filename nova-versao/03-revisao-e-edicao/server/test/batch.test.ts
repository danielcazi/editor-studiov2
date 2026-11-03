import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectEdits, deleteCards } from '../lib.ts';

const makeEdit = () => ({
  captions: [
    { start: 0, end: 1, words: [{ text: 'A', t: 0, accent: false }, { text: 'Black', t: 0.2, accent: false }, { text: 'Friday', t: 0.5, accent: true }] },
    { start: 1, end: 2, words: [{ text: 'do', t: 1.1, accent: false }, { text: 'Reservatório', t: 1.3, accent: false }] },
  ],
  cards: [
    { type: 'shot', src: 'a.png', label: 'original 0', start: 0, end: 2 },
    { type: 'shot', src: 'b.png', label: 'original 1', start: 2, end: 4 },
    { type: 'shot', src: 'a.png', label: 'original 2', y: 300, start: 4, end: 6 },
  ],
});

test('accent moves to the chosen word and only one word per caption keeps it', () => {
  const edit = makeEdit();
  applyDirectEdits(edit, [
    { type: 'word_accent', captionIndex: 0, wordIndex: 1, accent: true },
    { type: 'word_accent', captionIndex: 1, wordIndex: 1, accent: true },
  ]);
  assert.deepEqual(edit.captions[0].words.map(w => w.accent), [false, true, false]);
  assert.deepEqual(edit.captions[1].words.map(w => w.accent), [false, true]);
  applyDirectEdits(edit, [{ type: 'word_accent', captionIndex: 0, wordIndex: 1, accent: false }]);
  assert.deepEqual(edit.captions[0].words.map(w => w.accent), [false, false, false]);
});

test('card edits merge into the card and an unknown index changes nothing', () => {
  const edit = makeEdit();
  applyDirectEdits(edit, [{ type: 'card_edit', cardIndex: 0, card: { label: 'editado' } }, { type: 'card_edit', cardIndex: 9, card: { label: 'x' } }]);
  assert.equal(edit.cards[0].label, 'editado');
  assert.equal(edit.cards[0].end, 2);
  assert.equal(edit.cards.length, 3);
});

test('deletions use the original indices, highest first, and ignore repeats and bad indices', () => {
  const edit = makeEdit();
  deleteCards(edit, [{ type: 'card_delete', cardIndex: 0 }, { type: 'card_delete', cardIndex: 2 }, { type: 'card_delete', cardIndex: 2 }, { type: 'card_delete', cardIndex: 7 }]);
  assert.deepEqual(edit.cards.map(c => c.label), ['original 1']);
});
