import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyEdits, applyTexts, captionLines, checkLayers, elementSpan, listLayers, syncEdits, textRuns } from '../edits.ts';

const HTML = `<html><head><style>.a{color:red}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="10">
  <div id="pcam"><video id="plate" class="clip" src="assets/plate.mp4" data-start="0" data-duration="10" data-track-index="0"></video></div>
  <div id="b01" data-composition-id="b01" data-composition-src="compositions/b01.html" data-start="1" data-duration="2" data-track-index="2"></div>
  <div id="k0" class="custom"><b>Olá &amp; tchau</b><br><i>segunda</i></div>
  <audio id="voice" class="clip" src="assets/voice.m4a" data-start="0" data-duration="10" data-track-index="8" data-volume="1"></audio>
</div>
<script>const tl = gsap.timeline({ paused: true }); window.__timelines = { main: tl };</script>
</body></html>`;

test('layers: clips of the root plus extra windows, with their texts', () => {
  const ls = listLayers(HTML, [{ id: 'k0', kind: 'card', start: 2, end: 4, track: 20 }]);
  assert.deepEqual(ls.map(l => [l.id, l.kind, l.start, l.end, l.clip]), [
    ['plate', 'plate', 0, 10, true], ['b01', 'scene', 1, 3, true], ['voice', 'voice', 0, 10, true], ['k0', 'card', 2, 4, false]]);
  assert.deepEqual(ls[3].texts.map(t => t.text), ['Olá & tchau', 'segunda']);
});

test('text runs skip style and script, edits fall back to the same text when indices moved', () => {
  assert.deepEqual(textRuns(HTML).map(r => r.text), ['Olá & tchau', 'segunda']);
  const warns: string[] = [];
  const out = applyTexts(HTML, [{ i: 7, from: 'segunda', to: 'terça <b>' }, { i: 0, from: 'sumiu', to: 'x' }], m => warns.push(m));
  assert.match(out, /<i>terça &lt;b&gt;<\/i>/);
  assert.equal(warns.length, 1);
});

