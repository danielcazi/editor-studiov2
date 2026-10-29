// Checagem de layout do locutor (GUIDE §2 a §6 e §8), medida no Chrome headless com o runtime do HyperFrames.
// Uso: node layout_check.mjs <pasta do compose>. Saída: 0 ok · 1 regra quebrada · 2 não rodou (sem Chrome ou puppeteer-core).
// Lê compose.json, scenes.json, index.html e cut.webm; grava review/layout.json e review/recorte.png (10 quadros do recorte sobre verde).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// uso: node layout_check.mjs [-v] <pasta do compose>; -v imprime cada caixa medida, para calibrar as zonas
const VERBOSO = process.argv.includes('-v');
const DIR = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-')) ?? '.');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(HERE, '../claude-reel-editor/skills/reel-editor/engine/hf/hyperframe.runtime.iife.js');
const SRC_W = 1920, SRC_H = 1080;                      // fonte no palco do compositor (FIT_STAGE)
const COBERTO = 0.5;                                   // acima disso a palavra deixa de estar visível (GUIDE §4)

const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'compose.json'), 'utf8'));
const cenas = JSON.parse(fs.readFileSync(path.join(DIR, 'scenes.json'), 'utf8'));
const W = cfg.W, H = cfg.H, FACE = cfg.faceX ?? 980;
const ZONA = {
  top: cfg.safeZone?.top ?? Math.round(H * 0.104),
  bottom: H - (cfg.safeZone?.bottom ?? Math.round(H * 0.198)),
  left: cfg.safeZone?.left ?? Math.round(W * 0.065),
  right: W - (cfg.safeZone?.right ?? Math.round(W * 0.065)),
};
// cabeça na fonte, em px da fonte: medida na máscara de um clipe real (topo ≈170, queixo ≈445, largura ≈215).
// Pode ser trocada em compose.json ("head": {top, bottom, halfW}) para outro enquadramento de câmera.
const HEAD = { top: 170, bottom: 445, halfW: 110, ...(cfg.head ?? {}) };
const CUT = path.join(DIR, 'assets', 'cut.webm');   // o mesmo arquivo que o index.html toca

const erros = [], avisos = [], vistos = new Set();
const reporta = (tipo, chave, msg) => { if (vistos.has(chave)) return; vistos.add(chave); (tipo === 'erro' ? erros : avisos).push(msg); console.log(`${tipo}: ${msg}`); };
const sair = (code, msg) => { if (msg) console.error(msg); process.exit(code); };

// Geometria do #ccam (kit.py): a fonte 1920×1080 fica com a base no rodapé e o rosto (faceX) como origem do zoom.
const ccamLeft = W / 2 - FACE, ccamTop = H - SRC_H, ox = FACE, oy = SRC_H;
const paraTela = (x, y, cam) => ({ X: ccamLeft + ox + cam.e + cam.s * (x - ox), Y: ccamTop + oy + cam.f + cam.s * (y - oy) });
const daTela = (X, Y, cam) => ({ x: ox + (X - ccamLeft - ox - cam.e) / cam.s, y: oy + (Y - ccamTop - oy - cam.f) / cam.s });
const retangulo = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
const cabecaNaTela = (cam, cx) => {
  const a = paraTela(cx - HEAD.halfW, HEAD.top, cam), b = paraTela(cx + HEAD.halfW, HEAD.bottom, cam);
  return retangulo(a.X, a.Y, b.X, b.Y);
};
const sobrepoe = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;

// Alfa do recorte num instante: 1920×1080 bytes (0 a 255). null se o ffmpeg falhar.
const alfa = (t) => {
  try {
    // libvpx-vp9 é o decoder que lê o canal alfa do webm (o padrão do ffmpeg descarta)
    const buf = execFileSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', String(t), '-i', CUT, '-frames:v', '1', '-vf', 'alphaextract,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
    return buf.length === SRC_W * SRC_H ? buf : null;
  } catch { return null; }
};

