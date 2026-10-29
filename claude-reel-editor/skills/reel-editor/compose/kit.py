# Biblioteca de composição do compositor "agent". O Claude escreve scenes.py (importa este módulo, chama scene(...) e render()).
# Constantes vêm de compose.json (W, H, DUR, colors, faceX). Regras: GUIDE.md. Rode: python3 scenes.py
import json, os, subprocess

CFG = json.load(open('compose.json'))
W, H, DUR = CFG['W'], CFG['H'], CFG['DUR']
u = lambda n: f"{n * (W / 100):.0f}px"          # 1cqw = 1% da largura do canvas (ex: 10.8px no 1080)
RED, RED2, AMB, BLK, CRM = (CFG['colors'][k] for k in ('RED', 'RED2', 'AMB', 'BLK', 'CRM'))
FONT = "@font-face{font-family:Aspekta;src:url('assets/fonts/font.otf');font-weight:600}"
# enquadramentos fixos do recorte (escala sobre a fonte 1920x1080, base colada no rodapé)
FR = {'M': .95, 'L': 1.2, 'XL': 1.5, 'XXL': 1.8} if H >= W else {'M': .65, 'L': .85, 'XL': 1.05, 'XXL': 1.25}
FACE_X = CFG.get('faceX', 980)
SPEAKER = CFG.get('speaker', True)   # false = reel só de motion: sem plate, sem recorte, sem câmera

ICON = {
 'fire': f'<svg viewBox="0 0 24 24" fill="{CRM}"><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z"/></svg>',
 'up': '<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
 'user': '<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
 'book': '<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.4" stroke-linejoin="round"><path d="M3 5c3-1.5 6-1.5 9 0v15c-3-1.5-6-1.5-9 0z"/><path d="M21 5c-3-1.5-6-1.5-9 0v15c3-1.5 6-1.5 9 0z"/></svg>',
 'gym': f'<svg viewBox="0 0 24 24" fill="none" stroke="{CRM}" stroke-width="2.6" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
}

def giant(p, lines, size, top, color, extra=""):
    # lines: texto ou (texto, escala em em) para linhas de tamanhos diferentes
    ls = "".join(f'<span class="ln" id="{p}-l{i}" style="font-size:{l[1] if isinstance(l, tuple) else 1}em">{l[0] if isinstance(l, tuple) else l}</span>' for i, l in enumerate(lines))
    return f'<div class="giant" id="{p}-g" data-layout-allow-overlap data-layout-allow-occlusion style="font-size:{u(size)};top:{top}%;color:{color};{extra}">{ls}</div>'

def g_in(p, n, at=0.0):
    return f'tl.fromTo([{",".join(f"\"#{p}-l{i}\"" for i in range(n))}],{{yPercent:35,scale:1.12,opacity:0}},{{yPercent:0,scale:1,opacity:1,duration:.32,ease:"power3.out",stagger:.06}},{at});'

def hit(p, at, s0=1.6):
    return f'tl.fromTo("#{p}-l0",{{scale:{s0},opacity:0}},{{scale:1,opacity:1,duration:.3,ease:"expo.out"}},{at});'

def hl(p, html, size, top, color=AMB, at=.1, k="hl"):
    # destaque na frente (B-roll / altura do peito / acima da cabeça), nunca sobre o rosto
    return (f'<div class="hl" id="{p}-{k}" style="font-size:{u(size)};top:{top}%;color:{color}">{html}</div>',
            f'tl.fromTo("#{p}-{k}",{{y:60,scale:.85,opacity:0}},{{y:0,scale:1,opacity:1,duration:.35,ease:"back.out(1.6)"}},{at});')

def pop(sel, at, frm="scale:0,rotation:-12", ease="back.out(1.8)", d=.38):
    return f'tl.fromTo("{sel}",{{{frm},opacity:0}},{{scale:1,rotation:0,x:0,y:0,opacity:1,duration:{d},ease:"{ease}"}},{at});'

def rise(sel, at, d=.4):
    return f'tl.fromTo("{sel}",{{y:90,scale:.92,opacity:0}},{{y:0,scale:1,opacity:1,duration:{d},ease:"back.out(1.5)"}},{at});'

def icon(p, k, x, y, d=20, bg=AMB):
    return f'<div class="ico" id="{p}-ico" style="left:{x}%;top:{y}%;width:{u(d)};height:{u(d)};background:{bg}">{ICON[k]}</div>'

def pill(p, txt, css, bg, fg, k="pill"):
    return f'<div class="pill" id="{p}-{k}" style="{css};background:{bg};color:{fg}">{txt}</div>'

CENTER = "left:0;right:0;margin:auto;width:max-content"

def kenburns(sel, d, s0=1.0, s1=1.12):
    return f'tl.fromTo("{sel}",{{scale:{s0}}},{{scale:{s1},duration:{d},ease:"none"}},0);'

def ladder(p, hi, bg, fg, rows, at=.05):
    # rows: 3 linhas de texto; a linha `hi` fica ativa (vermelha, pulsa)
    h = "".join(
        f'<div id="{p}-r{i}" style="padding:0 {u(2.5)};{"background:"+RED+";color:"+CRM+";border-radius:"+u(2.5)+";font-size:"+u(7.5) if i == hi else "opacity:.45"}">{r}</div>'
        for i, r in enumerate(rows))
    js = rise(f"#{p}-card", at) + "".join(f'tl.fromTo("#{p}-r{i}",{{x:-40,opacity:0}},{{x:0,opacity:{1 if i == hi else .45},duration:.25,ease:"power2.out"}},{at + .2 + i * .12:.2f});' for i in range(3))
    js += f'tl.fromTo("#{p}-r{hi}",{{scale:1}},{{scale:1.08,duration:.18,yoyo:true,repeat:1,ease:"power2.out"}},{at + .7:.2f});'
    return f'<div class="card" id="{p}-card" style="left:14%;right:14%;top:11%;padding:{u(3.5)} {u(4)};background:{bg};color:{fg};font-size:{u(5)};line-height:2.1">{h}</div>', js

# Cada cena: n, início, fim, fundo, câmera(enquadramento, modo, final), back(p,d)->(html,js), front(p,d)->(html,js), sons[(nome, atraso, volume)]
# fundo: foot | red | amber | black | cream | broll ; câmera: None (recorte some) ou (M|L|XL|XXL, hold|snap|push|shake, final)
S = []
def scene(n, a, b, bg, cam, back=None, front=None, sfx=(), cta=False):
    # cta=True marca a cena do call to action: o lint exige locutor XXL nela
    S.append(dict(n=n, a=a, b=b, bg=bg, cam=cam, back=back, front=front, sfx=sfx, cta=cta))

def both(*parts):
    return "".join(x[0] for x in parts), "".join(x[1] for x in parts)

# Cada cena: n, início, fim, fundo, câmera(enquadramento, modo, final), back(p,d) -> (html, js), front(p,d) -> (html, js), sons
# fundo: foot = vídeo desfocado + véu | red/amber/black/cream = sólido | broll = a frente cobre tudo e o recorte some
# câmera: enquadramento M|L|XL; modo hold | snap (de 'final' para o enquadramento em .45s) | push (zoom lento até 'final' x) | shake
def counter(p, d):
    nums = [0, 20, 50, 80, 110, 140, 170, 190, 200]
    strip = "".join(f'<div class="cn">+{x}</div>' for x in nums)
    html = f'<div class="giant" id="{p}-g" data-layout-allow-overlap data-layout-allow-occlusion data-layout-allow-overflow style="top:10.4%;height:{u(42 * .84)};overflow:hidden;color:{AMB};font-size:{u(42)}"><div id="{p}-strip">{strip}</div></div>'
    # a tira de números rola até o +200, que cai no "200" falado (48.31s)
    js = f'tl.fromTo("#{p}-strip",{{y:0}},{{y:-{(len(nums) - 1) * 42 * 10.8 * .84:.0f},duration:1.45,ease:"power2.inOut"}},.05);'
    js += f'tl.fromTo("#{p}-g",{{scale:1}},{{scale:1.08,duration:.16,yoyo:true,repeat:1}},1.5);'
    return html, js

# Regras do locutor (GUIDE.md §3 a §5). Erro = o cliente proíbe; aviso = pede revisão nas folhas de contato.
MODOS = ('hold', 'snap', 'push', 'shake')
ERROS, AVISOS = [], []

def erro(msg): ERROS.append(msg)
def aviso(msg): AVISOS.append(msg)

def lint_static():
    for s in S:
        n, cam = s['n'], s['cam']
        if cam:
            fr, mode, fin = cam
            if fr not in FR or fin not in FR or mode not in MODOS:
                erro(f'cena {n}: câmera {cam} inválida (enquadramentos {list(FR)}, modos {list(MODOS)})')
                continue
            if s['bg'] == 'broll': erro(f'cena {n}: fundo broll com locutor: o recorte some, use câmera None')
            if mode == 'hold' and s['b'] - s['a'] > 4: aviso(f'cena {n}: {s["b"] - s["a"]:.1f} s com locutor parado; divida em duas com enquadramentos diferentes')
        if s['cta'] and not (cam and cam[0] == 'XXL'): erro(f'cena {n}: CTA exige locutor XXL')
    for x, y in zip(S, S[1:]):
        if x['cam'] and y['cam'] and x['cam'][0] == y['cam'][0]:
            aviso(f'cenas {x["n"]} e {y["n"]}: mesmo enquadramento {x["cam"][0]} em cenas vizinhas (alterne XL, L, M)')

def render():
    # sanidade: cenas encostadas cobrindo 0..DUR
    for x, y in zip(S, S[1:]):
        assert abs(x['b'] - y['a']) < 1e-6, (x['n'], y['n'])
    assert S[0]['a'] == 0 and abs(S[-1]['b'] - DUR) < 1e-6
    ERROS.clear(); AVISOS.clear()
    lint_static()
    if ERROS: raise AssertionError('\n'.join(ERROS))

    STYLE = FONT + """
    #root{position:absolute;inset:0;font-family:Aspekta,Montserrat,sans-serif;font-weight:600;overflow:hidden}
    #root *{box-sizing:border-box}
    .bgfill{position:absolute;inset:0}
    .giant{position:absolute;left:-2%;right:-2%;text-align:center;line-height:.84;letter-spacing:-.045em;text-transform:uppercase}
    .ln{display:block}
    .cn{line-height:.84;height:.84em}
    .hl{position:absolute;left:4%;right:4%;text-align:center;line-height:.9;letter-spacing:-.03em;text-transform:uppercase;text-shadow:0 9px 32px rgba(0,0,0,.7)}
    .card{position:absolute;border-radius:48px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
    img.card{display:block}
    .tema{width:@0@;aspect-ratio:333/417;object-fit:cover}
    .dp{width:50%;height:21%;object-fit:cover;object-position:top}
    .pill{position:absolute;border-radius:50px;padding:@1@ @2@;font-size:@3@;white-space:nowrap}
    .ico{position:absolute;display:grid;place-items:center;border-radius:50%;box-shadow:0 18px 40px rgba(0,0,0,.3)}
    .ico svg{width:55%;height:55%}
    .row{display:flex;align-items:center;gap:@4@}
    .chk{display:inline-block;color:#FFB600}
    .dash{border-left:9px dashed #E61C1C;height:@5@;margin-left:@6@;transform-origin:50% 0}
    .full{position:absolute;inset:0;overflow:hidden}
    .cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .shade{position:absolute;inset:0;background:linear-gradient(transparent 45%,rgba(0,0,0,.85))}
    .mural{position:absolute;left:-25%;top:-10%;width:150%;display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
    .mural img{width:100%;border-radius:32px;display:block}
    """.replace('@0@', u(32)).replace('@1@', u(1.6)).replace('@2@', u(4.5)).replace('@3@', u(4.6)).replace('@4@', u(2.4)).replace('@5@', u(2.4)).replace('@6@', u(1.6))

    def comp(cid, body, js):
        return f"""<template>
    <style>{STYLE}</style>
    <div id="root" data-composition-id="{cid}" data-width="{W}" data-height="{H}">
    {body}
    </div>
    <script>
    {EASES}
    const tl = gsap.timeline({{ paused: true }});
    {js}
    window.__timelines = window.__timelines || {{}}; window.__timelines["{cid}"] = tl;
    </script>
    </template>
    """

    BGS = {'foot': 'background:rgba(0,0,0,.6)', 'red': f'background:radial-gradient(120% 80% at 50% 30%,{RED},{RED2})', 'amber': f'background:{AMB}',
           'black': 'background:#000', 'cream': f'background:{CRM}', 'broll': 'background:#000'}
    os.makedirs('compositions', exist_ok=True)
    for f in os.listdir('compositions'):
        os.remove(os.path.join('compositions', f))
    hosts, sfx_tags, cam = [], [], []
    fx_n = 0
    SFXLEN = {k: v['duration'] for k, v in json.load(open('assets/sfx/manifest.json')).items()}
    for s in S:
        n, a, b = s['n'], s['a'], s['b']; d = round(b - a, 3)
        for kind in ('b', 's'):
            cid = f"{kind}{n:02d}"
            if kind == 'b':
                h, js = s['back'](cid, d) if s['back'] else ("", "")
                body = f'<div class="bgfill" style="{BGS[s["bg"]]}"></div>' + h
            else:
                if not s['front']:
                    continue
                body, js = s['front'](cid, d)
            if 'text-stroke' in body: erro(f'cena {n}: -webkit-text-stroke para forçar texto na frente do corpo; use back')
            if kind == 's' and 'class="giant"' in body: erro(f'cena {n}: tipografia gigante em front; use back, atrás do locutor')
            open(f'compositions/{cid}.html', 'w').write(comp(cid, body, js))
            z, track = (2, 1 + n % 2) if kind == 'b' else (4, 4 + n % 2)
            hosts.append(f'<div id="{cid}" data-composition-id="{cid}" data-composition-src="compositions/{cid}.html" data-start="{a}" data-duration="{d}" data-track-index="{track}" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:{z}"></div>')
        for i, (name, off, vol) in enumerate(s['sfx']):
            fx_n += 1  # trilhas 9..14 em rodízio global: efeitos vizinhos nunca dividem a mesma trilha
            sfx_tags.append(f'<audio id="fx{n:02d}{i}" class="clip" src="assets/sfx/{name}.mp3" data-start="{a + off:.2f}" data-duration="{min(SFXLEN[name], DUR - a - off):.2f}" data-track-index="{9 + fx_n % 6}" data-volume="{vol}"></audio>')
        # câmera do recorte: escala fixa por enquadramento, origem no rosto/base (regra 1 e 2)
        if s['cam']:
            fr, mode, fin = s['cam']
            cs = FR[fr]
            cam.append(f'tl.set("#ccam",{{opacity:1,x:0,scale:{FR[fin] if mode == "snap" else cs:.3f}}},{a});')
            if mode == 'snap':
                cam.append(f'tl.to("#ccam",{{scale:{cs:.3f},duration:.45,ease:"expo.out"}},{a + .02:.2f});')
            elif mode == 'push':
                cam.append(f'tl.to("#ccam",{{scale:{cs * fin:.3f},duration:{d - .05:.2f},ease:"sine.inOut"}},{a + .02:.2f});')
            elif mode == 'shake':
                cam.append(f'tl.fromTo("#ccam",{{x:-22}},{{x:0,duration:.45,ease:"elastic.out(1.2,0.25)"}},{a + .55:.2f});')
        else:
            cam.append(f'tl.set("#ccam",{{opacity:0}},{a});')

    cam = cam if SPEAKER else []
    pcam_js = 'tl.set("#pcam", { scale:1.12 }, 0);' if SPEAKER else ''
    speaker_html = (f"""
      <div id="pcam" style="z-index:1"><video id="plate" class="clip" src="assets/plate.mp4" data-start="0" data-duration="{DUR}" data-track-index="0" muted playsinline></video></div>
      <div id="ccam" style="z-index:3"><video id="cut" class="clip" src="assets/cut.webm" data-start="0" data-duration="{DUR}" data-track-index="3" muted playsinline data-layout-allow-occlusion data-layout-allow-overflow></video></div>
""" if SPEAKER else '')
    open('index.html', 'w').write(f"""<!doctype html>
    <html lang="pt-BR" data-resolution="{'landscape' if W > H else 'portrait'}">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width={W}, height={H}">
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    html, body {{ width:{W}px; height:{H}px; overflow:hidden; background:#000; }}
    #root {{ position:relative; width:100%; height:100%; background:#000; }}
    #pcam {{ position:absolute; inset:0; }}
    #pcam video {{ position:absolute; left:0; top:0; width:{W}px; height:{H}px; object-fit:cover; }}
    /* recorte em largura inteira (1920x1080): rosto (x={FACE_X}) no centro da tela, base no rodapé; escala a partir desse ponto */
    #ccam {{ position:absolute; left:{W // 2 - FACE_X}px; top:{H - 1080}px; width:1920px; height:1080px; transform-origin:{FACE_X}px 1080px; }}
    #ccam video {{ position:absolute; inset:0; width:1920px; height:1080px; }}
    </style>
    </head>
    <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="{W}" data-height="{H}">
      {speaker_html}
      {(chr(10) + '  ').join(hosts)}
      <audio id="voice" class="clip" src="assets/voice.m4a" data-start="0" data-duration="{DUR}" data-track-index="8" data-volume="1"></audio>
      {(chr(10) + '  ').join(sfx_tags)}
    </div>
    <script>
    const tl = gsap.timeline({{ paused: true }});
    {pcam_js}
    {chr(10).join(cam)}
    window.__timelines = window.__timelines || {{}}; window.__timelines["main"] = tl;
    </script>
    </body>
    </html>
    """)
    print(len(S), "cenas,", len(hosts), "hosts,", len(sfx_tags), "sons")
    json.dump([dict(n=s['n'], a=s['a'], b=s['b'], bg=s['bg'], cam=s['cam'], cta=s['cta']) for s in S], open('scenes.json', 'w'), indent=1)
    for m in AVISOS: print('aviso:', m)
    if ERROS: raise AssertionError('\n'.join(ERROS))
    # medição no Chrome (layout_check.mjs): caixas de texto, zonas seguras, rosto e cobertura pela cabeça
    check = CFG.get('layoutCheck')
    if SPEAKER and check and os.path.exists(check):
        r = subprocess.run(['node', check, '.'], capture_output=True, text=True)
        print(r.stdout, end='')
        if r.returncode == 2: print('aviso: checagem de layout não rodou:', r.stderr.strip()[-300:])
        elif r.returncode: raise AssertionError('checagem de layout reprovou (ver acima); corrija as cenas e rode de novo')


