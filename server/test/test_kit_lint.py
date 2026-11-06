"""Variety lint of compose/kit.py: it only measures what scenes.py and the generated html/js contain (no Chrome, no project)."""
import json, os, re, sys, tempfile
from pathlib import Path
KIT = Path(__file__).resolve().parents[2] / "claude-reel-editor/skills/reel-editor/compose"
d = tempfile.mkdtemp(); os.chdir(d)   # kit.py reads compose.json from the cwd at import
json.dump({"W": 1080, "H": 1920, "DUR": 10, "colors": {k: "#000" for k in ("RED", "RED2", "AMB", "BLK", "CRM")}}, open("compose.json", "w"))
os.makedirs("assets"); json.dump([{"text": "Eu", "start": 0, "end": .1}, {"text": "já", "start": .1, "end": .2}, {"text": "sei,", "start": .2, "end": .5},
                                   {"text": "Já", "start": 2.0, "end": 2.2}, {"text": "sei", "start": 2.2, "end": 2.6}], open("assets/transcript.json", "w"))
sys.path.insert(0, str(KIT)); import kit

# cue por palavra: acento e pontuação não contam, frase casa em sequência, `after` pula a primeira ocorrência, falta vira aviso
assert kit.T("ja sei") == .1 and kit.T("sei", end=True) == .5 and kit.T("já sei", after=1) == 2.0 and kit.T("nada", after=3) == 3, kit.MISSING
assert kit.MISSING == ['"nada" depois de 3.00 s'], kit.MISSING
kit.MISSING.clear()

assert {"giant", "pill", "counter", "lintel", "obj3d"} <= kit.KIT_HELPERS and "render" not in kit.KIT_HELPERS, sorted(kit.KIT_HELPERS)
poor = kit.lint_variety("from kit import *\nscene(1,0,10,'red',None,back=lambda p,d: giant(p,['A'],30,10,BLK))\nrender()",
                        "<div class='giant'>A</div>", 'tl.fromTo("#a",{opacity:0,y:40},{opacity:1,y:0,duration:.25,ease:"back.out"},0);tl.to("#a",{opacity:0,duration:.3},2);')
assert len(poor) == 1 and "duram" in poor[0], poor   # v8: the lint only flags stuck timing, not repertoire
rich_src = "from kit import *\n" + "".join(f"{h}(p)\n" for h in ("giant", "pill", "counter", "lintel", "slam"))
rich = kit.lint_variety(rich_src, '<div class="giant">A</div>',
                        'tl.fromTo("#a",{opacity:0},{opacity:1,duration:.4},0);tl.to("#b",{rotation:12,clipPath:"inset(0)",duration:1.2},0);tl.to("#c",{skewX:4,duration:.5},1);')
assert rich == [], rich
# câmera de mundo: pose contínua entre cenas, tipos de movimento e lint de direção
kit.S.clear()
kit.scene(1, 0, 2, 'red', None, world=dict(scale=1.1))
kit.scene(2, 2, 4, 'black', None, world=dict(x=-80, ry=4))
kit.scene(3, 4, 6, 'amber', None, world=dict(scale=1, y=40, snap=True), signature=True)
kit.scene(4, 6, 10, 'cream', None)
js, kinds = kit.world_track()
# a pose cabe na própria escala: pan de 80 px com orbit de 4° a 1.1 encolhe para 41 px e 2°; o snap para escala 1 volta ao repouso
assert kinds == ['push', 'pan', 'orbit', 'pull', 'pan', 'orbit'] and not kit.ERROS, (kinds, kit.ERROS)
assert js[1] == 'tl.to("#world",{x:0.000,y:0.000,scale:1.100,rotationX:0.000,rotationY:0.000,rotation:0.000,duration:2.00,ease:"sine.inOut"},0.00);', js[1]
assert js[2].startswith('tl.to("#world",{x:-40.989,y:0.000,scale:1.100,rotationX:0.000,rotationY:2.049') and js[3].startswith('tl.set("#world",{x:0.000,y:0.000,scale:1.000,rotationX:0.000,rotationY:0.000'), js[2:]
assert kit.world_cover(dict(x=0, y=0, scale=1, rx=0, ry=0, rz=0)) == 1 and kit.world_fit(dict(x=-70, y=0, scale=.95, rx=0, ry=0, rz=4)) == dict(x=0, y=0, scale=1, rx=0, ry=0, rz=0)
assert kit.lint_world(kinds) == [] and kit.lint_world(['push']) == []   # v8: no camera quotas, the director decides
kit.S.clear(); kit.scene(1, 0, 2, 'red', None, world=dict(scale=2, d=5)); kit.world_track()
assert len(kit.ERROS) == 2 and 'fora do limite' in kit.ERROS[0] and 'd=5.0' in kit.ERROS[1], kit.ERROS
kit.ERROS.clear(); kit.S.clear()
# render(): máscara do locutor por cena para o pace.py e zoom alternado do recorte nas emendas do corte (compose.json "cuts")
kit.CUTS[:] = [1.5, 3.0, 12.0]; os.makedirs("compositions", exist_ok=True); import shutil; shutil.copytree(KIT / "sfx", "assets/sfx")
kit.scene(1, 0, 4, 'red', ('L', 'push', 'XL'), back=lambda p, d: (kit.giant(p, ['A'], 30, 10, kit.BLK), '')); kit.scene(2, 4, 10, 'black', None); kit.T("nada")
kit.render()
mask = json.load(open("motion_mask.json")); html = open("index.html").read()
assert mask == [{"t0": 0, "ignore": [[-90, 300, 1260, 1620]]}, {"t0": 4, "ignore": []}], mask
assert 'tl.set(".cut",{scale:1.06},1.500);' in html and 'tl.set(".cut",{scale:1},3.000);' in html and ',12.000);' not in html
assert any('T() sem palavra' in a and '"nada"' in a for a in kit.AVISOS), kit.AVISOS
kit.S.clear(); kit.CUTS.clear()
# motores por estilo: engine() lê engines/<nome>.js uma vez, canvas(engine=) marca o uso da cena, e cada motor é JS válido
import subprocess
shutil.copytree(KIT / "engines", Path(d) / "engines")
for name, obj in (("silkscreen", "SK"), ("briefing", "BB"), ("swiss", "SW"), ("deco", "AD"), ("sketch", "SB"), ("launch", "LA"), ("cinetic", "CN"), ("diorama", "DI")):
    kit._ENG_USED.clear(); h, j = kit.canvas("b01", "ctx.fillRect(0,0,w,h)", 2, engine=name)
    assert name in kit.ENGINES and list(kit._ENG_USED) == [name] and f"const {obj} = " in kit.ENGINES[name], name
    assert subprocess.run(["node", "--check", str(KIT / "engines" / f"{name}.js")]).returncode == 0, name