// Centro horizontal da cabeça: média do x do recorte nas linhas de cima da cabeça (acima dos ombros).
const centroDaCabeca = (mask) => {
  let soma = 0, n = 0;
  for (let y = HEAD.top + 10; y < HEAD.top + 110; y++) for (let x = 0; x < SRC_W; x++) if (mask[y * SRC_W + x] > 127) { soma += x; n++; }
  return n ? Math.round(soma / n) : FACE;
};

// Roda no navegador: câmera do #ccam (matriz real do GSAP) e caixas de texto e de elementos de cada cena.
function coletaNaPagina(ids) {
  const opac = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.display === 'none' || c.visibility === 'hidden') return 0;
      o *= parseFloat(c.opacity) || 0;
    }
    return o;
  };
  // parte da caixa que aparece: recortada por ancestrais com overflow (contadores que rolam) e pelo quadro
  const visivel = (el, r) => {
    let x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0), x1 = Math.min(r.right, innerWidth), y1 = Math.min(r.bottom, innerHeight);
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
      const b = n.getBoundingClientRect();
      x0 = Math.max(x0, b.left); y0 = Math.max(y0, b.top); x1 = Math.min(x1, b.right); y1 = Math.min(y1, b.bottom);
    }
    const area = (r.right - r.left) * (r.bottom - r.top) || 1;
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    return { x: x0, y: y0, w, h, frac: (w * h) / area };
  };
  const cc = document.getElementById('ccam');
  let cam = null;
  if (cc) {
    const tr = getComputedStyle(cc).transform;
    const m = tr === 'none' ? new DOMMatrix() : new DOMMatrix(tr);
    cam = { s: m.a, e: m.e, f: m.f, op: opac(cc) };
    const v = document.getElementById('cut');
    if (v) cam.video = { rs: v.readyState, ct: +v.currentTime.toFixed(2), paused: v.paused, op: opac(v), err: v.error ? v.error.code : null, src: (v.currentSrc || '').slice(-20) };
  }
  const out = {};
  for (const id of ids) {
    const host = document.getElementById(id);
    if (!host) { out[id] = null; continue; }
    const texts = [], boxes = [];
    const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let n;
    // a caixa do texto é o em-box da fonte, bem maior que a altura das capitulares: mede-se só a altura de maiúscula por linha
    const ctx = document.createElement('canvas').getContext('2d');
    while ((n = w.nextNode())) {
      const t = n.textContent.trim();
      if (!t || /^(STYLE|SCRIPT)$/.test(n.parentElement.tagName)) continue;
      if (opac(n.parentElement) < 0.05) continue;
      const cs = getComputedStyle(n.parentElement);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const fa = ctx.measureText('H').fontBoundingBoxAscent, cap = ctx.measureText('H').actualBoundingBoxAscent;
      const r = document.createRange();
      r.selectNodeContents(n);
      const linhas = [...r.getClientRects()].filter((b) => b.width >= 1 && b.height >= 1);
      // a caixa inclui a margem lateral da fonte: quando o texto é de uma linha só, mede-se a tinta (canvas)
      ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      const m = ctx.measureText(cs.textTransform === 'uppercase' ? t.toUpperCase() : t);
      for (const b of linhas) {
        const solo = linhas.length === 1;
        const left = solo ? b.left - m.actualBoundingBoxLeft : b.left, right = solo ? b.left + m.actualBoundingBoxRight : b.right;
        const v = visivel(n.parentElement, { left, top: b.top + (fa - cap), right, bottom: b.top + fa });
        if (v.frac < 0.05) continue;   // escondido pelo recorte ou fora do quadro
        texts.push({ t: t.slice(0, 32), x: v.x, y: v.y, w: v.w, h: v.h, frac: v.frac });
      }
    }
    for (const el of host.querySelectorAll('*')) {
      const cls = el.getAttribute('class') || '';
      const ilustra = /^(IMG|SVG)$/.test(el.tagName) || /\b(card|pill|ico)\b/.test(cls);
      if (el.children.length && !ilustra) continue;   // só folhas e cartões: wrappers de layout não contam
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || (b.width > 1000 && b.height > 1500)) continue;   // fundo de tela inteira
      if (opac(el) < 0.5) continue;
      const v = visivel(el, b);
      if (v.frac < 0.05 || v.w < 2 || v.h < 2) continue;
      boxes.push({ tag: el.tagName.toLowerCase() + (cls ? '.' + cls.split(/\s+/)[0] : ''), x: v.x, y: v.y, w: v.w, h: v.h, frac: v.frac });
    }
    out[id] = { texts, boxes };
  }
  return { cam, out };
}

