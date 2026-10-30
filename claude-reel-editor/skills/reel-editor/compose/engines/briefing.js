// Motor briefing-board (BB): quadro branco filmado, tinta de caneta com significado fixo, fotos recortadas que pousam com peso,
// cotas, ímãs, etiquetas e carimbo. Tudo função pura de t; camadas estáticas em cache(). Receitas em estilos/briefing-board.md.
const BB = (() => {
  const TAU = Math.PI * 2;
  // esmalte do quadro: luz de janela pela esquerda, fantasmas de traços apagados, manchas, reflexo diagonal (cache)
  const board = (ctx, w, h, seed = 5) => {
    ctx.drawImage(cache(`bb-board-${w}x${h}-${seed}`, w, h, (c, W, H) => {
      const g = c.createLinearGradient(0, 0, W, H * .6); g.addColorStop(0, '#F2F3F1'); g.addColorStop(.55, '#E6E8E6'); g.addColorStop(1, '#D9DCDA'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const r = mulberry(seed); c.lineCap = 'round';
      for (let i = 0; i < 6; i++) { c.strokeStyle = `rgba(40,45,50,${(.012 + r() * .018).toFixed(3)})`; c.lineWidth = 30 + r() * 60; c.beginPath(); const x = r() * W, y = r() * H; c.moveTo(x, y); c.bezierCurveTo(x + (r() - .5) * 600, y + (r() - .5) * 400, x + (r() - .5) * 600, y + (r() - .5) * 400, x + (r() - .5) * 500, y + (r() - .5) * 500); c.stroke(); }
      for (let i = 0; i < 10; i++) { c.fillStyle = `rgba(30,35,40,${(.01 + r() * .015).toFixed(3)})`; c.beginPath(); c.ellipse(r() * W, r() * H, 80 + r() * 200, 30 + r() * 80, r() * TAU, 0, TAU); c.fill(); }
      const rf = c.createLinearGradient(0, 0, W, H); rf.addColorStop(.3, 'rgba(255,255,255,0)'); rf.addColorStop(.45, 'rgba(255,255,255,.18)'); rf.addColorStop(.5, 'rgba(255,255,255,.06)'); rf.addColorStop(.6, 'rgba(255,255,255,0)'); c.fillStyle = rf; c.fillRect(0, 0, W, H);
    }), 0, 0);
  };

  // comprimento acumulado de uma polilinha
  const lengths = pts => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; };
  const pointAt = (pts, L, d) => { if (d <= 0) return pts[0]; for (let i = 1; i < pts.length; i++) if (L[i] >= d) { const u = (d - L[i - 1]) / (L[i] - L[i - 1] || 1); return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]; } return pts[pts.length - 1]; };

  // traço de caneta: polilinha desenhada por comprimento de arco à velocidade de uma mão (speed px/s), multiply, núcleo claro,
  // brilho molhado na ponta enquanto desenha. Devolve true quando terminou.
  const ink = (ctx, t, t0, pts, color = '#2B2E33', o = {}) => {
    const { width = 6, speed = 1400, alpha = .9, core = true } = o; const L = lengths(pts), total = L[L.length - 1];
    const d = Math.min(total, Math.max(0, (t - t0) * speed)); if (d <= 0) return false;
    const n = Math.max(2, Math.ceil(d / 6)); const seq = []; for (let i = 0; i <= n; i++) seq.push(pointAt(pts, L, d * i / n));
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); seq.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    if (core) { ctx.globalAlpha = alpha * .35; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, width * .3); ctx.stroke(); }
    ctx.restore();
    if (d < total) { const tip = seq[seq.length - 1]; ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(tip[0], tip[1], width * .35, 0, TAU); ctx.fill(); ctx.restore(); }
    return d >= total;
  };
  const arrow = (ctx, t, t0, pts, color, o = {}) => {
    const done = ink(ctx, t, t0, pts, color, o); if (!done) return false;
    const a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = (o.width || 6) * 3;
    ink(ctx, t, t0 - 9, [[b[0] - s * Math.cos(ang - .5), b[1] - s * Math.sin(ang - .5)], b, [b[0] - s * Math.cos(ang + .5), b[1] - s * Math.sin(ang + .5)]], color, o); return true;
  };

  // letras de caneta: glifo por glifo (cps), inclinação e linha de base com semente, multiply
  const letter = (ctx, t, t0, text, x, y, size = 120, color = '#2B2E33', o = {}) => {
    const { cps = 18, font = `600 ${size}px Aspekta`, seed = 1, alpha = .9, tilt = 3, jitter = 2, align = 'left' } = o;
    const n = Math.min(text.length, Math.floor(Math.max(0, t - t0) * cps)); if (n <= 0) return false;
    ctx.save(); ctx.font = font; ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    let cx = align === 'center' ? x - ctx.measureText(text).width / 2 : align === 'right' ? x - ctx.measureText(text).width : x;
    for (let i = 0; i < n; i++) { const ch = text[i], wch = ctx.measureText(ch).width; ctx.save(); ctx.translate(cx + wch / 2, y + (hash(seed * 31 + i) - .5) * 2 * jitter); ctx.rotate((hash(seed * 17 + i) - .5) * 2 * tilt * Math.PI / 180); ctx.fillText(ch, -wch / 2, 0); ctx.restore(); cx += wch; }
    ctx.restore(); return n >= text.length;
  };

  // cota: linhas de extensão, linha com setas que batem nas pontas, rótulo acima, em quantidade real
  const dimension = (ctx, t, t0, x0, y0, x1, y1, label, color = '#A8460A', o = {}) => {
    const { width = 4, size = 40, font = `600 ${size}px Aspekta`, ext = 24 } = o;
    const ang = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(ang), ny = Math.cos(ang);
    ink(ctx, t, t0, [[x0 + nx * ext, y0 + ny * ext], [x0 - nx * ext, y0 - ny * ext]], color, { width: width * .6, speed: 900 });
    const done = ink(ctx, t, t0 + .08, [[x0, y0], [x1, y1]], color, { width, speed: 1800 });
    if (done) { ink(ctx, t, t0 + .08, [[x1 + nx * ext, y1 + ny * ext], [x1 - nx * ext, y1 - ny * ext]], color, { width: width * .6, speed: 900 });
      const s = width * 3; [[x0, y0, ang], [x1, y1, ang + Math.PI]].forEach(([px, py, a]) => { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .9; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + s * Math.cos(a + .45), py + s * Math.sin(a + .45)); ctx.lineTo(px + s * Math.cos(a - .45), py + s * Math.sin(a - .45)); ctx.closePath(); ctx.fill(); ctx.restore(); });
      letter(ctx, t, t0 + .25, label, (x0 + x1) / 2, (y0 + y1) / 2 - ext - 10, size, color, { font, align: 'center', cps: 30 }); }
    return done;
  };
  // linha de projeção tracejada (uma vista para outra)
  const projection = (ctx, t, t0, x0, y0, x1, y1, color = '#2B2E33', o = {}) => { ctx.save(); ctx.setLineDash([16, 14]); const r = ink(ctx, t, t0, [[x0, y0], [x1, y1]], color, { width: 3, speed: 2200, core: false, ...o }); ctx.restore(); return r; };

  // fotos: imagem registrada em buildReady para o render esperar o carregamento
  const imgs = {};
  const image = src => { if (!imgs[src]) { const im = new Image(); window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {}; window.__hf.buildReady['bb-' + src] = new Promise(ok => { im.onload = ok; im.onerror = ok; }); im.src = src; imgs[src] = im; } return imgs[src]; };
  // print recortado pousa: desce do lado da câmera (escala 1,12 → 1 com mola), sombra aperta, borda de papel, inclinação, ímã opcional
  const pin = (ctx, t, t0, img, x, y, w, h, o = {}) => {
    const { tilt = -3, border = 10, magnet = null, dur = .45, grade = 'saturate(.85) sepia(.12)' } = o; const u = seg(t, t0, t0 + dur); if (u <= 0) return false;
    const s = lerp(1.12, 1, spring(u * 1.6, 7, .4)), sh = lerp(46, 10, eo(u)), cx = x + w / 2, cy = y + h / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt * Math.PI / 180); ctx.scale(s, s);
    ctx.fillStyle = `rgba(0,0,0,${(.35 * (.6 + .4 * u)).toFixed(3)})`; ctx.filter = `blur(${sh * .5}px)`; ctx.fillRect(-w / 2 + sh * .4, -h / 2 + sh * .6, w, h); ctx.filter = 'none';
    ctx.fillStyle = '#FBFAF7'; ctx.fillRect(-w / 2 - border, -h / 2 - border, w + border * 2, h + border * 2);
    if (img && img.complete && img.naturalWidth) { ctx.save(); ctx.filter = grade; const ar = img.naturalWidth / img.naturalHeight, tw = ar > w / h ? h * ar : w, th = ar > w / h ? h : w / ar; ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip(); ctx.drawImage(img, -tw / 2, -th / 2, tw, th); ctx.restore(); }
    else { ctx.fillStyle = '#D8D9D6'; ctx.fillRect(-w / 2, -h / 2, w, h); }
    ctx.restore();
    if (magnet) magnetDot(ctx, t, t0 + dur * .8, cx + (w / 2 - 36) * Math.cos(tilt * Math.PI / 180), y + 6, magnet);
    return u >= 1;
  };
  // ímã: disco com brilho, entra com estalo (bk)
  const magnetDot = (ctx, t, t0, x, y, color = '#E8002D', r = 16) => { const u = seg(t, t0, t0 + .18); if (u <= 0) return false; const s = bk(u, 2.2); ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(2, 3, r, 0, TAU); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(-r * .3, -r * .3, r * .35, 0, TAU); ctx.fill(); ctx.restore(); return u >= 1; };
  // etiqueta impressa: cartão com sombra, desliza e balança (seno amortecido)
  const tag = (ctx, t, t0, text, x, y, o = {}) => {
    const { size = 34, font = `600 ${size}px Aspekta`, bg = '#FFFFFF', color = '#121212', pad = 18, dur = .3 } = o; const u = seg(t, t0, t0 + dur); if (u <= 0) return false;
    ctx.save(); ctx.font = font; const w = ctx.measureText(text).width + pad * 2, h = size + pad * 1.2; const swing = Math.sin((t - t0) * 9) * Math.exp(-(t - t0) * 3) * 6;
    ctx.translate(x + w / 2, y); ctx.rotate(swing * Math.PI / 180); ctx.translate(-w / 2, 0); ctx.globalAlpha = eo(u); ctx.translate(0, (1 - eo(u)) * -30);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(4, 6, w, h); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, pad, h / 2 + 2); ctx.restore(); return u >= 1;
  };
  // carimbo do veredito: cai com estalo (1,4 → 1 em 0,18 s), dupla moldura, texto, impressão com falhas
  const stamp = (ctx, t, t0, text, x, y, color = '#E8002D', o = {}) => {
    const { size = 72, font = `600 ${size}px Aspekta`, rot = -8, seed = 4, pad = 22 } = o; const u = seg(t, t0, t0 + .18); if (u <= 0) return false;
    const s = lerp(1.4, 1, eo(u)), a = lerp(.3, .85, u); ctx.save(); ctx.font = font; const w = ctx.measureText(text).width + pad * 2, h = size + pad * 1.4;
    ctx.translate(x, y); ctx.rotate(rot * Math.PI / 180); ctx.scale(s, s); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 6; ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 4);
    ctx.globalCompositeOperation = 'destination-out'; const r = mulberry(seed); for (let i = 0; i < 140; i++) { ctx.beginPath(); ctx.arc((r() - .5) * w, (r() - .5) * h, 1 + r() * 3, 0, TAU); ctx.fill(); }
    ctx.restore(); return u >= 1;
  };
  // fantasma de ideia apagada: desenha `draw` esmaecido e desfocado, uma vez (cache por chave)
  const ghost = (ctx, key, w, h, draw, alpha = .07) => { ctx.save(); ctx.globalAlpha = alpha; ctx.filter = 'blur(2px)'; ctx.drawImage(cache(`bb-ghost-${key}`, w, h, (c, W, H) => draw(c, W, H)), 0, 0); ctx.restore(); };
  // hachura de desenhista a 45° dentro de um path
  const hatch = (ctx, path, color = '#2B2E33', spacing = 12, w = 1080, h = 1920) => { ctx.save(); ctx.clip(path); ctx.strokeStyle = color; ctx.globalAlpha = .5; ctx.lineWidth = 1.5; for (let d = -h; d < w + h; d += spacing) { ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d - h, h); ctx.stroke(); } ctx.restore(); };

  return { board, ink, arrow, letter, dimension, projection, image, pin, magnet: magnetDot, tag, stamp, ghost, hatch, lengths, pointAt };
})();
