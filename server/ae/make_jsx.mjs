#!/usr/bin/env node
// ==============================================================================
// COMPOSIÇÃO HYPERFRAMES → PROJETO DO AFTER EFFECTS (.jsx que monta e salva o .aep)
//
// Lê o index.html que o player de revisão toca (proj/ ou compose/), no Chrome headless com o runtime do HyperFrames,
// e gera uma comp híbrida com as mesmas camadas da edição:
//   - vídeos e áudios da composição (data-start/data-duration/data-volume) entram como os PRÓPRIOS ARQUIVOS,
//     com a câmera (escala/posição do wrapper) em keyframes; .webm com alfa vira ProRes 4444
//   - cada cena (sub-composição data-composition-src) e cada camada manual vira um grupo de peças:
//     peças simples → texto/shape nativos com null de controle; complexas → clipe ProRes 4444 com alfa
//
// USO:
//   node make_jsx.mjs --html <compose|proj>/index.html --out <pasta> --aep <arquivo.aep> [--name <nome>]
//                     [--step N] [--sem-clipes] [--fps N] [--runtime <hyperframe.runtime.iife.js>]
// ==============================================================================

import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { findChrome } from '../host.ts';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { console.error('ERRO: puppeteer-core não encontrado. Rode "npm install" em server/.'); process.exit(1); }

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);

const htmlPath = path.resolve(opt('html', ''));
if (!fs.existsSync(htmlPath)) { console.error('ERRO: informe --html <index.html da composição>.'); process.exit(1); }
const FILM_DIR = path.dirname(htmlPath);
const RUNTIME = path.resolve(opt('runtime', path.join(HERE, '../../claude-reel-editor/skills/reel-editor/engine/hf/hyperframe.runtime.iife.js')));
if (!fs.existsSync(RUNTIME)) { console.error('ERRO: runtime do HyperFrames não encontrado: ' + RUNTIME); process.exit(1); }
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const NAME = opt('name', path.basename(path.dirname(FILM_DIR)));
const OUT = path.resolve(opt('out', path.join(FILM_DIR, '..', 'after-effects')));
const AEP = path.resolve(opt('aep', path.join(OUT, slug(NAME) + '.aep')));
const STEP = Math.max(1, +opt('step', 1));
const FPS = +opt('fps', 30);

const CHROME = findChrome();
if (!CHROME) { console.error('ERRO: Chrome não encontrado. Instale o Google Chrome ou defina CHROME_PATH.'); process.exit(1); }

for (const d of ['V/clips', 'V/media', 'V/img', 'V/svg']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'V/clips'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'V/media'), { recursive: true });

console.log(`[make_jsx] ${htmlPath}\n  saída: ${OUT}\n  aep:   ${AEP}`);