# =====================================================================================================================
# Estilos prontos, portados dos prompts testados da biblioteca awesome-opus-5-5-video-prompts (ver STYLES no GUIDE).
# Cada helper devolve (html, js) como giant/g_in e entra num back/front com both(...). `at` é relativo ao início da cena.
# Medidas em px no quadro 1080x1920, dentro das zonas seguras (topo 200, base 380, laterais 70). `k` separa duas
# instâncias do mesmo helper na mesma cena.
# =====================================================================================================================
import math, re

AO = 'data-layout-allow-overlap data-layout-allow-occlusion'
MONO = "ui-monospace,'SF Mono',Menlo,monospace"
# curvas no script de cada cena: ONE = cubic-bezier(.45,0,.15,1), a curva única dos morphs; CD = assentamento
# criticamente amortecido (o que pousa); SQ = raiz (inundação: a área cresce por igual)
EASES = ("const ONE=p=>{if(p<=0)return 0;if(p>=1)return 1;let u=p;for(let i=0;i<8;i++){u-=(((1.9*u-2.25)*u+1.35)*u-p)/((5.7*u-4.5)*u+1.35)}return u*u*(3-2*u)};"
         "const CD=p=>(1-(1+7*p)*Math.exp(-7*p))/0.992705;const SQ=p=>Math.sqrt(p);")


def _x(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _fit(size, n, avail=940, adv=.64):
    # tamanho (em u) que cabe em `avail` px com n caracteres de largura média `adv` em
    return min(size, avail / max(n, 1) / adv / 10.8)


# ---------- tipografia estrutural (Build the Floor): palavras com papel físico ----------

def phrase(p, text, top, size=6.5, color=CRM, at=0.0, step=.35, k='ph', css=''):
    # frase que sobe por uma máscara, um grupo por vez (separe os grupos com |), na ordem de leitura
    groups = [g.strip() for g in text.split('|')]
    spans = ''.join(f'<span style="display:inline-block;overflow:hidden;vertical-align:top;padding:0 .12em .1em">'
                    f'<span id="{p}-{k}{i}" style="display:inline-block">{_x(g)}</span></span>' for i, g in enumerate(groups))
    html = f'<div id="{p}-{k}" {AO} style="position:absolute;left:70px;right:70px;top:{top:.0f}px;text-align:center;font-size:{u(size)};line-height:1.05;color:{color};{css}">{spans}</div>'
    js = ''.join(f'tl.fromTo("#{p}-{k}{i}",{{yPercent:115}},{{yPercent:0,duration:.5,ease:CD}},{at + i * step:.2f});' for i in range(len(groups)))
    return html, js


def lintel(p, big, line, size=30, top=200, gap=300, press=80, at=0.0, d=2.4, color=CRM, rule=AMB, lsize=6.2, k='lt'):
    # palavra-viga gigante que desce devagar e aperta a frase numa fresta (pressão vem do layout, não de tremida)
    size = _fit(size, len(big), 1040, .62)
    hb = .84 * size * 10.8
    rule_y = top + hb + gap
    ph, pj = phrase(p, line, top + hb + gap / 2, lsize, color, at + .35, k=k + 'p', css='transform:translateY(-50%)')
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:-10%;right:-10%;top:{top}px;text-align:center;font-size:{u(size)};line-height:.84;letter-spacing:-.045em;text-transform:uppercase;white-space:nowrap;color:{color}">{_x(big)}</div>'
            f'<div id="{p}-{k}r" style="position:absolute;left:70px;right:70px;top:{rule_y:.0f}px;height:8px;background:{rule}"></div>'
            f'<div id="{p}-{k}w" style="position:absolute;inset:0">{ph}</div>')
    js = (f'tl.fromTo("#{p}-{k}",{{yPercent:-60,opacity:0}},{{yPercent:0,opacity:1,duration:.45,ease:CD}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}r",{{scaleX:0}},{{scaleX:1,duration:.45,ease:ONE}},{at + .1:.2f});' + pj +
          f'tl.fromTo("#{p}-{k}",{{y:0}},{{y:{press},duration:{max(.4, d - .6):.2f},ease:"sine.inOut"}},{at + .5:.2f});'
          f'tl.fromTo("#{p}-{k}w",{{y:0}},{{y:{press / 2:.0f},duration:{max(.4, d - .6):.2f},ease:"sine.inOut"}},{at + .5:.2f});')
    return html, js


def hang(p, word, rest=1250, size=22, sag=26, top=200, at=0.0, color=CRM, accent=AMB, k='hg'):
    # palavra-carga descida por dois cabos até a linha de base, que verga com mola quando ela pousa
    size = _fit(size, len(word), 940)
    fs = size * 10.8; hb = .84 * fs; n = len(word); wfrac = min(1, n * .64 * fs / 940)
    off = lambda i: sag * 4 * (x := .5 + (i + .5 - n / 2) / n * wfrac) * (1 - x)       # mesma parábola da linha de base
    letters = ''.join(f'<span id="{p}-{k}{i}" style="display:inline-block">{_x(c) if c != " " else "&nbsp;"}</span>' for i, c in enumerate(word))
    line = lambda s: f'M70 {rest + 6} Q540 {rest + 6 + 2 * s:.1f} 1010 {rest + 6}'
    html = (''.join(f'<div id="{p}-{k}c{j}" style="position:absolute;left:{x}%;top:{top}px;width:3px;height:{rest - hb - top:.0f}px;background:{accent};transform-origin:50% 0"></div>' for j, x in enumerate((30, 70)))
            + f'<div style="position:absolute;left:0;right:0;top:{top}px;bottom:0;overflow:hidden">'
              f'<div id="{p}-{k}" {AO} style="position:absolute;left:-5%;right:-5%;top:{rest - hb - top:.0f}px;text-align:center;font-size:{u(size)};line-height:.84;letter-spacing:-.045em;text-transform:uppercase;white-space:nowrap;color:{color}">{letters}</div></div>'
            + f'<svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" viewBox="0 0 1080 1920"><path id="{p}-{k}b" d="{line(0)}" fill="none" stroke="{accent}" stroke-width="8"/></svg>')
    js = ''.join(f'tl.fromTo("#{p}-{k}c{j}",{{scaleY:0}},{{scaleY:1,duration:.35,ease:"power2.out"}},{at:.2f});' for j in range(2))
    js += f'tl.fromTo("#{p}-{k}",{{y:{-(rest - top + 40):.0f}}},{{y:0,duration:.8,ease:CD}},{at + .25:.2f});'
    js += f'tl.fromTo("#{p}-{k}b",{{attr:{{d:"{line(0)}"}}}},{{attr:{{d:"{line(sag)}"}},duration:1.1,ease:"elastic.out(1,.45)"}},{at + 1.0:.2f});'
    js += ''.join(f'tl.fromTo("#{p}-{k}{i}",{{y:0}},{{y:{off(i):.1f},duration:1.1,ease:"elastic.out(1,.45)"}},{at + 1.0:.2f});' for i in range(n))
    return html, js


def column(p, word, side='left', top=1100, size=10, at=0.0, lift=0, x=None, color=CRM, k='co'):
    # palavra-suporte: sobe pela borda e gira na ponta de dentro até virar coluna com o topo em `top`; lift = empurra para cima
    left = side == 'left'; x = x if x is not None else (150 if left else 930); h = .84 * size * 10.8
    pos = f'right:{1080 - x}px;transform-origin:100% 50%' if left else f'left:{x}px;transform-origin:0% 50%'
    html = f'<div id="{p}-{k}" {AO} style="position:absolute;{pos};top:{top - h / 2:.0f}px;font-size:{u(size)};line-height:.84;letter-spacing:-.04em;text-transform:uppercase;white-space:nowrap;color:{color}">{_x(word)}</div>'
    js = (f'tl.fromTo("#{p}-{k}",{{y:{1920 - top + h:.0f},rotation:0}},{{y:0,rotation:0,duration:.5,ease:CD}},{at:.2f});'
          f'tl.to("#{p}-{k}",{{rotation:{-90 if left else 90},duration:.6,ease:ONE}},{at + .5:.2f});')
    if lift:
        js += f'tl.to("#{p}-{k}",{{y:{-lift},duration:.7,ease:CD}},{at + 1.15:.2f});'
    return html, js


def platform(p, rows, top=1000, width=760, final=None, at=0.0, color=CRM, seam=AMB, gap=16, k='pf'):
    # palavras anteriores se encaixam numa plataforma de linhas justificadas; `final` assenta em cima, na mesma largura
    x0 = (1080 - width) / 2; y = top + 14; body, js = [], ''
    body.append(f'<rect id="{p}-{k}e" x="{x0}" y="{top}" width="{width}" height="8" fill="{seam}"/>')
    grow = lambda id, t, d: f'tl.fromTo("#{id}",{{attr:{{x:540,width:0}}}},{{attr:{{x:{x0},width:{width}}},duration:{d},ease:ONE}},{t:.2f});'   # cresce do centro
    js += grow(f'{p}-{k}e', at, .5)
    for i, r in enumerate(rows):
        fs = width / max(1, len(r)) / .66; cap = .72 * fs
        body.append(f'<text id="{p}-{k}{i}" x="{x0}" y="{y + cap:.0f}" textLength="{width}" lengthAdjust="spacingAndGlyphs" font-size="{fs:.0f}" fill="{color}">{_x(r.upper())}</text>')
        js += f'tl.fromTo("#{p}-{k}{i}",{{x:{1300 if i % 2 else -1300}}},{{x:0,duration:.7,ease:CD}},{at + .1 + i * .14:.2f});'
        y += cap + gap
        if i < len(rows) - 1:
            body.append(f'<rect id="{p}-{k}s{i}" x="{x0}" y="{y - gap / 2 - 2:.0f}" width="{width}" height="4" fill="{seam}"/>')
            js += grow(f'{p}-{k}s{i}', at + .4 + i * .14, .45)
    if final:
        fs = width / max(1, len(final)) / .66; cap = .72 * fs
        body.append(f'<clipPath id="{p}-{k}m"><rect x="0" y="{top - cap - 220:.0f}" width="1080" height="{cap + 214:.0f}"/></clipPath>'
                    f'<g clip-path="url(#{p}-{k}m)"><text id="{p}-{k}f" x="{x0}" y="{top - 6}" textLength="{width}" lengthAdjust="spacingAndGlyphs" font-size="{fs:.0f}" fill="{color}">{_x(final.upper())}</text></g>')
        js += f'tl.fromTo("#{p}-{k}f",{{y:{-cap - 60:.0f}}},{{y:0,duration:.8,ease:CD}},{at + .55 + len(rows) * .14:.2f});'
    html = f'<svg {AO} viewBox="0 0 1080 1920" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;font-family:Aspekta,sans-serif;font-weight:600">{"".join(body)}</svg>'
    return html, js