h, j = kit.canvas("b02", "ctx.fillRect(0,0,w,h)", 2, over=80, bg="#FFF8EA")
assert 'width="1240" height="2080"' in h and "left:-80px;top:-80px" in h and 'OVER=80,BG="#FFF8EA"' in j, (h, j[:160])
# lista: os motores entram na ordem dada (marca.js pode usar o SK do silkscreen)
kit._ENG_USED.clear(); kit.engine("swiss, silkscreen"); assert list(kit._ENG_USED) == ["swiss", "silkscreen"]
try: kit.engine("nope"); assert False
except AssertionError as e: assert "não existe" in str(e)
# ilustração em código: canvas e scene3d devolvem (html, js) com o desenho do agente dentro, ligados ao tempo da cena
h, j = kit.canvas("b01", "ctx.fillStyle='#f00';ctx.fillRect(0,0,w*eo(t/2),h)", 2.5, at=.5, k="ilu")
assert 'id="b01-ilu"' in h and 'width="1080" height="1920"' in h and "ctx.fillRect(0,0,w*eo(t/2),h)" in j and "AT=0.50,D=2.50" in j, (h, j[:200])
h, j = kit.scene3d("b02", "sc.add(new T.Mesh(new T.BoxGeometry(1,1,1),clay('#f00')));return t=>{}", 3, fog=("#000", 6, 14), w=600, h=600)
assert 'width="600" height="600"' in h and "sc.fog=new T.Fog('#000',6,14)" in j and "clay('#f00')" in j and "key.castShadow=true" in j, j[:300]
assert "mulberry=" in kit.EASES and "grain=" in kit.EASES
# transições: a cena anterior sai por baixo da nova; cut não deixa sobra
assert kit.transition("b01", "b", 0, 2, "push", .3) == ['tl.fromTo("#b01",{scale:1.08,opacity:0},{scale:1,opacity:1,duration:.45,ease:"power3.out"},0.00);', 'tl.to("#b01",{scale:.96,opacity:0,duration:0.30,ease:"power2.in"},2.00);']
assert kit.transition("s01", "s", 0, 2, "cut", 0) == [] and len(kit.transition("b02", "b", 2, 4, "slide", 0)) == 1
print("kit variety lint: ok")
# sincronia de som (DIRETOR.md §5): nada antes do reel, o mesmo arquivo nunca duas vezes a menos de 0,1 s
kit.S.clear(); kit.ERROS.clear()
kit.scene(1, 0, 2, 'red', None, sfx=[('whoosh', -.12, .5)])
kit.scene(2, 2, 4, 'black', None, sfx=[('pop', .3, .5), ('pop', .35, .5), ('click', .35, .5)])
kit.lint_sfx()
assert len(kit.ERROS) == 2 and any('antes do reel' in e for e in kit.ERROS) and any('duas vezes' in e for e in kit.ERROS), kit.ERROS
