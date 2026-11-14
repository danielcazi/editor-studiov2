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
# shader(): o efeito tem de existir em fx/, o relógio é o tempo absoluto da linha do tempo e efeito de fundo escuro em fundo claro vira aviso
shutil_fx = __import__("shutil"); shutil_fx.copytree(KIT / "fx", "fx")
h, j = kit.shader("s01", "god-rays", 3, calm=(.5, .3))
assert 'id="s01-sh"' in h and "mount(el,'god-rays'" in j and '"calmX": 0.5' in j and f"tl.time()*{kit.FX_VEL}" in j and not kit.AVISOS, (j, kit.AVISOS)
kit.shader("s02", "god-rays", 3, bg="#FFFAEA"); assert len(kit.AVISOS) == 1 and "fundo escuro" in kit.AVISOS[0], kit.AVISOS
kit.shader("s03", "caustics", 3, bg="#FFFAEA"); assert len(kit.AVISOS) == 1, kit.AVISOS
try: kit.shader("s04", "nao-existe", 3); raise SystemExit("shader desconhecido passou")
except AssertionError as e: assert "god-rays" in str(e), e
kit.AVISOS.clear(); kit._FX_N[0] = 0
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
# ritmo: sem `pace` no compose.json vale o dinamico de antes; o aviso de locutor parado segue pace.hold
assert kit.PACE == {'every': 1.5, 'scene': [1.2, 3], 'framing': [2, 4], 'hold': 4}, kit.PACE
def hold_warn():
    kit.AVISOS.clear(); kit.S.clear(); kit.scene(1, 0, 6, 'red', ('L', 'hold', 'L')); kit.lint_static()
    return [a for a in kit.AVISOS if 'locutor parado' in a]
assert hold_warn(); kit.PACE['hold'] = 8; assert not hold_warn(); kit.PACE['hold'] = 4
kit.AVISOS.clear(); kit.ERROS.clear(); kit.S.clear()
# planos do formato: cam fora de compose.json planos é erro; o mesmo plano em cenas vizinhas (agenda livre) é aviso
assert kit.PLANOS == ['cut', 'panel', 'none']   # sem `planos` no compose.json valem os três de antes
kit.PLANOS[:] = ['cut', 'none']
kit.S.clear(); kit.scene(1, 0, 3, 'red', 'panel'); kit.scene(2, 3, 6, 'black', None); kit.scene(3, 6, 10, 'amber', None); kit.lint_static()
assert any('cena 1' in e and "'panel'" in e and 'fora dos planos' in e for e in kit.ERROS), kit.ERROS
assert not any('cena 2' in e or 'cena 3' in e for e in kit.ERROS) and any('cenas 2 e 3' in a and 'mesmo plano none' in a for a in kit.AVISOS), (kit.ERROS, kit.AVISOS)
kit.PLANOS[:] = ['cut', 'panel', 'none']
kit.AVISOS.clear(); kit.ERROS.clear(); kit.S.clear()
# v9 fase 6: panel-top (painel em cima), raw (vídeo cru em tela cheia, bg clear) e react (referência na metade oposta ao painel)
H = kit.H
kit.PANEL, kit.PANEL_SIDE, kit.PANEL_TOP = {'side': 'top', 'top': .5}, 'top', H // 2
kit.PANEL_Y0, kit.PANEL_H = 0, H // 2
kit.PLANOS[:] = ['cut', 'panel', 'panel-top', 'raw', 'react', 'none']
def erros(*sc):
    kit.ERROS.clear(); kit.AVISOS.clear(); kit.S.clear()
    for k, (cam, bg) in enumerate(sc, 1): kit.scene(k, k - 1, k, bg, cam)
    kit.lint_static(); return list(kit.ERROS)
