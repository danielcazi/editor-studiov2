"""Checks every helper of a bank folder (default: compose/estilos/banco) the way the composer will use it: a temp compose/ with the kit,
the bank copied into estilos/banco/, `import kit` (which loads the bank), name('b01') returns (html, js), and render() of a scene that uses it
passes with no bank warning. Usage: python3 banco_check.py [bancoDir] [helper ...]. Exit 1 on the first failure."""
import json, os, shutil, sys, tempfile
from pathlib import Path
KIT = Path(__file__).resolve().parents[2] / "claude-reel-editor/skills/reel-editor/compose"
banco = Path(sys.argv[1]) if len(sys.argv) > 1 else KIT / "estilos/banco"
only = sys.argv[2:]
names = [f[:-3] for f in sorted(os.listdir(banco)) if f.endswith('.py') and not f.startswith('_')] if banco.is_dir() else []
if only: names = [n for n in names if n in only]
if not names: print("banco: nenhum helper para checar"); sys.exit(0)
d = tempfile.mkdtemp(); os.chdir(d)
json.dump({"W": 1080, "H": 1920, "DUR": 8, "faceX": 980, "speaker": False, "colors": {"RED": "#E61C1C", "RED2": "#A61919", "AMB": "#FFB600", "BLK": "#000", "CRM": "#FFFAEA"}}, open("compose.json", "w"))
os.makedirs("assets"); json.dump([], open("assets/transcript.json", "w")); shutil.copytree(KIT / "sfx", "assets/sfx"); shutil.copytree(KIT / "engines", "engines")
shutil.copytree(banco, "estilos/banco"); os.makedirs("compositions", exist_ok=True)
sys.path.insert(0, str(KIT)); import kit
meta = {h['id']: h for h in json.load(open(banco / 'banco.json')).get('helpers', [])} if (banco / 'banco.json').exists() else {}
for n in names:
    fn = getattr(kit, n, None)
    assert callable(fn), f"{n}: kit não carregou o helper (estilos/banco/{n}.py precisa definir {n}())"
    out = fn('b01')
    assert isinstance(out, tuple) and len(out) == 2 and all(isinstance(x, str) for x in out), f"{n}('b01') precisa devolver (html, js), veio {type(out)}"
    assert out[0].strip(), f"{n}: html vazio"
    momento = meta.get(n, {}).get('momento')
    kit.S.clear(); kit._BANCO_USED.clear(); kit.AVISOS.clear(); kit.ERROS.clear()
    kit.scene(1, 0, 4, 'black', None, back=lambda p, d, fn=fn: fn(p), momento=momento)
    kit.scene(2, 4, 8, 'red', None, momento=None)
    kit.render()
    assert os.path.exists("index.html") and os.path.exists("compositions/b01.html"), f"{n}: render() não escreveu index.html"
    assert not any('no banco' in a and 'cena 1' in a for a in kit.AVISOS), f"{n}: o render não reconheceu o uso do helper: {kit.AVISOS}"
    print(f"banco: {n} ok ({momento or 'sem momento'})")
print(f"banco: {len(names)} helper(s) ok")