function acharChrome() {
  const cache = path.join(os.homedir(), '.cache/puppeteer/chrome');
  const achados = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  try {
    for (const v of fs.readdirSync(cache)) for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
      achados.push(path.join(cache, v, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    }
  } catch { /* sem cache do puppeteer */ }
  return achados.find((p) => p && fs.existsSync(p));
}

function folhaDoRecorte() {
  const dur = cenas.at(-1).b;
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', CUT, '-f', 'lavfi', '-i', `color=c=0x00ff00:s=${SRC_W}x${SRC_H}:d=${dur}`,
      '-filter_complex', `[1:v][0:v]overlay=shortest=1,fps=${10 / dur},scale=384:216,tile=5x2`, '-frames:v', '1', path.join(DIR, 'review', 'recorte.png')]);
  } catch (e) { reporta('aviso', 'folha', 'folha do recorte não foi gerada: ' + String(e.message).slice(0, 120)); }
}

// ---- preparo: puppeteer, Chrome, runtime ----
if (!fs.existsSync(CUT)) sair(2, 'sem cut.webm: nada a medir');
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); }
catch { sair(2, 'puppeteer-core não encontrado: rode "npm install" em server/'); }
const CHROME = acharChrome();
if (!CHROME) sair(2, 'Chrome não encontrado: defina CHROME_PATH');
if (!fs.existsSync(RUNTIME)) sair(2, 'runtime do HyperFrames não encontrado: ' + RUNTIME);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.otf': 'font/otf', '.ttf': 'font/ttf', '.json': 'application/json', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/__hf_runtime.js') return r.end(fs.readFileSync(RUNTIME));
  const p = path.resolve(DIR, '.' + (u === '/' ? '/index.html' : u));
  if (!p.startsWith(DIR + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream');
  if (p === path.join(DIR, 'index.html')) return r.end(fs.readFileSync(p, 'utf8').replace(/<\/body>/i, '<script src="/__hf_runtime.js"></script></body>'));
  // o Chrome só faz seek em vídeo com resposta 206 (Range); sem isso o #cut fica no primeiro quadro
  const total = fs.statSync(p).size;
  const faixa = q.headers.range && /bytes=(\d*)-(\d*)/.exec(q.headers.range);
  r.setHeader('accept-ranges', 'bytes');
  if (faixa) {
    const ini = faixa[1] ? +faixa[1] : 0, fim = faixa[2] ? Math.min(+faixa[2], total - 1) : total - 1;
    r.statusCode = 206;
    r.setHeader('content-range', `bytes ${ini}-${fim}/${total}`);
    r.setHeader('content-length', fim - ini + 1);
    return fs.createReadStream(p, { start: ini, end: fim }).pipe(r);
  }
  r.setHeader('content-length', total);
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));

