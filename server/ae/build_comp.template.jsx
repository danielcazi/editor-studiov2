// Comp editável no After Effects. Gerado por server/ae/make_jsx.mjs (não edite o build_comp.jsx; edite este molde).
// As camadas seguem a composição HyperFrames: áudios (voz, efeitos) e vídeos (fundo, recorte) como os próprios arquivos,
// com a câmera em keyframes; cada cena com suas peças (NATIVAS: null com keyframes + textos e shape layers com Drop Shadow;
// CLIPES: ProRes 4444 com alfa para imagem, 3D, gradiente, SVG e conteúdo animado por dentro). Empilhadas pelo z-index do HTML.
// ExtendScript é ES3: sem let/const, setas, template strings.
(function () {
/*__DATA__*/
var ROOT = (new File($.fileName)).parent.fsName;
var FPS = DATA.fps, DUR = DATA.dur, W = DATA.w, H = DATA.h;
var LOGF = new File(ROOT + '/build_comp.log'); LOGF.open('w'); LOGF.writeln('start'); LOGF.close();
function log(s) { LOGF.open('a'); LOGF.writeln(s); LOGF.close(); }
function has(p) { return new File(p).exists; }
function importOne(path, folder) { var it = app.project.importFile(new ImportOptions(new File(path))); it.parentFolder = folder; return it; }
function c01(c) { return [c[0] / 255, c[1] / 255, c[2] / 255]; }
function clamp(x, a, b) { if (x < a) return a; if (x > b) return b; return x; }
function span(L, a, b) { L.inPoint = a; L.outPoint = Math.min(b, DUR); }
// nome PostScript da fonte: prefere arquivo ESTÁTICO (a variável faz o After desenhar o peso padrão, fino)
var FONTE_VARIAVEL = {};
function afont(fam, w, size) {
  var base = afontBase(fam, w), f = fam.replace(/\s+/g, '');
  var suf = base.replace(/^.*-/, '-'), cands = [base, f + '-' + w];   // algumas famílias usam o peso numérico (Aspekta-600)
  // a Inter variável do navegador escolhe o tamanho óptico pelo tamanho do texto (até 32); o estático mais próximo vem primeiro
  if (f === 'Inter') {
    var opt = ['Inter18pt' + suf, 'Inter24pt' + suf, 'Inter28pt' + suf, 'InterDisplay' + suf];
    if (size >= 26) opt = ['Inter28pt' + suf, 'InterDisplay' + suf, 'Inter24pt' + suf, 'Inter18pt' + suf];
    else if (size >= 21) opt = ['Inter24pt' + suf, 'Inter28pt' + suf, 'Inter18pt' + suf, 'InterDisplay' + suf];
    cands = opt.concat(cands);
  }
  try {
    if (app.fonts && app.fonts.getFontsByPostScriptName) {
      var achou = null;
      for (var i = 0; i < cands.length; i++) { var a = app.fonts.getFontsByPostScriptName(cands[i]);
        for (var j = 0; j < a.length; j++) { var est = !/variable/i.test(String(a[j].location || '')); if (est) return cands[i]; if (!achou) achou = cands[i]; } }
      if (achou) { FONTE_VARIAVEL[achou] = 1; return achou; }
      // o peso pedido não existe (o navegador engrossa a fonte por conta própria): o peso instalado mais próximo, em vez de outra família
      var pesos = ['Black', '900', 'ExtraBold', '800', 'Bold', '700', 'SemiBold', '600', 'Medium', '500', 'Regular', '400', 'Light', '300'];
      for (i = 0; i < pesos.length; i++) { var ps2 = f + '-' + pesos[i]; if (ps2 !== base && app.fonts.getFontsByPostScriptName(ps2).length) { FONTES_FALTANDO[base + ' (usado ' + ps2 + ')'] = 1; return ps2; } }
    }
  } catch (e) {}
  return base;
}
function afontBase(fam, w) {
  // sem ternário encadeado: o ExtendScript do After avalia "a ? b : c ? d : e" errado (todo peso virava Medium)
  var f = fam.replace(/\s+/g, '');
  if (f === 'Inter') {
    if (w >= 900) return 'Inter-Black';
    if (w >= 800) return 'Inter-ExtraBold';
    if (w >= 700) return 'Inter-Bold';
    if (w >= 600) return 'Inter-SemiBold';
    if (w >= 500) return 'Inter-Medium';
    return 'Inter-Regular';
  }
  if (f === 'JetBrainsMono') { if (w >= 700) return 'JetBrainsMono-Bold'; return 'JetBrainsMono-Medium'; }
  if (f === 'Comfortaa') { if (w >= 700) return 'Comfortaa-Bold'; return 'Comfortaa-Regular'; }
  if (w >= 900) return f + '-Black';
  if (w >= 800) return f + '-ExtraBold';
  if (w >= 700) return f + '-Bold';
  if (w >= 600) return f + '-SemiBold';
  if (w >= 500) return f + '-Medium';
  if (w >= 400) return f + '-Regular';
  if (w >= 300) return f + '-Light';
  return f + '-Thin';
}
var FONTES_FALTANDO = {};
function fonteExiste(ps) {
  try { if (app.fonts && app.fonts.getFontsByPostScriptName) return app.fonts.getFontsByPostScriptName(ps).length > 0; } catch (e) {}
  return true; // After antigo: não dá para conferir
}
// sombra CSS → efeito Drop Shadow (nativo, editável)
function dropShadow(L, sh) {
  if (!sh) return;
  try {
    var fx = L.property('ADBE Effect Parade').addProperty('ADBE Drop Shadow');
    fx.property('ADBE Drop Shadow-0001').setValue(c01(sh.c));
    var op = fx.property('ADBE Drop Shadow-0002'); op.setValue(Math.min(op.hasMax ? op.maxValue : 100, sh.a * (op.hasMax && op.maxValue > 100 ? 255 : 100)));
    fx.property('ADBE Drop Shadow-0003').setValue(Math.atan2(sh.dx, -sh.dy) * 180 / Math.PI);
    fx.property('ADBE Drop Shadow-0004').setValue(Math.sqrt(sh.dx * sh.dx + sh.dy * sh.dy));
    fx.property('ADBE Drop Shadow-0005').setValue(sh.blur);
  } catch (e) { log('sombra: ' + e.toString()); }
}
// câmera de mundo (compose): null 3D "mundo" com a pose do #world, um null 3D por profundidade (translateZ + escala de compensação)
// e uma câmera com zoom = perspective do CSS. As camadas dentro do mundo são filhas dessas nulls (e viram 3D no fim, ver abaixo).
var WN = null, DN = {};
function setKeys(prop, ts, vs) { if (ts.length > 1) prop.setValuesAtTimes(ts, vs); else if (ts.length) prop.setValue(vs[0]); }
function mundo(comp, Wd) {
  var cam = comp.layers.addCamera('câmera de mundo', [W / 2, H / 2]);
  cam.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
  cam.property('ADBE Camera Options Group').property('ADBE Camera Zoom').setValue(Wd.p);
  cam.property('ADBE Transform Group').property('ADBE Position').setValue([W / 2, H / 2, -Wd.p]);
  WN = comp.layers.addNull(); WN.name = 'mundo (câmera)'; WN.threeDLayer = true;
  var tr = WN.property('ADBE Transform Group'); tr.property('ADBE Anchor Point').setValue([W / 2, H / 2, 0]);
  var ts = [], ps = [], ss = [], rx = [], ry = [], rz = [];
  // CSS gira com z para o espectador, o After com z para o fundo: X e Y trocam de sinal
  for (var k = 0; k < Wd.keys.length; k++) { var K = Wd.keys[k]; ts.push(K.t); ps.push([W / 2 + K.x, H / 2 + K.y, 0]); ss.push([K.s * 100, K.s * 100, K.s * 100]); rx.push(-K.rx); ry.push(-K.ry); rz.push(K.rz); }
  setKeys(tr.property('ADBE Position'), ts, ps); setKeys(tr.property('ADBE Scale'), ts, ss);
  setKeys(tr.property('ADBE Rotate X'), ts, rx); setKeys(tr.property('ADBE Rotate Y'), ts, ry); setKeys(tr.property('ADBE Rotate Z'), ts, rz);
  DN['@world'] = WN;
  for (k = 0; k < Wd.depths.length; k++) {
    var D = Wd.depths[k], N = comp.layers.addNull(); N.name = 'profundidade ' + D.id; N.threeDLayer = true;
    var t2 = N.property('ADBE Transform Group'); t2.property('ADBE Anchor Point').setValue([W / 2, H / 2, 0]);
    t2.property('ADBE Position').setValue([W / 2, H / 2, -D.z]); t2.property('ADBE Scale').setValue([D.s * 100, D.s * 100, D.s * 100]);
    N.parent = WN; DN[D.id] = N;
  }
}
// sem "jump": as posições já estão no espaço de repouso do mundo, que coincide com a comp
function pai(L, depth) { if (L && depth && DN[depth]) L.parent = DN[depth]; }
// null de uma peça: anchor [0,0] no ponto de origem da transformação CSS; keyframes quadro a quadro
function poseKeys(tr, keys, O) {
  var ts = [], ps = [], rs = [], ss = [];
  for (var k = 0; k < keys.length; k++) { var K = keys[k]; if (!K.p) continue; ts.push(K.t); ps.push(K.p); rs.push(K.r); ss.push(K.s); }
  if (!ts.length) { if (O) tr.property('ADBE Position').setValue(O); return; }
  setKeys(tr.property('ADBE Position'), ts, ps); setKeys(tr.property('ADBE Rotate Z'), ts, rs); setKeys(tr.property('ADBE Scale'), ts, ss);
}
function pieceNull(comp, P) {
  var N = comp.layers.addNull(); N.name = P.scene + ' · peça ' + P.i + ' (controle)';
  var tr = N.property('ADBE Transform Group');
  tr.property('ADBE Anchor Point').setValue([0, 0]);
  poseKeys(tr, P.keys, P.O);
  span(N, P.a, P.b); pai(N, P.depth);
  return N;
}
function opacityKeys(L, P, own) {
  var ts = [], vs = [];
  for (var k = 0; k < P.keys.length; k++) { ts.push(P.keys[k].t); vs.push(clamp(P.keys[k].op * own, 0, 100)); }
  var op = L.property('ADBE Transform Group').property('ADBE Opacity');
  if (ts.length > 1) op.setValuesAtTimes(ts, vs); else op.setValue(vs[0]);
}
// filter: blur(px) do CSS → Gaussian Blur; Blurriness = px × 3,6 (medido no After: 40 → σ 10,9 px, 73 → σ 20,3 px; o ÷0,3 do lottie dava 9% a mais de σ pedido)
function blurKeys(L, P) {
  var ts = [], vs = [], any = false;
  for (var k = 0; k < P.keys.length; k++) { ts.push(P.keys[k].t); vs.push((P.keys[k].bl || 0) * 3.6); if (P.keys[k].bl) any = true; }
  if (!any) return;
  var fx = L.property('ADBE Effect Parade').addProperty('ADBE Gaussian Blur 2');
  fx.property('ADBE Gaussian Blur 2-0003').setValue(false); // com repetir bordas ligado a borda de sólido e imagem não esfuma, e o CSS esfuma
  setKeys(fx.property('ADBE Gaussian Blur 2-0001'), ts, vs);
}
var BM = { multiply: 'MULTIPLY', screen: 'SCREEN', overlay: 'OVERLAY', darken: 'DARKEN', lighten: 'LIGHTEN', 'color-dodge': 'COLOR_DODGE', 'color-burn': 'COLOR_BURN', 'hard-light': 'HARD_LIGHT', 'soft-light': 'SOFT_LIGHT', difference: 'DIFFERENCE', exclusion: 'EXCLUSION', hue: 'HUE', saturation: 'SATURATION', color: 'COLOR', luminosity: 'LUMINOSITY', 'plus-lighter': 'ADD' };
// mix-blend-mode da peça → blending mode de cada camada dela (clipes também: o .mov é composto com o mesmo modo)
function blend(L, P) { if (P.blend && BM[P.blend]) try { L.blendingMode = BlendingMode[BM[P.blend]]; } catch (e) { log('blend ' + P.blend + ': ' + e); } }
var KAPPA = 0.5523;
// retângulo com cantos redondos como Shape de máscara (espaço da camada); r = 0 dá um retângulo
function rrShape(x0, y0, x1, y1, r) {
  var s = new Shape(); r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2); var k = r * KAPPA;
  s.vertices = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
  s.inTangents = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
  s.outTangents = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
  s.closed = true; return s;
}
function ellShape(cx, cy, rx, ry) {
  var s = new Shape(), kx = rx * KAPPA, ky = ry * KAPPA;
  s.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
  s.inTangents = [[-kx, 0], [0, -ky], [kx, 0], [0, ky]]; s.outTangents = [[kx, 0], [0, ky], [-kx, 0], [0, -ky]];
  s.closed = true; return s;
}
// máscaras seguintes cortam (interseção), não somam
function addMask(L, shape, feather, inverted) {
  var par = L.property('ADBE Mask Parade'), m = par.addProperty('ADBE Mask Atom');
  m.property('ADBE Mask Shape').setValue(shape); m.property('ADBE Mask Feather').setValue([feather, feather]); m.inverted = !!inverted;
  if (par.numProperties > 1) m.maskMode = MaskMode.INTERSECT;
  return m;
}
// degradê de 2 cores num sólido do tamanho da caixa: Gradient Ramp (opaco), Linear Wipe (linear só de alfa) ou máscara elíptica
// com pluma (radial só de alfa). Elipse: o sólido é esticado em Y e a camada leva escala Y = ry/rx, porque o Ramp radial é circular.
function gradLayer(comp, S, P, N) {
  var G = S.grad, op = G.c1, hid = G.c0;   // wipe/vig: 'op' é a ponta que aparece, 'hid' a transparente
  if (G.c0.a > G.c1.a) { op = G.c0; hid = G.c1; }
  var q = G.shape === 'radial' ? G.ry / G.rx : 1, hs = S.h / q, own = S.o;
  var L = comp.layers.addSolid(c01(op.c), P.scene + ' · degradê · ' + S.cls, Math.max(1, Math.round(S.w)), Math.max(1, Math.round(hs)), 1, DUR);
  var a = (G.ang || 0) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), len = Math.abs(S.w * dx) + Math.abs(S.h * dy);
  if (G.kind === 'ramp') {
    var fx = L.property('ADBE Effect Parade').addProperty('ADBE Ramp'), p0, p1;
    if (G.shape === 'linear') { p0 = [S.w / 2 + dx * len * (G.s0 - 0.5), S.h / 2 + dy * len * (G.s0 - 0.5)]; p1 = [S.w / 2 + dx * len * (G.s1 - 0.5), S.h / 2 + dy * len * (G.s1 - 0.5)]; }
    else { p0 = [G.cx, G.cy / q]; p1 = [G.cx + G.rx * G.s1, G.cy / q]; fx.property('ADBE Ramp-0005').setValue(2); }   // shortcut: a parada inicial do radial fica no centro, o Ramp não tem raio interno
    fx.property('ADBE Ramp-0001').setValue(p0); fx.property('ADBE Ramp-0002').setValue(c01(G.c0.c));
    fx.property('ADBE Ramp-0003').setValue(p1); fx.property('ADBE Ramp-0004').setValue(c01(G.c1.c));
  } else if (G.kind === 'wipe') {
    own = S.o * op.a;
    var ang = G.ang, m = (G.s0 + G.s1) / 2;
    if (hid === G.c1) { ang += 180; m = 1 - m; }   // transparente no fim: o wipe vem do lado oposto
    var w = L.property('ADBE Effect Parade').addProperty('ADBE Linear Wipe');
    w.property('ADBE Linear Wipe-0001').setValue(m * 100); w.property('ADBE Linear Wipe-0002').setValue(ang); w.property('ADBE Linear Wipe-0003').setValue((G.s1 - G.s0) * len);
  } else {
    own = S.o * op.a;
    var mm = (G.s0 + G.s1) / 2;
    addMask(L, ellShape(G.cx, G.cy / q, G.rx * mm, G.rx * mm), (G.s1 - G.s0) * G.rx, hid === G.c0);   // no sólido esticado a elipse é um círculo
  }
  if (S.rad > 0) addMask(L, rrShape(0, 0, S.w, hs, S.rad), 0, false);   // shortcut: canto esticado junto com o sólido nas elipses
  parentTo(L, N);
  var tr = L.property('ADBE Transform Group');
  tr.property('ADBE Scale').setValue([100, q * 100]);
  tr.property('ADBE Position').setValue([S.x + S.w / 2 - P.O[0], S.y + S.h / 2 - P.O[1]]);
  span(L, P.a, P.b); opacityKeys(L, P, own); blurKeys(L, P); blend(L, P);
  return L;
}
// <img>: o próprio arquivo importado, com a escala do object-fit; cover e cantos redondos viram máscara no espaço da imagem
var IMGC = {};
function imgLayer(comp, S, P, N, folder) {
  var f = ROOT + '/' + S.file;
  if (!has(f)) { log('sem imagem ' + f); return null; }
  if (!IMGC[f]) IMGC[f] = importOne(f, folder);
  var L = comp.layers.add(IMGC[f]);
  L.name = P.scene + ' · imagem · ' + S.file.replace(/^.*\//, '');
  var kx = S.w / S.nw, ky = S.h / S.nh, sx = kx, sy = ky;
  if (S.fit === 'cover') { sx = sy = Math.max(kx, ky); } else if (S.fit === 'contain') { sx = sy = Math.min(kx, ky); }
  if (S.fit === 'cover' || S.rad > 0) { var mw = S.w / sx, mh = S.h / sy; addMask(L, rrShape(S.nw / 2 - mw / 2, S.nh / 2 - mh / 2, S.nw / 2 + mw / 2, S.nh / 2 + mh / 2, S.rad / sx), 0, false); }
  parentTo(L, N);
  var tr = L.property('ADBE Transform Group');
  tr.property('ADBE Anchor Point').setValue([S.nw / 2, S.nh / 2]);
  tr.property('ADBE Scale').setValue([sx * 100, sy * 100]);
  tr.property('ADBE Position').setValue([S.x + S.w / 2 - P.O[0], S.y + S.h / 2 - P.O[1]]);
  span(L, P.a, P.b); opacityKeys(L, P, S.o); blurKeys(L, P); dropShadow(L, S.sh); blend(L, P);
  return L;
}
function parentTo(L, N) { if (L.setParentWithJump) L.setParentWithJump(N); else L.parent = N; }
function shapeLayer(comp, S, P, N) {
  var L = comp.layers.addShape();
  L.name = P.scene + ' · forma · ' + S.cls;
  var g = L.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var cont = g.property('ADBE Vectors Group');
  var sw = S.stroke ? S.stroke.w : 0;
  var rc = cont.addProperty('ADBE Vector Shape - Rect');
  rc.property('ADBE Vector Rect Size').setValue([Math.max(1, S.w - sw), Math.max(1, S.h - sw)]);
  rc.property('ADBE Vector Rect Roundness').setValue(Math.max(0, S.rad - sw / 2));
  if (S.stroke) {
    var st = cont.addProperty('ADBE Vector Graphic - Stroke');
    st.property('ADBE Vector Stroke Color').setValue(c01(S.stroke.c)); st.property('ADBE Vector Stroke Width').setValue(sw);
    st.property('ADBE Vector Stroke Opacity').setValue(S.stroke.a * 100);
  }
  if (S.fill) {
    var f = cont.addProperty('ADBE Vector Graphic - Fill');
    f.property('ADBE Vector Fill Color').setValue(c01(S.fill.c)); f.property('ADBE Vector Fill Opacity').setValue(S.fill.a * 100);
  }
  parentTo(L, N);
  L.property('ADBE Transform Group').property('ADBE Position').setValue([S.x + S.w / 2 - P.O[0], S.y + S.h / 2 - P.O[1]]);
  span(L, P.a, P.b); opacityKeys(L, P, S.o); blurKeys(L, P); dropShadow(L, S.sh); blend(L, P);
  return L;
}
function textLayer(comp, T, P, N) {
  var L = comp.layers.addText(T.text.replace(/\n/g, '\r'));
  L.name = P.scene + ' · texto · ' + T.text.replace(/\n/g, ' ').substr(0, 40);
  var st = L.property('ADBE Text Properties').property('ADBE Text Document'), td = st.value;
  td.resetCharStyle(); td.resetParagraphStyle();
  var ps = afont(T.fam, T.weight, T.size); if (!fonteExiste(ps)) FONTES_FALTANDO[ps] = 1;
  td.font = ps; td.fontSize = T.size; td.applyFill = true; td.fillColor = c01(T.color); td.applyStroke = false;
  td.tracking = Math.round(T.track); td.leading = T.lh; // o After só aceita tracking inteiro
  // uma linha: alinhado à esquerda na borda medida no HTML (o After ignora a justificação de texto de ponto criado por script)
  var umaLinha = (T.lines || 1) === 1 && T.l != null;
  var just = ParagraphJustification.RIGHT_JUSTIFY;
  if (umaLinha || T.align === 'left') just = ParagraphJustification.LEFT_JUSTIFY;
  else if (T.align === 'center') just = ParagraphJustification.CENTER_JUSTIFY;
  td.justification = just;
  st.setValue(td);
  parentTo(L, N);
  var tr = L.property('ADBE Transform Group');
  tr.property('ADBE Anchor Point').setValue([0, 0]);
  tr.property('ADBE Position').setValue([(umaLinha ? T.l : T.x) - P.O[0], T.base - P.O[1]]);
  span(L, P.a, P.b); opacityKeys(L, P, T.o * T.alpha); blurKeys(L, P); dropShadow(L, T.sh); blend(L, P);
  return L;
}
// peça nativa: null + camadas na ordem do HTML (a última fica por cima)
function nativePiece(comp, P, folder) {
  var N = pieceNull(comp, P), all = [], k;
  for (k = 0; k < P.shapes.length; k++) all.push({ ord: P.shapes[k].ord, s: P.shapes[k] });
  for (k = 0; k < P.texts.length; k++) all.push({ ord: P.texts[k].ord, t: P.texts[k] });
  all.sort(function (x, y) { return x.ord - y.ord; });
  for (k = 0; k < all.length; k++) {
    var S = all[k].s;
    if (!S) textLayer(comp, all[k].t, P, N); else if (S.kind === 'img') imgLayer(comp, S, P, N, folder); else if (S.kind === 'grad') gradLayer(comp, S, P, N); else shapeLayer(comp, S, P, N);
  }
  N.moveToBeginning();
}
// texto desenhado em canvas (ilustração do compose): camada de texto com a pose da frase quadro a quadro; o clipe leva só a decoração
function ctextLayer(comp, P) {
  var L = comp.layers.addText(P.text);
  L.name = P.scene + ' · texto · ' + P.text.substr(0, 40);
  var st = L.property('ADBE Text Properties').property('ADBE Text Document'), td = st.value;
  td.resetCharStyle(); td.resetParagraphStyle();
  var ps = afont(P.fam, P.weight, P.size); if (!fonteExiste(ps)) FONTES_FALTANDO[ps] = 1;
  td.font = ps; td.fontSize = P.size; td.applyFill = true; td.fillColor = c01(P.color); td.applyStroke = false;
  td.tracking = Math.round(P.track); td.justification = ParagraphJustification.LEFT_JUSTIFY;
  st.setValue(td);
  var tr = L.property('ADBE Transform Group');
  tr.property('ADBE Anchor Point').setValue([0, 0]);
  poseKeys(tr, P.keys, null);
  span(L, P.a, P.b); opacityKeys(L, P, P.alpha); dropShadow(L, P.sh); blend(L, P); pai(L, P.depth);
  return L;
}
// peça em clipe ProRes 4444 com alfa, idêntico ao HTML
function clipPiece(comp, P, folder) {
  var f = ROOT + '/' + P.file;
  if (!has(f)) { log('sem clipe ' + f); return null; }
  var it = importOne(f, folder); try { it.mainSource.alphaMode = AlphaMode.STRAIGHT; it.mainSource.conformFrameRate = FPS; } catch (e) {}
  var L = comp.layers.add(it);
  L.name = P.scene + ' · clipe · ' + P.file.replace(/^.*\//, '');
  var tr = L.property('ADBE Transform Group');
  tr.property('ADBE Anchor Point').setValue([0, 0]);
  tr.property('ADBE Position').setValue([P.x, P.y]);
  L.startTime = P.a; span(L, P.a, P.b); blend(L, P); pai(L, P.depth);
  return L;
}
function piece(comp, P, folder) { if (P.kind === 'native') nativePiece(comp, P, folder); else if (P.kind === 'ctext') ctextLayer(comp, P); else clipPiece(comp, P, folder); }
// vídeo/áudio da composição: o arquivo original no trecho em que toca; vídeo com a câmera (posição/escala/opacidade) em keyframes
var CACHE = {};
function mediaLayer(comp, M, folder) {
  if (!has(M.file)) { log('sem midia ' + M.file); return null; }
  var it = CACHE[M.file];
  if (!it) { it = CACHE[M.file] = importOne(M.file, folder); try { if (M.alpha) it.mainSource.alphaMode = AlphaMode.STRAIGHT; } catch (e) {} }
  var L = comp.layers.add(it);
  L.name = M.id;
  L.startTime = M.a - (M.ms || 0); L.inPoint = M.a; L.outPoint = Math.min(M.b, DUR);
  if (M.tag === 'audio') {
    if (M.vol !== 1) L.property('ADBE Audio Group').property('ADBE Audio Levels').setValue(M.vol > 0 ? [20 * Math.log(M.vol) / Math.LN10, 20 * Math.log(M.vol) / Math.LN10] : [-96, -96]);
    return L;
  }
  L.audioEnabled = false; // o som vem das camadas de áudio, como no HTML (vídeos mudos)
  var tr = L.property('ADBE Transform Group'), ts = [], ps = [], ss = [], os = [];
  tr.property('ADBE Anchor Point').setValue([M.sw / 2, M.sh / 2]);
  for (var k = 0; k < M.keys.length; k++) { ts.push(M.keys[k].t); ps.push(M.keys[k].p); ss.push(M.keys[k].s); os.push(clamp(M.keys[k].op, 0, 100)); }
  if (ts.length > 1) { tr.property('ADBE Position').setValuesAtTimes(ts, ps); tr.property('ADBE Scale').setValuesAtTimes(ts, ss); tr.property('ADBE Opacity').setValuesAtTimes(ts, os); }
  else if (ts.length) { tr.property('ADBE Position').setValue(ps[0]); tr.property('ADBE Scale').setValue(ss[0]); tr.property('ADBE Opacity').setValue(os[0]); }
  pai(L, M.depth);
  return L;
}

app.beginUndoGroup(DATA.name + ' — montar comp');
if (!app.project) app.newProject();
var root = app.project.items.addFolder(DATA.name);
var folder = app.project.items.addFolder('Arquivos'); folder.parentFolder = root;
var comp = app.project.items.addComp(DATA.name, W, H, 1, DUR, FPS);
comp.parentFolder = root; comp.bgColor = [0, 0, 0];

var k, it;
for (k = 0; k < DATA.media.length; k++) if (DATA.media[k].tag === 'audio') mediaLayer(comp, DATA.media[k], folder);
log('audio ok');
if (DATA.world) { mundo(comp, DATA.world); log('mundo ok'); }

// de baixo para cima: z-index do HTML, depois a ordem no documento; dentro da cena, a ordem das peças (texto de canvas logo acima do seu clipe)
var stack = [];
for (k = 0; k < DATA.media.length; k++) if (DATA.media[k].tag === 'video') stack.push({ z: DATA.media[k].z, ord: DATA.media[k].ord, i: -1, sub: 0, m: DATA.media[k] });
for (k = 0; k < DATA.pieces.length; k++) stack.push({ z: DATA.pieces[k].z, ord: DATA.pieces[k].ord, i: DATA.pieces[k].i, sub: DATA.pieces[k].sub || 0, p: DATA.pieces[k] });
stack.sort(function (x, y) { if (x.z !== y.z) return x.z - y.z; if (x.ord !== y.ord) return x.ord - y.ord; if (x.i !== y.i) return x.i - y.i; return x.sub - y.sub; });
for (k = 0; k < stack.length; k++) { it = stack[k]; if (it.m) mediaLayer(comp, it.m, folder); else piece(comp, it.p, folder); }
log('camadas ok: ' + stack.length);
// tudo que pende do mundo vira 3D (um filho 2D de null 3D não é projetado pela câmera); as nulls do mundo ficam no topo da pilha
if (WN) {
  for (k = 1; k <= comp.numLayers; k++) {
    var L = comp.layer(k), p = L;
    if (!L.hasVideo || L instanceof CameraLayer) continue;
    while (p.parent) p = p.parent;
    if (p.index === WN.index) L.threeDLayer = true;
  }
  for (var dk in DN) DN[dk].moveToBeginning();
  WN.moveToBeginning();
}
var falta = []; for (var fk in FONTES_FALTANDO) falta.push(fk);
if (falta.length) log('FONTES FALTANDO (o After trocou por outra; instale e reabra): ' + falta.join(', '));
var vari = []; for (var vk in FONTE_VARIAVEL) vari.push(vk);
if (vari.length) log('fonte so na versao variavel (confira o peso num quadro renderizado): ' + vari.join(', '));

for (var m = 0; m < DATA.markers.length; m++) comp.markerProperty.setValueAtTime(DATA.markers[m].t, new MarkerValue(DATA.markers[m].label));
app.endUndoGroup();
app.project.save(new File(DATA.aep));
log('saved ' + DATA.aep);
})();
