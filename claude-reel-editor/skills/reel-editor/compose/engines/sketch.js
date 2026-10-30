// Motor sketchnote (SB): explicação desenhada à mão sobre papel: traço de tinta que se desenha com tremor, marca-texto sobre
// palavras, parágrafo datilografado, sol/nuvem/onda/gota/seta em linha, preenchimento a lápis, página de livro, moldura de player.
// Referência: DistilBook (@itisRazak, prompt-motion). Tudo função pura de t; estáticos em cache(). Receitas em estilos/sketchnote.md.
const SB = (() => {
  const TAU = Math.PI * 2;
  const paper = (ctx, w, h, color = '#FFFFFF', seed = 2) => {
    ctx.drawImage(cache(`sb-paper-${w}x${h}-${color}-${seed}`, w, h, (c, W, H) => { c.fillStyle = color; c.fillRect(0, 0, W, H); const r = mulberry(seed); c.fillStyle = 'rgba(0,0,0,.035)'; for (let i = 0; i < 2600; i++) c.fillRect(r() * W, r() * H, 1.2, 1.2); }), 0, 0);
  };
  const lengths = pts => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; };
  const pointAt = (pts, L, d) => { if (d <= 0) return pts[0]; for (let i = 1; i < pts.length; i++) if (L[i] >= d) { const u = (d - L[i - 1]) / (L[i] - L[i - 1] || 1); return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]; } return pts[pts.length - 1]; };
  // traço de tinta à mão: polilinha desenhada por comprimento (speed px/s), tremor perpendicular por vnoise, largura levemente viva
  const stroke = (ctx, t, t0, pts, color = '#1B1B1B', o = {}) => {
    const { width = 4, speed = 1100, wobble = 1.4, seed = 1, alpha = 1, step = 6 } = o; const L = lengths(pts), total = L[L.length - 1];
    const d = Math.min(total, Math.max(0, (t - t0) * speed)); if (d <= 0) return false;
    const n = Math.max(2, Math.ceil(d / step)); ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = width; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const s = d * i / n, p = pointAt(pts, L, s), q = pointAt(pts, L, Math.min(total, s + 2)), dx = q[0] - p[0], dy = q[1] - p[1], m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m, wv = (vnoise(s * .07 + seed * 11) - .5) * 2 * wobble; const x = p[0] + nx * wv, y = p[1] + ny * wv; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.restore(); return d >= total;
  };
  const circle = (ctx, t, t0, cx, cy, r, color, o = {}) => { const pts = []; const turns = o.turns ?? 1.08, a0 = o.a0 ?? -.9; for (let i = 0; i <= 40; i++) { const a = a0 + TAU * turns * i / 40, rr = r * (1 + (vnoise(i * .4 + (o.seed || 1) * 5) - .5) * .06); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return stroke(ctx, t, t0, pts, color, { speed: 1400, ...o }); };
  const arrow = (ctx, t, t0, pts, color, o = {}) => { const done = stroke(ctx, t, t0, pts, color, o); if (!done) return false; const a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = (o.width || 4) * 4; stroke(ctx, t, t0 - 9, [[b[0] - s * Math.cos(ang - .55), b[1] - s * Math.sin(ang - .55)], b, [b[0] - s * Math.cos(ang + .55), b[1] - s * Math.sin(ang + .55)]], color, o); return true; };
  // marca-texto: faixa translúcida (multiply) que varre da esquerda em dur, bordas levemente onduladas, 1° de inclinação
  const highlight = (ctx, t, t0, x, y, w, h, color = '#B9F0A8', o = {}) => {
    const { dur = .28, alpha = .75, seed = 1 } = o; const u = seg(t, t0, t0 + dur); if (u <= 0) return false;
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.translate(x, y + h / 2); ctx.rotate(-.012); ctx.beginPath(); const ww = w * eo(u);
    ctx.moveTo(0, -h / 2); for (let xx = 0; xx <= ww; xx += 12) ctx.lineTo(xx, -h / 2 + (vnoise(xx * .05 + seed) - .5) * 4); ctx.lineTo(ww + 6, 0); for (let xx = ww; xx >= 0; xx -= 12) ctx.lineTo(xx, h / 2 + (vnoise(xx * .05 + seed + 9) - .5) * 4); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill(); ctx.restore(); return u >= 1;
  };
  // parágrafo datilografado com palavras marcadas: lines = ['texto...', ...]; marks = {palavra: cor}; a marca entra 0,2 s depois da palavra
  const para = (ctx, t, t0, lines, x, y, o = {}) => {
    const { font = '400 40px Aspekta', color = '#1B1B1B', lineH = 56, cps = 60, marks = {}, markH = 1.1 } = o; ctx.save(); ctx.font = font; ctx.textBaseline = 'alphabetic';
    let shown = Math.floor(Math.max(0, t - t0) * cps), done = true;
    lines.forEach((line, li) => { if (shown <= 0) { done = false; return; } const words = line.split(' '); let cx = x; let acc = '';
      for (const w of words) { const piece = (acc ? ' ' : '') + w; const wx = cx + (acc ? ctx.measureText(' ').width : 0), ww = ctx.measureText(w).width; acc += piece; const key = w.replace(/[.,;:!?]+$/, '');
        if (marks[key] !== undefined) { const idx = lines.slice(0, li).join(' ').length + acc.length; const tw = t0 + idx / cps + .2; highlight(ctx, t, tw, wx - 6, y + li * lineH - lineH * .72, ww + 12, lineH * .78 * markH, marks[key], { seed: idx }); }
        cx = wx + ww; }
      const vis = line.slice(0, shown); ctx.fillStyle = color; ctx.font = font; ctx.fillText(vis, x, y + li * lineH); shown -= line.length + 1; if (vis.length < line.length) done = false; });
    ctx.restore(); return done;
  };
  // ícones de linha que se desenham (cada um em dur ~0,5 s)
  const sun = (ctx, t, t0, cx, cy, r, color = '#1B1B1B', o = {}) => { const done = circle(ctx, t, t0, cx, cy, r, color, o); for (let i = 0; i < 8; i++) { const a = i * TAU / 8, r0 = r * 1.35, r1 = r * 1.9 + (i % 2) * r * .2; stroke(ctx, t, t0 + .35 + i * .05, [[cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]], color, { ...o, speed: 900 }); } return done && t >= t0 + .9; };
  const cloud = (ctx, t, t0, cx, cy, w, color = '#1B1B1B', o = {}) => { const pts = []; const bumps = [[-.42, 0, .22], [-.2, -.2, .26], [.08, -.26, .3], [.34, -.1, .24]]; bumps.forEach(([bx, by, br], k) => { for (let i = 0; i <= 10; i++) { const a = Math.PI + Math.PI * i / 10 + (k ? .3 : 0); pts.push([cx + (bx + br * Math.cos(a)) * w, cy + (by + br * Math.sin(a)) * w * .9]); } }); pts.push([cx + .5 * w, cy + .12 * w]); pts.push([cx - .5 * w, cy + .12 * w]); pts.push(pts[0]); return stroke(ctx, t, t0, pts, color, { speed: 1300, ...o }); };
  const waves = (ctx, t, t0, x, y, w, color = '#2B6CB0', o = {}) => { const { rows = 3, amp = 9, gap = 22 } = o; let done = true; for (let r = 0; r < rows; r++) { const pts = []; for (let xx = 0; xx <= w; xx += 10) pts.push([x + xx, y + r * gap + Math.sin(xx * .05 + r) * amp]); done = stroke(ctx, t, t0 + r * .15, pts, color, { speed: 1500, ...o }) && done; } return done; };
  const drop = (ctx, t, t0, cx, cy, r, color = '#2B6CB0', o = {}) => { const pts = [[cx, cy - r * 1.6]]; for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + .6 + (TAU - 1.2) * i / 24; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } pts.push([cx, cy - r * 1.6]); return stroke(ctx, t, t0, pts, color, { speed: 1100, ...o }); };
  // preenchimento a lápis de cor: hachura inclinada recortada pelo path, entrando por varredura em dur
  const fill = (ctx, t, t0, path, color, o = {}) => { const { spacing = 9, angle = -.65, alpha = .55, width = 3, dur = .45, w = 1080, h = 1920, seed = 1 } = o; const u = seg(t, t0, t0 + dur); if (u <= 0) return false; ctx.save(); ctx.clip(path); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; const n = Math.floor((w + h) / spacing), k = Math.floor(n * u); for (let i = 0; i < k; i++) { const d = -h + i * spacing, j = (vnoise(i * .3 + seed) - .5) * 6; ctx.beginPath(); ctx.moveTo(d + j, 0); ctx.lineTo(d + j + h * Math.tan(-angle), h); ctx.stroke(); } ctx.restore(); return u >= 1; };
  // legenda em negrito com uma palavra marcada: {word, color}
  const caption = (ctx, t, t0, text, cx, y, o = {}) => { const { font = '700 44px Aspekta', color = '#1B1B1B', mark = null, dur = .3 } = o; const u = seg(t, t0, t0 + dur); if (u <= 0) return false; ctx.save(); ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; const w = ctx.measureText(text).width, x0 = cx - w / 2; if (mark) { const i = text.indexOf(mark.word); if (i >= 0) { const px = ctx.measureText(text.slice(0, i)).width, ww = ctx.measureText(mark.word).width; highlight(ctx, t, t0 + .15, x0 + px - 6, y - 40, ww + 12, 52, mark.color || '#B9F0A8'); } } ctx.globalAlpha = eo(u); ctx.fillStyle = color; ctx.fillText(text, cx, y + (1 - eo(u)) * 14); ctx.restore(); return u >= 1; };
  // página de livro: folha com sombra; flip = progresso 0..1 da virada em torno da lombada à esquerda (x)
  const page = (ctx, x, y, w, h, o = {}) => { const { flip = 0, color = '#FFFFFF', lines = 0 } = o; const a = flip * Math.PI, sx = Math.cos(a); ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.filter = 'blur(14px)'; ctx.fillRect(8, 14, w * Math.abs(sx), h); ctx.filter = 'none'; ctx.scale(sx || .001, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, `rgba(0,0,0,${(.18 * (1 - Math.abs(sx))).toFixed(3)})`); g.addColorStop(.3, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); if (lines) { ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; for (let i = 1; i <= lines; i++) { ctx.beginPath(); ctx.moveTo(w * .1, h * i / (lines + 1)); ctx.lineTo(w * .9, h * i / (lines + 1)); ctx.stroke(); } } ctx.restore(); };
  // moldura de player: cartão branco com sombra, barra de progresso embaixo e tempo
  const player = (ctx, x, y, w, h, o = {}) => { const { progress = 0, accent = '#2B6CB0', r = 18 } = o; ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.filter = 'blur(22px)'; ctx.beginPath(); ctx.roundRect(x + 6, y + 18, w, h, r); ctx.fill(); ctx.filter = 'none'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.fillStyle = '#E6E8EC'; ctx.fillRect(x + 24, y + h - 26, w - 48, 4); ctx.fillStyle = accent; ctx.fillRect(x + 24, y + h - 26, (w - 48) * clamp(progress), 4); ctx.beginPath(); ctx.arc(x + 24 + (w - 48) * clamp(progress), y + h - 24, 6, 0, TAU); ctx.fill(); ctx.restore(); };
  return { paper, stroke, circle, arrow, highlight, para, sun, cloud, waves, drop, fill, caption, page, player, lengths, pointAt };
})();
