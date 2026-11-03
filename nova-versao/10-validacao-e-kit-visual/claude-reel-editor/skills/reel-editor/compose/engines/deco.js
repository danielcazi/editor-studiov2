// Motor art-deco (AD): laca preta, linha dourada gravada, volumes aerografados, sunburst, arco escalonado, letreiro de lâmpadas,
// mostradores e portas que abrem pelo eixo. Tudo função pura de t; camadas estáticas em cache(). Receitas em estilos/art-deco.md.
const AD = (() => {
  const TAU = Math.PI * 2;
  const hex = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], k))).join(',')})`; };
  // laca preta quente: nunca cinza neutro; leve esmeralda perto da base, luz no eixo central (cache)
  const lacquer = (ctx, w, h, o = {}) => {
    const { base = '#121212', emerald = true } = o;
    ctx.drawImage(cache(`ad-lacquer-${w}x${h}-${base}-${emerald}`, w, h, (c, W, H) => {
      const g = c.createRadialGradient(W / 2, H * .42, 60, W / 2, H * .42, H * .8); g.addColorStop(0, mix(base, '#4a3418', .22)); g.addColorStop(1, mix(base, '#000000', .35)); c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (emerald) { const e = c.createLinearGradient(0, H * .7, 0, H); e.addColorStop(0, 'rgba(8,48,40,0)'); e.addColorStop(1, 'rgba(8,48,40,.45)'); c.fillStyle = e; c.fillRect(0, 0, W, H); }
    }), 0, 0);
  };
  // ouro em faixas (escuro – claro – quente – claro – escuro) ao longo de um eixo; sheen desloca a faixa quente (0..1)
  const gold = (ctx, x0, y0, x1, y1, o = {}) => {
    const { base = '#F3984B', sheen = .5 } = o; const g = ctx.createLinearGradient(x0, y0, x1, y1); const s = clamp(sheen, .05, .95);
    g.addColorStop(0, mix(base, '#000000', .45)); g.addColorStop(clamp(s - .22, 0, 1), mix(base, '#ffffff', .1)); g.addColorStop(s, mix(base, '#ffffff', .62)); g.addColorStop(clamp(s + .22, 0, 1), mix(base, '#ffffff', .1)); g.addColorStop(1, mix(base, '#000000', .45)); return g;
  };
  const lengths = pts => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; };
  const partial = (pts, frac) => { if (frac >= 1) return pts; const L = lengths(pts), d = L[L.length - 1] * frac, out = [pts[0]]; for (let i = 1; i < pts.length; i++) { if (L[i] <= d) { out.push(pts[i]); continue; } const u = (d - L[i - 1]) / (L[i] - L[i - 1] || 1); out.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]); break; } return out; };
  // linha dourada gravada: sublinha escura mais larga, linha de ouro em faixas, fio de luz por cima; desenha-se por comprimento em dur
  const gline = (ctx, t, t0, pts, o = {}) => {
    const { width = 4, dur = .6, base = '#F3984B', glow = false, double = false, close = false, sheen = null } = o; const u = seg(t, t0, t0 + dur); if (u <= 0) return false;
    const seq = partial(close && u >= 1 ? [...pts, pts[0]] : pts, u), draw = (dx, dy, color, w) => { ctx.save(); ctx.translate(dx, dy); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); seq.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.restore(); };
    const bb = seq.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
    const g = gold(ctx, bb[0], bb[1], bb[2], bb[3], { base, sheen: sheen == null ? .5 : sheen });
    if (glow) { ctx.save(); ctx.shadowColor = base; ctx.shadowBlur = 18; draw(0, 0, g, width); ctx.restore(); }
    draw(1, 1.2, 'rgba(0,0,0,.8)', width + 1.6); draw(0, 0, g, width); draw(-.4, -.6, 'rgba(255,255,255,.7)', Math.max(.6, width * .18));
    if (double) { ctx.save(); ctx.translate(0, width * 2.4); draw(1, 1.2, 'rgba(0,0,0,.8)', width * .5 + 1.2); draw(0, 0, g, width * .5); ctx.restore(); }
    return u >= 1;
  };
  // volume aerografado: borda dura, degradê direcional de sombra para luz dentro da forma (luz do alto-esquerda), fio de ouro no lado iluminado
  const airbrush = (ctx, path, bbox, o = {}) => {
    const { light = '#F3984B', shade = '#5a2d10', rim = true, base = '#F3984B' } = o; const [x, y, w, h] = bbox;
    ctx.save(); ctx.clip(path); const g = ctx.createLinearGradient(x + w, y + h, x, y); g.addColorStop(0, shade); g.addColorStop(1, light); ctx.fillStyle = g; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    if (rim) { ctx.translate(2, 2); ctx.strokeStyle = gold(ctx, x, y, x + w, y + h, { base }); ctx.lineWidth = 3; ctx.stroke(path); }
    ctx.restore();
  };
  // sunburst: raios em leque abrindo do eixo central (ângulo cresce simetricamente), alternando alfa
  const sunburst = (ctx, t, t0, cx, cy, o = {}) => {
    const { n = 24, r0 = 0, r1 = 1400, color = '#F3984B', alpha = .12, dur = .8, spread = TAU, up = -Math.PI / 2 } = o; const u = eio(seg(t, t0, t0 + dur)); if (u <= 0) return false;
    ctx.save(); ctx.translate(cx, cy); for (let i = 0; i < n; i++) { const a = up + (i / n - .5) * spread * u, da = spread / n * .5 * u; ctx.fillStyle = color; ctx.globalAlpha = alpha * (i % 2 ? .55 : 1); ctx.beginPath(); ctx.moveTo(r0 * Math.cos(a - da), r0 * Math.sin(a - da)); ctx.lineTo(r1 * Math.cos(a - da * .9), r1 * Math.sin(a - da * .9)); ctx.lineTo(r1 * Math.cos(a + da * .9), r1 * Math.sin(a + da * .9)); ctx.lineTo(r0 * Math.cos(a + da), r0 * Math.sin(a + da)); ctx.closePath(); ctx.fill(); } ctx.restore(); return u >= 1;
  };
  // arco escalonado (zigurate) em linha dourada, desenhado do centro para as bordas: topo em (cx, y), largura w, altura h, `steps` degraus
  const arch = (ctx, t, t0, cx, y, w, h, o = {}) => {
    const { steps = 5, dur = .7 } = o; const half = [], sw = w / 2 / steps, sh = h / steps; for (let i = 0; i < steps; i++) { half.push([cx + sw * i, y + sh * i]); half.push([cx + sw * (i + 1), y + sh * i]); } half.push([cx + w / 2, y + h]);
    const left = half.map(p => [cx - (p[0] - cx), p[1]]); gline(ctx, t, t0, half, o); return gline(ctx, t, t0, left, { ...o, dur });
  };
  // letreiro de lâmpadas: grade de passo `step` amostrada uma vez da fonte da marca; acende uma letra por batida (`beat` s ou `times`),
  // com sobre-aceleração de ignição (1,6× em 0,18 s) e, depois de tudo aceso, perseguição rápida opcional (chase)
  const grids = {};
  const marquee = (ctx, t, t0, text, x, y, o = {}) => {
    const { size = 150, step = 22, font = `700 ${size}px Aspekta`, on = '#F3984B', off = 'rgba(243,152,75,.18)', ring = '#121212', beat = .4, times = null, chase = false, align = 'center' } = o;
    const key = `${text}|${font}|${step}`;
    if (!grids[key]) { const c = document.createElement('canvas'); const g = c.getContext('2d'); g.font = font; const w = Math.ceil(g.measureText(text).width) + step * 2, h = Math.ceil(size * 1.3); c.width = w; c.height = h; g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.fillText(text, step, size); const d = g.getImageData(0, 0, w, h).data, cells = [];
      let li = 0, lx = step; const starts = []; for (const ch of text) { starts.push(lx); lx += g.measureText(ch).width; }
      for (let yy = step / 2; yy < h; yy += step) for (let xx = step / 2; xx < w; xx += step) { if (d[((yy | 0) * w + (xx | 0)) * 4 + 3] > 128) { let L = 0; for (let k = 0; k < starts.length; k++) if (xx >= starts[k]) L = k; cells.push([xx, yy, L]); } }
      grids[key] = { cells, w, h, n: text.length }; }
    const G = grids[key], ox = align === 'center' ? x - G.w / 2 : x, oy = y - G.h + size * .3;
    ctx.save(); G.cells.forEach(([cx, cy, L]) => { const tl = times ? times[L] : t0 + L * beat, u = seg(t, tl, tl + .18), lit = u > 0; const allOn = times ? t >= times[G.n - 1] + .2 : t >= t0 + (G.n - 1) * beat + .2; const ch = chase && allOn ? (Math.floor((t * 18 + L * 2) % 6) === 0 ? .55 : 1) : 1; const r = lit ? 7 * (1 + .6 * Math.sin(Math.PI * u)) : 7;
      ctx.fillStyle = lit ? on : off; ctx.globalAlpha = lit ? ch : 1; if (lit) { ctx.shadowColor = on; ctx.shadowBlur = 18 * (1 + .6 * Math.sin(Math.PI * u)); } ctx.beginPath(); ctx.arc(ox + cx, oy + cy, r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.strokeStyle = ring; ctx.lineWidth = 1; ctx.stroke(); }); ctx.restore();
    return times ? t >= times[G.n - 1] + .18 : t >= t0 + (G.n - 1) * beat + .18;
  };
  // mostrador: anel em ouro, marcas, ponteiro com facilidade mecânica e pequena sobre-aceleração, valor em texto
  const dial = (ctx, t, t0, cx, cy, r, v0, v1, o = {}) => {
    const { dur = 1, ticks = 12, label = null, font = `700 ${Math.round(r * .5)}px Aspekta`, base = '#F3984B', ink = '#FFF8EA', a0 = Math.PI * .75, a1 = Math.PI * 2.25, fmt = v => Math.round(v) } = o;
    const u = seg(t, t0, t0 + dur), e = u >= 1 ? 1 : bk(eio(u), 1.2), v = lerp(v0, v1, e), ang = lerp(a0, a1, clamp(e));
    const ringPts = []; for (let i = 0; i <= 48; i++) { const a = a0 + (a1 - a0) * i / 48; ringPts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } gline(ctx, t, t0 - .5, ringPts, { width: 4, dur: .5, base });
    ctx.save(); ctx.strokeStyle = gold(ctx, cx - r, cy - r, cx + r, cy + r, { base }); ctx.lineWidth = 2; for (let i = 0; i <= ticks; i++) { const a = a0 + (a1 - a0) * i / ticks; ctx.beginPath(); ctx.moveTo(cx + (r - 14) * Math.cos(a), cy + (r - 14) * Math.sin(a)); ctx.lineTo(cx + (r - 28) * Math.cos(a), cy + (r - 28) * Math.sin(a)); ctx.stroke(); }
    if (u > 0) { ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 12 * Math.cos(ang), cy - 12 * Math.sin(ang)); ctx.lineTo(cx + (r - 40) * Math.cos(ang), cy + (r - 40) * Math.sin(ang)); ctx.stroke(); ctx.fillStyle = gold(ctx, cx - 14, cy - 14, cx + 14, cy + 14, { base }); ctx.beginPath(); ctx.arc(cx, cy, 14, 0, TAU); ctx.fill();
      ctx.font = font; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(fmt(v)) + (label || ''), cx, cy + r * .72); }
    ctx.restore(); return u >= 1;
  };
  // portas: duas folhas de laca com fio de ouro fecham (close=true) ou abrem pelo eixo; p = progresso 0..1 em dur
  const doors = (ctx, t, t0, w, h, o = {}) => {
    const { dur = .5, close = false, base = '#F3984B', lacq = '#0E0B09' } = o; const u = eio(seg(t, t0, t0 + dur)), p = close ? u : 1 - u; if (p <= 0) return close ? false : true;
    const lw = w / 2 * p; [[0, lw], [w - lw, lw]].forEach(([x, ww], i) => { ctx.save(); ctx.fillStyle = lacq; ctx.fillRect(x, 0, ww, h); const ex = i ? x : x + ww; ctx.strokeStyle = gold(ctx, ex - 6, 0, ex + 6, h, { base, sheen: .5 }); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex, h); ctx.stroke(); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex + (i ? 18 : -18), 0); ctx.lineTo(ex + (i ? 18 : -18), h); ctx.stroke(); ctx.restore(); });
    return close ? p >= 1 : false;
  };
  // faísca de quatro pontas: escala sobe e desce em dur
  const sparkle = (ctx, t, t0, x, y, r, color = '#FFF8EA', dur = .5) => { const u = seg(t, t0, t0 + dur); if (u <= 0 || u >= 1) return u >= 1; const s = Math.sin(Math.PI * u); ctx.save(); ctx.translate(x, y); ctx.rotate(u * .6); ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.lineTo(r * s * Math.cos(a), r * s * Math.sin(a)); ctx.lineTo(r * s * .18 * Math.cos(a + Math.PI / 4), r * s * .18 * Math.sin(a + Math.PI / 4)); } ctx.closePath(); ctx.fill(); ctx.restore(); return false; };
  // barra de título escalonada abrindo do centro (ponto → fio → barras simétricas → texto sobe → faísca)
  const titleBar = (ctx, t, t0, text, cx, y, w, h, o = {}) => {
    const { base = '#F3984B', ink = '#FFF8EA', font = `700 ${Math.round(h * .5)}px Aspekta`, lacq = '#0E0B09', dur = .7 } = o; const u = eio(seg(t, t0, t0 + dur)); if (u <= 0) return false;
    const ww = w * u, st = h * .22; ctx.save(); ctx.fillStyle = lacq; const shape = new Path2D(); ctx.beginPath(); ctx.moveTo(cx - ww / 2, y + st); ctx.lineTo(cx - ww / 2 + st, y + st); ctx.lineTo(cx - ww / 2 + st, y); ctx.lineTo(cx + ww / 2 - st, y); ctx.lineTo(cx + ww / 2 - st, y + st); ctx.lineTo(cx + ww / 2, y + st); ctx.lineTo(cx + ww / 2, y + h - st); ctx.lineTo(cx + ww / 2 - st, y + h - st); ctx.lineTo(cx + ww / 2 - st, y + h); ctx.lineTo(cx - ww / 2 + st, y + h); ctx.lineTo(cx - ww / 2 + st, y + h - st); ctx.lineTo(cx - ww / 2, y + h - st); ctx.closePath(); ctx.fill();
    shape.rect(cx - ww / 2 + st, y, Math.max(0, ww - st * 2), h); shape.rect(cx - ww / 2, y + st, ww, Math.max(0, h - st * 2));
    ctx.strokeStyle = gold(ctx, cx - ww / 2, y, cx + ww / 2, y + h, { base, sheen: clamp(seg(t, t0 + dur, t0 + dur + .6), .05, .95) }); ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1; ctx.save(); ctx.translate(0, 0); ctx.scale(1, 1); ctx.strokeRect(cx - ww / 2 + 10, y + 10, Math.max(0, ww - 20), h - 20); ctx.restore();
    if (u > .6) { const v = seg(t, t0 + dur * .6, t0 + dur); ctx.clip(shape); ctx.font = font; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '0.12em'; ctx.fillText(text, cx, y + h / 2 + (1 - eio(v)) * h * .6); }
    ctx.restore(); sparkle(ctx, t, t0 + dur, cx + w / 2 - 20, y - 6, 26, ink); return u >= 1;
  };

  return { mix, lacquer, gold, gline, airbrush, sunburst, arch, marquee, dial, doors, sparkle, titleBar, partial };
})();