def aperture(p, word, idx, cy=900, size=30, at=0.0, hold=.45, d=.75, bg=CRM, fg=BLK, k='ap'):
    # parede que cobre a tela com a palavra; o miolo da letra idx vira íris e abre para a cena. Use no início da cena:
    # cobre o corte, segura `hold` e abre (a letra escolhida fica no centro exato, então a íris nasce dentro dela)
    size = _fit(size, len(word) * 2 - 1, 1180, .62)      # a letra central fica no meio: o lado maior define a largura
    hb = .84 * size * 10.8
    mask = f'radial-gradient(circle at 50% {cy}px,transparent var(--r),#000 calc(var(--r) + 1px))'
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;inset:0;background:{bg};--r:0px;-webkit-mask:{mask};mask:{mask}">'
            f'<div style="position:absolute;left:-40%;right:-40%;top:{cy - hb / 2:.0f}px;display:grid;grid-template-columns:1fr auto 1fr;font-size:{u(size)};line-height:.84;letter-spacing:-.045em;text-transform:uppercase;white-space:nowrap;color:{fg}">'
            f'<span style="text-align:right">{_x(word[:idx])}</span><span>{_x(word[idx])}</span><span>{_x(word[idx + 1:])}</span></div></div>')
    js = (f'tl.fromTo("#{p}-{k}",{{"--r":"0px"}},{{"--r":"2300px",duration:{d},ease:"power2.in"}},{at + hold:.2f});'
          f'tl.set("#{p}-{k}",{{autoAlpha:0}},{at + hold + d:.2f});')
    return html, js


# ---------- vídeo como código (Video as Code): batidas, editor, diff, contagem, assinatura ----------

def slam(p, words, at=0.0, step=.47, size=34, top=None, color=CRM, invert=True, ibg=CRM, ifg=BLK, k='sl'):
    # uma palavra por batida, cada uma substitui a anterior; a última pode cair num quadro invertido
    size = _fit(size, max(len(w) for w in words), 940, .62)
    pos = f'top:{top}px' if top is not None else 'top:50%'
    html = (f'<div id="{p}-{k}i" style="position:absolute;inset:0;background:{ibg};visibility:hidden"></div>' if invert else '')
    html += ''.join(f'<div id="{p}-{k}{i}" {AO} style="position:absolute;left:-5%;right:-5%;{pos};text-align:center;font-size:{u(size)};line-height:.84;letter-spacing:-.045em;text-transform:uppercase;white-space:nowrap;visibility:hidden;color:{ifg if invert and i == len(words) - 1 else color}">{_x(w)}</div>' for i, w in enumerate(words))
    js, yp = '', -50 if top is None else 0
    for i in range(len(words)):
        t0 = at + i * step; last = i == len(words) - 1
        js += f'tl.set("#{p}-{k}{i}",{{autoAlpha:1}},{t0:.2f});tl.fromTo("#{p}-{k}{i}",{{yPercent:{yp},y:46,scale:1.14}},{{yPercent:{yp},y:0,scale:1,duration:.24,ease:"expo.out"}},{t0:.2f});'
        if not last:
            js += f'tl.set("#{p}-{k}{i}",{{autoAlpha:0}},{t0 + step:.2f});'
        elif invert:
            js += f'tl.set("#{p}-{k}i",{{autoAlpha:1}},{t0:.2f});'
    return html, js


_TOK = re.compile(r'\s+|"[^"]*"|\'[^\']*\'|\d+(?:\.\d+)?|[A-Za-z_]\w*|.')
_KW = {'const', 'let', 'var', 'return', 'export', 'import', 'from', 'function', 'await', 'async', 'if', 'else', 'new', 'def', 'for', 'in'}


def code(p, lines, top=300, at=0.0, cps=70, title='scene.tsx', size=3.6, accent=AMB, k='cd'):
    # editor de código com destaque de sintaxe, digitado caractere a caractere; o cursor anda junto (bordas por quadro)
    col = lambda t: accent if t in _KW else RED if t[0].isdigit() else 'rgba(255,250,234,.62)' if t[0] in '"\'' else CRM if t[0].isalpha() or t[0] == '_' else 'rgba(255,250,234,.45)'
    rows, js, n = [], '', 0
    for ln in lines:
        cells = ''
        for tok in _TOK.findall(ln):
            for ch in tok:
                cells += f'<span id="{p}-{k}{n}" style="visibility:hidden;color:{col(tok)};border-right:.12em solid transparent;margin-right:-.12em">{_x(ch) if ch != " " else "&nbsp;"}</span>'
                js += f'tl.set("#{p}-{k}{n}",{{visibility:"visible",borderRightColor:"{accent}"}},{at + .3 + n / cps:.3f});'
                if n:
                    js += f'tl.set("#{p}-{k}{n - 1}",{{borderRightColor:"transparent"}},{at + .3 + n / cps:.3f});'
                n += 1
        rows.append(f'<div style="min-height:1.6em;white-space:pre">{cells}</div>')
    dots = ''.join(f'<i style="display:inline-block;width:22px;height:22px;border-radius:50%;margin-right:12px;background:{c}"></i>' for c in (RED, AMB, 'rgba(255,250,234,.3)'))
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:70px;right:70px;top:{top}px;padding:44px 48px 52px;border-radius:36px;background:#141419;box-shadow:0 30px 80px rgba(0,0,0,.45);font-family:{MONO};font-size:{u(size)};line-height:1.6;color:{CRM}">'
            f'<div style="display:flex;align-items:center;margin-bottom:28px;font-size:.78em;color:rgba(255,250,234,.5)">{dots}<span style="margin-left:10px">{_x(title)}</span></div>{"".join(rows)}</div>')
    js = f'tl.fromTo("#{p}-{k}",{{y:80,opacity:0}},{{y:0,opacity:1,duration:.4,ease:CD}},{at:.2f});' + js
    return html, js


def diff(p, rows, top=360, at=0.0, step=.2, size=4.2, title=None, k='df'):
    # linhas de diff entrando uma a uma: "+ ..." em âmbar, "- ..." em vermelho, "  ..." neutra
    style = {'+': (AMB, 'rgba(255,182,0,.14)'), '-': (RED, 'rgba(230,28,28,.16)')}
    h = f'<div style="font-size:.72em;color:rgba(255,250,234,.5);margin-bottom:22px">{_x(title)}</div>' if title else ''
    for i, r in enumerate(rows):
        fg, bg = style.get(r[:1], (CRM, 'transparent'))
        h += f'<div id="{p}-{k}{i}" style="padding:10px 26px;margin:8px 0;border-radius:14px;white-space:pre;background:{bg};color:{fg}">{_x(r)}</div>'
    html = f'<div {AO} style="position:absolute;left:70px;right:70px;top:{top}px;font-family:{MONO};font-size:{u(size)}">{h}</div>'
    js = ''.join(f'tl.fromTo("#{p}-{k}{i}",{{x:-40,opacity:0}},{{x:0,opacity:1,duration:.3,ease:CD}},{at + i * step:.2f});' for i in range(len(rows)))
    return html, js


def count(p, start, end, top=700, size=34, at=0.0, dur=1.2, prefix='', suffix='', color=CRM, mono=False, fps=30, k='ct'):
    # número que conta com valores fixos por quadro (determinístico) e pousa com um pulso
    num = lambda v: '\u2060' + f'{_x(prefix)}{v:,}{_x(suffix)}'.replace(',', '.')   # milhar com ponto (pt-BR); o \u2060 invisível impede o GSAP de ler "1.250" como o número 1.25
    size = _fit(size, len(num(end)), 940, .62)
    fam = f'font-family:{MONO};' if mono else ''
    html = f'<div id="{p}-{k}" {AO} style="position:absolute;left:0;right:0;top:{top}px;text-align:center;{fam}font-size:{u(size)};line-height:.9;letter-spacing:-.04em;font-variant-numeric:tabular-nums;white-space:nowrap;color:{color}">{num(start)}</div>'
    n = max(1, round(dur * fps))
    js = f'tl.fromTo("#{p}-{k}",{{y:40,opacity:0}},{{y:0,opacity:1,duration:.3,ease:CD}},{at:.2f});'
    for f in range(n + 1):
        v = round(start + (end - start) * (1 - math.cos(math.pi * f / n)) / 2)
        js += f'tl.set("#{p}-{k}",{{textContent:"{num(v)}"}},{at + f / fps:.3f});'
    js += f'tl.fromTo("#{p}-{k}",{{scale:1}},{{scale:1.07,duration:.16,yoyo:true,repeat:1,ease:"power2.out"}},{at + dur:.2f});'
    return html, js


def braces(p, title, sub=None, top=820, size=12, at=0.0, color=CRM, accent=AMB, k='br'):
    # assinatura: { TÍTULO } com as chaves fechando em volta do título medido (mesma linha flex, nunca sobrepõe)
    size = _fit(size, len(title) + 3, 940, .62)
    html = (f'<div {AO} style="position:absolute;left:0;right:0;top:{top}px;display:flex;justify-content:center;align-items:center;gap:.25em;font-size:{u(size)};line-height:1;text-transform:uppercase;letter-spacing:-.04em;white-space:nowrap;color:{color}">'
            f'<span id="{p}-{k}l" style="display:inline-block;font-family:{MONO};font-size:1.5em;color:{accent}">{{</span>'
            f'<span id="{p}-{k}t" style="display:inline-block">{_x(title)}</span>'
            f'<span id="{p}-{k}r" style="display:inline-block;font-family:{MONO};font-size:1.5em;color:{accent}">}}</span></div>')
    js = (f'tl.fromTo("#{p}-{k}l",{{x:-500}},{{x:0,duration:.5,ease:"expo.out"}},{at:.2f});tl.fromTo("#{p}-{k}r",{{x:500}},{{x:0,duration:.5,ease:"expo.out"}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}t",{{scale:.92,opacity:0}},{{scale:1,opacity:1,duration:.5,ease:"expo.out"}},{at:.2f});')
    if sub:
        sh, sj = typeline(p, sub, top + size * 10.8 * 1.6, 3.8, 'rgba(255,250,234,.6)', at + .7, k=k + 's')
        html += sh; js += sj
    return html, js


def typeline(p, text, top, size=3.8, color=CRM, at=0.0, cps=32, k='ty'):
    # uma linha monoespaçada digitada (comando de terminal, URL, legenda técnica)
    cells = ''.join(f'<span id="{p}-{k}{i}" style="visibility:hidden">{_x(c) if c != " " else "&nbsp;"}</span>' for i, c in enumerate(text))
    html = f'<div {AO} style="position:absolute;left:70px;right:70px;top:{top:.0f}px;text-align:center;font-family:{MONO};font-size:{u(size)};white-space:nowrap;color:{color}">{cells}</div>'
    js = ''.join(f'tl.set("#{p}-{k}{i}",{{visibility:"visible"}},{at + i / cps:.3f});' for i in range(len(text)))
    return html, js


# ---------- UI que se transforma (One Object): um objeto só, íris, inundação, vidro, botão, toggle ----------

def morph(p, states, at=0.0, hold=.55, move=.5, cx=540, cy=960, k='mo'):
    # um objeto que nunca corta: cada estado {w,h,r,bg,html} nasce do anterior na curva ONE; o conteúdo sobe por máscara.
    # A cor nova inunda a partir do centro (sem interpolar cores, que passaria por um cinza barrento)
    s0 = states[0]
    fills = ''.join(f'<div id="{p}-{k}f{i}" style="position:absolute;inset:0;background:{s["bg"]};clip-path:circle({"150%" if i == 0 else "0%"} at 50% 50%)"></div>' for i, s in enumerate(states))
    layers = ''.join(f'<div id="{p}-{k}c{i}" style="position:absolute;inset:0;display:grid;place-items:center;visibility:hidden">{s.get("html", "")}</div>' for i, s in enumerate(states))
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx}px;top:{cy}px;width:{s0["w"]}px;height:{s0["h"]}px;border-radius:{s0["r"]}px;overflow:hidden">{fills}{layers}</div>')
    js = f'tl.set("#{p}-{k}",{{xPercent:-50,yPercent:-50}},0);'
    T = [at + i * (hold + move) for i in range(len(states))]
    for i, s in enumerate(states):
        if i:
            js += f'tl.to("#{p}-{k}",{{width:{s["w"]},height:{s["h"]},borderRadius:{s["r"]},duration:{move},ease:ONE}},{T[i] - move:.2f});'
            if s['bg'] != states[i - 1]['bg']:
                js += f'tl.fromTo("#{p}-{k}f{i}",{{clipPath:"circle(0% at 50% 50%)"}},{{clipPath:"circle(150% at 50% 50%)",duration:{move},ease:SQ}},{T[i] - move:.2f});'
            else:
                js += f'tl.set("#{p}-{k}f{i}",{{clipPath:"circle(150% at 50% 50%)"}},{T[i] - move:.2f});'
        js += f'tl.set("#{p}-{k}c{i}",{{autoAlpha:1}},{max(0, T[i] - .12):.2f});tl.fromTo("#{p}-{k}c{i}",{{yPercent:100}},{{yPercent:0,duration:.4,ease:CD}},{max(0, T[i] - .12):.2f});'
        if i < len(states) - 1:
            js += f'tl.to("#{p}-{k}c{i}",{{yPercent:-100,duration:.22,ease:"power2.in"}},{T[i + 1] - move - .05:.2f});tl.set("#{p}-{k}c{i}",{{autoAlpha:0}},{T[i + 1] - move + .17:.2f});'
    return html, js


