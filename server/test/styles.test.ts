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

test('packs: migrateStyles writes one valid style.json per illustration pack, and a bad pack or engine is refused', async () => {
  const { mkdtempSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { migrateStyles } = await import('../scripts/migrate-v9.mjs');
  const kit = join(import.meta.dirname, '../../claude-reel-editor/skills/reel-editor/compose'), ws = mkdtempSync(join(tmpdir(), 'editor-mig-'));
  const made: string[] = migrateStyles(ws, kit);
  assert.equal(made.length, 13);   // the 12 packs + image-cluster
  for (const id of made.filter(x => x !== 'image-cluster')) {
    const s = JSON.parse(readFileSync(join(ws, 'styles', id, 'style.json'), 'utf8'));
    assert.ok(s.name && s.description && existsSync(join(kit, 'estilos', s.pack)), id);
    if (s.engine) assert.ok(existsSync(join(kit, 'engines', `${s.engine}.js`)), id);
  }
  assert.deepEqual(migrateStyles(ws, kit), []);   // idempotent
  assert.throws(() => createStyle('bad-pack', { name: 'x', pack: 'nao-existe.md' }), /pack/);
  assert.throws(() => createStyle('bad-engine', { name: 'x', engine: '../x' }), /engine/);
  assert.ok(!listMotionStyles().some(s => s.startsWith('bad-')));
  createStyle('test-pack', { name: 'Pack', pack: 'diorama.md', engine: 'diorama' });
  try { assert.match(styleGuide({ styleId: 'test-pack' } as any), /ESTILO\.md[\s\S]*engine='diorama'/); } finally { deleteStyle('test-pack'); }
});
