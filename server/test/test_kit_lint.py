"""Variety lint of compose/kit.py: it only measures what scenes.py and the generated html/js contain (no Chrome, no project)."""
import json, os, re, sys, tempfile
from pathlib import Path
KIT = Path(__file__).resolve().parents[2] / "claude-reel-editor/skills/reel-editor/compose"
d = tempfile.mkdtemp(); os.chdir(d)   # kit.py reads compose.json from the cwd at import
json.dump({"W": 1080, "H": 1920, "DUR": 10, "colors": {k: "#000" for k in ("RED", "RED2", "AMB", "BLK", "CRM")}}, open("compose.json", "w"))
sys.path.insert(0, str(KIT)); import kit

assert {"giant", "pill", "counter", "lintel", "obj3d"} <= kit.KIT_HELPERS and "render" not in kit.KIT_HELPERS, sorted(kit.KIT_HELPERS)
poor = kit.lint_variety("from kit import *\nscene(1,0,10,'red',None,back=lambda p,d: giant(p,['A'],30,10,BLK))\nrender()",
                        "<div class='giant'>A</div>", 'tl.fromTo("#a",{opacity:0,y:40},{opacity:1,y:0,duration:.4,ease:"back.out"},0);tl.to("#a",{opacity:0,duration:.3},2);')
assert len(poor) == 3 and "só 1 helper" in poor[0] and "motions/" in poor[1] and "2 de 2 tweens" in poor[2], poor
rich_src = "from kit import *\n" + "".join(f"{h}(p)\n" for h in ("giant", "pill", "counter", "lintel", "slam"))
rich = kit.lint_variety(rich_src, '<div class="clip" data-composition-src="motions/count-up.html"></div>',
                        'tl.fromTo("#a",{opacity:0},{opacity:1,duration:.4},0);tl.to("#b",{rotation:12,clipPath:"inset(0)",duration:1.2},0);tl.to("#c",{skewX:4,duration:.5},1);')
assert rich == [], rich
print("kit variety lint: ok")
