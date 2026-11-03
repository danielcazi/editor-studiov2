import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotaMessage } from '../models.ts';

test('a spent subscription window is reported as a wait, other CLI failures stay errors', () => {
  const q = quotaMessage("claude exited 1: You've hit your 5-hour limit · resets 6:30pm (America/Sao_Paulo)");
  assert.ok(q?.startsWith('Cota do Claude esgotada (You\'ve hit your 5-hour limit'));
  assert.equal(quotaMessage('claude exited 1: OAuth session expired'), null);
  assert.equal(quotaMessage('claude gave no answer in 20 min'), null);
});