let browser;
let codigo = 0;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__playerReady && window.__player, { timeout: 60000 });
  await page.evaluate(() => { window.__player.enableRenderMode && window.__player.enableRenderMode(); return document.fonts.ready.then(() => 0); });
  // o runtime nem sempre leva o #cut ao tempo da linha do tempo (ficava em 0 depois do primeiro seek): leva-se à mão
  const seek = (t) => page.evaluate(async (x) => {
    await window.__player.renderSeek(x);
    if (window.__hfWaitForSeekCompletion) await window.__hfWaitForSeekCompletion();
    await document.fonts.ready;
    const v = document.getElementById('cut');
    if (v && Math.abs(v.currentTime - x) > 0.02) {
      await new Promise((ok) => { v.addEventListener('seeked', ok, { once: true }); v.currentTime = x; setTimeout(ok, 2000); });
    }
  }, t);

  fs.mkdirSync(path.join(DIR, 'review'), { recursive: true });
  for (const c of cenas) {
    const pad = String(c.n).padStart(2, '0'), ids = [`b${pad}`, `s${pad}`], d = c.b - c.a;
    // duas amostras por cena: a primeira perto do início (o contact sheet de §8) e outra depois, para pegar o que entra depois
    for (const t of [c.a + Math.min(0.6, d / 2), c.a + d * 0.75]) {
      const antes = erros.length;
      await seek(t);
      amostra: {
      const { cam, out } = await page.evaluate(coletaNaPagina, ids);
      if (VERBOSO && cam) console.log(`  ${c.n} t=${t.toFixed(2)} ccam scale=${cam.s.toFixed(2)} op=${cam.op} video=${JSON.stringify(cam.video)}`);
      const locutor = !!c.cam && cam && cam.op > 0.5;
      const back = out[ids[0]]?.texts ?? [];
      const front = [...(out[ids[1]]?.texts ?? []), ...(out[ids[1]]?.boxes ?? [])];

      // zonas seguras: texto inteiro dentro da zona (§6); sem locutor na tela vira aviso
      if (VERBOSO) for (const x of [...back.map((x) => ['fundo', x]), ...(out[ids[1]]?.texts ?? []).map((x) => ['frente', x])]) {
        console.log(`  ${c.n} ${x[0]} "${x[1].t}" x=${x[1].x.toFixed(0)} y=${x[1].y.toFixed(0)} w=${x[1].w.toFixed(0)} h=${x[1].h.toFixed(0)}`);
      }
      // texto em animação (ou cortado pelo quadro) não entra na conta: a folha mostra o que ficou
      for (const x of [...back, ...(out[ids[1]]?.texts ?? [])]) {
        if (x.frac < 0.9) { reporta('aviso', `${c.n}|parcial|${x.t}`, `cena ${c.n}: "${x.t}" parcialmente fora do quadro ou do recorte neste instante (animação ou corte); confira na folha`); continue; }
        if (x.x < ZONA.left || x.x + x.w > ZONA.right || x.y < ZONA.top || x.y + x.h > ZONA.bottom) {
          const msg = `cena ${c.n}: "${x.t}" fora da zona segura (topo ${ZONA.top}, base ${H - ZONA.bottom}, laterais ${ZONA.left})`;
          reporta(locutor ? 'erro' : 'aviso', msg, msg);
        }
      }
      if (!locutor) break amostra;

      // máscara do recorte neste instante; o centro da cabeça vem dela (o faceX do projeto pode estar errado)
      const mask = alfa(t);
      const cx = mask ? centroDaCabeca(mask) : FACE;
      if (mask && Math.abs(cx - FACE) > 50) reporta('aviso', `${c.n}|centro`, `cena ${c.n}: cabeça centrada em x=${cx} na fonte, faceX=${FACE}; ajuste faceX em compose.json (GUIDE §2)`);

      // nada sobre o rosto nem o queixo: cartões, imagens e textos da frente ficam acima da cabeça (§4 e §5)
      const cab = cabecaNaTela(cam, cx);
      for (const x of front) {
        if (sobrepoe(x, cab)) {
          const nome = x.t ?? x.tag;
          reporta('erro', `${c.n}|rosto|${nome}`, `cena ${c.n}: ${x.t ? `"${x.t}"` : x.tag} sobre o rosto ou o queixo; suba acima da cabeça`);
        }
      }

      // cobertura pela cabeça e pelo corpo (§4): o alfa do recorte no instante da amostra
      if (!mask) { reporta('aviso', `${c.n}|mascara`, `cena ${c.n}: sem máscara do recorte; cobertura não medida`); break amostra; }
      // fonte mais estreita que 16:9 (9:16): o recorte é só a faixa do meio, e o corpo que sai dela vira borda reta
      if (cfg.fonte) {
        const fw = Math.min(1920, cfg.fonte.w * 1080 / cfg.fonte.h), x0 = Math.round((1920 - fw) / 2), x1 = x0 + fw;
        // "aceitos" no compose.json: avisos que o dono do projeto decidiu manter (ex.: ["borda"] com fonte vertical)
        if (fw < 1920 && !(cfg.aceitos ?? []).includes('borda')) {
          let toca = 0;
          for (let y = 100; y < SRC_H; y++) if (mask[y * SRC_W + x0 + 1] > 127 || mask[y * SRC_W + x1 - 2] > 127) toca++;
          if (toca > 0.05 * (SRC_H - 100)) reporta('aviso', `${c.n}|borda`, `cena ${c.n}: braço ou corpo cortado pela borda da faixa de ${Math.round(fw)} px (fonte ${cfg.fonte.w}×${cfg.fonte.h}). A fonte já sai do quadro: só se resolve com fonte mais larga ou enquadramento que mostre o braço.`);
        }
      }
      let resto = 0;
      for (let y = 0; y < 60; y++) for (let x = 0; x < SRC_W; x++) if (mask[y * SRC_W + x] > 127) resto++;
      if (resto > 0.02 * SRC_W * 60) reporta('aviso', `${c.n}|resto`, `cena ${c.n}: resto de cenário no topo do recorte (${resto} px de alfa nas 60 primeiras linhas)`);

      for (const x of back) {
        let tot = 0, corpo = 0, cab2 = 0;
        for (let Y = x.y; Y < x.y + x.h; Y += 6) for (let X = x.x; X < x.x + x.w; X += 6) {
          if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
          tot++;
          const p = daTela(X, Y, cam), xi = Math.floor(p.x), yi = Math.floor(p.y);
          if (xi < 0 || xi >= SRC_W || yi < 0 || yi >= SRC_H || mask[yi * SRC_W + xi] <= 127) continue;
          corpo++;
          if (yi >= HEAD.top && yi <= HEAD.bottom && Math.abs(xi - cx) <= HEAD.halfW) cab2++;
        }
        if (!tot) continue;
        if (VERBOSO) console.log(`  ${c.n} cobertura "${x.t}": cabeça ${Math.round(100 * cab2 / tot)}%, corpo ${Math.round(100 * corpo / tot)}%`);
        if (cab2 / tot > COBERTO) reporta('erro', `${c.n}|cab|${x.t}`, `cena ${c.n}: a cabeça cobre ${Math.round(100 * cab2 / tot)}% de "${x.t}" (atrás); desça o locutor (M ou L), nunca o texto`);
        else if (corpo / tot > COBERTO) reporta('aviso', `${c.n}|corpo|${x.t}`, `cena ${c.n}: o corpo ou a mão cobre ${Math.round(100 * corpo / tot)}% de "${x.t}"; traga o texto para a frente (hl) se a mão for o problema`);
      }
      }
      // a amostra reprovou: guarda o quadro para você ver o que a regra pegou
      if (erros.length > antes) await page.screenshot({ path: path.join(DIR, 'review', `erro-cena-${pad}-${t.toFixed(2)}s.png`) });
    }
  }
} catch (e) {
  console.error('checagem de layout não rodou: ' + String(e.message).slice(0, 300));
  codigo = 2;
} finally {
  if (browser) await browser.close();
  srv.close();
}

if (codigo === 0) {
  fs.mkdirSync(path.join(DIR, 'review'), { recursive: true });
  folhaDoRecorte();
  fs.writeFileSync(path.join(DIR, 'review', 'layout.json'), JSON.stringify({ erros, avisos }, null, 1));
  console.log(`layout: ${erros.length} erro(s), ${avisos.length} aviso(s); recorte em review/recorte.png`);
  codigo = erros.length ? 1 : 0;
}
process.exit(codigo);
