import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WS, clampCamera, createSkill, createStyle, deleteSkill, deleteStyle, getSkill, getSkillView, getStyle, listMotionStyles, listSkills, styleGuide, updateSkill, updateStyle } from '../pipeline.ts';

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

test('skills: three drawers on disk, the flat view for the shared screens, guide edits land in look.guide, brief carries the lot', () => {
  const id = 'test-skill';
  if (listSkills().includes(id)) deleteSkill(id);
  createSkill(id, { name: 'Teste', format: { camera: { framing: 'só M' } }, look: { guide: 'g1', motif: 'linha' }, rhythm: { pace: 2, beats: [{ from: 0, to: 2, composition: 'c', elements: 'e', typography: 't', motion: 'm', transitionOut: 'cut' }] } });
  assert.deepEqual(getSkill(id).rhythm.pace, 2);
  const v = getSkillView(id);
  assert.equal(v.guide, 'g1'); assert.equal(v.camera.framing, 'só M'); assert.equal(v.pace, 2); assert.equal(v.beats.length, 1);
  updateSkill(id, { guide: 'g2', rhythm: { pace: 3 } });
  const k = getSkill(id);
  assert.equal(k.look.guide, 'g2'); assert.equal(k.look.motif, 'linha'); assert.equal(k.rhythm.pace, 3); assert.equal(k.rhythm.beats.length, 1);   // deep merge keeps the siblings
  assert.throws(() => updateSkill(id, { format: { planos: ['zoom'] } }), /plano desconhecido/);
  for (const part of ['# Skill brief', 'g2', 'linha', 'Presenter framing: só M', '0-2s · c']) assert.ok(styleGuide({ skillId: id } as any).includes(part), part);
  deleteSkill(id);
  assert.ok(!listSkills().includes(id));
});

test('migrateSkills moves a flat clone to skills/ with its refs, skill.md and the old style.json kept as refs/style-v8.json', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { migrateSkills } = await import('../scripts/migrate-v9.mjs');
  const ws = mkdtempSync(join(tmpdir(), 'editor-mig-')), d = join(ws, 'styles', 'build');
  mkdirSync(join(d, 'refs'), { recursive: true });
  writeFileSync(join(d, 'style.json'), JSON.stringify({ name: 'Build', guide: 'g', pace: 6, camera: { framing: 'M', depth: 'flat' } }));
  writeFileSync(join(d, 'refs', 'v0_0.jpg'), 'x'); writeFileSync(join(d, 'skill.md'), 'minhas regras');
  assert.deepEqual(migrateSkills(ws), ['build']);
  const to = join(ws, 'skills', 'build'), k = JSON.parse(readFileSync(join(to, 'skill.json'), 'utf8'));
  assert.equal(k.id, 'build'); assert.equal(k.look.guide, 'g'); assert.equal(k.rhythm.pace, 6); assert.equal(k.format.camera.framing, 'M');
  assert.ok(existsSync(join(to, 'refs', 'v0_0.jpg')) && existsSync(join(to, 'skill.md')) && existsSync(join(to, 'refs', 'style-v8.json')));
  assert.ok(!existsSync(d)); assert.deepEqual(migrateSkills(ws), []);
});
