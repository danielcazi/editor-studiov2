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
// null de uma peça: anchor [0,0] no ponto de origem da transformação CSS; keyframes quadro a quadro
function pieceNull(comp, P) {
  var N = comp.layers.addNull(); N.name = P.scene + ' · peça ' + P.i + ' (controle)';
  var tr = N.property('ADBE Transform Group');
  tr.property('ADBE Anchor Point').setValue([0, 0]);
  var ts = [], ps = [], rs = [], ss = [], last = null;
  for (var k = 0; k < P.keys.length; k++) { var K = P.keys[k]; if (!K.p) continue; ts.push(K.t); ps.push(K.p); rs.push(K.r); ss.push(K.s); last = K; }
  if (!ts.length) { tr.property('ADBE Position').setValue(P.O); return N; }
  if (ts.length === 1) { tr.property('ADBE Position').setValue(ps[0]); tr.property('ADBE Rotate Z').setValue(rs[0]); tr.property('ADBE Scale').setValue(ss[0]); }
  else { tr.property('ADBE Position').setValuesAtTimes(ts, ps); tr.property('ADBE Rotate Z').setValuesAtTimes(ts, rs); tr.property('ADBE Scale').setValuesAtTimes(ts, ss); }
  span(N, P.a, P.b);
  return N;
}
function opacityKeys(L, P, own) {
  var ts = [], vs = [];
  for (var k = 0; k < P.keys.length; k++) { ts.push(P.keys[k].t); vs.push(clamp(P.keys[k].op * own, 0, 100)); }
  var op = L.property('ADBE Transform Group').property('ADBE Opacity');
  if (ts.length > 1) op.setValuesAtTimes(ts, vs); else op.setValue(vs[0]);
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
  span(L, P.a, P.b); opacityKeys(L, P, S.o); dropShadow(L, S.sh);
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
  span(L, P.a, P.b); opacityKeys(L, P, T.o * T.alpha); dropShadow(L, T.sh);
  return L;
}
// peça nativa: null + camadas na ordem do HTML (a última fica por cima)
function nativePiece(comp, P) {
  var N = pieceNull(comp, P), all = [], k;
  for (k = 0; k < P.shapes.length; k++) all.push({ ord: P.shapes[k].ord, s: P.shapes[k] });
  for (k = 0; k < P.texts.length; k++) all.push({ ord: P.texts[k].ord, t: P.texts[k] });
  all.sort(function (x, y) { return x.ord - y.ord; });
  for (k = 0; k < all.length; k++) { if (all[k].s) shapeLayer(comp, all[k].s, P, N); else textLayer(comp, all[k].t, P, N); }
  N.moveToBeginning();
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
  L.startTime = P.a; span(L, P.a, P.b);
  return L;
}
function piece(comp, P, folder) { if (P.kind === 'native') nativePiece(comp, P); else clipPiece(comp, P, folder); }
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

// de baixo para cima: z-index do HTML, depois a ordem no documento; dentro da cena, a ordem das peças
var stack = [];
for (k = 0; k < DATA.media.length; k++) if (DATA.media[k].tag === 'video') stack.push({ z: DATA.media[k].z, ord: DATA.media[k].ord, i: -1, m: DATA.media[k] });
for (k = 0; k < DATA.pieces.length; k++) stack.push({ z: DATA.pieces[k].z, ord: DATA.pieces[k].ord, i: DATA.pieces[k].i, p: DATA.pieces[k] });
stack.sort(function (x, y) { if (x.z !== y.z) return x.z - y.z; if (x.ord !== y.ord) return x.ord - y.ord; return x.i - y.i; });
for (k = 0; k < stack.length; k++) { it = stack[k]; if (it.m) mediaLayer(comp, it.m, folder); else piece(comp, it.p, folder); }
log('camadas ok: ' + stack.length);
var falta = []; for (var fk in FONTES_FALTANDO) falta.push(fk);
if (falta.length) log('FONTES FALTANDO (o After trocou por outra; instale e reabra): ' + falta.join(', '));
var vari = []; for (var vk in FONTE_VARIAVEL) vari.push(vk);
if (vari.length) log('fonte so na versao variavel (confira o peso num quadro renderizado): ' + vari.join(', '));

for (var m = 0; m < DATA.markers.length; m++) comp.markerProperty.setValueAtTime(DATA.markers[m].t, new MarkerValue(DATA.markers[m].label));
app.endUndoGroup();
app.project.save(new File(DATA.aep));
log('saved ' + DATA.aep);
})();
