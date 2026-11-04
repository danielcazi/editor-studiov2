import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WS, clampCamera, createStyle, deleteStyle, getStyle, listMotionStyles, styleGuide, updateStyle } from '../pipeline.ts';

test('clampCamera keeps world moves inside the kit limits and drops unknown kinds', () => {
  const c = clampCamera({ world: [{ kind: 'pan', amount: 900, when: 'cut' }, { kind: 'push', amount: 0.2, when: 'cta' }, { kind: 'zoom', amount: 3 }, { kind: 'roll', amount: 'x' }], depth: 'flat' });
  assert.deepEqual(c.world.map((m: any) => [m.kind, m.amount]), [['pan', 120], ['push', 0.9], ['roll', -6]]);
  assert.equal(c.depth, 'flat');
  assert.equal(clampCamera(undefined), undefined);
});

test('styles: create, read with refs, update (deep merge, camera clamped), brief, delete', () => {
  const id = 'test-style';
  if (listMotionStyles().includes(id)) deleteStyle(id);
  createStyle(id, { name: 'Teste', guide: 'tipografia gigante', motif: 'linha amarela', refs: ['ignored.jpg'], camera: { world: [{ kind: 'orbit', amount: 30, when: 'gancho' }], signature: 'orbit no gancho' },
    beats: [{ from: 0, to: 2, composition: 'rosto', elements: 'título', typography: 'Anton', motion: 'sobe', transitionOut: 'push', sfx: 'whoosh' }], sfxRules: [{ when: 'título', sfx: 'whoosh', level: 'subtle' }] });
  const s = getStyle(id);
  assert.equal(s.camera.world[0].amount, 8);
  assert.deepEqual(s.refs, []);
  assert.ok(!('refs' in JSON.parse(readFileSync(join(WS, 'styles', id, 'style.json'), 'utf8'))));
  const g = styleGuide({ styleId: id } as any);
  for (const part of ['# Style brief', 'tipografia gigante', 'linha amarela', 'orbit 8°', 'signature=True', '0-2s · rosto', 'whoosh']) assert.ok(g.includes(part), part);
  assert.equal(styleGuide({} as any), '');
  assert.equal(styleGuide({ styleId: 'nope' } as any), '');
  const u = updateStyle(id, { guide: 'novo guia', camera: { world: [{ kind: 'pan', amount: -500, when: 'x' }] } });
  assert.equal(u.guide, 'novo guia');
  assert.equal(u.motif, 'linha amarela');
  assert.equal(u.camera.world[0].amount, -120);
  assert.equal(u.camera.signature, 'orbit no gancho');
  assert.throws(() => createStyle(id, {}), /já existe/);
  deleteStyle(id);
  assert.throws(() => getStyle(id), /não encontrado/);
});
