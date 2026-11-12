// The bank of movements (Motion Think): kit.py loads estilos/banco/*.py, wraps the calls to know which scene used which helper, and warns a
// scene whose `momento` the bank covers but that used none. Then every helper really in the bank is checked (banco_check.py). approve() runs this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PYTHON } from '../host.ts';

const CHECK = join(import.meta.dirname, 'banco_check.py');
const py = (args: string[]) => execFileSync(PYTHON, [CHECK, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('kit loads a bank helper, records its use per scene and warns the uncovered scene', () => {
  const banco = mkdtempSync(join(tmpdir(), 'banco-fixture-'));
  writeFileSync(join(banco, 'cluster_demo.py'), `from kit import *\n\ndef cluster_demo(p, words=('UM', 'DOIS'), color=None, at=0.0, d=None, k='cd'):\n    """Fixture: one giant word and a small one in the corner."""\n    i = f'{p}-{k}'\n    html = f'<div id="{i}" class="giant" style="top:{H*.3:.0f}px;color:{color or AMB}">{words[0]}</div>'\n    js = f'tl.fromTo("#{i}",{{opacity:0}},{{opacity:1,duration:.4}},{at});'\n    return html, js\n`);
  writeFileSync(join(banco, 'banco.json'), JSON.stringify({ helpers: [{ id: 'cluster_demo', nome: 'fixture', momento: 'gancho', categoria: 'tipografia', params: ['words', 'color'], medidas: {}, origem: 't', aprovadoEm: '2026-01-01', rodadas: 1 }], negativo: [] }));
  const out = py([banco]);
  assert.match(out, /cluster_demo ok \(gancho\)/);
  // the warning itself: a scene with momento gancho and no bank call
  const d = mkdtempSync(join(tmpdir(), 'banco-warn-'));
  const KIT = join(import.meta.dirname, '../../claude-reel-editor/skills/reel-editor/compose');
  mkdirSync(join(d, 'assets'), { recursive: true }); writeFileSync(join(d, 'assets/transcript.json'), '[]');
  writeFileSync(join(d, 'compose.json'), JSON.stringify({ W: 1080, H: 1920, DUR: 4, speaker: false, colors: { RED: '#000', RED2: '#000', AMB: '#000', BLK: '#000', CRM: '#000' } }));
  const script = `import sys, shutil; sys.path.insert(0, ${JSON.stringify(KIT)}); shutil.copytree(${JSON.stringify(banco)}, 'estilos/banco')\nimport kit\nkit.scene(1, 0, 2, 'black', None, momento='gancho'); kit.scene(2, 2, 4, 'black', None, momento='prova'); print(kit.lint_banco())\nassert 'cluster_demo' in kit.BANCO and kit.BANCO['cluster_demo']['momento'] == 'gancho'\nassert kit.lint_banco() == ["cena 1: momento 'gancho' tem 1 helper no banco (cluster_demo) e a cena não usou nenhum"], kit.lint_banco()\nkit.S.clear(); kit.scene(1, 0, 4, 'black', None, momento='gancho'); kit._BANCO_SCENE[0] = 1; kit.cluster_demo('b01'); assert kit.lint_banco() == [], kit.lint_banco()\nprint('warn ok')`;
  const w = execFileSync(PYTHON, ['-c', script], { cwd: d, encoding: 'utf8' });
  assert.match(w, /warn ok/);
});

test('every helper in the real bank generates html/js and renders a scene', () => {
  const out = py(process.env.BANCO_DIR ? [process.env.BANCO_DIR] : []);
  assert.match(out, /helper\(s\) ok|nenhum helper/);
});
