import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutWindows, deepMerge, lookOnly, PACE, paceFromSkill, pickFormats, remapSrt, remapWords, resolveChoices, safeId, shortcutPlan, skillAsStyle, styleToSkill } from '../lib.ts';

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

test('remapSrt moves cues to the cut, lands a time inside a gap on the join and drops cues cut out', () => {
  const srt = '\uFEFF1\n00:00:00,000 --> 00:00:01,000\nolá\n\n2\n00:00:01,500 --> 00:00:02,500\nfora\n\n3\n00:00:02,800 --> 00:00:04,000\ncorte\nno meio\n';
  assert.equal(remapSrt(srt, [[0, 1.2], [2.9, 4]], 1), '1\n00:00:00,000 --> 00:00:01,000\nolá\n\n2\n00:00:01,200 --> 00:00:02,300\ncorte\nno meio\n');
  assert.equal(remapSrt(srt, [[0, 1]], 2), '1\n00:00:00,000 --> 00:00:00,500\nolá\n');
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

test('cutWindows: head, mid and tail clipped to the clip and merged when they touch', () => {
  assert.deepEqual(cutWindows([[0, 5], [15, 20], ['tail', 5]], 97.3), [[0, 5], [15, 20], [92.3, 97.3]]);
  assert.deepEqual(cutWindows([['head', 5], [15, 20], ['tail', 5]], 18), [[0, 5], [13, 18]]);   // short clip: mid and tail overlap
  assert.deepEqual(cutWindows([['head', 5], ['tail', 5]], 8), [[0, 8]]);
  assert.equal(cutWindows(undefined, 30), null);
  assert.deepEqual(cutWindows([], 30), []);
});

test('resolveChoices: a skill locks format, look and rhythm; without one the three are independent', () => {
  const format = { id: 'recorte', planos: ['cut', 'none'], regras: 'r' }, style = { id: 'diorama', paceHint: 'lento' };
  const skill = { format: { planos: ['none'] }, look: { guide: 'g' }, rhythm: { pace: 1.3 }, colorsLocked: true };
  const s = resolveChoices({ format, style, skill, pace: 'dinamico' });
  assert.deepEqual(s.format.planos, ['none']); assert.equal(s.format.regras, 'r');   // the skill's format over the chosen one
  assert.deepEqual(s.rhythm, { pace: 1.3 }); assert.equal(s.look.guide, 'g');
  assert.deepEqual(s.sources, { format: 'skill', look: 'skill', rhythm: 'skill', colors: 'skill' });
  assert.equal(resolveChoices({ format, skill, site: true }).sources.colors, 'site');   // the site wins over the locked hex
  const n = resolveChoices({ format });
  assert.deepEqual(n.rhythm, PACE.dinamico); assert.equal(n.look, null); assert.deepEqual(n.sources, { format: 'format', look: 'none', rhythm: 'default', colors: 'brand' });
  assert.deepEqual(resolveChoices({ format, style }).rhythm, PACE.lento);   // paceHint is only the starting value
  assert.deepEqual(resolveChoices({ format, style, pace: 'normal' }).rhythm, PACE.normal);   // the toggle wins once set
});

test('styleToSkill splits a flat clone in three drawers and skillAsStyle gives every field back', () => {
  const flat = { id: 'build', name: 'Build', description: 'd', guide: 'g', motif: 'm', palette: [{ hex: '#fff', role: 'fundo' }],
    camera: { world: [{ kind: 'push', amount: 1.1, when: 'x' }], framing: 'só M', transitions: 'wipe', depth: 'flat', signature: 's' },
    beats: [{ from: 0, to: 2 }], pace: 2.4, sfxRules: [{ when: 'a', sfx: 'b', level: 'subtle' }], sfxPerMinute: 20, motionRecipes: [{ name: 'n', use: 'u', gsap: 'g' }],
    giantCase: 'lower', speakerShadow: true, clonedFrom: { urls: ['u'], measured: [], note: '' }, refineLog: [{ match: 7 }] };
  const k = styleToSkill(flat);
  assert.deepEqual(k.format, { camera: { framing: 'só M', transitions: 'wipe' } });   // no planos: the chosen format keeps the speaker's shots
  assert.equal(k.look.camera.framing, undefined); assert.equal(k.look.camera.depth, 'flat'); assert.equal(k.rhythm.pace, 2.4); assert.equal(k.colorsLocked, false);
  assert.deepEqual(JSON.parse(JSON.stringify(skillAsStyle(k))), flat);   // nothing lost on the way there and back
  const l = lookOnly(flat);
  assert.ok(!('beats' in l) && !('pace' in l) && !('clonedFrom' in l) && !('framing' in l.camera) && l.camera.depth === 'flat' && l.guide === 'g');
});

test('paceFromSkill: the skill\'s seconds per cut pick the nearest toggle limits, capped at lento', () => {
  assert.deepEqual(paceFromSkill({ rhythm: { pace: 1.3 } }), { ...PACE.dinamico, every: 1.3 });
  assert.deepEqual(paceFromSkill({ rhythm: { pace: 2.4 } }), { ...PACE.normal, every: 2.4 });
  assert.equal(paceFromSkill({ rhythm: { pace: 18 } })!.every, PACE.lento.every);
  assert.equal(paceFromSkill({ rhythm: {} }), null);
});