def iris(p, inner, cx=540, cy=960, at=0.0, d=.9, k='ir'):
    # camada de tela cheia revelada por um círculo que cresce de um ponto; o conteúdo já está onde vai ficar
    html = f'<div id="{p}-{k}" {AO} style="position:absolute;inset:0;overflow:hidden;clip-path:circle(0px at {cx}px {cy}px)">{inner}</div>'
    js = f'tl.fromTo("#{p}-{k}",{{clipPath:"circle(0px at {cx}px {cy}px)"}},{{clipPath:"circle(2300px at {cx}px {cy}px)",duration:{d},ease:ONE}},{at:.2f});'
    return html, js


def flood(p, color, cx=540, cy=960, at=0.0, d=.8, k='fl'):
    # a cor inunda a tela a partir de um ponto com área crescendo por igual (raio na raiz do tempo), sem degradê no meio
    html = f'<div id="{p}-{k}" {AO} style="position:absolute;inset:0;background:{color};clip-path:circle(0px at {cx}px {cy}px)"></div>'
    js = f'tl.fromTo("#{p}-{k}",{{clipPath:"circle(0px at {cx}px {cy}px)"}},{{clipPath:"circle(2300px at {cx}px {cy}px)",duration:{d},ease:SQ}},{at:.2f});'
    return html, js


def glass(p, inner, cx=540, cy=1200, w=760, h=300, at=0.0, rise=320, k='gl'):
    # vidro líquido: nasce como gota que sobe e abre no painel (desfoque do que está atrás, tinta branca, brilho e borda)
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx}px;top:{cy}px;width:86px;height:86px;border-radius:43px;overflow:hidden;'
            f'backdrop-filter:blur(26px) saturate(1.5);-webkit-backdrop-filter:blur(26px) saturate(1.5);background:rgba(255,255,255,.16);'
            f'box-shadow:inset 0 0 0 2px rgba(255,255,255,.55),0 24px 60px rgba(0,0,0,.25)">'
            f'<div style="position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.34),rgba(255,255,255,0) 45%)"></div>'
            f'<div id="{p}-{k}c" style="position:absolute;inset:0;display:grid;place-items:center;visibility:hidden">{inner}</div></div>')
    js = (f'tl.set("#{p}-{k}",{{xPercent:-50,yPercent:-50}},0);'
          f'tl.fromTo("#{p}-{k}",{{y:{rise},opacity:0}},{{y:0,opacity:1,duration:.45,ease:CD}},{at:.2f});'
          f'tl.to("#{p}-{k}",{{width:{w},height:{h},borderRadius:44,duration:.5,ease:ONE}},{at + .45:.2f});'
          f'tl.set("#{p}-{k}c",{{autoAlpha:1}},{at + .8:.2f});tl.fromTo("#{p}-{k}c",{{yPercent:100}},{{yPercent:0,duration:.4,ease:CD}},{at + .8:.2f});')
    return html, js


def pay(p, label, cx=540, cy=1300, at=0.0, bg=BLK, fg=CRM, ok=AMB, k='pb'):
    # botão que nasce com mola, é tocado, vira loader e termina num check (2,7 s)
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx}px;top:{cy}px;width:540px;height:136px;border-radius:68px;background:{bg};color:{fg};display:grid;place-items:center;overflow:hidden;font-size:{u(5)}">'
            f'<div id="{p}-{k}f" style="position:absolute;inset:0;background:{ok};clip-path:circle(0% at 50% 50%)"></div>'
            f'<span id="{p}-{k}t" style="display:inline-block;white-space:nowrap">{_x(label)}</span>'
            f'<svg id="{p}-{k}s" viewBox="0 0 64 64" style="position:absolute;width:64px;height:64px;visibility:hidden"><circle cx="32" cy="32" r="24" fill="none" stroke="{fg}" stroke-width="6" stroke-linecap="round" stroke-dasharray="100 200"/></svg>'
            f'<svg viewBox="0 0 64 64" style="position:absolute;width:64px;height:64px"><path id="{p}-{k}k" d="M18 33l9 9 19-21" fill="none" stroke="{BLK if ok != BLK else CRM}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60" stroke-dashoffset="60"/></svg></div>')
    js = (f'tl.set("#{p}-{k}",{{xPercent:-50,yPercent:-50}},0);'
          f'tl.fromTo("#{p}-{k}",{{scale:0}},{{scale:1,duration:.45,ease:"back.out(1.7)"}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}",{{scale:1}},{{scale:.94,duration:.1,yoyo:true,repeat:1,ease:"power2.out"}},{at + .9:.2f});'
          f'tl.to("#{p}-{k}t",{{yPercent:140,duration:.2,ease:"power2.in"}},{at + 1.05:.2f});'
          f'tl.to("#{p}-{k}",{{width:136,duration:.4,ease:ONE}},{at + 1.1:.2f});'
          f'tl.set("#{p}-{k}s",{{autoAlpha:1}},{at + 1.4:.2f});tl.fromTo("#{p}-{k}s",{{rotation:0}},{{rotation:540,duration:.7,ease:"none"}},{at + 1.4:.2f});'
          f'tl.set("#{p}-{k}s",{{autoAlpha:0}},{at + 2.1:.2f});tl.to("#{p}-{k}",{{width:120,height:120,borderRadius:60,duration:.3,ease:ONE}},{at + 2.1:.2f});'
          f'tl.to("#{p}-{k}f",{{clipPath:"circle(80% at 50% 50%)",duration:.3,ease:SQ}},{at + 2.1:.2f});'
          f'tl.to("#{p}-{k}k",{{strokeDashoffset:0,duration:.35,ease:"power2.out"}},{at + 2.2:.2f});'
          f'tl.fromTo("#{p}-{k}",{{scale:1}},{{scale:1.12,duration:.14,yoyo:true,repeat:1,ease:"power2.out"}},{at + 2.5:.2f});')
    return html, js


def toggle(p, label, cx=540, cy=1300, at=0.0, on=.7, track=BLK, on_color=AMB, fg=CRM, k='tg'):
    # toggle que liga na batida: rótulo à esquerda, trilho à direita; o botão estica no caminho (a borda da frente sai antes)
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx}px;top:{cy}px;display:flex;align-items:center;gap:44px;font-size:{u(5)};color:{fg};white-space:nowrap">'
            f'<div style="overflow:hidden;padding-bottom:.08em"><span id="{p}-{k}t" style="display:inline-block">{_x(label)}</span></div>'
            f'<div id="{p}-{k}r" style="position:relative;flex:0 0 260px;height:140px;border-radius:70px;background:{track};box-shadow:inset 0 0 0 3px rgba(255,250,234,.18);overflow:hidden">'
            f'<div id="{p}-{k}f" style="position:absolute;inset:0;background:{on_color};clip-path:circle(0px at 190px 70px)"></div>'
            # o botão é uma faixa recortada por clip-path: cada borda é uma variável com seu próprio tempo (sem animar left/right)
            f'<div id="{p}-{k}k" style="position:absolute;inset:0;background:{fg};--l:16px;--r:136px;clip-path:inset(16px var(--r) 16px var(--l) round 54px)"></div></div></div>')
    js = (f'tl.set("#{p}-{k}",{{xPercent:-50,yPercent:-50}},0);'
          f'tl.fromTo("#{p}-{k}",{{scale:.7,opacity:0}},{{scale:1,opacity:1,duration:.4,ease:CD}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}t",{{yPercent:110}},{{yPercent:0,duration:.45,ease:CD}},{at + .15:.2f});'
          f'tl.to("#{p}-{k}k",{{"--r":"16px",duration:.28,ease:"back.out(1.15)"}},{at + on:.2f});'
          f'tl.to("#{p}-{k}k",{{"--l":"136px",duration:.42,ease:"back.out(1.15)"}},{at + on:.2f});'
          f'tl.to("#{p}-{k}f",{{clipPath:"circle(300px at 190px 70px)",duration:.35,ease:SQ}},{at + on + .05:.2f});')
    return html, js


# ---------- mais da biblioteca: abas líquidas, ilha dinâmica, toast, ⌘K, widget, split-flap, contorno, bento, abertura ----------

def tabs(p, labels, steps, cx=540, cy=1300, w=940, at=0.0, bg='rgba(255,250,234,.12)', ind=AMB, fg=CRM, afg=BLK, k='tb'):
    # abas com indicador líquido: a borda da frente chega antes da de trás, então ele estica no caminho e volta
    # steps: [(índice, tempo relativo a at)], o indicador começa na aba 0
    n = len(labels); cw = (w - 16) / n
    L = lambda j: 8 + j * cw; R = lambda j: w - 8 - (j + 1) * cw
    lab = ''.join(f'<div id="{p}-{k}l{i}" style="flex:1;text-align:center;position:relative;color:{afg if i == 0 else fg}">{_x(t)}</div>' for i, t in enumerate(labels))
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx}px;top:{cy}px;width:{w}px;height:128px;border-radius:64px;background:{bg}">'
            f'<div id="{p}-{k}i" style="position:absolute;inset:0;background:{ind};--l:{L(0):.0f}px;--r:{R(0):.0f}px;clip-path:inset(8px var(--r) 8px var(--l) round 56px)"></div>'
            f'<div style="position:absolute;inset:0;display:flex;align-items:center;font-size:{u(4.2)}">{lab}</div></div>')
    js = (f'tl.set("#{p}-{k}",{{xPercent:-50,yPercent:-50}},0);'
          f'tl.fromTo("#{p}-{k}",{{y:60,opacity:0}},{{y:0,opacity:1,duration:.4,ease:CD}},{at:.2f});')
    cur = 0
    for j, t in steps:
        lead, trail = ('right', 'left') if j > cur else ('left', 'right')
        edge = lambda side: f'"--{side[0]}":"{(R(j) if side == "right" else L(j)):.0f}px"'
        js += (f'tl.to("#{p}-{k}i",{{{edge(lead)},duration:.3,ease:"back.out(1.15)"}},{at + t:.2f});'
               f'tl.to("#{p}-{k}i",{{{edge(trail)},duration:.5,ease:"back.out(1.15)"}},{at + t:.2f});'
               f'tl.set("#{p}-{k}l{cur}",{{color:"{fg}"}},{at + t + .1:.2f});tl.set("#{p}-{k}l{j}",{{color:"{afg}"}},{at + t + .15:.2f});')   # troca seca quando o indicador cobre a aba
        cur = j
    return html, js


def island(p, title, sub='', at=0.0, d=2.2, top=230, icon='fire', bg=BLK, fg=CRM, accent=AMB, k='is'):
    # ilha dinâmica: pílula preta no topo que abre com ícone e texto e volta a ser pílula
    ico = ICON.get(icon, '').replace(f'fill="{CRM}"', f'fill="{BLK}"').replace(f'stroke="{CRM}"', f'stroke="{BLK}"')
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:540px;top:{top}px;width:280px;height:80px;border-radius:40px;background:{bg};overflow:hidden">'
            f'<div id="{p}-{k}c" style="position:absolute;left:40px;right:40px;top:0;bottom:0;display:flex;align-items:center;gap:30px;visibility:hidden">'
            f'<div style="flex:0 0 120px;height:120px;border-radius:50%;background:{accent};display:grid;place-items:center"><div style="width:58%;height:58%">{ico}</div></div>'
            f'<div style="overflow:hidden"><div style="font-size:{u(5)};color:{fg};white-space:nowrap">{_x(title)}</div><div style="font-size:{u(3.4)};color:rgba(255,250,234,.6);white-space:nowrap">{_x(sub)}</div></div></div></div>')
    js = (f'tl.set("#{p}-{k}",{{xPercent:-50}},0);tl.fromTo("#{p}-{k}",{{scale:.6,opacity:0}},{{scale:1,opacity:1,duration:.3,ease:CD}},{at:.2f});'
          f'tl.to("#{p}-{k}",{{width:940,height:220,borderRadius:72,duration:.55,ease:ONE}},{at + .3:.2f});'
          f'tl.set("#{p}-{k}c",{{autoAlpha:1}},{at + .65:.2f});tl.fromTo("#{p}-{k}c",{{y:60}},{{y:0,duration:.4,ease:CD}},{at + .65:.2f});'
          f'tl.to("#{p}-{k}c",{{y:-60,autoAlpha:0,duration:.2,ease:"power2.in"}},{at + d - .7:.2f});'
          f'tl.to("#{p}-{k}",{{width:280,height:80,borderRadius:40,duration:.5,ease:ONE}},{at + d - .5:.2f});')
    return html, js


def toast(p, text, at=0.0, d=1.8, y=1380, bg=CRM, fg=BLK, ok=AMB, k='to'):
    # toast de confirmação que sobe, segura e desce
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:540px;top:{y}px;display:flex;align-items:center;gap:26px;padding:28px 52px 28px 30px;border-radius:70px;background:{bg};color:{fg};font-size:{u(4.4)};white-space:nowrap;box-shadow:0 20px 50px rgba(0,0,0,.3)">'
            f'<div style="width:76px;height:76px;border-radius:50%;background:{ok};display:grid;place-items:center"><svg viewBox="0 0 64 64" style="width:60%;height:60%"><path d="M18 33l9 9 19-21" fill="none" stroke="{BLK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>{_x(text)}</div>')
    js = (f'tl.set("#{p}-{k}",{{xPercent:-50}},0);'
          f'tl.fromTo("#{p}-{k}",{{y:200,opacity:0}},{{y:0,opacity:1,duration:.45,ease:"back.out(1.3)"}},{at:.2f});'
          f'tl.to("#{p}-{k}",{{y:200,opacity:0,duration:.3,ease:"power2.in"}},{at + d - .3:.2f});')
    return html, js