assert erros(('panel-top', 'red'), ('raw', 'clear'), (None, 'black')) == []
assert any('painel embaixo' in e or 'painel de baixo' in e for e in erros(('panel', 'red')))   # "panel" com o painel em cima
assert any('bg="clear"' in e for e in erros(('raw', 'red')))   # um fundo sólido esconderia o vídeo cru
assert any('"clear" só com' in e for e in erros((None, 'clear')) + erros((('L', 'hold', 'L'), 'clear')))
assert any('refVideo' in e for e in erros(('react', 'clear')))   # sem assets/ref.mp4 não há react
kit.REF_VIDEO = True
assert erros(('react', 'clear'), (('L', 'hold', 'L'), 'red')) == []
kit.S.clear(); kit.ERROS.clear()
kit.scene(1, 0, 3, 'clear', 'raw'); kit.scene(2, 3, 6, 'red', 'panel-top'); kit.scene(3, 6, 9, 'clear', 'react'); kit.scene(4, 9, 10, 'black', None)
kit.render()
html = open("index.html").read(); mask = json.load(open("motion_mask.json"))
assert 'id="rcam"' in html and 'assets/raw.mp4' in html and 'id="rfcam"' in html and 'assets/ref.mp4' in html and 'object-position:' in html, 'raw e react no index.html'
assert f'#tcam {{ position:absolute; left:0; top:0px; width:1080px; height:{H // 2}px' in html, 'painel de cima: de 0 até a metade'
assert f'id="rfcam" style="position:absolute;left:0;width:1080px;top:{H // 2}px;height:{H - H // 2}px' in html, 'a referência ocupa a metade de baixo, oposta ao painel'
assert 'tl.set("#rcam",{opacity:1},0);' in html and 'tl.set("#tcam",{opacity:1},3);' in html and 'tl.set("#tcam",{opacity:1},6);' in html and 'tl.set("#rfcam",{opacity:1},6);' in html
assert mask[1]["ignore"] == [[0, 0, 1080, H // 2]] and mask[2]["ignore"] == [[0, 0, 1080, H]] and mask[3]["ignore"] == [], mask
# recorte desligado (planos sem 'cut', cutWindows []): a CTA vale em qualquer plano, nenhum cut.webm entra no index.html e cena recortada é erro
kit.PLANOS[:] = ['panel-top', 'none']; kit.CUT_WINDOWS = []
kit.S.clear(); kit.ERROS.clear(); kit.scene(1, 0, 5, 'red', 'panel-top', cta=True); kit.scene(2, 5, 10, 'black', None, cta=True); kit.lint_static(); assert kit.ERROS == [], kit.ERROS
kit.render(); assert 'cut.webm' not in open("index.html").read(), 'sem recorte não há clipe do cut.webm'
assert any('fora dos planos' in e for e in erros((('XXL', 'hold', 'XXL'), 'red')))
kit.CUT_WINDOWS = None
kit.PANEL, kit.PANEL_SIDE, kit.PANEL_TOP, kit.PANEL_Y0, kit.PANEL_H, kit.REF_VIDEO = None, 'bottom', None, 0, 0, False
kit.PLANOS[:] = ['cut', 'panel', 'none']
kit.AVISOS.clear(); kit.ERROS.clear(); kit.S.clear()
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
# b-roll: footage() é uma janela de vídeo mudo com clip dentro da cena; music() entra uma vez no index.html
h, js = kit.footage('b01', 'assets/video/lib1-clip-tim-cook.mp4', 60, 300, 960, 540, 4.0, at=.5, start=3)
assert 'class="clip"' in h and 'data-media-start="3.00"' in h and 'data-duration="3.50"' in h and 'muted' in h and 'object-fit:cover' in h, h
assert 'tl.fromTo("#b01-ft"' in js and '},3.70);' in js, js
assert 'footage' in kit.KIT_HELPERS
kit.music('assets/music/lib9-music-upbeat.mp3', vol=.2)
assert kit.MUSIC == ('assets/music/lib9-music-upbeat.mp3', .2, 1.2)
# one-take (scene(..., at=)): o #world põe o centro do bloco no centro do quadro com escala, roll e perspectiva da pose
I = dict(x=0, y=0, scale=1, rx=0, ry=0, rz=0)
assert kit.oner_pose(I, (1200, 0)).startswith('x:-1200.00,y:0.00,z:0.00,scale:1.000'), kit.oner_pose(I, (1200, 0))
assert kit.oner_pose(dict(I, scale=.5, x=40), (1000, 400)).startswith('x:-460.00,y:-200.00,z:0.00,scale:0.500')   # pull-out: a deriva soma ao centro
assert re.match(r'x:-?0\.00,y:-100\.00', kit.oner_pose(dict(I, rz=90), (100, 0))), kit.oner_pose(dict(I, rz=90), (100, 0))
vx, vy, vz = kit._rot(0, 8, 0, (1000, 0, 0))   # orbit num bloco longe: z devolve o bloco ao plano (o locutor não cresce na perspectiva)
assert abs(vz) > 100 and kit.oner_pose(dict(I, ry=8), (1000, 0)).startswith(f'x:{-vx:.2f},y:0.00,z:{-vz:.2f},'), kit.oner_pose(dict(I, ry=8), (1000, 0))
kit.S.clear(); kit.ERROS.clear(); kit.AVISOS.clear(); kit.MUSIC = None
L = lambda p, d: (kit.giant(p, ['A'], 30, 10, kit.BLK), '')
kit.scene(1, 0, 2, 'cream', ('L', 'hold', 'L'), back=L, at=(0, 0))
kit.scene(2, 2, 4, 'cream', ('M', 'hold', 'M'), back=L, at=(1200, 0), spk=dict(y=-300, blur=8), world=dict(scale=.6))
kit.scene(3, 4, 6, 'red', ('XL', 'hold', 'XL'), back=L)                    # mesmo bloco, outra batida
kit.scene(4, 6, 10, 'cream', ('L', 'hold', 'L'), back=L, at=(0, 0))        # volta ao começo: o loop
kit.render()
html = open("index.html").read(); sc = json.load(open("scenes.json"))
km = kit.DEPTH_K('mid')
assert f'left:{1200 / km:.1f}px;top:0.0px' in html, 'host no bloco, compensado pela profundidade da camada'
assert 'id="b01" data-composition-id="b01" data-composition-src="compositions/b01.html" data-start="0" data-duration="6"' in html, 'o bloco 1 fica no mundo até a câmera voltar a ele'
assert 'tl.to("#world",{x:-1200.00,y:0.00,z:0.00,scale:1.000' in html and 'duration:0.320,ease:"power3.inOut"},1.840);' in html, 'whip centrado no começo da cena 2'
assert 'tl.set("#root",{filter:"url(#wmb)"},1.840);' in html and 'stdDeviation:"36.0 0.0"' in html and 'tl.set("#root",{filter:"none"},2.160);' in html, 'desfoque horizontal só no whip'
assert 'tl.set("#spk",{x:1200.0,y:-300.0},2.000);' in html and 'filter:"blur(8px)","--fade":"72%"' in html, 'o locutor troca de bloco no pico do whip, erguido e desfocado'
assert 'tl.to("#world",{x:-720.00,y:0.00,z:0.00,scale:0.600' in html, 'pull-out da cena 2 em volta do bloco'
assert 'class="bgfill"' not in open("compositions/b01.html").read() and 'inset:0' in open("compositions/b03.html").read(), 'chão no #root; cena de outro fundo pinta só o bloco'
assert f'background:{kit.CRM}; perspective' in html and 'id="spk"' in html and 'id="wmb"' in html
assert [s['at'] for s in sc] == [[0, 0], [1200, 0], [1200, 0], [0, 0]], sc
kit.S.clear(); kit.ONER_REQ = True; kit.scene(1, 0, 10, 'cream', ('L', 'hold', 'L'))
try: kit.render(); raise SystemExit('skill one-take sem at= passou')
except AssertionError as e: assert 'one-take' in str(e), e
kit.ONER_REQ = False; kit.S.clear(); kit.ERROS.clear()
print("one-take: ok")