// O runtime carrega as sub-composições por fetch, então a pasta é servida por http (só 127.0.0.1) com o runtime injetado.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/__hf_runtime.js') return r.end(fs.readFileSync(RUNTIME));
  const p = path.resolve(FILM_DIR, '.' + (u === '/' ? '/index.html' : u));
  if (!p.startsWith(FILM_DIR + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream');
  if (p === htmlPath) return r.end(fs.readFileSync(p, 'utf8').replace(/<\/body>/i, '<script src="/__hf_runtime.js"></script></body>'));
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none'] });
const page = await browser.newPage();
const avisos = [];
page.on('pageerror', (e) => avisos.push('erro na página: ' + String(e.message).slice(0, 160)));

const dims = await (async () => {
  const m = /data-composition-id="[^"]*"[^>]*?data-width="(\d+)"[^>]*?data-height="(\d+)"/.exec(fs.readFileSync(htmlPath, 'utf8'));
  return m ? [+m[1], +m[2]] : [1080, 1920];
})();
const [W_COMP, H_COMP] = dims;
// margem em volta do quadro: com câmera de mundo (pan, pull) o After mostra o que fica fora do quadro, então os clipes a levam junto
const MARGEM = 160;
await page.setViewport({ width: W_COMP + 2 * MARGEM, height: H_COMP + 2 * MARGEM, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load', timeout: 120000 });   // não networkidle: os vídeos continuam baixando
await page.waitForFunction(() => window.__playerReady && window.__player, { timeout: 60000 });
await page.evaluate(() => { window.__player.enableRenderMode && window.__player.enableRenderMode(); return document.fonts.ready.then(() => 0); });
const DUR = +(+opt('dur', await page.evaluate(() => window.__player.getDuration()))).toFixed(3);
const seek = (t) => page.evaluate(async (x) => {
  if (window.__AE) window.__AE.antes();   // zera o registro de texto em canvas: os canvases desenham durante o seek
  await window.__player.renderSeek(x);
  if (window.__hfWaitForSeekCompletion) await window.__hfWaitForSeekCompletion();
  await document.fonts.ready;   // a fonte de uma cena só carrega quando ela aparece; medir antes dá a fonte reserva
  if (window.__AE) window.__AE.repouso();   // câmera de mundo em repouso: medimos sem ela e o After a recria
}, t);

// ---- Funções injetadas na página ----
const INPAGE = () => {
  const num = (v) => parseFloat(v) || 0;
  // rgb()/rgba() do computed style, ou hex (#rgb, #rrggbb, #rrggbbaa: o canvas devolve fillStyle/shadowColor opacos em hex)
  const col = (s) => {
    const sr = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)/.exec(String(s).trim());
    if (sr) return { c: [Math.round(+sr[1] * 255), Math.round(+sr[2] * 255), Math.round(+sr[3] * 255)], a: sr[4] == null ? 1 : /%/.test(sr[4]) ? parseFloat(sr[4]) / 100 : +sr[4] };
    const h = /^#([0-9a-f]{3,8})$/i.exec(String(s).trim());
    if (h) { let x = h[1]; if (x.length < 6) x = [...x].map((c) => c + c).join(''); const n = (i) => parseInt(x.slice(i, i + 2), 16); return { c: [n(0), n(2), n(4)], a: x.length === 8 ? n(6) / 255 : 1 }; }
    const m = String(s).match(/[\d.]+/g) || []; return { c: [+m[0] || 0, +m[1] || 0, +m[2] || 0], a: m.length > 3 ? +m[3] : 1 };
  };
  const vis = (el, stop) => {
    let o = 1;
    for (let n = el; n && n !== stop && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.display === 'none' || c.visibility === 'hidden') return 0;
      o *= num(c.opacity);
    }
    return o;
  };
  const R = (r) => ({ x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
  const textNodes = (el) => { const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) out.push(n); return out; };
  const direct = (el) => [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
  const inlineKids = (el) => [...el.children].every((c) => /^inline/.test(getComputedStyle(c).display) || c.tagName === 'BR');
  const ctx = document.createElement('canvas').getContext('2d');
  const SKIP = /^(STYLE|SCRIPT|TEMPLATE|LINK|META)$/, BLUR = /^blur\(([\d.]+)px\)$/;
  const root = document.querySelector('[data-composition-id]');
  const host = (el) => el.parentElement && el.parentElement.closest('[data-composition-src]');
  const startOf = (el) => num(el.getAttribute('data-start')) + (host(el) ? startOf(host(el)) : 0);

  const shadow = (s) => {
    if (!s || s === 'none') return null;
    for (const part of s.split(/,(?![^(]*\))/)) {
      if (/inset/.test(part)) continue;
      const c = col((part.match(/rgba?\([^)]*\)/) || ['rgb(0,0,0)'])[0]);
      const n = part.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(num);
      if (c.a < 0.02) continue;
      return { c: c.c, a: c.a, dx: n[0] || 0, dy: n[1] || 0, blur: n[2] || 0 };
    }
    return null;
  };
  // degradê de 2 cores do computed style → o que o After recria: 'ramp' (Gradient Ramp, as duas opacas), 'wipe' (sólido + Linear
  // Wipe: linear com uma ponta transparente) ou 'vig' (sólido + máscara elíptica com pluma: radial com uma ponta transparente).
  // Qualquer outro (3+ cores, repeating, canto, circle, duas pontas semitransparentes) → null, e a peça segue em clipe.
  const grad = (bg, w, h) => {
    const m = /^(linear|radial)-gradient\((.*)\)$/.exec(bg);
    if (!m || (bg.match(/gradient\(/g) || []).length > 1) return null;
    const parts = m[2].split(/,(?![^(]*\))/).map((x) => x.trim());
    const head = /^(rgba?\(|color\(|#)/.test(parts[0]) ? null : parts.shift();
    if (parts.length !== 2) return null;
    const stops = [];
    for (const x of parts) { const cm = /^(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)\s*(.*)$/i.exec(x); if (!cm) return null; stops.push({ ...col(cm[1]), pos: cm[2] }); }
    const pos = (q, len, def) => q === '' ? def : /%$/.test(q) ? num(q) / 100 : /px$/.test(q) ? num(q) / len : NaN;
    const opaque = stops[0].a > 0.99 && stops[1].a > 0.99, alpha = (stops[0].a < 0.01) !== (stops[1].a < 0.01);
    if (!opaque && !alpha) return null;
    if (m[1] === 'linear') {
      let ang = 180;
      if (head) { if (/deg$/.test(head)) ang = num(head); else if (head === 'to top') ang = 0; else if (head === 'to right') ang = 90; else if (head === 'to bottom') ang = 180; else if (head === 'to left') ang = 270; else return null; }
      const rad = ang * Math.PI / 180, len = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
      const s0 = pos(stops[0].pos, len, 0), s1 = pos(stops[1].pos, len, 1);
      if (!(s0 >= 0 && s1 <= 1 && s1 > s0)) return null;
      return { kind: opaque ? 'ramp' : 'wipe', shape: 'linear', ang, s0, s1, c0: stops[0], c1: stops[1] };
    }
    // radial: "rx% ry% at x% y%" (tamanho explícito), "at x y" ou nada (farthest-corner: a proporção da elipse closest-side)
    let cx = w / 2, cy = h / 2, rx = null, ry = null;
    if (head) {
      const hm = /^(?:(ellipse|circle)\s*)?(?:([\d.]+)(%|px)\s+([\d.]+)(%|px)\s*)?(?:at\s+([\d.]+)(%|px)\s+([\d.]+)(%|px))?$/.exec(head);
      if (!hm || hm[1] === 'circle') return null;
      if (hm[2]) { rx = hm[3] === '%' ? w * num(hm[2]) / 100 : num(hm[2]); ry = hm[5] === '%' ? h * num(hm[4]) / 100 : num(hm[4]); }
      if (hm[6]) { cx = hm[7] === '%' ? w * num(hm[6]) / 100 : num(hm[6]); cy = hm[9] === '%' ? h * num(hm[8]) / 100 : num(hm[8]); }
    }
    if (rx === null) {
      const ax = Math.min(cx, w - cx), ay = Math.min(cy, h - cy), dx = Math.max(cx, w - cx), dy = Math.max(cy, h - cy);
      if (ax < 1 || ay < 1) return null;
      const k = Math.hypot(dx / ax, dy / ay); rx = k * ax; ry = k * ay;
    }
    const s0 = pos(stops[0].pos, rx, 0), s1 = pos(stops[1].pos, rx, 1);
    if (!(s0 >= 0 && s1 <= 1 && s1 > s0) || rx < 1 || ry < 1) return null;
    return { kind: opaque ? 'ramp' : 'vig', shape: 'radial', cx: +cx.toFixed(1), cy: +cy.toFixed(1), rx: +rx.toFixed(1), ry: +ry.toFixed(1), s0, s1, c0: stops[0], c1: stops[1] };
  };
  const gradOf = (el, cs) => cs.backgroundImage !== 'none' && cs.backgroundSize === 'auto' ? grad(cs.backgroundImage, el.offsetWidth, el.offsetHeight) : null;
  // <img> que o After importa como está: raster, object-fit simples, centrada (svg e data: ficam em clipe)
  const imgOk = (el, cs) => /\.(png|jpe?g|webp)(\?|$)/i.test(el.currentSrc || '') && el.naturalWidth > 0 && /^(fill|contain|cover)$/.test(cs.objectFit) && cs.objectPosition === '50% 50%';
  // <svg> que o After importa e converte em formas sem perda: só formas e grupos, sem texto, imagem, filtro, máscara, gradiente ou <use>,
  // e sem conteúdo vazando da viewBox (o After corta na largura × altura do arquivo)
  const SVG_FORA = 'text, image, foreignObject, filter, mask, pattern, linearGradient, radialGradient, use, clipPath, style, animate, animateTransform';
  const svgOk = (el) => el.tagName.toLowerCase() === 'svg' && !el.querySelector(SVG_FORA) && el.getBoundingClientRect().width > 0.5;
  // traço que se desenha por dash (o padrão do kit: pathLength=1, dasharray "1 g", dashoffset de ~1 a 0) vira Trim Paths no After.
  // Só filhos diretos de um svg cujos filhos são todos formas: cada filho vira um grupo na conversão.
  const TRIM_TAGS = /^(path|line|polyline|polygon|circle|ellipse|rect)$/i;
  const trimEls = (p) => [...(p.tagName.toLowerCase() === 'svg' ? [p] : []), ...p.querySelectorAll('svg')].filter((v) => svgOk(v) && [...v.children].every((c) => TRIM_TAGS.test(c.tagName)))
    .flatMap((v) => [...v.children].filter((c) => getComputedStyle(c).strokeDasharray !== 'none' && getComputedStyle(c).stroke !== 'none'));
  // fração visível (0..1) de um traço com um só dash começando no início do caminho; null quando o dash não é esse padrão
  const trimFrac = (el) => {
    const cs = getComputedStyle(el), da = cs.strokeDasharray.split(/[\s,]+/).map(num);
    if (da.length > 2 && !(da.length === 4 && da[0] === da[2] && da[1] === da[3])) return null;
    const L = da[0], G = da.length > 1 ? da[1] : da[0], d = num(cs.strokeDashoffset);
    const P = el.hasAttribute('pathLength') ? +el.getAttribute('pathLength') : el.getTotalLength();
    if (!(P > 0) || d < -1e-6 || L + G - d < P - 1e-6) return null;
    return Math.max(0, Math.min(1, (L - d) / P));
  };
  const BLEND = new Set(['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter']);
  const radOf = (cs, r) => { const v = cs.borderTopLeftRadius, rad = /%/.test(v) ? Math.min(r.width, r.height) * num(v) / 100 : num(v); return Math.min(rad, Math.min(r.width, r.height) / 2); };

  // caractere que a fonte principal não tem (emoji, ✦): o navegador desenha com outra fonte, o After não.
  // Se a largura muda conforme a fonte reserva, quem desenhou foi a reserva.
  const glifoFora = (chars, weight, fam) => {
    const w = `${weight} 40px "${fam}"`;
    const largura = (ch, reserva) => { ctx.font = w + ', ' + reserva; ctx.letterSpacing = '0px'; return ctx.measureText(ch).width; };
    // emoji sai da fonte de emoji do sistema com qualquer reserva, então é pego pela categoria
    return [...chars].some((ch) => /\p{Extended_Pictographic}/u.test(ch) || largura(ch, 'serif') !== largura(ch, 'monospace'));
  };
  const semGlifo = (el, cs) => glifoFora(new Set([...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').replace(/\s/g, '')),
    cs.fontWeight, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());

  // ---- Câmera de mundo (compose): #world com preserve-3d sob a raiz e, dentro, camadas de profundidade com translateZ fixo ----
  // Tudo é medido no repouso (transforms deles em 'none', ver repouso()) e o After recria a câmera: nulls 3D + câmera com zoom = perspective.
  const world = [...root.children].find((e) => !SKIP.test(e.tagName) && getComputedStyle(e).transformStyle === 'preserve-3d') || null;
  const zDe = (e) => { const m = /translateZ\((-?[\d.]+)px\)/.exec(e.getAttribute('style') || ''); return m ? +m[1] : null; };
  const depths = world ? [...world.children].filter((e) => !SKIP.test(e.tagName) && zDe(e) !== null) : [];
  depths.forEach((d, n) => d.setAttribute('data-ae-depth', d.id || 'prof' + n));
  const repouso = () => { if (world) world.style.transform = 'none'; for (const d of depths) d.style.transform = 'none'; };
  const depthOf = (e) => { const d = depths.find((x) => x.contains(e)); return d ? d.getAttribute('data-ae-depth') : world && world.contains(e) ? '@world' : null; };
  const mundo = () => world && {
    p: num(getComputedStyle(root).perspective) || 1800,
    depths: depths.map((d) => ({ id: d.getAttribute('data-ae-depth'), z: zDe(d), s: +((/scale\(([\d.]+)\)/.exec(d.getAttribute('style')) || [])[1] || 1) }))
  };
  // pose do #world no quadro atual (GSAP guarda os valores; o style inline já está em repouso)
  const pose = () => {
    const g = (k) => window.gsap ? +(+window.gsap.getProperty(world, k)).toFixed(3) : 0;
    return { x: g('x'), y: g('y'), s: window.gsap ? +(+window.gsap.getProperty(world, 'scale')).toFixed(4) : 1, rx: g('rotationX'), ry: g('rotationY'), rz: g('rotation') };
  };

  // ---- Texto desenhado em canvas (ilustrações do compose): cada fillText de um canvas do documento é candidato a texto nativo ----
  // Elegível: alfa ≥ .5, sem clip, sem filtro, cor sólida, sem emoji. Suprimido (não desenhado) quando a chave já virou camada de texto
  // no After: o clipe leva só a decoração. Rastros de alfa baixo (smear, fades) ficam no clipe, por isso o limiar de .5 vale nos dois lados.
  const draws = [], SUP = new Set(), VISTOS = new Set();   // VISTOS: toda chave de texto de canvas já desenhada, para o relatório
  const CT = CanvasRenderingContext2D.prototype, ft0 = CT.fillText, clip0 = CT.clip, save0 = CT.save, restore0 = CT.restore;
  CT.clip = function () { this.__clip = (this.__clip || 0) + 1; return clip0.apply(this, arguments); };
  CT.save = function () { (this.__pilha = this.__pilha || []).push(this.__clip || 0); return save0.apply(this, arguments); };
  CT.restore = function () { this.__clip = this.__pilha && this.__pilha.length ? this.__pilha.pop() : 0; return restore0.apply(this, arguments); };
  CT.fillText = function (s, x, y) {
    const cv = this.canvas;
    if (cv && cv.isConnected && cv.id && this.globalAlpha > 0) {
      const text = String(s), fill = typeof this.fillStyle === 'string' ? this.fillStyle : null;
      const key = [cv.id, text, this.font, this.textAlign, this.textBaseline, fill, this.letterSpacing].join('\u0001');
      if (text.trim()) VISTOS.add(key);
      const ok = this.globalAlpha >= 0.5 && !this.__clip && this.filter === 'none' && this.globalCompositeOperation === 'source-over' && !!fill && !/\p{Extended_Pictographic}/u.test(text);
      if (ok && SUP.has(key)) return;
      const m = this.getTransform(), sc = col(this.shadowColor);
      draws.push({ cv, key, text, x, y, font: this.font, align: this.textAlign, base: this.textBaseline, fill, ls: this.letterSpacing, alpha: this.globalAlpha, ok,
        m: [m.a, m.b, m.c, m.d, m.e, m.f], sh: sc.a > 0.02 && (this.shadowBlur || this.shadowOffsetX || this.shadowOffsetY) ? { c: sc.c, a: sc.a, dx: this.shadowOffsetX, dy: this.shadowOffsetY, blur: this.shadowBlur } : null });
    }
    return ft0.apply(this, arguments);
  };
  const fontDe = (s) => { const m = /(?:^|\s)(\d{3}|bold|normal)?\s*([\d.]+)px\s+(.+)$/.exec(s); return m && { fam: m[3].split(',')[0].replace(/["']/g, '').trim(), weight: m[1] === 'bold' ? 700 : +m[1] || 400, size: +m[2] }; };
  // textos elegíveis desenhados neste quadro nos canvases da peça, já no espaço da página: ponto esquerda-base, matriz linear, cor, fonte
  const ctexts = (p) => {
    const out = [];
    for (const d of draws) {
      if (!d.ok || !p.contains(d.cv)) continue;
      const r = d.cv.getBoundingClientRect(), kx = r.width / d.cv.width, ky = r.height / d.cv.height;   // shortcut: canvas girado por CSS mede o AABB
      const f = fontDe(d.font);
      if (!kx || !ky || !f) continue;
      ctx.font = d.font; ctx.letterSpacing = d.ls; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const mt = ctx.measureText(d.text), w = mt.width, asc = mt.fontBoundingBoxAscent || f.size * 0.95, desc = mt.fontBoundingBoxDescent || f.size * 0.25;
      if (glifoFora(new Set(d.text.replace(/\s/g, '')), f.weight, f.fam)) continue;
      const lx = d.x - (/center/.test(d.align) ? w / 2 : /right|end/.test(d.align) ? w : 0);
      const by = d.y + (d.base === 'middle' ? (asc - desc) / 2 : /top|hanging/.test(d.base) ? asc : /bottom|ideographic/.test(d.base) ? -desc : 0);
      const [a, b, c, dd, e, ff] = d.m;   // página = T(canvas) · S(css/pixel) · matriz do contexto
      const M = [a * kx, b * ky, c * kx, dd * ky, r.left + e * kx, r.top + ff * ky], fc = col(d.fill);
      out.push({ key: d.key, text: d.text, fam: f.fam, weight: f.weight, size: f.size, color: fc.c, alpha: fc.a, track: num(d.ls) / f.size * 1000, sh: d.sh, op: d.alpha,
        p: [+(M[0] * lx + M[2] * by + M[4]).toFixed(2), +(M[1] * lx + M[3] * by + M[5]).toFixed(2)], m: [M[0], M[1], M[2], M[3]] });
    }
    return out;
  };

  // invólucros acima da peça sem transform: medimos no espaço local da cena; a escala/translação deles entra na pose da null
  const semInvolucros = (p, fn) => {
    const anc = [];
    for (let a = p.parentElement; a && a !== document.body; a = a.parentElement) { anc.push([a, a.style.transform]); a.style.transform = 'none'; }
    try { return fn(); } finally { for (const [a, t] of anc) a.style.transform = t; }
  };

  // motivos para a peça virar clipe (lista vazia = pode ser nativa)
  const complexo = (p) => {
    const why = new Set();
    // a translação de um invólucro já entra na posição medida; escala/rotação dele não, então vira clipe
    for (let a = p.parentElement; a && !a.matches('[data-hf-inner-root], [data-ae-group]'); a = a.parentElement) {
      const t = getComputedStyle(a).transform, q = /^matrix\(([^)]*)\)/.exec(t);
      if (t !== 'none' && (!q || ((v) => Math.abs(v[1]) > 1e-4 || Math.abs(v[2]) > 1e-4 || Math.abs(v[0] - v[3]) > 1e-4)(q[1].split(',').map(Number)))) why.add('transformação no invólucro');
    }
    for (const el of [p, ...p.querySelectorAll('*')]) {
      const sv = el.closest && el.closest('svg');
      if (sv && sv !== el && svgOk(sv)) continue;   // o que está dentro de um svg aceito vai junto no arquivo .svg
      const cs = getComputedStyle(el), tag = el.tagName.toLowerCase();
      if (direct(el) && semGlifo(el, cs)) why.add('emoji/símbolo fora da fonte');
      if (/^(canvas|video)$/.test(tag) || (tag === 'svg' && !svgOk(el)) || (tag === 'img' && !imgOk(el, cs))) why.add('ilustração/imagem');
      if (cs.mixBlendMode !== 'normal' && (el !== p || !BLEND.has(cs.mixBlendMode))) why.add('blend sem equivalente');
      if (/matrix3d/.test(cs.transform) || cs.perspective !== 'none' || cs.transformStyle === 'preserve-3d') why.add('3D/perspectiva');
      if (el !== p && cs.transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(cs.transform)) why.add('transformação interna');
      // blur() na própria peça vira Gaussian Blur com keyframes; outros filtros (e blur em filhos) continuam em clipe
      if (cs.backdropFilter !== 'none' || (cs.filter !== 'none' && !(el === p && BLUR.test(cs.filter)))) why.add('filtro');
      if (/url\(/.test(cs.backgroundImage) || (cs.backgroundImage !== 'none' && !gradOf(el, cs))) why.add('gradiente/imagem de fundo');
      if (cs.clipPath !== 'none' || (cs.webkitMaskImage || 'none') !== 'none') why.add('máscara');
      if (cs.borderTopStyle === 'dashed' || cs.borderTopStyle === 'dotted') why.add('borda tracejada');
      if (el !== p && cs.overflow === 'hidden' && el.children.length) why.add('recorte (overflow)');
    }
    return [...why];
  };

  // assinatura do conteúdo: muda quando algo anima por dentro (contador, digitação, barra)
  const assinatura = (p) => {
    const r0 = p.getBoundingClientRect(), out = [], trim = new Set(trimEls(p));
    for (const el of p.querySelectorAll('*')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      // stroke-dashoffset: traço que se desenha não muda a caixa, mas é conteúdo animado; o que vira Trim Paths sai da assinatura
      out.push([Math.round(r.left - r0.left), Math.round(r.top - r0.top), Math.round(r.width), Math.round(r.height), (+cs.opacity).toFixed(2), cs.backgroundColor, cs.color, trim.has(el) ? '' : cs.strokeDashoffset].join(','));
    }
    out.push(p.textContent.replace(/\s+/g, ' ').trim(), Math.round(r0.width), Math.round(r0.height));
    return out.join('|');
  };

  // Grupos de peças: cada filho direto da raiz que não é mídia. Sub-composição → os filhos da raiz interna; o resto → ele mesmo.
  const isMedia = (el) => el.matches('audio, video.clip') || (!el.hasAttribute('data-composition-src') && !!el.querySelector('video.clip') && !el.querySelector('[data-composition-src]'));
  // dentro do #world, os grupos são os filhos das camadas de profundidade (e os irmãos delas, como o invólucro do recorte)
  const filhos = (e) => [...e.children].filter((c) => !SKIP.test(c.tagName));
  const tops = filhos(root).flatMap((e) => e !== world ? [e] : filhos(world).flatMap((c) => depths.includes(c) ? filhos(c) : [c]));
  tops.forEach((e, n) => e.setAttribute('data-ae-group', e.id || 'camada' + n));
  // invólucro sem nada visível (só agrupa linhas que animam cada uma): os filhos viram peças, para o texto ficar nativo
  // overflow:hidden só corta se algum filho sai da caixa; o quadro do design (.design) contém as cartas e não corta nada
  const dentro = (e) => { const r = e.getBoundingClientRect(); return [...e.children].every((c) => { const q = c.getBoundingClientRect(); return !q.width || (q.left >= r.left - 1 && q.top >= r.top - 1 && q.right <= r.right + 1 && q.bottom <= r.bottom + 1); }); };
  const plain = (e) => {
    if (!e.children.length || direct(e) || /^(IMG|SVG|CANVAS|VIDEO)$/i.test(e.tagName)) return false;
    const cs = getComputedStyle(e);
    return col(cs.backgroundColor).a < 0.01 && cs.backgroundImage === 'none' && num(cs.borderTopWidth) === 0 && cs.boxShadow === 'none'
      && (cs.overflow !== 'hidden' || dentro(e)) && cs.clipPath === 'none' && cs.filter === 'none';
  };
  const achatar = (els) => els.flatMap((e) => plain(e) ? achatar([...e.children].filter((c) => !SKIP.test(c.tagName))) : [e]);
  const PECAS = {};
  const pecas = (g) => PECAS[g] || (PECAS[g] = (() => {
    const e = tops.find((t) => t.getAttribute('data-ae-group') === g);
    if (!e) return [];
    if (!e.hasAttribute('data-composition-src')) return achatar([e]);
    const inner = e.querySelector('[data-hf-inner-root]') || e.firstElementChild;
    return inner ? achatar([...inner.children].filter((c) => !SKIP.test(c.tagName))) : [];
  })());
  const zOf = (e) => parseInt(getComputedStyle(e).zIndex) || 0;

  const grupos = () => tops.filter((e) => !isMedia(e)).map((e, n) => {
    const a = e.hasAttribute('data-start') ? startOf(e) : 0;
    const d = e.getAttribute('data-hf-authored-duration') || e.getAttribute('data-duration');
    return { id: e.getAttribute('data-ae-group'), a, b: d ? a + num(d) : null, z: zOf(e), ord: tops.indexOf(e), comp: e.hasAttribute('data-composition-src'), depth: depthOf(e) };
  });

  // vídeos e áudios que entram como arquivo (vídeo dentro de cena é peça da cena e vira clipe)
  const midias = () => [...document.querySelectorAll('audio[src], video.clip[src]')].filter((m) => m.tagName === 'AUDIO' || !host(m)).map((m) => {
    const top = tops.find((t) => t.contains(m));
    return {
      id: m.id, tag: m.tagName.toLowerCase(), src: m.getAttribute('src'),
      a: startOf(m), d: num(m.getAttribute('data-duration')) || null,
      ms: num(m.getAttribute('data-media-start') || m.getAttribute('data-playback-start')),
      vol: m.hasAttribute('data-volume') ? num(m.getAttribute('data-volume')) : 1,
      fit: getComputedStyle(m).objectFit, z: top ? zOf(top) : 0, ord: top ? tops.indexOf(top) : -1, depth: depthOf(m)
    };
  });
  // caixa do vídeo na tela (já com a câmera dos wrappers aplicada) e opacidade
  const midiaPose = (id) => {
    const m = document.getElementById(id), r = m.getBoundingClientRect();
    return { op: +vis(m).toFixed(4), x: r.left, y: r.top, w: r.width, h: r.height };
  };

  const sondar = (g) => pecas(g).map((p, i) => {
    const cs = getComputedStyle(p), op = vis(p);
    if (!op || cs.display === 'none') return { i, on: false };
    const m = cs.transform === 'none' ? [1, 0, 0, 1, 0, 0] : /^matrix\(/.test(cs.transform) ? cs.transform.slice(7, -1).split(',').map(Number) : null;
    const bb = p.getBoundingClientRect();
    let L = bb.left, T = bb.top, Rr = bb.right, B = bb.bottom;
    for (const d of p.querySelectorAll('*')) {
      const r = d.getBoundingClientRect();
      if (r.width && r.height) { L = Math.min(L, r.left); T = Math.min(T, r.top); Rr = Math.max(Rr, r.right); B = Math.max(B, r.bottom); }
    }
    const why = complexo(p), ct = ctexts(p);
    const salvo = p.style.transform;
    p.style.transform = 'none';
    // a mesma caixa com e sem os invólucros dá a transformação deles (escala k + translação); assinatura e origem no espaço local
    const rt = p.getBoundingClientRect(), [r0, sig] = semInvolucros(p, () => [p.getBoundingClientRect(), assinatura(p)]);
    p.style.transform = salvo;
    const org = cs.transformOrigin.split(' ').map(num), k = r0.width > 0.5 ? rt.width / r0.width : r0.height > 0.5 ? rt.height / r0.height : 1;
    if (r0.width > 0.5 && r0.height > 0.5 && Math.abs(rt.height / r0.height - k) > 0.003 * k) why.push('transformação no invólucro');
    const Lo = [r0.left + org[0], r0.top + org[1]], Ot = [rt.left + org[0] * k, rt.top + org[1] * k];
    const mt = m && [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k];
    const nome = (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) || (typeof p.className === 'string' && p.className.split(/\s+/)[0]) || p.id || p.tagName.toLowerCase();
    const tr = trimEls(p).map(trimFrac);
    if (tr.some((v) => v === null)) why.push('traço tracejado');   // dash que não é um traço só desenhando: fica em clipe
    return { i, on: true, nome, tr: tr.map((v) => +((v || 0) * 100).toFixed(2)), op: +op.toFixed(4), blend: cs.mixBlendMode, bl: +((BLUR.exec(cs.filter) || [])[1] || 0), m: mt, O: Ot, Lo, sig, why, box: [L, T, Rr, B], ct };
  });

  // textos e formas nativos na pose de repouso
  const extrair = (p) => {
    const out = { shapes: [], texts: [], avisos: [] };
    let ord = 0;
    const salvoT = p.style.transform, salvoO = p.style.opacity;
    p.style.transform = 'none'; p.style.opacity = '1';
    try { return semInvolucros(p, () => {
    const stop = p.parentElement;

    const shapeOf = (el, o, cs) => {
      const bg = col(cs.backgroundColor);
      const fill = bg.a > 0.01 ? bg : null;
      const bw = num(cs.borderTopWidth), bc = col(cs.borderTopColor);
      const stroke = bw > 0 && cs.borderTopStyle !== 'none' && bc.a > 0.01 ? { c: bc.c, a: bc.a, w: bw } : null;
      const g = gradOf(el, cs);
      if (!fill && !stroke && !g) return;
      const rects = el.getClientRects().length > 1 ? [...el.getClientRects()] : [el.getBoundingClientRect()];
      const cls = String(el.id || el.className || el.tagName).slice(0, 40);
      for (const r of rects) {
        if (r.width < 2 || r.height < 2) continue;
        if (fill || stroke) out.shapes.push({ ord: ord++, ...R(r), rad: radOf(cs, r), fill, stroke, o: +o.toFixed(3), sh: shadow(cs.boxShadow), cls });
        if (g) out.shapes.push({ ord: ord++, kind: 'grad', ...R(r), rad: radOf(cs, r), grad: g, o: +o.toFixed(3), cls });   // a cor de fundo fica por baixo, como no CSS
      }
    };
    const imgOf = (el, o, cs) => {
      const r = el.getBoundingClientRect();
      out.shapes.push({ ord: ord++, kind: 'img', ...R(r), rad: radOf(cs, r), src: el.currentSrc, nw: el.naturalWidth, nh: el.naturalHeight, fit: cs.objectFit, o: +o.toFixed(3), sh: shadow(cs.boxShadow), cls: String(el.id || el.className || el.tagName).slice(0, 40) });
    };

    const PINTURA = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'display', 'visibility'];
    const svgOf = (el, o, cs) => {
      const r = el.getBoundingClientRect(), c = el.cloneNode(true), orig = [el, ...el.querySelectorAll('*')], copia = [c, ...c.querySelectorAll('*')];
      const todos = trimEls(p), trims = [];
      orig.forEach((e, k) => {
        const q = getComputedStyle(e), d = copia[k];
        d.removeAttribute('class'); d.removeAttribute('style'); d.removeAttribute('id');
        for (const a of PINTURA) d.setAttribute(a, q.getPropertyValue(a));
        const j = todos.indexOf(e);
        // o traço sai inteiro no arquivo; o Trim Paths do After (Fim = fração visível por quadro) faz o desenho
        if (j >= 0) { d.setAttribute('stroke-dasharray', 'none'); d.setAttribute('stroke-dashoffset', '0'); d.removeAttribute('pathLength'); trims.push({ k: [...el.children].indexOf(e), j }); }
      });
      // raiz nova só com tamanho e viewBox, width primeiro: o importador do After pega o primeiro 'width=' do arquivo,
      // e um stroke-width na raiz virava largura 1 (medido no After 2026). A pintura já está em cada filho.
      const raiz = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      raiz.setAttribute('width', String(+r.width.toFixed(2))); raiz.setAttribute('height', String(+r.height.toFixed(2)));
      raiz.setAttribute('viewBox', el.getAttribute('viewBox') || `0 0 ${r.width} ${r.height}`);
      if (el.getAttribute('preserveAspectRatio')) raiz.setAttribute('preserveAspectRatio', el.getAttribute('preserveAspectRatio'));
      while (c.firstChild) raiz.appendChild(c.firstChild);
      out.shapes.push({ ord: ord++, kind: 'svg', ...R(r), svg: new XMLSerializer().serializeToString(raiz), trims, n: el.children.length, o: +o.toFixed(3), cls: String(el.id || el.getAttribute('class') || 'svg').slice(0, 40) });
    };

    const textOf = (el, o, cs) => {
      const size = num(cs.fontSize), pre = /^pre/.test(cs.whiteSpace), up = cs.textTransform === 'uppercase';
      const rg = document.createRange();
      let txt = '', lastTop = null, first = null, box = null;
      for (const node of textNodes(el)) {
        const s = node.textContent;
        for (let i = 0; i < s.length; i++) {
          let ch = s[i];
          if (ch === '\n' && pre) { txt += '\n'; lastTop = null; continue; }
          rg.setStart(node, i); rg.setEnd(node, i + 1);
          const rc = rg.getClientRects()[0];
          if (!rc || (rc.width === 0 && rc.height === 0)) continue;
          if (/\s/.test(ch)) ch = ' ';
          if (lastTop !== null && rc.top - lastTop > size * 0.5) txt = txt.replace(/ +$/, '') + '\n';
          if (ch !== ' ') lastTop = rc.top; else if (lastTop === null) lastTop = rc.top;
          if (!first && ch !== ' ') first = rc;
          if (ch !== ' ') box = box ? { l: Math.min(box.l, rc.left), r: Math.max(box.r, rc.right), t: Math.min(box.t, rc.top), b: Math.max(box.b, rc.bottom) } : { l: rc.left, r: rc.right, t: rc.top, b: rc.bottom };
          txt += up ? ch.toUpperCase() : ch;
        }
      }
      txt = txt.replace(/ {2,}/g, ' ').replace(/ *\n */g, '\n').trim();
      if (!txt || !box) return;
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      ctx.font = `${cs.fontWeight} ${size}px "${fam}"`;
      const asc = ctx.measureText('Hg').fontBoundingBoxAscent || size * 0.95;
      const lh = num(cs.lineHeight) || size * 1.2;
      const tc = col(cs.color);
      const al = cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' || cs.textAlign === 'end') ? 'right' : 'left';
      out.texts.push({
        ord: ord++, text: txt, fam, weight: num(cs.fontWeight), size, color: tc.c, alpha: tc.a, align: al, lh,
        track: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing) / size * 1000,
        x: +(al === 'center' ? (box.l + box.r) / 2 : al === 'right' ? box.r : box.l).toFixed(1),
        l: +box.l.toFixed(1), lines: txt.split('\n').length, base: +(first.top + asc).toFixed(1),
        w: +(box.r - box.l).toFixed(1), o: +o.toFixed(3), sh: shadow(cs.textShadow), cls: String(el.id || el.className || el.tagName).slice(0, 40)
      });
    };

    const walk = (el) => {
      const o = vis(el, stop);
      if (!o) return;
      const cs = getComputedStyle(el);
      if (el.tagName === 'IMG') { imgOf(el, o, cs); return; }
      if (svgOk(el)) { svgOf(el, o, cs); return; }
      shapeOf(el, o, cs);
      if (direct(el) && inlineKids(el)) {
        textOf(el, o, cs);
        [...el.querySelectorAll('*')].forEach((d) => { const v = vis(d, stop); if (v) shapeOf(d, v, getComputedStyle(d)); });
        return;
      }
      if (direct(el)) { out.avisos.push('texto misturado com blocos: ' + String(el.id || el.className || el.tagName)); textOf(el, o, cs); }
      for (const c of el.children) walk(c);
    };

    walk(p);
    return out;
    }); } finally { p.style.transform = salvoT; p.style.opacity = salvoO; }
  };

  const isolar = (g, ids) => {
    document.querySelectorAll('[data-ae-only]').forEach((e) => e.removeAttribute('data-ae-only'));
    const ps = ids.map((i) => pecas(g)[i]).filter(Boolean);
    ps.forEach((p) => p.setAttribute('data-ae-only', '1'));
    return ps.length > 0;
  };

  // o texto dessas peças já está nativo no After: o clipe só leva a decoração
  const ocultarTexto = (g, ids) => {
    const salvos = [];
    for (const p of ids.map((i) => pecas(g)[i]).filter(Boolean))
      for (const el of [p, ...p.querySelectorAll('*')]) {
        if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
        salvos.push([el, el.getAttribute('style')]);
        el.style.setProperty('color', 'transparent', 'important');
        el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        el.style.setProperty('text-shadow', 'none', 'important');
        el.style.setProperty('-webkit-text-stroke', '0', 'important');
      }
    window.__aeSalvos = salvos;
  };
  const restaurarTexto = () => {
    for (const [el, st] of window.__aeSalvos || []) st === null ? el.removeAttribute('style') : el.setAttribute('style', st);
    window.__aeSalvos = [];
  };

  return { grupos, midias, midiaPose, sondar, extrair: (g, i) => { const p = pecas(g)[i]; return p ? extrair(p) : null; }, isolar, ocultarTexto, restaurarTexto,
    mundo, pose, repouso, antes: () => { draws.length = 0; }, suprimir: (keys) => { SUP.clear(); for (const k of keys) SUP.add(k); },
    // quanto texto a composição tem (nós de texto do DOM + frases de canvas vistas): zero nativo com isso > 0 é regressão, não reel sem texto
    textoNaComposicao: () => textNodes(root).filter((n) => n.textContent.trim() && !SKIP.test(n.parentElement.tagName)).length + VISTOS.size };
};

await page.evaluate(`window.__AE = (${INPAGE.toString()})();`);
// só na hora dos clipes a página desliza pela margem, para a captura alcançar o que sai do quadro (as medições ficam em coordenadas do quadro)
const STYLE_ONLY = `html,body,[data-composition-id],[data-hf-inner-root]{background:transparent!important}body *{visibility:hidden!important}[data-ae-only],[data-ae-only] *{visibility:visible!important}html{transform:translate(${MARGEM}px,${MARGEM}px)}html,body,[data-composition-id],[data-hf-inner-root]{overflow:visible!important}`;   // shortcut: o que a cena esconde fora do quadro aparece na margem do clipe
const r3 = (x) => +x.toFixed(3);
const grupos = await page.evaluate(() => window.__AE.grupos());
const midias = await page.evaluate(() => window.__AE.midias());

// ---- Câmera de mundo: pose do #world quadro a quadro (só as chaves onde algo muda) ----
const mundo = await page.evaluate(() => window.__AE.mundo());
if (mundo) {
  const keys = [];
  for (let f = 0; f < Math.round(DUR * FPS); f += STEP) { await seek(f / FPS); keys.push({ t: r3(f / FPS), ...(await page.evaluate(() => window.__AE.pose())) }); }
  const same = (x, y) => x && y && ['x', 'y', 's', 'rx', 'ry', 'rz'].every((k) => x[k] === y[k]);
  mundo.keys = keys.filter((k, j) => !(same(k, keys[j - 1]) && same(k, keys[j + 1])));
  console.log(`mundo: ${mundo.depths.length} profundidade(s), ${mundo.keys.length} chave(s) de câmera`);
}

// ---- Peças de cada grupo, quadro a quadro ----
// ---- <img> nativa: o arquivo copiado para V/img (webp vira png, que o After abre) ----
const SVGS = new Map();
const svgFile = (svg, base) => {
  if (SVGS.has(svg)) return SVGS.get(svg);
  fs.mkdirSync(path.join(OUT, 'V/svg'), { recursive: true });
  const f = `V/svg/${base}-${SVGS.size}.svg`;
  fs.writeFileSync(path.join(OUT, f), '<?xml version="1.0" encoding="UTF-8"?>\n' + svg);
  SVGS.set(svg, f);
  return f;
};
const IMGS = new Map();
const imgFile = (src) => {
  let u; try { u = new URL(src); } catch { return null; }
  const f = path.resolve(FILM_DIR, '.' + decodeURIComponent(u.pathname));
  if (u.hostname !== '127.0.0.1' || !f.startsWith(FILM_DIR + path.sep) || !fs.existsSync(f)) return null;
  if (IMGS.has(f)) return IMGS.get(f);
  fs.mkdirSync(path.join(OUT, 'V/img'), { recursive: true });
  const name = `${IMGS.size}-${path.basename(f).replace(/\.webp$/i, '.png')}`, dst = path.join(OUT, 'V/img', name);
  let ok = true;
  if (/\.webp$/i.test(f)) ok = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', f, dst]).status === 0; else fs.copyFileSync(f, dst);
  IMGS.set(f, ok ? 'V/img/' + name : null);
  return IMGS.get(f);
};

const pieces = [];
const fontsUsed = new Set();
for (const g of grupos) {
  const a = Math.max(0, g.a), b = Math.min(DUR, g.b ?? DUR);
  const f0 = Math.round(a * FPS), f1 = Math.max(f0 + 1, Math.round(b * FPS));
  const tracks = new Map();
  for (let f = f0; f < f1; f += STEP) {
    const t = f / FPS;
    await seek(t);
    for (const p of await page.evaluate((id) => window.__AE.sondar(id), g.id)) {
      if (!tracks.has(p.i)) tracks.set(p.i, []);
      tracks.get(p.i).push({ t: r3(t), ...p });
    }
  }
  let n = 0;
  const keysOf = (s) => s.map((x) => {
    if (!x.on || !x.m) return { t: x.t, op: 0 };
    const [ma, mb, mc, md, me, mf] = x.m, sx = Math.hypot(ma, mb), sy = sx ? (ma * md - mb * mc) / sx : 0;
    return { t: x.t, p: [+(x.O[0] + me).toFixed(2), +(x.O[1] + mf).toFixed(2)], r: +(Math.atan2(mb, ma) * 180 / Math.PI).toFixed(3), s: [+(sx * 100).toFixed(3), +(sy * 100).toFixed(3)], op: +(x.op * 100).toFixed(2), bl: +(x.bl || 0).toFixed(2), ...(x.tr && x.tr.length ? { tr: x.tr } : {}) };
  });
  for (const [i, s] of tracks) {
    const on = s.filter((x) => x.on && x.op > 0.004);
    if (!on.length) continue;
    const pa = on[0].t, pb = r3(Math.min(b, on[on.length - 1].t + STEP / FPS));
    const why = new Set(on.flatMap((x) => x.why));
    if (on.some((x) => !x.m)) why.add('transformação não 2D');
    if (new Set(on.filter((x) => x.op > 0.05).map((x) => x.sig)).size > 1) why.add('conteúdo muda por dentro (contador, digitação, barra, troca de texto)');
    const base = { scene: g.id, i, z: g.z, ord: g.ord, a: pa, b: pb };
    // texto nativo sempre, salvo dentro de animação complexa (3D, transformação, conteúdo que muda): aí o clipe leva o texto junto
    const animacao = [...why].filter((w) => /^(transformação|3D|conteúdo muda|emoji)/.test(w));
    const decor = [...why].filter((w) => !animacao.includes(w));
    const maxOp = Math.max(...on.map((x) => x.op)), tops = on.filter((x) => x.op >= maxOp - 0.01), rest = tops[Math.floor(tops.length / 2)];
    base.blend = rest.blend;
    let ex = null;
    if (!animacao.length) {
      await seek(rest.t);
      ex = await page.evaluate((id, k) => window.__AE.extrair(id, k), g.id, i);
      if (ex) {
        ex.avisos.forEach((x) => avisos.push(`${g.id}: ${x}`));
        ex.texts.forEach((x) => fontsUsed.add(`${x.fam} ${x.weight}`));
        for (const x of ex.shapes.filter((y) => y.kind === 'svg')) { x.file = svgFile(x.svg, `${slug(g.id)}-${i}`); delete x.svg; }
        for (const x of ex.shapes.filter((y) => y.kind === 'img')) { x.file = imgFile(x.src); if (!x.file) { why.add('ilustração/imagem'); decor.push('ilustração/imagem'); } }
      }
    }
    if (ex && !decor.length) {
      if (!ex.shapes.length && !ex.texts.length) continue;
      pieces.push({ kind: 'native', ...base, O: [+rest.Lo[0].toFixed(2), +rest.Lo[1].toFixed(2)], keys: keysOf(s), shapes: ex.shapes, texts: ex.texts });
    } else {
      // decoração (gradiente, filtro, máscara, imagem) fica em clipe; quando há texto estático, o texto vai nativo e sai do clipe
      const comTexto = !!(ex && ex.texts.length);
      if (comTexto) pieces.push({ kind: 'native', ...base, O: [+rest.Lo[0].toFixed(2), +rest.Lo[1].toFixed(2)], keys: keysOf(s), shapes: [], texts: ex.texts });
      const PAD = 70;
      let L = 1e9, T = 1e9, Rr = -1e9, B = -1e9;
      for (const x of on) { L = Math.min(L, x.box[0]); T = Math.min(T, x.box[1]); Rr = Math.max(Rr, x.box[2]); B = Math.max(B, x.box[3]); }
      const x0 = Math.max(-MARGEM, Math.floor(L - PAD)), y0 = Math.max(-MARGEM, Math.floor(T - PAD));
      let w = Math.min(W_COMP + MARGEM, Math.ceil(Rr + PAD)) - x0, h = Math.min(H_COMP + MARGEM, Math.ceil(B + PAD)) - y0;
      w -= w % 2; h -= h % 2;
      if (w < 2 || h < 2) continue;
      // texto desenhado em canvas: cada frase estável (mesma chave) vira camada de texto com keyframes e sai do clipe
      const porChave = new Map();
      for (const x of on) for (const d of x.ct || []) {
        const l = porChave.get(d.key) || new Map(), h = l.get(x.t);
        if (!h || d.op > h.d.op) l.set(x.t, { d, pop: x.op });
        porChave.set(d.key, l);
      }
      const sup = [];
      for (const [key, l] of porChave) {
        if (l.size * STEP / FPS < 0.25) continue;   // shortcut: texto que fica menos de 0,25 s (digitação, contador) segue no clipe
        const ts = [...l.keys()], d0 = l.get(ts[Math.floor(ts.length / 2)]).d;
        const ca = ts[0], cb = r3(Math.min(b, ts[ts.length - 1] + STEP / FPS));
        const keys = on.filter((x) => x.t >= ca && x.t < cb).map((x) => {
          const h = l.get(x.t);
          if (!h) return { t: x.t, op: 0 };
          const [ma, mb, mc, md] = h.d.m, sx = Math.hypot(ma, mb), sy = sx ? (ma * md - mb * mc) / sx : 0;
          return { t: x.t, p: h.d.p, r: +(Math.atan2(mb, ma) * 180 / Math.PI).toFixed(3), s: [+(sx * 100).toFixed(3), +(sy * 100).toFixed(3)], op: +(h.d.op * h.pop * 100).toFixed(2) };
        });
        fontsUsed.add(`${d0.fam} ${d0.weight}`);
        pieces.push({ kind: 'ctext', ...base, a: ca, b: cb, sub: sup.length + 1, text: d0.text, fam: d0.fam, weight: d0.weight, size: d0.size, color: d0.color, alpha: d0.alpha, track: d0.track, sh: d0.sh, keys });
        sup.push(key);
      }
      pieces.push({ kind: 'clip', ...base, x: x0, y: y0, w, h, file: `V/clips/${slug(g.id)}-${i}-${slug(rest.nome).slice(0, 32) || 'peca'}.mov`, ids: [i], why: [...why], semTexto: comTexto, sup });
    }
    n++;
  }
  // emojis soltos da mesma cena (uma chuva de 💸 são ~100) viram UM clipe: um por emoji levaria minutos por cena
  const so = (p) => p.kind === 'clip' && p.scene === g.id && p.why.length === 1 && p.why[0] === 'emoji/símbolo fora da fonte';
  const soltos = pieces.filter(so);
  if (soltos.length > 1) {
    const x0 = Math.min(...soltos.map((p) => p.x)), y0 = Math.min(...soltos.map((p) => p.y));
    const x1 = Math.max(...soltos.map((p) => p.x + p.w)), y1 = Math.max(...soltos.map((p) => p.y + p.h));
    const um = { ...soltos[0], x: x0, y: y0, w: x1 - x0, h: y1 - y0, a: Math.min(...soltos.map((p) => p.a)), b: Math.max(...soltos.map((p) => p.b)), ids: soltos.map((p) => p.i), file: `V/clips/${slug(g.id)}-emojis.mov` };
    pieces.splice(pieces.indexOf(soltos[0]), 1, um);
    for (const p of soltos.slice(1)) pieces.splice(pieces.indexOf(p), 1);
  }
  process.stdout.write(`\r${g.id}: ${n} peça(s)        `);
}
console.log('');

const textosNaComposicao = await page.evaluate(() => window.__AE.textoNaComposicao());

// ---- Vídeos e áudios: o arquivo original, com a câmera em keyframes ----
const probe = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name:stream_tags=alpha_mode', '-of', 'json', f], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout).streams[0] || null; } catch { return null; }
};
const media = [];
for (const m of midias) {
  const src = path.resolve(FILM_DIR, m.src);
  if (!fs.existsSync(src)) { avisos.push(`mídia ${m.id}: arquivo não encontrado (${m.src})`); continue; }
  const it = { id: m.id, tag: m.tag, file: src, a: r3(m.a), b: r3(Math.min(DUR, m.d ? m.a + m.d : DUR)), ms: m.ms, vol: m.vol, z: m.z, ord: m.ord, depth: m.depth };
  if (m.tag === 'video') {
    const v = probe(src);
    if (!v) { avisos.push(`mídia ${m.id}: ffprobe não leu ${m.src}`); continue; }
    // o After não abre .webm: vira ProRes 4444 (com alfa quando o VP9 tem alfa, decodificado pelo libvpx)
    if (/\.webm$/i.test(src)) {
      const mov = path.join(OUT, 'V/media', path.basename(src).replace(/\.webm$/i, '.mov'));
      const alpha = v.tags && v.tags.alpha_mode === '1';
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...(alpha ? ['-c:v', 'libvpx-vp9'] : []), '-i', src,
        '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', alpha ? 'yuva444p10le' : 'yuv444p10le', '-vendor', 'apl0', '-qscale:v', '9', '-an', mov], { encoding: 'utf8' });
      if (r.status !== 0) { avisos.push(`mídia ${m.id}: conversão para ProRes falhou (${(r.stderr || '').slice(0, 160)})`); continue; }
      it.file = mov; it.alpha = alpha;
    }
    it.sw = v.width; it.sh = v.height;
    const keys = [];
    for (let f = Math.round(it.a * FPS); f < Math.round(it.b * FPS); f += STEP) {
      await seek(f / FPS);
      const q = await page.evaluate((id) => window.__AE.midiaPose(id), m.id);
      // escala do conteúdo dentro da caixa, como o object-fit do HTML; posição = centro da caixa (object-position padrão)
      const kx = q.w / it.sw, ky = q.h / it.sh;
      const s = m.fit === 'cover' ? [Math.max(kx, ky), Math.max(kx, ky)] : m.fit === 'contain' ? [Math.min(kx, ky), Math.min(kx, ky)] : [kx, ky];
      keys.push({ t: r3(f / FPS), p: [+(q.x + q.w / 2).toFixed(2), +(q.y + q.h / 2).toFixed(2)], s: [+(s[0] * 100).toFixed(3), +(s[1] * 100).toFixed(3)], op: +(q.op * 100).toFixed(2) });
    }
    // shortcut: o recorte do object-fit:cover não vira máscara, só importa quando a caixa do vídeo é menor que o quadro
    // só as chaves onde algo muda (e as vizinhas), para a câmera ficar editável no After
    const same = (x, y) => x && y && x.op === y.op && x.p[0] === y.p[0] && x.p[1] === y.p[1] && x.s[0] === y.s[0] && x.s[1] === y.s[1];
    it.keys = keys.filter((k, j) => !(same(k, keys[j - 1]) && same(k, keys[j + 1])));
  }
  media.push(it);
}

// ---- Clipes ProRes 4444 com alfa ----
if (!flag('sem-clipes')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aeclip-'));
  const h = await page.addStyleTag({ content: STYLE_ONLY });
  for (const c of pieces.filter((p) => p.kind === 'clip')) {
    fs.readdirSync(tmp).forEach((f) => fs.unlinkSync(path.join(tmp, f)));
    let n = 0;
    await page.evaluate((keys) => window.__AE.suprimir(keys), c.sup || []);   // antes do seek: o canvas desenha durante o seek
    const a0 = Math.max(0, Math.round(c.a * FPS) - STEP), b0 = Math.min(Math.round(DUR * FPS), Math.round(c.b * FPS) + STEP);
    for (let f = a0; f < b0; f++) {
      await seek(f / FPS);
      await page.evaluate((id, ids) => window.__AE.isolar(id, ids), c.scene, c.ids);
      if (c.semTexto) await page.evaluate((id, ids) => window.__AE.ocultarTexto(id, ids), c.scene, c.ids);
      await page.screenshot({ path: path.join(tmp, String(n++).padStart(5, '0') + '.png'), clip: { x: c.x + MARGEM, y: c.y + MARGEM, width: c.w, height: c.h }, omitBackground: true });
      if (c.semTexto) await page.evaluate(() => window.__AE.restaurarTexto());
    }
    // caixa justa: a união do alfa visível (> ~1%) em todos os quadros; a folga de PAD/margem serviu só para não cortar a captura.
    // cropdetect com reset=0 devolve a maior área vista; sem nenhum pixel visível mantém a caixa medida.
    let corte = null;
    const cd = spawnSync('ffmpeg', ['-hide_banner', '-framerate', String(FPS), '-i', path.join(tmp, '%05d.png'), '-vf', 'alphaextract,blackframe=amount=100:threshold=3,cropdetect=limit=3:round=2:skip=0:reset=0', '-f', 'null', '-'], { encoding: 'utf8' });
    for (const m of (cd.stderr || '').matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)) corte = m.slice(1).map(Number);
    // quadros 100% transparentes no começo e no fim saem do clipe: a camada dura só o tempo em que algo aparece
    const vazio = new Set([...(cd.stderr || '').matchAll(/frame:(\d+) pblack:100/g)].map((m) => +m[1]));
    let f0 = 0, f1 = n - 1;
    while (f0 < n && vazio.has(f0)) f0++;
    while (f1 > f0 && vazio.has(f1)) f1--;
    if (f0 >= n) { c.kind = 'erro'; continue; }   // nada visível no trecho inteiro
    c.a = r3((a0 + f0) / FPS); c.b = r3(Math.min(DUR, (a0 + f1 + 1) / FPS));
    let vf = [];
    if (corte && corte[0] >= 2 && corte[1] >= 2 && (corte[0] < c.w || corte[1] < c.h)) {
      vf = ['-vf', `crop=${corte.join(':')}`];
      c.x += corte[2]; c.y += corte[3]; c.w = corte[0]; c.h = corte[1];
    }
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-start_number', String(f0), '-i', path.join(tmp, '%05d.png'), '-frames:v', String(f1 - f0 + 1), ...vf,
      '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', '-qscale:v', '9', '-alpha_bits', '16', path.join(OUT, c.file)], { encoding: 'utf8' });
    if (r.status !== 0) { avisos.push(`clipe ${c.file}: ffmpeg falhou (${(r.stderr || '').slice(0, 160)})`); c.kind = 'erro'; }
    process.stdout.write(`\rclipe ${c.file} (${n} quadros)        `);
  }
  await page.evaluate(() => window.__AE.suprimir([]));
  await h.evaluate((e) => e.remove());
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('');
}

await browser.close();
srv.close();

// ---- Fontes instaladas no Mac ----
const fontFiles = [path.join(os.homedir(), 'Library/Fonts'), '/Library/Fonts', '/System/Library/Fonts', '/System/Library/Fonts/Supplemental']
  .flatMap((d) => { try { return fs.readdirSync(d).map((f) => f.toLowerCase().replace(/[\s_-]/g, '')); } catch { return []; } });
const families = [...new Set([...fontsUsed].map((f) => f.replace(/ \d+$/, '')))];
const key = (fam) => fam.toLowerCase().replace(/[\s_-]/g, '');
const fontesFaltando = families.filter((fam) => !fontFiles.some((f) => f.startsWith(key(fam))));
const soVariavel = families.filter((fam) => { const l = fontFiles.filter((f) => f.startsWith(key(fam))); return l.length && l.every((f) => /variable/.test(f)); });
if (soVariavel.length) avisos.push(`só a versão variável instalada para: ${soVariavel.join(', ')}. Instale os arquivos estáticos para o After usar o peso certo.`);
if (fontesFaltando.length) avisos.push(`fontes não instaladas neste Mac: ${fontesFaltando.join(', ')}. Instale antes de abrir o projeto, senão o After troca por outra.`);

// ---- build_comp.jsx, run.jsx e relatório ----
const ok = pieces.filter((p) => p.kind !== 'erro');
const data = {
  name: NAME, fps: FPS, dur: DUR, w: W_COMP, h: H_COMP, aep: AEP,
  markers: grupos.filter((g) => g.comp).map((g) => ({ t: r3(g.a), label: g.id })),
  media, pieces: ok.map((p) => ({ ...p, depth: grupos.find((g) => g.id === p.scene)?.depth || null })), world: mundo
};
const tpl = fs.readFileSync(path.join(HERE, 'build_comp.template.jsx'), 'utf8');
fs.writeFileSync(path.join(OUT, 'build_comp.jsx'), tpl.replace('/*__DATA__*/', 'var DATA = ' + JSON.stringify(data) + ';'));
fs.writeFileSync(path.join(OUT, 'run.jsx'), `var f = new File((new File($.fileName)).parent.fsName + '/run.log'); f.open('w');
try {
  var alvo = new File(${JSON.stringify(AEP)});
  if (app.project && app.project.file && app.project.file.fsName === alvo.fsName) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  else if (app.project && app.project.dirty) throw new Error('há um projeto com alterações não salvas aberto no After; salve ou feche e rode de novo');
  app.newProject();
  $.evalFile((new File($.fileName)).parent.fsName + '/build_comp.jsx');
  f.writeln('ok ' + (app.project.file ? app.project.file.fsName : 'NAO SALVO'));
} catch (e) {
  f.writeln('erro: ' + e.toString() + ' linha ' + e.line);
}
f.close();
`);

const nat = ok.filter((p) => p.kind === 'native'), clips = ok.filter((p) => p.kind === 'clip'), ctexts = ok.filter((p) => p.kind === 'ctext');
const report = {
  comp: NAME, aep: AEP, fps: FPS, dur: DUR, passo_amostragem: STEP,
  camadas: {
    videos: media.filter((m) => m.tag === 'video').length, audios: media.filter((m) => m.tag === 'audio').length,
    grupos: grupos.length, pecas_nativas: nat.length + ctexts.length,
    textos: nat.reduce((n, p) => n + p.texts.length, 0) + ctexts.length, textos_canvas: ctexts.length,
    formas: nat.reduce((n, p) => n + p.shapes.filter((x) => !x.kind).length, 0), degrades: nat.reduce((n, p) => n + p.shapes.filter((x) => x.kind === 'grad').length, 0),
    imagens: nat.reduce((n, p) => n + p.shapes.filter((x) => x.kind === 'img').length, 0),
    vetores: nat.reduce((n, p) => n + p.shapes.filter((x) => x.kind === 'svg').length, 0),
    clipes_prores: clips.length, camera_mundo: mundo ? mundo.keys.length : 0, textos_na_composicao: textosNaComposicao
  },
  midias: media.map((m) => `${m.id} (${m.tag}, ${m.a.toFixed(2)}–${m.b.toFixed(2)} s): ${m.file.startsWith(OUT) ? path.relative(OUT, m.file) : m.file}`),
  nativas: nat.map((p) => `${p.scene} peça ${p.i} (${p.a.toFixed(2)}–${p.b.toFixed(2)} s): ${p.texts.map((x) => x.text.replace(/\n/g, ' ')).join(' / ') || p.shapes.length + ' forma(s)'}`)
    .concat(ctexts.map((p) => `${p.scene} peça ${p.i} canvas (${p.a.toFixed(2)}–${p.b.toFixed(2)} s): ${p.text}`)),
  clipes: clips.map((p) => `${p.file} (${p.a.toFixed(2)}–${p.b.toFixed(2)} s, ${p.w}×${p.h}): ${p.why.join(', ')}`),
  fontes_usadas: [...fontsUsed].sort(), fontes_faltando: fontesFaltando,
  avisos: [...new Set(avisos)]
};
fs.writeFileSync(path.join(OUT, 'ae_report.json'), JSON.stringify(report, null, 2));
console.log(`✓ ${OUT}\n  ${report.camadas.videos} vídeo(s), ${report.camadas.audios} áudio(s), ${nat.length + ctexts.length} peças nativas (${report.camadas.textos} textos, ${ctexts.length} de canvas, ${report.camadas.formas} formas), ${clips.length} clipes ProRes`);
if (fontesFaltando.length) console.log(`  ⚠️ fontes faltando: ${fontesFaltando.join(', ')}`);
