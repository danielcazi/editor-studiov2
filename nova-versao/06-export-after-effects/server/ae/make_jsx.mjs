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

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('ERRO: Chrome não encontrado. Instale o Google Chrome ou defina CHROME_PATH.'); process.exit(1); }

for (const d of ['V/clips', 'V/media']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
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
await page.setViewport({ width: W_COMP, height: H_COMP, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load', timeout: 120000 });   // não networkidle: os vídeos continuam baixando
await page.waitForFunction(() => window.__playerReady && window.__player, { timeout: 60000 });
await page.evaluate(() => { window.__player.enableRenderMode && window.__player.enableRenderMode(); return document.fonts.ready.then(() => 0); });
const DUR = +(+opt('dur', await page.evaluate(() => window.__player.getDuration()))).toFixed(3);
const seek = (t) => page.evaluate(async (x) => {
  await window.__player.renderSeek(x);
  if (window.__hfWaitForSeekCompletion) await window.__hfWaitForSeekCompletion();
  await document.fonts.ready;   // a fonte de uma cena só carrega quando ela aparece; medir antes dá a fonte reserva
}, t);

// ---- Funções injetadas na página ----
const INPAGE = () => {
  const num = (v) => parseFloat(v) || 0;
  const col = (s) => { const m = String(s).match(/[\d.]+/g) || []; return { c: [+m[0] || 0, +m[1] || 0, +m[2] || 0], a: m.length > 3 ? +m[3] : 1 }; };
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
  const SKIP = /^(STYLE|SCRIPT|TEMPLATE|LINK|META)$/;
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

  // caractere que a fonte principal não tem (emoji, ✦): o navegador desenha com outra fonte, o After não.
  // Se a largura muda conforme a fonte reserva, quem desenhou foi a reserva.
  const semGlifo = (el, cs) => {
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), w = `${cs.fontWeight} 40px "${fam}"`;
    const chars = new Set([...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').replace(/\s/g, ''));
    const largura = (ch, reserva) => { ctx.font = w + ', ' + reserva; return ctx.measureText(ch).width; };
    // emoji sai da fonte de emoji do sistema com qualquer reserva, então é pego pela categoria
    return [...chars].some((ch) => /\p{Extended_Pictographic}/u.test(ch) || largura(ch, 'serif') !== largura(ch, 'monospace'));
  };

  // motivos para a peça virar clipe (lista vazia = pode ser nativa)
  const complexo = (p) => {
    const why = new Set();
    // a translação de um invólucro já entra na posição medida; escala/rotação dele não, então vira clipe
    for (let a = p.parentElement; a && !a.matches('[data-hf-inner-root], [data-ae-group]'); a = a.parentElement) {
      const t = getComputedStyle(a).transform;
      if (t !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(t)) why.add('transformação no invólucro');
    }
    for (const el of [p, ...p.querySelectorAll('*')]) {
      const cs = getComputedStyle(el), tag = el.tagName.toLowerCase();
      if (direct(el) && semGlifo(el, cs)) why.add('emoji/símbolo fora da fonte');
      if (/^(svg|img|canvas|video)$/.test(tag)) why.add('ilustração/imagem');
      if (/matrix3d/.test(cs.transform) || cs.perspective !== 'none' || cs.transformStyle === 'preserve-3d') why.add('3D/perspectiva');
      if (el !== p && cs.transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(cs.transform)) why.add('transformação interna');
      if (cs.filter !== 'none' || cs.backdropFilter !== 'none') why.add('filtro');
      if (/gradient|url\(/.test(cs.backgroundImage)) why.add('gradiente/imagem de fundo');
      if (cs.clipPath !== 'none' || (cs.webkitMaskImage || 'none') !== 'none') why.add('máscara');
      if (cs.borderTopStyle === 'dashed' || cs.borderTopStyle === 'dotted') why.add('borda tracejada');
      if (el !== p && cs.overflow === 'hidden' && el.children.length) why.add('recorte (overflow)');
    }
    return [...why];
  };

  // assinatura do conteúdo: muda quando algo anima por dentro (contador, digitação, barra)
  const assinatura = (p) => {
    const r0 = p.getBoundingClientRect(), out = [];
    for (const el of p.querySelectorAll('*')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      out.push([Math.round(r.left - r0.left), Math.round(r.top - r0.top), Math.round(r.width), Math.round(r.height), (+cs.opacity).toFixed(2), cs.backgroundColor, cs.color].join(','));
    }
    out.push(p.textContent.replace(/\s+/g, ' ').trim(), Math.round(r0.width), Math.round(r0.height));
    return out.join('|');
  };

  // Grupos de peças: cada filho direto da raiz que não é mídia. Sub-composição → os filhos da raiz interna; o resto → ele mesmo.
  const isMedia = (el) => el.matches('audio, video.clip') || (!el.hasAttribute('data-composition-src') && !!el.querySelector('video.clip') && !el.querySelector('[data-composition-src]'));
  const tops = [...root.children].filter((e) => !SKIP.test(e.tagName));
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
    const e = root.querySelector(`:scope > [data-ae-group="${CSS.escape(g)}"]`);
    if (!e) return [];
    if (!e.hasAttribute('data-composition-src')) return achatar([e]);
    const inner = e.querySelector('[data-hf-inner-root]') || e.firstElementChild;
    return inner ? achatar([...inner.children].filter((c) => !SKIP.test(c.tagName))) : [];
  })());
  const zOf = (e) => parseInt(getComputedStyle(e).zIndex) || 0;

  const grupos = () => tops.filter((e) => !isMedia(e)).map((e, n) => {
    const a = e.hasAttribute('data-start') ? startOf(e) : 0;
    const d = e.getAttribute('data-hf-authored-duration') || e.getAttribute('data-duration');
    return { id: e.getAttribute('data-ae-group'), a, b: d ? a + num(d) : null, z: zOf(e), ord: tops.indexOf(e), comp: e.hasAttribute('data-composition-src') };
  });

  // vídeos e áudios que entram como arquivo (vídeo dentro de cena é peça da cena e vira clipe)
  const midias = () => [...document.querySelectorAll('audio[src], video.clip[src]')].filter((m) => m.tagName === 'AUDIO' || !host(m)).map((m) => {
    const top = tops.find((t) => t.contains(m));
    return {
      id: m.id, tag: m.tagName.toLowerCase(), src: m.getAttribute('src'),
      a: startOf(m), d: num(m.getAttribute('data-duration')) || null,
      ms: num(m.getAttribute('data-media-start') || m.getAttribute('data-playback-start')),
      vol: m.hasAttribute('data-volume') ? num(m.getAttribute('data-volume')) : 1,
      fit: getComputedStyle(m).objectFit, z: top ? zOf(top) : 0, ord: top ? tops.indexOf(top) : -1
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
    const why = complexo(p);
    const salvo = p.style.transform;
    p.style.transform = 'none';
    const r0 = p.getBoundingClientRect(), org = cs.transformOrigin.split(' ').map(num), sig = assinatura(p);
    p.style.transform = salvo;
    return { i, on: true, op: +op.toFixed(4), m, O: [r0.left + org[0], r0.top + org[1]], sig, why, box: [L, T, Rr, B] };
  });

  // textos e formas nativos na pose de repouso
  const extrair = (p) => {
    const out = { shapes: [], texts: [], avisos: [] };
    let ord = 0;
    const salvoT = p.style.transform, salvoO = p.style.opacity;
    p.style.transform = 'none'; p.style.opacity = '1';
    const stop = p.parentElement;

    const shapeOf = (el, o, cs) => {
      const bg = col(cs.backgroundColor);
      const fill = bg.a > 0.01 ? bg : null;
      const bw = num(cs.borderTopWidth), bc = col(cs.borderTopColor);
      const stroke = bw > 0 && cs.borderTopStyle !== 'none' && bc.a > 0.01 ? { c: bc.c, a: bc.a, w: bw } : null;
      if (!fill && !stroke) return;
      const rects = el.getClientRects().length > 1 ? [...el.getClientRects()] : [el.getBoundingClientRect()];
      for (const r of rects) {
        if (r.width < 2 || r.height < 2) continue;
        let rad = cs.borderTopLeftRadius;
        rad = /%/.test(rad) ? Math.min(r.width, r.height) * num(rad) / 100 : num(rad);
        out.shapes.push({ ord: ord++, ...R(r), rad: Math.min(rad, Math.min(r.width, r.height) / 2), fill, stroke, o: +o.toFixed(3), sh: shadow(cs.boxShadow), cls: String(el.id || el.className || el.tagName).slice(0, 40) });
      }
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
    p.style.transform = salvoT;
    p.style.opacity = salvoO;
    return out;
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

  return { grupos, midias, midiaPose, sondar, extrair: (g, i) => { const p = pecas(g)[i]; return p ? extrair(p) : null; }, isolar, ocultarTexto, restaurarTexto };
};

await page.evaluate(`window.__AE = (${INPAGE.toString()})();`);
const STYLE_ONLY = 'html,body,[data-composition-id],[data-hf-inner-root]{background:transparent!important}body *{visibility:hidden!important}[data-ae-only],[data-ae-only] *{visibility:visible!important}';
const r3 = (x) => +x.toFixed(3);
const grupos = await page.evaluate(() => window.__AE.grupos());
const midias = await page.evaluate(() => window.__AE.midias());

// ---- Peças de cada grupo, quadro a quadro ----
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
    return { t: x.t, p: [+(x.O[0] + me).toFixed(2), +(x.O[1] + mf).toFixed(2)], r: +(Math.atan2(mb, ma) * 180 / Math.PI).toFixed(3), s: [+(sx * 100).toFixed(3), +(sy * 100).toFixed(3)], op: +(x.op * 100).toFixed(2) };
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
    let ex = null;
    if (!animacao.length) {
      await seek(rest.t);
      ex = await page.evaluate((id, k) => window.__AE.extrair(id, k), g.id, i);
      if (ex) {
        ex.avisos.forEach((x) => avisos.push(`${g.id}: ${x}`));
        ex.texts.forEach((x) => fontsUsed.add(`${x.fam} ${x.weight}`));
      }
    }
    if (ex && !decor.length) {
      if (!ex.shapes.length && !ex.texts.length) continue;
      pieces.push({ kind: 'native', ...base, O: [+rest.O[0].toFixed(2), +rest.O[1].toFixed(2)], keys: keysOf(s), shapes: ex.shapes, texts: ex.texts });
    } else {
      // decoração (gradiente, filtro, máscara, imagem) fica em clipe; quando há texto estático, o texto vai nativo e sai do clipe
      const comTexto = !!(ex && ex.texts.length);
      if (comTexto) pieces.push({ kind: 'native', ...base, O: [+rest.O[0].toFixed(2), +rest.O[1].toFixed(2)], keys: keysOf(s), shapes: [], texts: ex.texts });
      const PAD = 70;
      let L = 1e9, T = 1e9, Rr = -1e9, B = -1e9;
      for (const x of on) { L = Math.min(L, x.box[0]); T = Math.min(T, x.box[1]); Rr = Math.max(Rr, x.box[2]); B = Math.max(B, x.box[3]); }
      const x0 = Math.max(0, Math.floor(L - PAD)), y0 = Math.max(0, Math.floor(T - PAD));
      let w = Math.min(W_COMP, Math.ceil(Rr + PAD)) - x0, h = Math.min(H_COMP, Math.ceil(B + PAD)) - y0;
      w -= w % 2; h -= h % 2;
      if (w < 2 || h < 2) continue;
      pieces.push({ kind: 'clip', ...base, x: x0, y: y0, w, h, file: `V/clips/${slug(g.id)}-${i}.mov`, ids: [i], why: [...why], semTexto: comTexto });
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

// ---- Vídeos e áudios: o arquivo original, com a câmera em keyframes ----
const probe = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name:stream_tags=alpha_mode', '-of', 'json', f], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout).streams[0] || null; } catch { return null; }
};
const media = [];
for (const m of midias) {
  const src = path.resolve(FILM_DIR, m.src);
  if (!fs.existsSync(src)) { avisos.push(`mídia ${m.id}: arquivo não encontrado (${m.src})`); continue; }
  const it = { id: m.id, tag: m.tag, file: src, a: r3(m.a), b: r3(Math.min(DUR, m.d ? m.a + m.d : DUR)), ms: m.ms, vol: m.vol, z: m.z, ord: m.ord };
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
    for (let f = Math.round(c.a * FPS); f < Math.round(c.b * FPS); f++) {
      await seek(f / FPS);
      await page.evaluate((id, ids) => window.__AE.isolar(id, ids), c.scene, c.ids);
      if (c.semTexto) await page.evaluate((id, ids) => window.__AE.ocultarTexto(id, ids), c.scene, c.ids);
      await page.screenshot({ path: path.join(tmp, String(n++).padStart(5, '0') + '.png'), clip: { x: c.x, y: c.y, width: c.w, height: c.h }, omitBackground: true });
      if (c.semTexto) await page.evaluate(() => window.__AE.restaurarTexto());
    }
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, '%05d.png'),
      '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', '-qscale:v', '9', '-alpha_bits', '16', path.join(OUT, c.file)], { encoding: 'utf8' });
    if (r.status !== 0) { avisos.push(`clipe ${c.file}: ffmpeg falhou (${(r.stderr || '').slice(0, 160)})`); c.kind = 'erro'; }
    process.stdout.write(`\rclipe ${c.file} (${n} quadros)        `);
  }
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
  media, pieces: ok
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

const nat = ok.filter((p) => p.kind === 'native'), clips = ok.filter((p) => p.kind === 'clip');
const report = {
  comp: NAME, aep: AEP, fps: FPS, dur: DUR, passo_amostragem: STEP,
  camadas: {
    videos: media.filter((m) => m.tag === 'video').length, audios: media.filter((m) => m.tag === 'audio').length,
    grupos: grupos.length, pecas_nativas: nat.length,
    textos: nat.reduce((n, p) => n + p.texts.length, 0), formas: nat.reduce((n, p) => n + p.shapes.length, 0),
    clipes_prores: clips.length
  },
  midias: media.map((m) => `${m.id} (${m.tag}, ${m.a.toFixed(2)}–${m.b.toFixed(2)} s): ${m.file.startsWith(OUT) ? path.relative(OUT, m.file) : m.file}`),
  nativas: nat.map((p) => `${p.scene} peça ${p.i} (${p.a.toFixed(2)}–${p.b.toFixed(2)} s): ${p.texts.map((x) => x.text.replace(/\n/g, ' ')).join(' / ') || p.shapes.length + ' forma(s)'}`),
  clipes: clips.map((p) => `${p.file} (${p.a.toFixed(2)}–${p.b.toFixed(2)} s, ${p.w}×${p.h}): ${p.why.join(', ')}`),
  fontes_usadas: [...fontsUsed].sort(), fontes_faltando: fontesFaltando,
  avisos: [...new Set(avisos)]
};
fs.writeFileSync(path.join(OUT, 'ae_report.json'), JSON.stringify(report, null, 2));
console.log(`✓ ${OUT}\n  ${report.camadas.videos} vídeo(s), ${report.camadas.audios} áudio(s), ${nat.length} peças nativas (${report.camadas.textos} textos, ${report.camadas.formas} formas), ${clips.length} clipes ProRes`);
if (fontesFaltando.length) console.log(`  ⚠️ fontes faltando: ${fontesFaltando.join(', ')}`);