def cmdk(p, query, items, at=0.0, top=480, cps=12, accent=AMB, k='ck'):
    # paleta de comandos ⌘K: a busca é digitada, a lista filtra a cada letra e o Enter escolhe o primeiro resultado
    rows = ''.join(f'<div id="{p}-{k}r{i}" style="height:110px;display:flex;align-items:center;padding:0 34px;border-radius:24px;overflow:hidden;white-space:nowrap">{_x(t)}</div>' for i, t in enumerate(items))
    q = ''.join(f'<span id="{p}-{k}q{i}" style="visibility:hidden">{_x(c) if c != " " else "&nbsp;"}</span>' for i, c in enumerate(query))
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:70px;right:70px;top:{top}px;padding:28px;border-radius:44px;background:#141419;color:{CRM};font-size:{u(4.4)};box-shadow:0 30px 80px rgba(0,0,0,.45)">'
            f'<div style="display:flex;align-items:center;gap:24px;padding:16px 26px 30px;border-bottom:2px solid rgba(255,250,234,.12);margin-bottom:16px">'
            f'<span style="font-family:{MONO};font-size:.75em;padding:6px 16px;border-radius:12px;background:rgba(255,250,234,.12)">⌘K</span><span>{q}</span></div>{rows}</div>')
    js = f'tl.fromTo("#{p}-{k}",{{scale:.9,opacity:0}},{{scale:1,opacity:1,duration:.35,ease:CD}},{at:.2f});'
    gone = set()
    for i in range(len(query)):
        t = at + .4 + i / cps
        js += f'tl.set("#{p}-{k}q{i}",{{visibility:"visible"}},{t:.2f});'
        for j, it in enumerate(items):
            if j not in gone and query[:i + 1].lower() not in it.lower():
                gone.add(j); js += f'tl.to("#{p}-{k}r{j}",{{height:0,opacity:0,duration:.18,ease:"power2.in"}},{t:.2f});'
    hit = next((j for j in range(len(items)) if j not in gone), None)
    if hit is not None:
        t = at + .5 + len(query) / cps
        js += (f'tl.set("#{p}-{k}r{hit}",{{backgroundColor:"{accent}",color:"{BLK}"}},{t:.2f});'
               f'tl.fromTo("#{p}-{k}r{hit}",{{scale:1}},{{scale:.97,duration:.1,yoyo:true,repeat:1}},{t + .35:.2f});')
    return html, js


def widget(p, title, value, delta, points, cx=540, cy=1000, w=900, h=640, at=0.0, accent=AMB, k='wd'):
    # card de métrica: cresce de 30% a 100%, os detalhes deslizam em ordem, a linha se desenha, brilho atrás e duas faixas de luz
    cw, ch = w - 120, 240
    lo, hi = min(points), max(points); sp = (hi - lo) or 1
    pts = [(60 + cw * i / (len(points) - 1), h - 70 - ch * (v - lo) / sp) for i, v in enumerate(points)]
    length = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    poly = ' '.join(f'{x:.0f},{y:.0f}' for x, y in pts)
    bars = ''.join(f'<div id="{p}-{k}s{j}" style="position:absolute;top:-20%;bottom:-20%;left:0;width:{wd}px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent);transform:skewX(-18deg)"></div>' for j, wd in enumerate((160, 70)))
    html = (f'<div id="{p}-{k}g" style="position:absolute;left:{cx - w * .45:.0f}px;top:{cy - h * .4:.0f}px;width:{w * .9:.0f}px;height:{h * .8:.0f}px;border-radius:50%;background:{accent};filter:blur(120px);opacity:0"></div>'
            f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx}px;top:{cy}px;width:{w}px;height:{h}px;border-radius:48px;background:#141419;color:{CRM};overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.45)">'
            f'<div id="{p}-{k}a" style="position:absolute;left:60px;top:56px;font-size:{u(3.8)};color:rgba(255,250,234,.6)">{_x(title)}</div>'
            f'<div id="{p}-{k}b" style="position:absolute;left:60px;top:116px;font-size:{u(11)};letter-spacing:-.04em">{_x(value)}</div>'
            f'<div id="{p}-{k}c" style="position:absolute;right:60px;top:150px;padding:10px 26px;border-radius:40px;background:{accent};color:{BLK};font-size:{u(4)}">{_x(delta)}</div>'
            f'<svg viewBox="0 0 {w} {h}" style="position:absolute;inset:0;width:100%;height:100%"><polyline id="{p}-{k}l" points="{poly}" fill="none" stroke="{accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="{length:.0f}" stroke-dashoffset="{length:.0f}"/></svg>'
            f'{bars}</div>')
    js = (f'tl.set("#{p}-{k}",{{xPercent:-50,yPercent:-50}},0);'
          f'tl.fromTo("#{p}-{k}",{{scale:.3,opacity:0}},{{scale:1,opacity:1,duration:.55,ease:CD}},{at:.2f});'
          + ''.join(f'tl.fromTo("#{p}-{k}{c}",{{x:-50,opacity:0}},{{x:0,opacity:1,duration:.35,ease:CD}},{at + .45 + i * .12:.2f});' for i, c in enumerate('abc'))
          + f'tl.to("#{p}-{k}g",{{opacity:.35,duration:.6,ease:"power2.out"}},{at + .5:.2f});'
          f'tl.to("#{p}-{k}l",{{strokeDashoffset:0,duration:.9,ease:"power2.inOut"}},{at + .7:.2f});'
          + ''.join(f'tl.fromTo("#{p}-{k}s{j}",{{x:-300}},{{x:{w + 300},duration:{du},ease:"power2.inOut"}},{at + .9 + j * .12:.2f});' for j, du in enumerate((.8, .95))))
    return html, js


# objeto 3D "clay" (Three.js, sem crédito): cursor | card | layers | bolt. Cor da marca; entra com mola, flutua, sai.
# Determinístico: a pose é função de tl.time(); o GSAP chama R() a cada seek. three@0.181.2 vem do CDN (um import por página).
_OBJ3D = r"""(function(){
const cv=document.getElementById('@ID@'),S=@SIZE@,st={s:0},AT=@AT@,D=@D@;let R=null;
window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
window.__hfThree=window.__hfThree||import('https://cdn.jsdelivr.net/npm/three@0.181.2/+esm');
const rr=(T,w,h,r)=>{const s=new T.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s};
const poly=(T,pts)=>{const s=new T.Shape();pts.forEach((q,i)=>i?s.lineTo(q[0],q[1]):s.moveTo(q[0],q[1]));s.closePath();return s};
const ext=(T,sh,depth,bev)=>{const g=new T.ExtrudeGeometry(sh,{depth,bevelEnabled:true,bevelSize:bev,bevelThickness:bev,bevelSegments:6,curveSegments:14});g.center();return g};
const build=T=>{const c=new T.Color('@COLOR@'),mat=l=>new T.MeshPhysicalMaterial({color:c.clone().offsetHSL(0,0,l),roughness:.32,clearcoat:1,clearcoatRoughness:.18}),g=new T.Group(),kind='@KIND@';
  if(kind==='cursor')g.add(new T.Mesh(ext(T,poly(T,[[0,1.2],[0,-.9],[.3,-.6],[.52,-1.1],[.78,-1],[.56,-.5],[.95,-.48]]),.22,.07),mat(0)));
  else if(kind==='bolt')g.add(new T.Mesh(ext(T,poly(T,[[.25,1.2],[-.65,-.1],[-.08,-.1],[-.3,-1.2],[.7,.25],[.12,.25]]),.25,.07),mat(0)));
  else if(kind==='layers')[-.5,0,.5].forEach((y,i)=>{const m=new T.Mesh(ext(T,rr(T,1.5,1,.2),.1,.05),mat(i*.06-.06));m.position.set(0,y,i*.18);m.rotation.x=-.9;g.add(m)});
  else g.add(new T.Mesh(ext(T,rr(T,1.7,1.1,.22),.16,.06),mat(0)));
  return g};
window.__hf.buildReady['@ID@']=window.__hfThree.then(T=>{
  const rd=new T.WebGLRenderer({canvas:cv,alpha:true,antialias:true,preserveDrawingBuffer:true});rd.setPixelRatio(1);rd.setSize(S,S,false);
  const sc=new T.Scene(),cam=new T.PerspectiveCamera(30,1,.1,50),o=build(T);cam.position.set(0,0,6.4);
  sc.add(new T.HemisphereLight(0xffffff,0x9a9ad8,2.2));const a=new T.DirectionalLight(0xffffff,2.6);a.position.set(-2,3,4);sc.add(a);
  const b=new T.DirectionalLight(0xdfe0ff,1.1);b.position.set(3,-1,2);sc.add(b);sc.add(o);
  R=()=>{const t=tl.time()-AT,e=@SEED@;o.visible=st.s>.001;o.scale.setScalar(Math.max(st.s,.001));o.position.y=Math.sin(t*2.1+e)*.08;
    o.rotation.set(-.25+Math.sin(t*1.3+e)*.12,@SPIN@?t*1.2:Math.sin(t*1.1+e)*.5-.35,@TILT@+Math.sin(t*1.7)*.05);rd.render(sc,cam)};R()});
const U=()=>R&&R();
tl.fromTo(st,{s:0},{s:1,duration:.5,ease:'back.out(1.8)',onUpdate:U},AT);
tl.to(st,{s:0,duration:.3,ease:'power2.in',onUpdate:U},AT+D-.3);
tl.to({},{duration:Math.max(D-.8,.01),onUpdate:U},AT+.5);
})();"""

def obj3d(p, kind, x, y, size=520, at=0.0, d=2.4, color=None, spin=False, tilt=0.0, seed=0.0, k='o3'):
    """Objeto 3D flutuante com centro em (x,y) px. kind: cursor|card|layers|bolt. Entra em `at`, sai em at+d. Use dentro de both()."""
    assert kind in ('cursor', 'card', 'layers', 'bolt'), kind
    i = f'{p}-{k}'
    html = f'<canvas id="{i}" width="{size}" height="{size}" {AO} style="position:absolute;left:{x - size / 2:.0f}px;top:{y - size / 2:.0f}px;width:{size}px;height:{size}px;opacity:0"></canvas>'
    code = (_OBJ3D.replace('@ID@', i).replace('@SIZE@', str(size)).replace('@COLOR@', color or '#6f6fc9').replace('@KIND@', kind)
            .replace('@AT@', f'{at:.2f}').replace('@D@', f'{d:.2f}').replace('@SEED@', f'{seed:.2f}')
            .replace('@SPIN@', 'true' if spin else 'false').replace('@TILT@', f'{tilt:.2f}'))
    js = f'tl.set("#{i}",{{opacity:0}},0);tl.set("#{i}",{{opacity:1}},{at:.2f});tl.set("#{i}",{{opacity:0}},{at + d:.2f});{code}'
    return html, js


_FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%$+'


def flap(p, text, top=700, size=12, at=0.0, steps=7, step=.06, stagger=.05, tile='#1C1C22', fg=CRM, k='sf'):
    # placa split-flap: cada letra gira por caracteres (sequência fixa, sem acaso) até parar no texto
    text = text.upper(); n = len(text)
    size = min(size, 940 / max(n, 1) / .94 / 10.8)          # célula .86em + espaço .08em
    cells, js = '', ''
    for i, ch in enumerate(text):
        if ch == ' ':
            cells += '<div style="width:.5em"></div>'; continue
        cells += (f'<div style="position:relative;width:.86em;height:1.2em;border-radius:.1em;background:{tile};display:grid;place-items:center;perspective:500px;box-shadow:0 8px 20px rgba(0,0,0,.35)">'
                  f'<span id="{p}-{k}{i}" style="display:inline-block;line-height:1">{_x(_FLAP[(i * 7) % len(_FLAP)])}</span>'
                  f'<div style="position:absolute;left:0;right:0;top:50%;height:3px;margin-top:-1px;background:rgba(0,0,0,.55)"></div></div>')
        seq = [_FLAP[(i * 7 + s * 13) % len(_FLAP)] for s in range(steps - 1)] + [ch]
        for s, c in enumerate(seq):
            t = at + i * stagger + s * step
            js += f'tl.set("#{p}-{k}{i}",{{textContent:"{_x(c)}"}},{t:.3f});tl.fromTo("#{p}-{k}{i}",{{rotationX:-75}},{{rotationX:0,duration:{step * .9:.3f},ease:"power2.out"}},{t:.3f});'
    html = f'<div {AO} style="position:absolute;left:0;right:0;top:{top}px;display:flex;justify-content:center;gap:.08em;font-size:{u(size)};color:{fg};text-transform:uppercase">{cells}</div>'
    return html, js


def outline(p, word, top=760, size=26, at=0.0, d=.9, color=CRM, stroke=AMB, k='ol'):
    # a palavra se desenha em contorno (todas as letras juntas) e depois é preenchida
    size = _fit(size, len(word), 940, .66); fs = size * 10.8
    html = (f'<svg {AO} viewBox="0 0 1080 1920" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;font-family:Aspekta,sans-serif;font-weight:600">'
            f'<text id="{p}-{k}" x="540" y="{top + .72 * fs:.0f}" text-anchor="middle" font-size="{fs:.0f}" letter-spacing="{-.03 * fs:.1f}" fill="{color}" fill-opacity="0" '
            f'stroke="{stroke}" stroke-width="4" stroke-dasharray="{fs * 5:.0f}" stroke-dashoffset="{fs * 5:.0f}">{_x(word.upper())}</text></svg>')
    js = (f'tl.to("#{p}-{k}",{{strokeDashoffset:0,duration:{d},ease:"power2.inOut"}},{at:.2f});'
          f'tl.to("#{p}-{k}",{{fillOpacity:1,duration:.3,ease:"power2.out"}},{at + d:.2f});'
          f'tl.to("#{p}-{k}",{{strokeOpacity:0,duration:.3}},{at + d + .15:.2f});')
    return html, js


