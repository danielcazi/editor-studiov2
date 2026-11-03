// Motor silkscreen-poster (SK): tintas chapadas puxadas por rodo, faixas escalonadas, registro escorregado, papel com fibras.
// Tudo função pura de t (sem Math.random); camadas estáticas em cache(). Receitas em estilos/silkscreen-poster.md.
const SK = (() => {
  const P = f => { const p = new Path2D(); f(p); return p; };
  const poly = (pts, close = true) => P(p => { pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); if (close) p.closePath(); });
  const rect = (x, y, w, h) => P(p => p.rect(x, y, w, h));
  const circle = (cx, cy, r) => P(p => p.arc(cx, cy, r, 0, Math.PI * 2));
  // cordilheira: picos [[x,y],...] fechados até `bottom`, de borda a borda do quadro
  const ridge = (pts, bottom, w = 1080) => poly([[-40, pts[0][1]], ...pts, [w + 40, pts[pts.length - 1][1]], [w + 40, bottom], [-40, bottom]]);
  // pinheiro de camadas pendentes (uma silhueta só), base em (x, y), altura h
  const pine = (x, y, h, tiers = 4) => P(p => { const w = h * .55; p.moveTo(x, y - h); for (let i = 1; i <= tiers; i++) { const yy = y - h + (h * .85) * i / tiers, ww = w * i / tiers; p.lineTo(x + ww / 2, yy); p.lineTo(x + ww * .3, yy); } p.lineTo(x + w * .07, y); p.lineTo(x - w * .07, y); for (let i = tiers; i >= 1; i--) { const yy = y - h + (h * .85) * i / tiers, ww = w * i / tiers; p.lineTo(x - ww * .3, yy); p.lineTo(x - ww / 2, yy); } p.closePath(); });

  // papel creme com fibras (cache por tamanho/semente)
  const paper = (ctx, w, h, color = '#FFF8EA', seed = 3) => {
    ctx.drawImage(cache(`sk-paper-${w}x${h}-${seed}-${color}`, w, h, (c, W, H) => {
      c.fillStyle = color; c.fillRect(0, 0, W, H);
      const r = mulberry(seed); c.strokeStyle = 'rgba(0,0,0,.05)'; c.lineWidth = 1;
      for (let i = 0; i < 900; i++) { const x = r() * W, y = r() * H, l = 20 + r() * 40; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + (r() - .5) * 3); c.stroke(); }
    }), 0, 0);
  };
  // pinholes na cor do papel, só sobre tinta (desenhe depois das tintas)
  const pinholes = (ctx, w, h, color = '#FFF8EA', seed = 11, n = 60, maxY = h) => { const r = mulberry(seed); ctx.fillStyle = color; for (let i = 0; i < n; i++) ctx.fillRect(r() * w, r() * maxY, 1.5, 1.5); };

  // borda irregular do rodo: clip na parte já puxada (dir 'x' da esquerda para a direita, 'y' de cima para baixo)
  const clipFront = (ctx, edge, w, h, seed, dir) => {
    ctx.beginPath();
    if (dir === 'x') { ctx.moveTo(-40, -40); ctx.lineTo(edge, -40); for (let y = -40; y <= h + 40; y += 24) ctx.lineTo(edge - 30 * vnoise(y * .05 + seed * 9), y); ctx.lineTo(-40, h + 40); }
    else { ctx.moveTo(-40, -40); ctx.lineTo(w + 40, -40); ctx.lineTo(w + 40, edge); for (let x = w + 40; x >= -40; x -= 24) ctx.lineTo(x, edge - 30 * vnoise(x * .05 + seed * 9)); }
    ctx.closePath(); ctx.clip();
  };
  // lâmina do rodo com bolha de tinta (tubo redondo, metade iluminada)
  const squeegee = (ctx, dir, edge, w, h, color) => {
    ctx.save();
    if (dir === 'x') { ctx.fillStyle = '#121212'; ctx.fillRect(edge - 6, -40, 12, h + 80); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(edge - 16, h / 2, 10, h / 2 + 40, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(edge - 19, h / 2, 3, h / 2 + 40, 0, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = '#121212'; ctx.fillRect(-40, edge - 6, w + 80, 12); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(w / 2, edge - 16, w / 2 + 40, 10, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(w / 2, edge - 19, w / 2 + 40, 3, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  };

  // uma tinta: path chapado revelado por rodo linear a partir de t0, com fantasma de sobreposição, borda de tinta e brilho fresco.
  // o: dx, dy (registro fixo), seed, dur (.35), dir ('x'|'y'), w, h, rule ('evenodd' para vazados), rim, ghost, sheen, blade. Devolve true quando pousou.
  const pull = (ctx, t, t0, path, color, o = {}) => {
    const { dx = 0, dy = 0, seed = 1, dur = .35, dir = 'x', w = 1080, h = 1920, rule = 'nonzero', rim = true, ghost = true, sheen = true, blade = true } = o;
    const u = seg(t, t0, t0 + dur); if (u <= 0) return false;
    const L = dir === 'x' ? w : h, edge = u * (L + 80) - 40;
    ctx.save(); ctx.translate(dx, dy);
    if (u < 1) clipFront(ctx, edge, w, h, seed, dir);
    if (ghost) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .25; ctx.translate(2, 2); ctx.fillStyle = '#000'; ctx.fill(path, rule); ctx.restore(); }
    ctx.fillStyle = color; ctx.fill(path, rule);
    if (rim) { ctx.save(); ctx.clip(path, rule); ctx.translate(-2, -2); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill(path, rule); ctx.translate(5, 5); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill(path, rule); ctx.restore(); }
    if (sheen) { const a = .12 * (1 - seg(t, t0 + dur, t0 + dur + .8)); if (a > 0) { ctx.save(); ctx.clip(path, rule); ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; ctx.fillRect(-40, -40, w + 80, h + 80); ctx.restore(); } }
    ctx.restore();
    if (blade && u < 1) squeegee(ctx, dir, edge + dx * (dir === 'x' ? 1 : 0), w, h, color);
    return u >= 1;
  };

  // céu em faixas escalonadas: rows = [[y0, y1, cor], ...] de cima para baixo; cada faixa é uma tinta (t0 + i*step) e a de baixo
  // invade a de cima com três listras (18, 10, 4 px) no lugar de degradê.
  const bands = (ctx, t, t0, rows, o = {}) => {
    const { step = .12, w = 1080, h = 1920, seed = 2 } = o; const r = mulberry(seed);
    rows.forEach(([y0, y1, color], i) => {
      const path = P(p => { p.rect(-40, y0, w + 80, y1 - y0); if (i) { p.rect(-40, y0 - 30, w + 80, 18); p.rect(-40, y0 - 56, w + 80, 10); p.rect(-40, y0 - 76, w + 80, 4); } });
      pull(ctx, t, t0 + i * step, path, color, { ...o, dx: Math.round((r() - .5) * 6), dy: Math.round((r() - .5) * 4), seed: seed + i, blade: o.blade !== false && i === rows.length - 1 });
    });
  };

  // faixa de informação: itens [texto|[texto, cor]] imprimem da esquerda para a direita, um por subdivisão (step), em clip
  const infoBand = (ctx, t, t0, items, o = {}) => {
    const { x = 70, y = 1600, lineH = 90, font = '600 44px Aspekta', color = '#FFF8EA', step = .15, dur = .15, w = 940, spacing = '6px' } = o;
    ctx.save(); ctx.font = font; ctx.letterSpacing = spacing; ctx.textBaseline = 'alphabetic';
    items.forEach((it, i) => { const [s, c] = Array.isArray(it) ? it : [it, color]; const u = seg(t, t0 + i * step, t0 + i * step + dur); if (u <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(x - 10, y + i * lineH - lineH * .8, (w + 20) * u, lineH); ctx.clip(); ctx.fillStyle = c; ctx.fillText(s, x, y + i * lineH); ctx.restore(); });
    ctx.restore();
  };

  // re-tinta: o rodo diagonal troca drawA por drawB (mesma geometria, outra paleta) em dur s; só lâmina, bolha e um pedaço de cabo
  const reink = (ctx, t, t0, drawA, drawB, o = {}) => {
    const { dur = .35, w = 1080, h = 1920, color = '#121212' } = o; const u = seg(t, t0, t0 + dur);
    if (u <= 0) { drawA(ctx); return false; } if (u >= 1) { drawB(ctx); return true; }
    drawA(ctx); const d = u * (w + h + 200) - 100;   // linha x + y = d
    ctx.save(); ctx.beginPath(); ctx.moveTo(-50, -50); ctx.lineTo(d + 50, -50); ctx.lineTo(-50, d + 50); ctx.closePath(); ctx.clip(); drawB(ctx); ctx.restore();
    ctx.save(); ctx.translate(d / 2, d / 2); ctx.rotate(-Math.PI / 4); ctx.fillStyle = color; ctx.fillRect(-w - h, -7, (w + h) * 2, 14); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-w - h, -7, (w + h) * 2, 3); ctx.fillStyle = color; ctx.fillRect(-60, -70, 120, 60); ctx.restore();
    return false;
  };

  // camadas soltas → registro: fator 1..0 para multiplicar os deslocamentos de parallax, encaixando com eo em dur s
  const loose = (t, t0, dur = .4) => 1 - eo(seg(t, t0, t0 + dur));

  // levantar a tela: moldura com malha achatando verticalmente e sombra em anel crescendo (0,4 s)
  const lift = (ctx, t, t0, w, h, o = {}) => {
    const { dur = .4, tape = '#2b2b2b' } = o; const u = seg(t, t0, t0 + dur); if (u >= 1) return true;
    const sy = 1 - .9 * eio(u), top = 0;
    ctx.save(); ctx.translate(0, top); ctx.scale(1, sy);
    ctx.fillStyle = `rgba(0,0,0,${(.25 * (1 - u)).toFixed(3)})`; ctx.fillRect(-40, -40, w + 80, 60); ctx.fillRect(-40, h - 20, w + 80, 60); ctx.fillRect(-40, -40, 60, h + 80); ctx.fillRect(w - 20, -40, 60, h + 80);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; for (let x = 0; x < w; x += 9) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.fillStyle = tape; ctx.fillRect(0, 0, w, 28); ctx.fillRect(0, h - 28, w, 28);
    ctx.restore(); return false;
  };

  return { P, poly, rect, circle, ridge, pine, paper, pinholes, pull, bands, infoBand, reink, loose, lift, squeegee };
})();
