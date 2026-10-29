import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, formatCardTypes, validateAnim, validateCaptionStyle, validateCard, validateCustom, validateFont, validateIcon } from '../validate.ts';

const palette = ['#ED84B0', '#FFEEF5'];
const custom = (o: object) => ({ type: 'custom', start: 1, end: 3, html: '<div class="b">oi</div>', css: '.b{color:var(--main)}', js: 'tl.from(el.querySelector(".b"),{y:40,top:10,duration:.3},T);', ...o });

test('standard cards need an end inside the video and their fields', () => {
  assert.deepEqual(validateCard({ type: 'sticker', start: 0, end: 2, src: 'a.png' }, 10, palette), []);
  assert.ok(validateCard({ type: 'sticker', start: 0, src: 'a.png' }, 10, palette).some(e => e.includes('end')));
  assert.ok(validateCard({ type: 'sticker', start: 0, end: 12, src: 'a.png' }, 10, palette).some(e => e.includes('past')));
  assert.ok(validateCard({ type: 'sticker', start: 0, end: 2 }, 10, palette).some(e => e.includes('needs src')));
  assert.deepEqual(validateCard({ type: 'nope', start: 0, end: 1 }, 10, palette), ['unknown type "nope"']);
});

test('a clean custom card passes', () => {
  assert.deepEqual(validateCard(custom({}), 10, palette), []);
  assert.deepEqual(validateCustom(custom({ css: '.b{background:#ed84b0}' }), palette), []);
});

test('custom card: no network, scripts or non-determinism', () => {
  const bad: [object, string][] = [
    [{ html: '<script>alert(1)</script>' }, 'script'],
    [{ html: '<div onclick="x()">' }, 'on'],
    [{ html: '<a href="https://evil.com">' }, 'href'],
    [{ css: '.b{background:url(https://x.com/a.png)}' }, 'url'],
    [{ css: '@import "x.css";' }, '@'],
    [{ js: 'fetch("/x")' }, 'fetch'],
    [{ js: 'tl.to(el,{x:Math.random()},T)' }, 'Math.random'],
    [{ js: 'document.body.remove()' }, 'document'],
    [{ js: 'top.location="x"' }, 'top'],
    [{ js: 'tl.to(el,{x:' }, 'parse'],
  ];
  for (const [o, hint] of bad) assert.ok(validateCustom(custom(o), palette).some(e => e.includes(hint)), `${JSON.stringify(o)} -> ${hint}`);
});

test('custom card: any colour is allowed', () => {
  assert.deepEqual(validateCustom(custom({ css: '.b{color:#00ff00;background:rgb(0,0,0)}' }), palette), []);
});

test('icons: PNG magic bytes, SVG without scripts or external refs', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.deepEqual(validateIcon('a.png', png), []);
  assert.deepEqual(validateIcon('a.png', Buffer.from('GIF89a')), ['not a PNG file']);
  assert.deepEqual(validateIcon('a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><use href="#c"/></svg>')), []);
  assert.ok(validateIcon('a.svg', Buffer.from('<svg><script>x</script></svg>')).length);
  assert.ok(validateIcon('a.svg', Buffer.from('<svg onload="x()"></svg>')).length);
  assert.ok(validateIcon('a.svg', Buffer.from('<svg><image href="https://x.com/a.png"/></svg>')).length);
  assert.deepEqual(validateIcon('a.gif', Buffer.from('x')), ['icons must be .svg or .png']);
});

test('brand fonts: extension and magic bytes must agree', () => {
  assert.deepEqual(validateFont('a.woff2', Buffer.from('wOF2xxxx')), []);
  assert.deepEqual(validateFont('a.otf', Buffer.from('OTTOxxxx')), []);
  assert.deepEqual(validateFont('a.ttf', Buffer.from([0, 1, 0, 0, 9])), []);
  assert.deepEqual(validateFont('a.ttf', Buffer.from('OTTOxxxx')), ['not a .ttf file']);
  assert.deepEqual(validateFont('a.woff', Buffer.from('wOFFxxxx')), ['fonts must be .ttf, .otf or .woff2']);
});

test('captionStyle: presets, hex colours and number ranges', () => {
  assert.deepEqual(validateCaptionStyle(undefined), []);
  assert.deepEqual(validateCaptionStyle({ preset: 'karaoke', maxWords: 4, color: '#ffffff', highlight: '#FF7DB8', case: 'upper', font: 'head', size: 96, y: 1250 }), []);
  assert.deepEqual(validateCaptionStyle({ preset: '' }), []);
  assert.equal(validateCaptionStyle({ preset: 'neon' }).length, 1);
  assert.equal(validateCaptionStyle({ maxWords: 20, color: 'red' }).length, 2);
  assert.equal(validateCaptionStyle([]).length, 1);
});

