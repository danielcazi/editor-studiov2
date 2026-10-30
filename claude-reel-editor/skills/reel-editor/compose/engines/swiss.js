// Motor swiss-motion (SW): grade modular, uma cor-sinal, numeral gigante, snaps que pousam na batida, nada quica.
// Duas curvas só: eio (snap preciso) e linear (linhas, playhead, a exceção). Receitas em estilos/swiss-motion.md.
const SW = (() => {
  // grade: 6 colunas de 136 px com margens 72 e calhas 24 (= zona segura lateral) e linha de base de 24 px
  const grid = (o = {}) => {
    const { cols = 6, margin = 72, gutter = 24, base = 24, w = 1080 } = o; const col = (w - margin * 2 - gutter * (cols - 1)) / cols;
    return { cols, margin, gutter, base, col, x: c => margin + c * (col + gutter), span: n => n * col + (n - 1) * gutter, row: r => r * base, snap: v => Math.round(v / base) * base };
  };
  const page = (ctx, w, h, color = '#EAE9E5') => { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); };
  const gridLines = (ctx, g, h, color = '#000', alpha = .07) => { ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1; for (let c = 0; c < g.cols; c++) { const x = g.x(c); ctx.strokeRect(x + .5, 0, g.col - 1, h); } for (let y = 0; y < h; y += g.base) { ctx.beginPath(); ctx.moveTo(g.margin, y + .5); ctx.lineTo(g.x(g.cols - 1) + g.col, y + .5); ctx.stroke(); } ctx.restore(); };
  // snap: começa uma nota antes e pousa em t0 + dur; linear para a exceção
  const snap = (t, t0, dur = .2) => eio(seg(t, t0, t0 + dur));
  const linear = (t, t0, t1) => seg(t, t0, t1);

  // texto que sobe de um clip pela linha de base (entrada) e sai por cima (t1); flush left ótico (tira o apoio esquerdo do glifo)
  const riseText = (ctx, t, t0, text, x, y, font, color = '#111111', o = {}) => {
    const { dur = .25, t1 = Infinity, align = 'left', spacing = '-0.02em' } = o; const u = snap(t, t0, dur), v = t1 < Infinity ? snap(t, t1 - dur, dur) : 0; if (u <= 0 || v >= 1) return false;
    ctx.save(); ctx.font = font; ctx.letterSpacing = spacing; ctx.textBaseline = 'alphabetic'; ctx.textAlign = align; const m = ctx.measureText(text), hgt = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, lb = align === 'left' ? m.actualBoundingBoxLeft : 0;
    ctx.beginPath(); ctx.rect(x - 4, y - m.actualBoundingBoxAscent - 6, m.width + 12, hgt + 12); ctx.clip();
    ctx.fillStyle = color; ctx.fillText(text, x + lb, y + (1 - u) * (hgt + 10) - v * (hgt + 10)); ctx.restore(); return u >= 1;
  };
  // numeral gigante que sobe em degraus eased ("um módulo por vez"), flush left ótico
  const numeral = (ctx, t, t0, text, x, y, size, color = '#111111', o = {}) => {
    const { steps = 4, module = 48, dur = .6, font = `700 ${size}px Aspekta` } = o; const p = seg(t, t0, t0 + dur); if (p <= 0) return false;
    const k = p * steps, off = (steps - (Math.floor(k) + eio(k - Math.floor(k)))) * module;
    ctx.save(); ctx.font = font; ctx.letterSpacing = '-0.03em'; ctx.textBaseline = 'alphabetic'; const m = ctx.measureText(text);
    ctx.beginPath(); ctx.rect(x - 8, y - m.actualBoundingBoxAscent - 8, m.width + 24, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 16); ctx.clip();
    ctx.fillStyle = color; ctx.fillText(text, x + m.actualBoundingBoxLeft, y + off); ctx.restore(); return p >= 1;
  };
  // barra que cresce ao longo de dir ('x'|'y'|'-x'|'-y') com snap; 1 px de sobra nas emendas
  const bar = (ctx, t, t0, x, y, w, h, color, o = {}) => {
    const { dur = .25, dir = 'x' } = o; const u = snap(t, t0, dur); if (u <= 0) return false; ctx.fillStyle = color;
    if (dir === 'x') ctx.fillRect(x, y, w * u + 1, h); else if (dir === '-x') ctx.fillRect(x + w - w * u, y, w * u + 1, h); else if (dir === 'y') ctx.fillRect(x, y, w, h * u + 1); else ctx.fillRect(x, y + h - h * u, w, h * u + 1);
    return u >= 1;
  };
  // filete que se desenha linear ao longo do comprimento
  const rule = (ctx, t, t0, x0, y0, x1, y1, color = '#111111', o = {}) => { const { width = 2, dur = .3 } = o; const u = linear(t, t0, t0 + dur); if (u <= 0) return false; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, u), lerp(y0, y1, u)); ctx.stroke(); ctx.restore(); return u >= 1; };
  // revelação por wipe: clip que abre ao longo de dir em dur, com o desenho dentro
  const wipe = (ctx, t, t0, x, y, w, h, draw, o = {}) => { const { dur = .25, dir = 'x' } = o; const u = snap(t, t0, dur); if (u <= 0) return false; ctx.save(); ctx.beginPath(); if (dir === 'x') ctx.rect(x, y, w * u, h); else if (dir === 'y') ctx.rect(x, y, w, h * u); else if (dir === '-x') ctx.rect(x + w - w * u, y, w * u, h); else ctx.rect(x, y + h - h * u, w, h * u); ctx.clip(); draw(ctx); ctx.restore(); return u >= 1; };
  // corte de faca: uma linha fina cruza o elemento (0–.15 s), depois ele colapsa para a linha do meio (.15–.4 s)
  const knife = (ctx, t, t0, x, y, w, h, draw, o = {}) => {
    const { color = '#111111' } = o; const u1 = linear(t, t0, t0 + .15), u2 = snap(t, t0 + .15, .25); if (u2 >= 1) return true;
    ctx.save(); const hh = h / 2 * (1 - u2); ctx.beginPath(); ctx.rect(x - 4, y + h / 2 - hh, w + 8, hh * 2); ctx.clip(); draw(ctx); ctx.restore();
    if (u1 > 0 && u2 < 1) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 20, y + h / 2); ctx.lineTo(x - 20 + (w + 40) * u1, y + h / 2); ctx.stroke(); ctx.restore(); }
    return false;
  };
  // playhead linear (nunca 1 s parado): marcador que anda de x0 a x1 entre t0 e t1
  const playhead = (ctx, t, t0, t1, x0, x1, y, color = '#E30613', o = {}) => { const { h = 60, width = 3 } = o; const u = linear(t, t0, t1); const x = lerp(x0, x1, u); ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y + h / 2); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 7, y - h / 2 - 2); ctx.lineTo(x + 7, y - h / 2 - 2); ctx.lineTo(x, y - h / 2 + 8); ctx.closePath(); ctx.fill(); ctx.restore(); return u; };
  // notas pequenas com filete de 1 px acima (rótulo de museu)
  const caption = (ctx, t, t0, lines, x, y, o = {}) => { const { size = 19, font = `500 ${size}px Aspekta`, color = '#111111', width = 300, lineH = 26 } = o; const u = snap(t, t0, .2); if (u <= 0) return false; ctx.save(); ctx.fillStyle = color; ctx.fillRect(x, y, width * u, 1); ctx.font = font; ctx.letterSpacing = '0.02em'; ctx.textBaseline = 'alphabetic'; ctx.beginPath(); ctx.rect(x, y, width, lineH * lines.length + 12); ctx.clip(); lines.forEach((l, i) => ctx.fillText(l, x, y + 12 + lineH * (i + 1) - (1 - u) * 20)); ctx.restore(); return u >= 1; };
  // células iguais (casos paralelos): devolve retângulos de uma grade n×m dentro de uma área
  const cells = (x, y, w, h, n, m, gap = 24) => { const cw = (w - gap * (n - 1)) / n, ch = (h - gap * (m - 1)) / m, out = []; for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) out.push([x + i * (cw + gap), y + j * (ch + gap), cw, ch]); return out; };
  // ondulação ordenada pela distância a uma causa: atraso (s) de cada elemento
  const ripple = (cx, cy, x, y, perUnit = .04, unit = 160) => Math.hypot(x - cx, y - cy) / unit * perUnit;

  return { grid, page, gridLines, snap, linear, riseText, numeral, bar, rule, wipe, knife, playhead, caption, cells, ripple };
})();
