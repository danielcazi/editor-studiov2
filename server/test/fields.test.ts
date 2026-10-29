import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCard, validateCustom } from '../validate.ts';

const base = { start: 0.5, end: 1.5 };
const check = (c: object) => validateCard({ ...base, ...c }, 3, ['#750800']);

test('a normal card with numbers and a brand colour passes', () => {
  assert.deepEqual(check({ type: 'sticker', src: 'a.png', y: 300, color: '#750800' }), []);
  assert.deepEqual(check({ type: 'sticker', src: 'a.png', x: 760, y: 420, size: 260, rotate: -6 }), []);
  assert.deepEqual(check({ type: 'sticker', src: 'a.png', color: 'var(--pop)' }), []);
});

test('markup or script in a colour or number field never reaches build_reel.py', () => {
  assert.match(check({ type: 'sticker', src: 'a.png', color: 'red"><b id="x"></b><i x="' }).join(), /color/);
  assert.match(check({ type: 'sticker', src: 'a.png', rotate: '0});window.x=1;tl.set(\'#cam\',{x:0' }).join(), /rotate must be a number/);
  assert.match(check({ type: 'shot', src: 'a.png', y: '130px;background:url(//x)' }).join(), /y must be a number/);
  assert.match(check({ type: 'motion', name: '../../x' }).join(), /motion name/);
  assert.match(check({ type: 'motion', name: 'carousel-vision-1', box: [0, 160, '1080"', 700] }).join(), /box/);
  assert.match(check({ type: 'sticker', src: 'a.png', sfx: { name: '../../x', db: -12 } }).join(), /sfx/);
});

test('custom js cannot reach window through this, constructor or ownerDocument', () => {
  for (const js of ["var k='fe'+'tch'; this[k]", "tl['constructor']['constructor']('return 1')()", "el.ownerDocument.defaultView"])
    assert.ok(validateCustom({ html: '<div></div>', css: '', js }, []).length, js);
  assert.deepEqual(validateCustom({ html: '<div class="a"></div>', css: '.a{top:10px}', js: "tl.to(el.querySelector('.a'),{top:20,duration:.3},T)" }, []), []);
});