test('anim: closed vocabularies and limits, errors name the field', () => {
  const ok = { unit: 'char', stagger: 0.05, in: { type: 'slide-up', duration: 0.2, ease: 'back.out', from: { y: 40, opacity: 0, blur: 8 } }, active: { to: '@caption_accent', scale: 1.1 } };
  assert.deepEqual(validateAnim(ok), []);
  assert.deepEqual(validateCaptionStyle({ preset: 'karaoke', anim: ok }), []);
  assert.match(validateAnim({ in: { ease: 'x=>alert(1)' } })[0], /anim\.in\.ease/);
  assert.match(validateAnim({ in: { duration: 5 } })[0], /anim\.in\.duration/);
  assert.match(validateAnim({ in: { from: { y: 900 } } })[0], /from\.y/);
  assert.match(validateAnim({ in: { from: { bogus: 1 } } })[0], /unknown property/);
  assert.match(validateAnim({ unit: 'letter' })[0], /anim\.unit/);
  assert.match(validateAnim({ active: { to: 'red;x' } })[0], /anim\.active\.to/);
});

test('anim-presets.json passes the validator', async () => {
  const presets = (await import('../../claude-reel-editor/skills/reel-editor/anim-presets.json', { with: { type: 'json' } })).default;
  for (const [name, a] of Object.entries(presets)) assert.deepEqual(validateAnim(a), [], name);
  // Specific assertions for user's requested animation parameter styles
  assert.equal(presets['scale-pop'].in.type, 'scale');
  assert.deepEqual(presets['scale-pop'].in.from, { scale: 0 }); // só escala

  assert.equal(presets['fade-word'].in.type, 'fade');
  assert.deepEqual(presets['fade-word'].in.from, { opacity: 0 }); // só opacidade

  assert.equal(presets['scale-fade'].in.type, 'scale-fade');
  assert.deepEqual(presets['scale-fade'].in.from, { opacity: 0, scale: 0.4 }); // mesclado opacidade e escala

  assert.equal(presets['slide-scale'].in.type, 'slide-scale');
  assert.deepEqual(presets['slide-scale'].in.from, { scale: 0, y: 40 }); // position e escala
});

test('backdrop cards need a src and an end', () => {
  assert.deepEqual(validateCard({ type: 'backdrop', src: 'bg.png', start: 0, end: 2 }, 10, []), []);
  assert.ok(validateCard({ type: 'backdrop', start: 0, end: 2 }, 10, []).some(m => /needs src/.test(m)));
});

test('tier cards need a tier S-F, a text and time to slide', () => {
  assert.deepEqual(validateCard({ type: 'tier', tier: 'S', text: 'pix', start: 0, end: 2 }, 10, []), []);
  assert.ok(validateCard({ type: 'tier', tier: 'E', text: 'pix', start: 0, end: 2 }, 10, []).some(m => /one of S/.test(m)));
  assert.ok(validateCard({ type: 'tier', tier: 'A', start: 0, end: 2 }, 10, []).some(m => /needs text/.test(m)));
  assert.ok(validateCard({ type: 'tier', tier: 'A', text: 'x', start: 0, end: 0.5 }, 10, []).some(m => /0.8 s/.test(m)));
  assert.ok(!(CARD_TYPES as readonly string[]).includes('tier'));
});

test('formats offer tier only with the Ranking table and backdrop only with the cut-out', () => {
  assert.deepEqual(formatCardTypes({}), [...CARD_TYPES]);
  assert.deepEqual(formatCardTypes({ layout: 'tier-list-bottom' }), [...CARD_TYPES, 'tier']);
  assert.deepEqual(formatCardTypes({ cutout: true }), [...CARD_TYPES, 'backdrop']);
  assert.deepEqual(formatCardTypes(undefined), [...CARD_TYPES]);
  assert.deepEqual(formatCardTypes({ layout: 'cutout-widgets', cutout: true }), [...CARD_TYPES, 'backdrop', 'broll']);
  assert.deepEqual(validateCard({ type: 'broll', src: 'a.mp4', start: 0, end: 2 }, 10, []), []);
  assert.ok(validateCard({ type: 'broll', start: 0, end: 2 }, 10, []).some(m => /needs src/.test(m)));
});