def bento(p, tiles, top=240, bottom=1520, at=0.0, cols=2, gap=24, k='bn'):
    # grade bento estilo keynote: cada tile {html, bg, c (colunas), r (linhas)} cresce no lugar; o conteúdo sobe depois
    rows = sum(t.get('c', 1) * t.get('r', 1) for t in tiles) / cols
    cells = ''.join(f'<div id="{p}-{k}{i}" style="grid-column:span {t.get("c", 1)};grid-row:span {t.get("r", 1)};border-radius:40px;background:{t.get("bg", "#141419")};overflow:hidden;position:relative">'
                    f'<div id="{p}-{k}c{i}" style="position:absolute;inset:0;padding:40px;display:flex;flex-direction:column;justify-content:flex-end">{t.get("html", "")}</div></div>' for i, t in enumerate(tiles))
    html = (f'<div {AO} style="position:absolute;left:70px;right:70px;top:{top}px;height:{bottom - top}px;display:grid;grid-template-columns:repeat({cols},1fr);'
            f'grid-template-rows:repeat({math.ceil(rows)},1fr);gap:{gap}px;color:{CRM}">{cells}</div>')
    js = ''.join(f'tl.fromTo("#{p}-{k}{i}",{{scale:.86,y:60,opacity:0}},{{scale:1,y:0,opacity:1,duration:.55,ease:"expo.out"}},{at + i * .1:.2f});'
                 f'tl.fromTo("#{p}-{k}c{i}",{{y:40,opacity:0}},{{y:0,opacity:1,duration:.4,ease:CD}},{at + .3 + i * .1:.2f});' for i in range(len(tiles)))
    return html, js


def title_seq(p, title, sub='', top=820, size=11, at=0.0, d=2.6, color=CRM, k='ts'):
    # abertura de série: letras bem abertas que se fecham devagar, uma cintilação curta e uma faixa de luz pelo título
    size = _fit(size, len(title) * 1.6, 940, .66)
    n = len(title)                                                # cada letra começa afastada do centro e desliza até o lugar,
    spread = min(.5 * size * 10.8, max(0, 940 - n * .7 * size * 10.8) / max(n - 1, 1))   # sem a de fora passar da lateral
    letters = lambda s: ''.join(f'<span id="{p}-{k}{s}{i}" style="display:inline-block;white-space:pre">{_x(c)}</span>' for i, c in enumerate(title))
    common = f'position:absolute;left:-10%;right:-10%;top:{top}px;text-align:center;font-size:{u(size)};line-height:1;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap'
    html = (f'<div id="{p}-{k}" {AO} style="{common};color:{color}">{letters("a")}</div>'
            f'<div id="{p}-{k}h" {AO} style="{common};color:transparent;background:linear-gradient(100deg,transparent 42%,rgba(255,255,255,.95) 50%,transparent 58%);'
            f'background-size:300% 100%;background-position:100% 0;-webkit-background-clip:text;background-clip:text">{letters("b")}</div>')
    if sub:
        html += f'<div id="{p}-{k}s" {AO} style="position:absolute;left:0;right:0;top:{top + size * 10.8 * 1.5:.0f}px;text-align:center;font-size:{u(3.4)};letter-spacing:.42em;text-transform:uppercase;color:rgba(255,250,234,.6)">{_x(sub)}</div>'
    js = ''.join(f'tl.fromTo(["#{p}-{k}a{i}","#{p}-{k}b{i}"],{{x:{(i - (n - 1) / 2) * spread:.0f}}},{{x:0,duration:{d},ease:"power1.out"}},{at:.2f});' for i in range(n))
    js += ''.join(f'tl.set("#{p}-{k}",{{opacity:{o}}},{at + t:.2f});' for t, o in ((0, 0), (.06, .55), (.11, .15), (.17, .85), (.24, .4), (.3, 1)))
    js += f'tl.to("#{p}-{k}h",{{backgroundPosition:"0% 0",duration:.9,ease:"power2.inOut"}},{at + .6:.2f});'
    if sub:
        js += f'tl.fromTo("#{p}-{k}s",{{y:30,opacity:0}},{{y:0,opacity:1,duration:.5,ease:CD}},{at + .9:.2f});'
    return html, js


def frame(p, d, label='', color=CRM, accent=AMB, at=0.0, k='fm'):
    # moldura de edição: rótulo e timecode que conta no topo, cantos de marcação e régua de progresso na base.
    # Ornamento de propósito fora da zona segura (topo < 200, base > 1540): não traz texto de conteúdo.
    # shortcut: timecode só de segundos inteiros, até 99 s; fica em `front` (acima do recorte do locutor)
    m = max(1, min(99, int(d)))
    tape = ''.join(f'<div style="height:28px">{s:02d}</div>' for s in range(m + 1))
    cor = lambda x, css: f'<div id="{p}-{k}{x}" {AO} style="position:absolute;width:36px;height:36px;border-color:{color};{css}"></div>'
    html = (f'<div id="{p}-{k}tl" {AO} style="position:absolute;left:70px;top:60px;font-family:{MONO};font-size:28px;line-height:28px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;color:{color}">{_x(label)}</div>'
            f'<div id="{p}-{k}tr" {AO} style="position:absolute;right:70px;top:60px;display:flex;font-family:{MONO};font-size:28px;line-height:28px;color:{color}"><span>00:</span><div style="width:1.25em;height:28px;overflow:hidden"><div id="{p}-{k}tp">{tape}</div></div></div>'
            + cor('0', 'left:24px;top:24px;border-top:4px solid;border-left:4px solid')
            + cor('1', 'right:24px;top:24px;border-top:4px solid;border-right:4px solid')
            + cor('2', 'left:24px;bottom:24px;border-bottom:4px solid;border-left:4px solid')
            + cor('3', 'right:24px;bottom:24px;border-bottom:4px solid;border-right:4px solid')
            + f'<div id="{p}-{k}bar" {AO} style="position:absolute;left:0;right:0;bottom:0;height:6px;background:{accent};transform-origin:0 50%"></div>')
    fade = [f'#{p}-{k}{x}' for x in ('tl', 'tr', '0', '1', '2', '3')]
    js = f'tl.fromTo({json.dumps(fade)},{{opacity:0}},{{opacity:1,duration:.4,ease:"power2.out"}},{at:.2f});'
    js += f'tl.fromTo("#{p}-{k}bar",{{scaleX:0}},{{scaleX:1,duration:{d:.3f},ease:"none"}},{at:.2f});'
    js += ''.join(f'tl.set("#{p}-{k}tp",{{y:{-s * 28}}},{at + s:.2f});' for s in range(1, m))   # um salto por segundo, no segundo exato
    return html, js


def scope(p, at=0.0, top=520, size=880, d=1.6, color=AMB, k='os'):
    # osciloscópio: o feixe varre o traço (clip-path) e o fósforo deixa uma cauda que apaga (opacity); grade 10×8
    w, h = size, size * .8
    x0 = (1080 - w) / 2
    pts = ' '.join(f'{w * i / 120:.1f},{h / 2 - (math.sin(i / 120 * math.tau * 3) * .6 + math.sin(i / 120 * math.tau * 7 + 1.1) * .25 + math.sin(i / 120 * math.tau * 13) * .08) * h * .42:.1f}' for i in range(121))
    grid = ''.join(f'<line x1="{w * i / 10:.1f}" y1="0" x2="{w * i / 10:.1f}" y2="{h:.1f}"/>' for i in range(1, 10))
    grid += ''.join(f'<line x1="0" y1="{h * j / 8:.1f}" x2="{w:.1f}" y2="{h * j / 8:.1f}"/>' for j in range(1, 8))
    trace = f'<polyline points="{pts}" fill="none" stroke-linejoin="round" stroke-linecap="round"'
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{x0:.0f}px;top:{top}px;width:{w:.0f}px;height:{h:.0f}px;border:6px solid rgba(255,250,234,.35);border-radius:36px;background:#06070A;overflow:hidden">'
            f'<svg viewBox="0 0 {w:.0f} {h:.0f}" style="position:absolute;inset:0;width:100%;height:100%"><g stroke="rgba(255,250,234,.14)" stroke-width="2">{grid}</g></svg>'
            f'<svg id="{p}-{k}tail" viewBox="0 0 {w:.0f} {h:.0f}" style="position:absolute;inset:0;width:100%;height:100%;opacity:0">{trace} stroke="{color}" stroke-width="14"/></svg>'
            f'<div id="{p}-{k}v" style="position:absolute;inset:0;clip-path:inset(0 100% 0 0)"><svg viewBox="0 0 {w:.0f} {h:.0f}" style="position:absolute;inset:0;width:100%;height:100%">{trace} stroke="{color}" stroke-width="8"/></svg></div>'
            f'<div id="{p}-{k}b" style="position:absolute;top:0;bottom:0;left:0;width:4px;background:{color};box-shadow:0 0 24px {color};opacity:0"></div></div>')
    js = (f'tl.fromTo("#{p}-{k}b",{{x:0,opacity:1}},{{x:{w:.0f},opacity:1,duration:{d},ease:"none"}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}v",{{clipPath:"inset(0 100% 0 0)"}},{{clipPath:"inset(0 0% 0 0)",duration:{d},ease:"none"}},{at:.2f});'
          f'tl.to("#{p}-{k}b",{{opacity:0,duration:.15}},{at + d:.2f});'
          f'tl.fromTo("#{p}-{k}tail",{{opacity:.55}},{{opacity:0,duration:1.4,ease:"power2.out"}},{at + d:.2f});')
    return html, js


def papel(p, word, top=640, size=20, at=0.0, d=.7, back=AMB, paper=CRM, ink=BLK, k='pp'):
    # recorte de papel: duas folhas entram girando com sombra dura; a folha de cima tem borda serrilhada e a palavra
    size = _fit(size, len(word), 880, .66); fs = size * 10.8
    assert fs >= 28, word
    notch = 'polygon(0 4%,6% 0,14% 3%,22% 0,31% 2%,40% 0,52% 3%,61% 0,73% 2%,82% 0,91% 3%,100% 0,100% 96%,95% 100%,84% 97%,72% 100%,60% 97%,47% 100%,35% 97%,24% 100%,12% 97%,0 100%)'
    html = (f'<div id="{p}-{k}b" {AO} style="position:absolute;{CENTER};top:{top}px;filter:drop-shadow(0 28px 30px rgba(0,0,0,.4))">'
            f'<div style="padding:{u(4)} {u(6)};background:{back};clip-path:{notch};transform:rotate(2.5deg);font-size:{u(size)};line-height:1;white-space:nowrap;color:transparent">{_x(word.upper())}</div></div>'
            f'<div id="{p}-{k}" {AO} style="position:absolute;{CENTER};top:{top}px;filter:drop-shadow(0 28px 30px rgba(0,0,0,.4))">'
            f'<div style="padding:{u(4)} {u(6)};background:{paper};clip-path:{notch};font-size:{u(size)};line-height:1;white-space:nowrap;color:{ink};text-transform:uppercase">{_x(word.upper())}</div></div>')
    js = (f'tl.fromTo("#{p}-{k}b",{{y:-900,rotation:-14,opacity:0}},{{y:0,rotation:0,opacity:1,duration:{d},ease:"power3.out"}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}",{{y:-900,rotation:9,opacity:0}},{{y:0,rotation:0,opacity:1,duration:{d},ease:"power3.out"}},{at + .14:.2f});')
    return html, js


def crt(p, word, top=800, size=24, at=0.0, d=.9, color=CRM, k='cr'):
    # glitch RGB sobre CRT: duas cópias deslocadas (vermelha/ciano) tremem em passos fixos; linhas de varredura por cima
    size = _fit(size, len(word), 940, .66); fs = size * 10.8
    assert fs >= 28, word
    layer = lambda c, s, extra='': (f'<div id="{p}-{k}{s}" {AO} style="position:absolute;left:0;right:0;top:{top}px;text-align:center;white-space:nowrap;'
                                    f'font-size:{u(size)};line-height:.9;letter-spacing:-.04em;text-transform:uppercase;color:{c};{extra}">{_x(word.upper())}</div>')
    html = (layer('#FF2A3D', 'r', 'mix-blend-mode:screen') + layer('#00E5FF', 'c', 'mix-blend-mode:screen') + layer(color, 'm')
            + f'<div id="{p}-{k}s" {AO} style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.42) 0 3px,transparent 3px 6px);opacity:.6"></div>')
    shake = [(0, 0), (-16, 3), (12, -4), (-6, 0), (20, 6), (-2, -2), (0, 0)]   # desloca só as cópias coloridas
    js = ''.join(f'tl.fromTo("#{p}-{k}{s}",{{scale:1.5,opacity:0}},{{scale:1,opacity:1,duration:{d},ease:"expo.out"}},{at:.2f});' for s in 'rcm')
    for i, (dx, dy) in enumerate(shake):
        t = at + .25 + i * .07
        js += f'tl.set("#{p}-{k}r",{{x:{-dx},y:{-dy}}},{t:.2f});tl.set("#{p}-{k}c",{{x:{dx},y:{dy}}},{t:.2f});'
    js += ''.join(f'tl.set("#{p}-{k}s",{{opacity:{o}}},{at + t:.2f});' for t, o in ((.1, .2), (.3, .6), (.4, .3), (.66, .6)))
    return html, js


# ---------- garimpo NullMotion: reimplementados com código próprio (o repositório de origem não tem licença) ----------

