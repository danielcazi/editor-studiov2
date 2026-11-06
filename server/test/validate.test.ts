import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnim, validateCaptionStyle, validateFont, validateFormat, validateIcon } from '../validate.ts';

const palette = ['#ED84B0', '#FFEEF5'];
const custom = (o: object) => ({ type: 'custom', start: 1, end: 3, html: '<div class="b">oi</div>', css: '.b{color:var(--main)}', js: 'tl.from(el.querySelector(".b"),{y:40,top:10,duration:.3},T);', ...o });

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


test('format.json: planos from the kit vocabulary, janelas well formed, panel needed for panel shots', () => {
  const ok = { planos: ['cut', 'panel', 'none'], janelas: { cut: [[0, 5], [15, 20], ['tail', 5]] }, panel: { top: 0.42 } };
  assert.deepEqual(validateFormat(ok), []);
  assert.deepEqual(validateFormat({ planos: ['cut', 'none'], janelas: null }), []);
  assert.match(validateFormat({ planos: ['cut', 'zoom'] }).join(), /plano desconhecido: zoom/);
  assert.ok(validateFormat({ planos: [] }).length && validateFormat({}).length);
  assert.match(validateFormat({ planos: ['panel'] }).join(), /panel\.top/);
  assert.match(validateFormat({ planos: ['cut'], janelas: { cut: [[5, 2]] } }).join(), /janela inválida/);
  assert.match(validateFormat({ planos: ['none'], janelas: { cut: [[0, 5]] } }).join(), /sem o plano cut/);
  assert.match(validateFormat({ planos: ['cut'], speaker: false }).join(), /sem locutor/);
});