test('edits: clip timing, volume, transforms, switched off, added layers and gaps', () => {
  const d = checkLayers({
    layers: { b01: { start: 2, duration: 3, x: 10, y: -20, scale: 120, opacity: 50, gaps: [[2.5, 3]] }, voice: { volume: 0.5 }, plate: { hidden: true }, gone: { x: 1 } },
    added: [{ id: 'e1', kind: 'title', text: 'Oi <script>', start: 1, duration: 2, track: 0 }],
  });
  const warns: string[] = [];
  const out = applyEdits(HTML, d, m => warns.push(m));
  assert.match(out, /^<!--hf-edits-->/);
  assert.match(out, /id="b01"[^>]*data-start="2" data-duration="3"/);
  assert.match(out, /id="voice"[^>]*data-volume="0.5"/);
  assert.match(out, /#b01\{translate:10px -20px;scale:1.2;filter:opacity\(calc\(var\(--hfv,1\)\*0.5\)\)\}/);
  assert.match(out, /#plate\{display:none!important\}/);
  assert.match(out, /data-composition-id="main"[^>]*>\n<div id="e1" class="clip hf-add"[^>]*><div class="in"[^>]*>Oi &lt;script&gt;<\/div>/);
  assert.match(out, /"gaps":\[\["b01",\[\[2.5,3\]\]\]\]/);
  assert.equal(warns.length, 1);   // "gone"
});

test('stacking: z goes to the ancestor right under the root, original swaps the background source', () => {
  const out = applyEdits(HTML, checkLayers({ layers: { plate: { z: 30, original: true }, b01: { z: 5 } }, order: ['t0', 't2'] }));
  assert.match(out, /#pcam\{z-index:30!important\}/);
  assert.match(out, /#b01\{z-index:5!important\}/);
  assert.match(out, /id="plate"[^>]*src="media\/_original.mp4"/);
});

test('crop masks the object: the clip itself, or the .in of an added layer', () => {
  const out = applyEdits(HTML, checkLayers({ layers: { b01: { crop: [10, 0, 20, 5] }, e1: { crop: [0, 50, 0, 0] } }, added: [{ id: 'e1', kind: 'text', text: 'x', start: 0, duration: 1, track: 0 }] }));
  assert.match(out, /#b01\{clip-path:inset\(10% 0% 20% 5%\)\}/);
  assert.match(out, /#e1 \.in\{clip-path:inset\(0% 50% 0% 0%\)\}/);
  assert.throws(() => checkLayers({ layers: { a: { crop: [0, 0, 120, 0] } } }));
});

test('values that end up in HTML/CSS are checked', () => {
  assert.throws(() => checkLayers({ layers: { 'a"b': {} } }));
  assert.throws(() => checkLayers({ added: [{ id: 'e1', kind: 'image', src: '../etc/passwd', start: 0, duration: 1, track: 0 }] }));
  assert.throws(() => checkLayers({ added: [{ id: 'e1', kind: 'text', color: 'red;}', start: 0, duration: 1, track: 0 }] }));
  assert.throws(() => checkLayers({ layers: { a: { opacity: 300 } } }));
});

test('captions: up to 4 words, broken on pauses and sentence ends', () => {
  const w = (text: string, start: number) => ({ text, start, end: start + 0.2 });
  assert.deepEqual(captionLines([w('um', 0), w('dois.', 0.2), w('tres', 0.4), w('quatro', 1.5)]).map(l => l.text), ['um dois.', 'tres', 'quatro']);
});

test('sync keeps the AI file as index.ai.html and reapplies the edits to a new AI pass', () => {
  const P = mkdtempSync(join(tmpdir(), 'edits-')), D = join(P, 'compose');
  mkdirSync(join(D, 'compositions'), { recursive: true });
  writeFileSync(join(D, 'index.html'), HTML);
  writeFileSync(join(D, 'compositions/b01.html'), '<template><div id="root"><div id="t">PALAVRA</div></div></template>');
  writeFileSync(join(P, 'layers.json'), JSON.stringify({ layers: { b01: { texts: [{ i: 0, from: 'PALAVRA', to: 'OUTRA' }] }, plate: { hidden: true } }, added: [] }));
  syncEdits(D, P);
  syncEdits(D, P);   // idempotent: built from the pristine copy, not from its own output
  assert.equal(readFileSync(join(D, 'index.ai.html'), 'utf8'), HTML);
  assert.equal(readFileSync(join(D, 'index.html'), 'utf8').match(/display:none/g)?.length, 1);
  assert.match(readFileSync(join(D, 'compositions/b01.html'), 'utf8'), /OUTRA/);
  writeFileSync(join(D, 'index.html'), HTML.replace('data-duration="2"', 'data-duration="4"'));   // the AI rewrites it
  syncEdits(D, P);
  assert.match(readFileSync(join(D, 'index.ai.html'), 'utf8'), /data-duration="4"/);
  assert.match(readFileSync(join(D, 'index.html'), 'utf8'), /#plate\{display:none/);
  writeFileSync(join(P, 'layers.json'), '{"layers":{},"added":[]}');
  syncEdits(D, P);
  assert.doesNotMatch(readFileSync(join(D, 'compositions/b01.html'), 'utf8'), /OUTRA|hf-edits/);
});

test('colors: a layer\'s palette is remapped in its own markup only (scene file or element span)', () => {
  const root = HTML.replace('<b>Olá', '<b style="color:#AA0000">Olá').replace('<i>segunda', '<i style="color:#aa0000;background:#00ff00">segunda');
  assert.deepEqual(listLayers(root, [{ id: 'k0', kind: 'card', start: 0, end: 1, track: 20 }]).find(l => l.id === 'k0')!.colors, ['#aa0000', '#00ff00']);
  assert.deepEqual(elementSpan(root, 'k0')!.map(n => root.slice(n)).length, 2);
  const d = checkLayers({ layers: { k0: { colors: [{ from: '#AA0000', to: '#0000FF' }] }, plate: { row: 'n1x' } } });
  const out = applyEdits(root, d);
  assert.match(out, /<b style="color:#0000ff">Olá/);
  assert.match(out, /<i style="color:#0000ff;background:#00ff00">/);
  assert.equal(d.layers.plate.row, 'n1x');
  assert.throws(() => checkLayers({ layers: { a: { colors: [{ from: 'red', to: '#000000' }] } } }));
  const P = mkdtempSync(join(tmpdir(), 'col-')), D = join(P, 'compose');
  mkdirSync(join(D, 'compositions'), { recursive: true });
  writeFileSync(join(D, 'index.html'), HTML);
  writeFileSync(join(D, 'compositions/b01.html'), '<template><div style="color:#111111">A</div><script>g("#111111")</script></template>');
  writeFileSync(join(P, 'layers.json'), JSON.stringify({ layers: { b01: { colors: [{ from: '#111111', to: '#222222' }] } }, added: [] }));
  syncEdits(D, P);
  assert.equal(readFileSync(join(D, 'compositions/b01.html'), 'utf8').match(/#222222/g)?.length, 2);
});

test('font: restyles the AI text with !important rules, added text carries italic and family', () => {
  const d = checkLayers({ layers: { k0: { font: { size: 80, weight: 700, italic: true, family: 'Georgia' } } },
    added: [{ id: 'tx', kind: 'text', start: 0, duration: 2, track: 0, text: 'oi', italic: true, family: 'Impact' }] });
  const out = applyEdits(HTML, d);
  assert.match(out, /#k0,#k0 \*\{font-size:80px!important;font-weight:700!important;font-style:italic!important;font-family:'Georgia',sans-serif!important\}/);
  assert.match(out, /font-family:'Impact',inherit;[^"]*font-style:italic/);
  assert.throws(() => checkLayers({ layers: { k0: { font: { family: 'x;}</style>' } } } }), /font family/);
});

test('rights on an added clip are checked and never reach the composition HTML', () => {
  const add = (rights: unknown) => ({ added: [{ id: 'av1', kind: 'video', src: 'media/a.mp4', start: 1, duration: 2, track: 1, rights }] });
  const ok = checkLayers(add({ status: 'unlicensed', source: 'pexels', license: 'Pexels License', author: 'Bo', url: 'https://www.pexels.com/video/1/' }));
  assert.equal(ok.added[0].rights?.status, 'unlicensed');
  assert.equal(checkLayers(add(undefined)).added[0].rights, undefined);
  assert.throws(() => checkLayers(add({ status: 'maybe' })), /licensed or unlicensed/);
  assert.throws(() => checkLayers(add({ status: 'licensed', license: 'x'.repeat(301) })), /rights.license/);
  assert.ok(!applyEdits(HTML, ok).includes('Pexels License'));
});