def stack_rise(p, master, back, rear, at=0.0, top=620, w=560, h=340, fan=220, k='sr'):
    # pilha de cartões: sobe de baixo, o mestre gira e mostra o verso, e até dois cartões de trás abrem em leque
    assert len(rear) <= 2, 'stack_rise: no máximo 2 cartões de trás'
    x0 = (1080 - w) / 2
    face = f'position:absolute;inset:0;border-radius:44px;overflow:hidden;background:#141419;border:2px solid rgba(255,250,234,.22);color:{CRM};backface-visibility:hidden;-webkit-backface-visibility:hidden'
    cards = ''.join(f'<div id="{p}-{k}r{i}" style="position:absolute;inset:0;border-radius:44px;overflow:hidden;background:#2a2a33;border:2px solid rgba(255,250,234,.22);color:{CRM};opacity:0">{c}</div>' for i, c in enumerate(rear))
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{x0:.0f}px;top:{top}px;width:{w}px;height:{h}px;perspective:1800px">{cards}'
            f'<div id="{p}-{k}m" style="position:absolute;inset:0;transform-style:preserve-3d">'
            f'<div id="{p}-{k}f" style="{face}">{master}</div>'
            f'<div id="{p}-{k}v" style="{face};transform:rotateY(180deg)">{back}</div></div></div>')
    js = f'tl.fromTo("#{p}-{k}",{{y:1100,opacity:0}},{{y:0,opacity:1,duration:.9,ease:"power4.out"}},{at:.2f});'
    for i in range(len(rear)):
        sx = -1 if i == 0 else 1
        js += f'tl.fromTo("#{p}-{k}r{i}",{{x:0,y:40,rotation:0,opacity:0}},{{x:{sx * fan},y:0,rotation:{sx * 5},opacity:1,duration:.7,ease:"back.out(1.4)"}},{at + .5 + i * .08:.2f});'
    js += f'tl.fromTo("#{p}-{k}m",{{rotationY:0}},{{rotationY:180,duration:.7,ease:"power3.inOut"}},{at + 1.5:.2f});'
    js += f'tl.to("#{p}-{k}",{{y:-1000,opacity:0,duration:.55,ease:"power3.in"}},{at + 3.4:.2f});'
    return html, js


def hud_lens(p, title, rows, cx=540, cy=900, r=300, at=0.0, d=1.4, color=CRM, accent=AMB, k='hu'):
    # lente HUD: anel com marcas que giram, cantoneiras que pousam nos cantos, título revelado por máscara e linhas de dados em sequência
    S = 2 * r + 120; c = S / 2
    size = _fit(8, len(title), 2 * r * .8, .62); fs = size * 10.8
    assert fs >= 28, title
    ticks = ''.join(f'<line x1="{c:.0f}" y1="{c - r - 8:.0f}" x2="{c:.0f}" y2="{c - r - 8 - (34 if j % 5 == 0 else 16):.0f}" stroke-width="{6 if j % 5 == 0 else 3}" transform="rotate({j * 6} {c:.0f} {c:.0f})"/>' for j in range(60))
    corners = ((0, 0, 'border-top:6px solid;border-left:6px solid'), (S - 90, 0, 'border-top:6px solid;border-right:6px solid'),
               (0, S - 90, 'border-bottom:6px solid;border-left:6px solid'), (S - 90, S - 90, 'border-bottom:6px solid;border-right:6px solid'))
    br = ''.join(f'<div id="{p}-{k}b{i}" style="position:absolute;left:{x}px;top:{y}px;width:90px;height:90px;color:{accent};{b}"></div>' for i, (x, y, b) in enumerate(corners))
    svg = (f'<svg viewBox="0 0 {S} {S}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">'
           f'<circle cx="{c:.0f}" cy="{c:.0f}" r="{r}" fill="none" stroke="{accent}" stroke-width="4" opacity=".7"/>'
           f'<g id="{p}-{k}t" stroke="{accent}" fill="none">{ticks}</g>'
           f'<circle id="{p}-{k}d" cx="{c:.0f}" cy="{c:.0f}" r="{r + 60}" fill="none" stroke="{color}" stroke-width="2" stroke-dasharray="6 14" opacity=".4"/></svg>')
    title_html = (f'<div id="{p}-{k}tt" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:{u(size)};line-height:1;'
                  f'text-transform:uppercase;letter-spacing:-.03em;white-space:nowrap;color:{color};clip-path:inset(0 100% 0 0)">{_x(title)}</div>')
    lines = ''.join(f'<div id="{p}-{k}w{i}" style="font-family:{MONO};font-size:{u(3.4)};line-height:1.5;color:{color};white-space:nowrap;clip-path:inset(0 100% 0 0)">{_x(t)}</div>' for i, t in enumerate(rows))
    rows_html = f'<div style="position:absolute;left:0;right:0;top:{S + 40}px;display:flex;flex-direction:column;align-items:center;gap:10px">{lines}</div>'
    html = f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx - c:.0f}px;top:{cy - c:.0f}px;width:{S}px;height:{S}px">{svg}{br}{title_html}{rows_html}</div>'
    js = (f'tl.fromTo("#{p}-{k}",{{scale:.6,opacity:0}},{{scale:1,opacity:1,duration:{d * .6:.2f},ease:"expo.out"}},{at:.2f});'
          f'tl.set(["#{p}-{k}t","#{p}-{k}d"],{{transformOrigin:"50% 50%"}},0);'
          f'tl.fromTo("#{p}-{k}t",{{rotation:0}},{{rotation:90,duration:{d + 2:.2f},ease:"none"}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}d",{{rotation:0}},{{rotation:-180,duration:{d + 2:.2f},ease:"none"}},{at:.2f});'
          + ''.join(f'tl.fromTo("#{p}-{k}b{i}",{{scale:1.5,opacity:0}},{{scale:1,opacity:1,duration:.5,ease:"expo.out"}},{at + .1 + i * .06:.2f});' for i in range(4))
          + f'tl.fromTo("#{p}-{k}tt",{{clipPath:"inset(0 100% 0 0)"}},{{clipPath:"inset(0 0% 0 0)",duration:{d * .7:.2f},ease:"power2.inOut"}},{at + .5:.2f});'
          + ''.join(f'tl.fromTo("#{p}-{k}w{i}",{{clipPath:"inset(0 100% 0 0)"}},{{clipPath:"inset(0 0% 0 0)",duration:.4,ease:"power2.out"}},{at + .9 + i * .2:.2f});' for i in range(len(rows))))
    return html, js


def bars_3d(p, values, labels=None, top=420, bw=120, gap=54, h=560, at=0.0, color=CRM, accent=AMB, k='b3'):
    # barras pseudo-3D (face, lateral e topo em recortes): cada barra cresce pela base, reflete no chão e a mais alta sai em destaque
    side = 36; n = len(values); mx = max(values) or 1
    x0 = (1080 - (n * bw + (n - 1) * gap)) / 2
    base = top + h
    grp = ''
    for i, v in enumerate(values):
        bh = h * v / mx; H = bh + side; x = x0 + i * (bw + gap); fc = accent if v == mx else color
        faces = (f'<div style="position:absolute;left:0;bottom:0;width:{bw}px;height:{bh:.0f}px;background:{fc}"></div>'
                 f'<div style="position:absolute;left:{bw}px;bottom:0;width:{side}px;height:{H:.0f}px;background:{fc};filter:brightness(.62);clip-path:polygon(0 {side}px,{side}px 0,{side}px {bh:.0f}px,0 {H:.0f}px)"></div>'
                 f'<div style="position:absolute;left:0;bottom:{bh:.0f}px;width:{bw + side}px;height:{side}px;background:{fc};filter:brightness(1.22);clip-path:polygon(0 100%,{bw}px 100%,{bw + side}px 0,{side}px 0)"></div>')
        clip = max(0, min(H, 1920 - base))   # o reflexo corta na borda do quadro, sem painel para fora
        refl = (f'<div style="position:absolute;left:0;top:{H:.0f}px;width:{bw + side}px;height:{clip:.0f}px;overflow:hidden">'
                f'<div style="position:absolute;left:0;top:{-H:.0f}px;width:{bw + side}px;height:{H:.0f}px;transform:scaleY(-1);transform-origin:50% 100%;opacity:.2;-webkit-mask-image:linear-gradient(transparent,#000);mask-image:linear-gradient(transparent,#000)">{faces}</div></div>')
        grp += f'<div id="{p}-{k}{i}" style="position:absolute;left:{x:.0f}px;top:{base - H:.0f}px;width:{bw + side}px;height:{H:.0f}px;transform-origin:50% 100%">{faces}{refl}</div>'
    floor = f'<div id="{p}-{k}f" style="position:absolute;left:{x0 - 40:.0f}px;top:{base}px;width:{n * bw + (n - 1) * gap + 80:.0f}px;height:4px;background:rgba(255,250,234,.5)"></div>'
    lb = ''
    if labels:
        lb = ''.join(f'<div id="{p}-{k}l{i}" style="position:absolute;left:{x0 + i * (bw + gap):.0f}px;top:{base + 30}px;width:{bw + side}px;text-align:center;font-size:{u(3.4)};color:{color};white-space:nowrap">{_x(t)}</div>' for i, t in enumerate(labels))
    html = f'<div {AO} style="position:absolute;left:0;top:0;width:1080px;height:1920px">{grp}{floor}{lb}</div>'
    js = f'tl.fromTo("#{p}-{k}f",{{scaleX:0}},{{scaleX:1,duration:.7,ease:"power3.out"}},{at + .1:.2f});'
    js += ''.join(f'tl.fromTo("#{p}-{k}{i}",{{scaleY:0}},{{scaleY:1,duration:.9,ease:"power4.out"}},{at + .3 + i * .12:.2f});' for i in range(n))
    if labels:
        js += ''.join(f'tl.fromTo("#{p}-{k}l{i}",{{y:20,opacity:0}},{{y:0,opacity:1,duration:.4,ease:"power2.out"}},{at + .9 + i * .12:.2f});' for i in range(n))
    return html, js


def grid_net(p, hub, nodes, cx=540, cy=900, R=340, at=0.0, k='gn'):
    # rede: cada linha cresce do centro até o nó, o nó entra na ponta e, no fim, o centro pulsa
    n = len(nodes); lines = ''; items = ''; js = ''
    for i, nd in enumerate(nodes):
        a = -90 + i * 360 / n
        x = cx + R * math.cos(math.radians(a)); y = cy + R * math.sin(math.radians(a))
        lines += f'<div id="{p}-{k}l{i}" style="position:absolute;left:{cx}px;top:{cy - 2}px;width:{R}px;height:4px;background:rgba(255,250,234,.4)"></div>'
        items += f'<div id="{p}-{k}n{i}" style="position:absolute;left:{x:.0f}px;top:{y:.0f}px">{nd}</div>'
        js += f'tl.set("#{p}-{k}l{i}",{{rotation:{a:.2f},transformOrigin:"0% 50%"}},0);'
        js += f'tl.set("#{p}-{k}n{i}",{{xPercent:-50,yPercent:-50}},0);'
        t = at + .7 + i * .12
        js += f'tl.fromTo("#{p}-{k}l{i}",{{scaleX:0}},{{scaleX:1,duration:.5,ease:"power2.out"}},{t:.2f});'
        js += f'tl.fromTo("#{p}-{k}n{i}",{{scale:0,opacity:0}},{{scale:1,opacity:1,duration:.6,ease:"back.out(1.8)"}},{t + .2:.2f});'
    js += f'tl.set("#{p}-{k}h",{{xPercent:-50,yPercent:-50}},0);'
    js += f'tl.fromTo("#{p}-{k}h",{{scale:0,opacity:0}},{{scale:1,opacity:1,duration:.8,ease:"back.out(1.7)"}},{at + .3:.2f});'
    js += f'tl.fromTo("#{p}-{k}h",{{scale:1}},{{scale:1.06,duration:.45,yoyo:true,repeat:1,ease:"sine.inOut"}},{at + .7 + n * .12 + .6:.2f});'
    html = f'<div {AO} style="position:absolute;left:0;top:0;width:1080px;height:1920px">{lines}{items}<div id="{p}-{k}h" style="position:absolute;left:{cx}px;top:{cy}px">{hub}</div></div>'
    return html, js


def chat_sim(p, user, answer, top=640, at=0.0, cps=28, k='cs'):
    # conversa com IA: a mensagem do usuário entra, três pontos pulsam e a resposta aparece letra por letra
    cells = ''.join(f'<span id="{p}-{k}a{i}" style="visibility:hidden">{_x(c)}</span>' for i, c in enumerate(answer))
    bubble = f'position:absolute;border-radius:44px;padding:36px 44px;font-size:{u(4.2)};line-height:1.3;color:{CRM};border:2px solid rgba(255,250,234,.22)'
    dots = ''.join(f'<span id="{p}-{k}d{j}" style="display:block;width:22px;height:22px;border-radius:11px;background:{CRM}"></span>' for j in range(3))
    html = (f'<div id="{p}-{k}u" {AO} style="{bubble};right:70px;left:220px;top:{top}px;background:rgba(255,250,234,.14);border-bottom-right-radius:12px">{_x(user)}</div>'
            f'<div id="{p}-{k}r" {AO} style="{bubble};left:70px;right:70px;top:{top + 260}px;background:#141419;border-bottom-left-radius:12px;opacity:0">{cells}</div>'
            f'<div id="{p}-{k}d" {AO} style="{bubble};left:70px;top:{top + 260}px;padding:32px 40px;background:#141419;display:flex;gap:14px">{dots}</div>')
    js = (f'tl.fromTo("#{p}-{k}u",{{y:46,opacity:0,scale:.96}},{{y:0,opacity:1,scale:1,duration:.55,ease:"back.out(1.4)"}},{at + .3:.2f});'
          f'tl.fromTo("#{p}-{k}d",{{scale:.7,opacity:0}},{{scale:1,opacity:1,duration:.3,ease:"back.out(2)"}},{at + 1.0:.2f});'
          f'tl.fromTo(["#{p}-{k}d0","#{p}-{k}d1","#{p}-{k}d2"],{{y:0}},{{y:-13,duration:.2,yoyo:true,repeat:3,stagger:.12,ease:"sine.inOut"}},{at + 1.1:.2f});'
          f'tl.set("#{p}-{k}d",{{opacity:0}},{at + 2.4:.2f});'
          f'tl.set("#{p}-{k}r",{{opacity:1}},{at + 2.4:.2f});')
    js += ''.join(f'tl.set("#{p}-{k}a{i}",{{visibility:"visible"}},{at + 2.5 + i / cps:.3f});' for i in range(len(answer)))
    return html, js


# ---------- NullMotion (lote 2): reimplementados com código próprio ----------

def steps3(p, items, top=560, gap=40, at=0.0, k='st'):
    # cards empilhados que sobem em sequência: número, título e texto (3 itens cabem na zona segura)
    assert len(items) <= 3, 'steps3: no máximo 3 passos'
    html = ''.join(
        f'<div id="{p}-{k}{i}" {AO} style="position:absolute;left:70px;right:70px;top:{top + i * (300 + gap)}px;height:300px;padding:44px 52px;border-radius:48px;background:#141419;color:{CRM}">'
        f'<div style="font-size:{u(4)};color:{AMB}">{i + 1:02d}</div>'
        f'<div style="font-size:{u(6)};line-height:1;margin-top:18px">{_x(t)}</div>'
        f'<div style="font-size:{u(3.6)};line-height:1.3;margin-top:18px;color:rgba(255,250,234,.7)">{_x(body)}</div></div>'
        for i, (t, body) in enumerate(items))
    js = ''.join(f'tl.fromTo("#{p}-{k}{i}",{{y:200,opacity:0,scale:.96}},{{y:0,opacity:1,scale:1,duration:.5,ease:"back.out(1.3)"}},{at + i * .25:.2f});' for i in range(len(items)))
    return html, js


def slide_head(p, eyebrow, headline, sub='', top=760, at=0.0, k='sh'):
    # divisor que desce, rótulo, título que entra deslizando e subtítulo opcional
    size = _fit(12, len(headline), 940, .62)
    html = (f'<div id="{p}-{k}d" style="position:absolute;left:538px;top:{top - 280}px;width:4px;height:200px;background:{AMB};transform-origin:50% 0"></div>'
            f'<div id="{p}-{k}e" {AO} style="position:absolute;left:0;right:0;top:{top - 80}px;text-align:center;font-size:{u(3.6)};letter-spacing:.42em;text-transform:uppercase;color:{AMB}">{_x(eyebrow)}</div>'
            f'<div id="{p}-{k}h" {AO} style="position:absolute;left:0;right:0;top:{top}px;text-align:center;font-size:{u(size)};line-height:.9;text-transform:uppercase;letter-spacing:-.04em;color:{CRM}">{_x(headline)}</div>')
    js = (f'tl.fromTo("#{p}-{k}d",{{scaleY:0}},{{scaleY:1,duration:.6,ease:"power3.out"}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}e",{{opacity:0,y:20}},{{opacity:1,y:0,duration:.4,ease:"power2.out"}},{at + .4:.2f});'
          f'tl.fromTo("#{p}-{k}h",{{x:-120,opacity:0}},{{x:0,opacity:1,duration:.7,ease:"expo.out"}},{at + .6:.2f});')
    if sub:
        html += f'<div id="{p}-{k}s" {AO} style="position:absolute;left:70px;right:70px;top:{top + size * 10.8 * 1.2:.0f}px;text-align:center;font-size:{u(4)};color:rgba(255,250,234,.7)">{_x(sub)}</div>'
        js += f'tl.fromTo("#{p}-{k}s",{{opacity:0}},{{opacity:1,duration:.5}},{at + 1.1:.2f});'
    return html, js


def phone_alert(p, title, alert, at=0.0, k='pa'):
    # título que cai do topo; celular sobe e um alerta desliza para dentro da tela
    html = (f'<div id="{p}-{k}t" {AO} style="position:absolute;left:70px;right:70px;top:200px;text-align:center;font-size:{u(_fit(8, len(title), 940, .62))};line-height:.95;text-transform:uppercase;color:{AMB}">{_x(title)}</div>'
            f'<div id="{p}-{k}p" {AO} style="position:absolute;left:250px;top:600px;width:580px;height:940px;border-radius:90px;background:#050507;border:10px solid #2a2a33;overflow:hidden">'
            f'<div id="{p}-{k}a" style="position:absolute;left:36px;right:36px;top:150px;padding:36px 40px;border-radius:44px;background:{CRM};color:{BLK};font-size:{u(4)};line-height:1.3">{_x(alert)}</div></div>')
    js = (f'tl.fromTo("#{p}-{k}t",{{y:-200,opacity:0}},{{y:0,opacity:1,duration:.6,ease:"power3.out"}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}p",{{y:600,opacity:0}},{{y:0,opacity:1,duration:.8,ease:"back.out(1.2)"}},{at + .4:.2f});'
          f'tl.fromTo("#{p}-{k}a",{{y:-160,opacity:0}},{{y:0,opacity:1,duration:.5,ease:"back.out(1.6)"}},{at + 1.2:.2f});')
    return html, js


def compare_bars(p, a, b, cx=540, cy=960, w=860, h=900, at=0.0, k='cb'):
    # duas barras crescem do mesmo chão: a de antes em cinza, a de depois em âmbar; valor acima de cada uma
    # a: (valor, rótulo) — a altura é proporcional ao maior valor
    top = cy - h / 2; mx = max(a[0], b[0]); bw = 220
    cells = ''
    for i, ((v, t), col) in enumerate(((a, 'rgba(255,250,234,.28)'), (b, AMB))):
        x = 150 + i * (w - 300 - bw); bh = 560 * v / mx   # coordenadas dentro do card
        cells += (f'<div id="{p}-{k}{i}" style="position:absolute;left:{x:.0f}px;top:{h - 150 - bh:.0f}px;width:{bw}px;height:{bh:.0f}px;border-radius:36px 36px 0 0;background:{col};transform-origin:50% 100%"></div>'
                  f'<div id="{p}-{k}v{i}" {AO} style="position:absolute;left:{x:.0f}px;width:{bw}px;top:{h - 150 - bh - 120:.0f}px;text-align:center;font-size:{u(7)};color:{CRM}">{_x(t)}</div>')
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{cx - w / 2:.0f}px;top:{top:.0f}px;width:{w}px;height:{h}px;border-radius:48px;background:#141419">'
            f'<div style="position:absolute;left:60px;right:60px;top:{h - 150}px;height:4px;background:rgba(255,250,234,.5)"></div>{cells}</div>')
    js = ''.join(f'tl.fromTo("#{p}-{k}{i}",{{scaleY:0}},{{scaleY:1,duration:.8,ease:"power3.out"}},{at + .2 + i * .3:.2f});' for i in range(2))
    js += ''.join(f'tl.fromTo("#{p}-{k}v{i}",{{opacity:0,y:20}},{{opacity:1,y:0,duration:.4,ease:"power2.out"}},{at + .9 + i * .3:.2f});' for i in range(2))
    return html, js


# ---------- movimento de origem medida (onetake, reimplementado: sem código copiado) ----------

def ripple(p, colors, cx=540, cy=960, at=0.0, d=.9, stagger=.12, k='rp'):
    # flood em anéis: cada cor nasce do ponto com atraso e cobre a anterior; a última fica até a cena seguinte
    # shortcut: discos empilhados, não anéis vazados (um furo exigiria máscara, que não é animável aqui)
    html = ''.join(f'<div id="{p}-{k}{i}" {AO} style="position:absolute;inset:0;background:{c};clip-path:circle(0px at {cx}px {cy}px)"></div>'
                   for i, c in enumerate(colors))
    # raio linear até o canto mais longe: com SQ o disco de cima cobre a tela antes de os anéis aparecerem
    R = math.hypot(max(cx, W - cx), max(cy, H - cy)) + 40
    js = ''.join(f'tl.fromTo("#{p}-{k}{i}",{{clipPath:"circle(0px at {cx}px {cy}px)"}},{{clipPath:"circle({R:.0f}px at {cx}px {cy}px)",duration:{d},ease:"none"}},{at + i * stagger:.2f});'
                 for i in range(len(colors)))
    return html, js


def zoom_through(p, inner, cw=760, at=0.0, d=1.2, k='zt'):
    # `inner` é o quadro inteiro da próxima cena, encolhido para um cartão de `cw` px no centro; cresce em escala
    # logarítmica (s0 → 1) até preencher a tela. Centrado: o cartão não se desloca, só cresce.
    assert 0 < cw < W, 'o cartão precisa caber na tela'
    s0 = cw / W
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:0;top:0;width:{W}px;height:{H}px;'
            f'transform:scale({s0:.4f});transform-origin:50% 50%;opacity:0">{inner}</div>')
    # o ease devolve a fração que faz o valor andar em s0^(1-ONE): log-linear, como um zoom de câmera
    ease = f'p=>(Math.pow({s0:.4f},1-ONE(p))-{s0:.4f})/(1-{s0:.4f})'
    js = (f'tl.set("#{p}-{k}",{{opacity:1}},{at:.2f});'
          f'tl.fromTo("#{p}-{k}",{{scale:{s0:.4f}}},{{scale:1,duration:{d},ease:{ease}}},{at:.2f});')
    return html, js


def _target(knots, t):
    # alvo em (dx, dy) por interpolação linear entre (t, dx, dy); antes do primeiro e depois do último, fica nas bordas
    if t <= knots[0][0]:
        return knots[0][1], knots[0][2]
    for (t0, x0, y0), (t1, x1, y1) in zip(knots, knots[1:]):
        if t <= t1:
            u_ = (t - t0) / (t1 - t0) if t1 > t0 else 1.0
            return x0 + (x1 - x0) * u_, y0 + (y1 - y0) * u_
    return knots[-1][1], knots[-1][2]


def follow(p, inner, knots, omega=14., zeta=.7, at=0.0, k='fw', fps=30):
    # `inner` é seguido por uma mola amortecida que persegue o alvo; knots = [(t, dx, dy)] em px a partir do repouso,
    # t em segundos desde `at`. A mola anda em passo fixo de 1/240 s a partir de t=0: mesmo quadro para o mesmo tempo.
    html = f'<div id="{p}-{k}" {AO} style="position:absolute;left:0;top:0;width:{W}px;height:{H}px">{inner}</div>'
    dt, n_frames = 1 / 240, int((knots[-1][0] + 1.2) * fps)
    x, y = _target(knots, 0.0); vx = vy = 0.0; tn = 0.0
    xs, ys = [x], [y]
    for j in range(1, n_frames + 1):
        t_end = j / fps
        while tn < t_end - 1e-9:
            tx, ty = _target(knots, tn)
            vx += (omega * omega * (tx - x) - 2 * zeta * omega * vx) * dt; x += vx * dt
            vy += (omega * omega * (ty - y) - 2 * zeta * omega * vy) * dt; y += vy * dt
            tn += dt
        xs.append(x); ys.append(y)
    frames = ','.join(f'{{x:{xs[j]:.2f},y:{ys[j]:.2f},duration:{1 / fps:.4f},ease:"none"}}' for j in range(1, len(xs)))
    js = f'tl.set("#{p}-{k}",{{x:{xs[0]:.2f},y:{ys[0]:.2f}}},{at:.2f});tl.to("#{p}-{k}",{{keyframes:[{frames}]}},{at:.2f});'
    return html, js


def carousel_loop(p, items, cy=960, cw=420, ch=620, gap=460, v=900., brake_at=1.0, at=0.0, k='cl', fps=30):
    # esteira de cards em velocidade constante; a partir de brake_at a velocidade cai até zero num card (ease quadrático,
    # sem degrau de velocidade). O laço só salta fora da tela: L >= largura da tela + um card.
    n = len(items); L = n * gap
    assert L >= W + cw, f'poucos cards ({n}): o salto do laço apareceria na tela'
    # posição de parada: múltiplo de gap; Δ sai de D = stop - P1 com v igual à velocidade de entrada
    P1 = v * brake_at
    stop = gap * math.ceil((P1 + .4 * v) / gap)
    T2 = brake_at + 2 * (stop - P1) / v
    def P(t):
        if t <= brake_at:
            return v * t
        if t >= T2:
            return stop
        u_ = (t - brake_at) / (T2 - brake_at)
        return P1 + (stop - P1) * (1 - (1 - u_) ** 2)
    def wrap(a):
        return (a + L / 2) % L - L / 2
    T_end = T2 + .6
    ts = [j / fps for j in range(int(T_end * fps) + 1)]
    html = ''.join(f'<div id="{p}-{k}{i}" {AO} style="position:absolute;left:{W // 2 - cw // 2}px;top:{cy - ch // 2}px;width:{cw}px;height:{ch}px">{it}</div>'
                   for i, it in enumerate(items))
    js = ''
    for i in range(n):
        sel = f'#{p}-{k}{i}'
        xs = [wrap(i * gap - P(t)) for t in ts]
        js += f'tl.set("{sel}",{{x:{xs[0]:.2f}}},{at:.2f});'
        s = 0
        for j in range(1, len(ts) + 1):
            # quebra o trecho onde o laço salta (passo maior que um gap entre dois quadros)
            if j == len(ts) or abs(xs[j] - xs[j - 1]) > gap:
                if j - 1 > s:
                    fr = ','.join(f'{{x:{xs[m]:.2f},duration:{1 / fps:.4f},ease:"none"}}' for m in range(s + 1, j))
                    js += f'tl.set("{sel}",{{x:{xs[s]:.2f}}},{at + ts[s]:.2f});tl.to("{sel}",{{keyframes:[{fr}]}},{at + ts[s]:.2f});'
                elif j < len(ts):
                    js += f'tl.set("{sel}",{{x:{xs[j]:.2f}}},{at + ts[j]:.2f});'
                s = j
    return html, js


def light_field(p, color=AMB, at=0.0, d_in=.5, hold=.3, d_out=1.1, k='lf'):
    # campo de luz ancorado abaixo da tela: infla até cobrir o quadro e drena (cor sólida na elipse, sem degradê de mancha)
    # origem da medida: chão em 0,84·H; a elipse tem 2,2·W de largura para o centro ficar claro
    w_, h_ = int(W * 2.2), int(H * 1.1)
    left, top = W / 2 - w_ / 2, H * .84 - h_ / 2
    html = (f'<div id="{p}-{k}" {AO} style="position:absolute;left:{left:.0f}px;top:{top:.0f}px;width:{w_}px;height:{h_}px;opacity:0;'
            f'background:radial-gradient(ellipse closest-side,{color} 0%,{color} 40%,rgba(0,0,0,0) 100%)"></div>')
    js = (f'tl.fromTo("#{p}-{k}",{{scale:.4,opacity:0}},{{scale:1.25,opacity:1,duration:{d_in},ease:"expo.out"}},{at:.2f});'
          f'tl.to("#{p}-{k}",{{scale:1.6,opacity:0,duration:{d_out},ease:"power2.in"}},{at + d_in + hold:.2f});')
    return html, js
