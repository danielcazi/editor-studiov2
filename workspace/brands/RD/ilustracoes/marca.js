// Biblioteca da marca RD (IL): um objeto concreto por função, desenhado em tinta chapada com o motor silkscreen (SK).
// Assinatura: IL.nome(ctx, t, x, y, s, o) — (x, y) é o centro, s a escala (caixa base 400 px), t s desde a entrada (t=0 começa).
// Sombra dura deslocada, borda de tinta, grão com semente; nunca stroke de ícone (só o fio do balão, 3 px). Regras: ILUSTRACAO.md.
// Opções comuns: o.rot (graus), o.bob (0 desliga a vida), o.ph (fase), o.c (cor principal), o.shc (cor da sombra).
const IL = (() => {
  const C = { BLK: '#121212', CRM: '#FFF8EC', LUZ: '#F5F0E8', OR: '#EE7A1E', OR1: '#FFA34D', OR2: '#F3984B', SH: '#A8460A', G1: '#1D1D1D', G2: '#2A2A2A', G3: '#4A4744', G4: '#7A7671', GOLD: '#F7B708', DK: '#1A0A00' };
  // sem o motor silkscreen (ex.: engine='launch,marca'): tinta revelada por máscara linear, mesma assinatura do SK.pull, sem rodo
  const { P, poly, circle, pull } = typeof SK !== 'undefined' ? SK : (() => {
    const P = f => { const p = new Path2D(); f(p); return p; };
    const poly = pts => P(p => { pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath(); });
    const circle = (cx, cy, r) => P(p => p.arc(cx, cy, r, 0, Math.PI * 2));
    const pull = (ctx, t, t0, path, color, o = {}) => {
      const { dx = 0, dy = 0, dur = .35, dir = 'x', w = 1080, h = 1920, rule = 'nonzero', rim = true, ghost = true, sheen = true } = o;
      const u = seg(t, t0, t0 + dur); if (u <= 0) return false; const e = eo(u);
      ctx.save(); ctx.translate(dx, dy);
      if (u < 1) { ctx.beginPath(); if (dir === 'x') ctx.rect(-60, -60, (w + 120) * e, h + 120); else ctx.rect(-60, -60, w + 120, (h + 120) * e); ctx.clip(); }
      if (ghost) { ctx.save(); ctx.globalAlpha = .25; ctx.translate(2, 2); ctx.fillStyle = '#000'; ctx.fill(path, rule); ctx.restore(); }
      ctx.fillStyle = color; ctx.fill(path, rule);
      if (rim) { ctx.save(); ctx.clip(path, rule); ctx.translate(-2, -2); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill(path, rule); ctx.translate(5, 5); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill(path, rule); ctx.restore(); }
      if (sheen) { const a = .12 * (1 - seg(t, t0 + dur, t0 + dur + .8)); if (a > 0) { ctx.save(); ctx.clip(path, rule); ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; ctx.fillRect(-60, -60, w + 120, h + 120); ctx.restore(); } }
      ctx.restore(); return u >= 1;
    };
    return { P, poly, circle, pull };
  })();
  const B = 400, R = Math.PI / 180;
  // grão dentro da massa (semente fixa: não pisca)
  const speck = (ctx, path, seed, rule = 'nonzero', n = 240) => {
    ctx.save(); ctx.clip(path, rule); const r = mulberry(seed * 7 + 3);
    for (let i = 0; i < n; i++) { ctx.fillStyle = r() < .5 ? 'rgba(255,255,255,.13)' : 'rgba(0,0,0,.15)'; const z = 1 + r() * 1.6; ctx.fillRect(-60 + r() * (B + 120), -60 + r() * (B + 120), z, z); }
    ctx.restore();
  };
  // uma tinta da marca: sombra dura no mesmo rodo + tinta + grão. o.sx/o.sy deslocam a sombra (14/14), shadow:false tira.
  const ink = (ctx, t, t0, path, col, o = {}) => {
    const q = { w: B, h: B, blade: false, ...o };
    if (q.shadow !== false) pull(ctx, t, t0, path, q.shc || 'rgba(0,0,0,.55)', { ...q, dx: (q.dx || 0) + (q.sx ?? 14), dy: (q.dy || 0) + (q.sy ?? 14), rim: false, ghost: false, sheen: false, blade: false });
    const ok = pull(ctx, t, t0, path, col, q);
    if (ok && q.speck !== false) speck(ctx, path, q.seed || 1, q.rule);
    return ok;
  };
  // caixa local 0..400 com centro em (x, y), escala s e vida (bob ±8 px, balanço ±1,2°)
  const box = (ctx, t, x, y, s, o, f) => {
    const ph = o.ph || 0, b = o.bob ?? 1;
    ctx.save(); ctx.translate(x, y + b * 8 * Math.sin(t * 1.75 + ph)); ctx.rotate(((o.rot || 0) + b * 1.2 * Math.sin(t * 1.3 + ph)) * R);
    ctx.scale(s, s); ctx.translate(-200, -200); f(); ctx.restore();
  };
  // canvas de rascunho reaproveitado (limpo a cada uso): para dissolver e riscar sem apagar o resto da cena
  const SC = {};
  const scratch = (k, w, h) => { const c = SC[k] || (SC[k] = document.createElement('canvas')); w = Math.ceil(w); h = Math.ceil(h); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h); return [c, x]; };
  const rot = (pts, a, cx, cy) => pts.map(([x, y]) => { const c = Math.cos(a * R), s = Math.sin(a * R), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; });
  const blob = (cx, cy, r, n, seed, j = .18) => { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + (hash(seed + i * 3.7) - .5) * 2 * j; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); } return pts; };

  // folha de tarefa: plana → meio amassada → bola, a partir de o.crush (s). Dobras são vazados (o papel de baixo aparece).
  const folha = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const cr = o.crush ?? 1e9, k = t < cr ? 0 : t < cr + .14 ? 1 : 2, col = o.c || C.CRM, sh = { shc: o.shc || C.BLK };
    if (k === 0) {
      ink(ctx, t, 0, poly([[85, 40], [262, 40], [318, 96], [318, 362], [85, 362]]), col, { seed: 3, dir: 'y', blade: true, ...sh });
      ink(ctx, t, .2, poly([[262, 40], [262, 96], [318, 96]]), C.G4, { seed: 4, shadow: false, dx: 2, dy: -1 });
      ink(ctx, t, .3, P(p => { p.rect(115, 82, 120, 30); for (let i = 0; i < 5; i++) { p.rect(115, 150 + i * 42, 24, 24); p.rect(152, 156 + i * 42, i % 2 ? 110 : 140, 13); } }), o.ln || C.BLK, { seed: 5, shadow: false, dx: -2, dy: 2 });
    } else if (k === 1) {
      ink(ctx, cr + 1, 0, P(p => { [[95, 72], [205, 52], [300, 96], [312, 205], [292, 342], [182, 328], [92, 352], [112, 222]].forEach((q, i) => i ? p.lineTo(...q) : p.moveTo(...q)); p.closePath(); [[150, 118], [232, 178], [162, 232]].forEach((q, i) => i ? p.lineTo(...q) : p.moveTo(...q)); p.closePath(); [[220, 250], [282, 300], [196, 304]].forEach((q, i) => i ? p.lineTo(...q) : p.moveTo(...q)); p.closePath(); }), col, { seed: 6, rule: 'evenodd', sheen: false, ...sh });
    } else {
      const ball = P(p => { blob(200, 225, 118, 15, 9, .14).forEach((q, i) => i ? p.lineTo(...q) : p.moveTo(...q)); p.closePath(); [[[150, 170], [210, 205], [140, 215]], [[230, 150], [262, 238], [222, 210]], [[170, 262], [250, 280], [185, 300]]].forEach(tri => { tri.forEach((q, i) => i ? p.lineTo(...q) : p.moveTo(...q)); p.closePath(); }); });
      const sq = 1 + .12 * (1 - eo(seg(t, cr + .14, cr + .4)));
      ctx.save(); ctx.translate(200, 225); ctx.scale(sq, 1 / sq); ctx.translate(-200, -225);
      ink(ctx, cr + 1, 0, ball, col, { seed: 7, rule: 'evenodd', sheen: false, ...sh });
      ink(ctx, cr + 1, 0, poly([[300, 230], [312, 290], [262, 334], [205, 343], [258, 290]]), C.G4, { seed: 8, shadow: false });
      ctx.restore();
    }
  });

  // bandeira de meta: mastro, pano que tremula (Path2D senoidal), 3 riscos de brilho
  const bandeira = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const col = o.c || C.CRM, wv = i => 12 * Math.sin(i * .7 - t * 6) * (i / 12);
    ink(ctx, t, 0, P(p => { p.rect(122, 70, 16, 310); p.arc(130, 62, 15, 0, 7); }), o.pole || C.G4, { seed: 6, dir: 'y', shc: o.shc });
    const top = [], bot = []; for (let i = 0; i <= 12; i++) { const xx = 138 + i * 16; top.push([xx, 76 + wv(i)]); bot.push([xx, 196 + wv(i) * 1.1]); }
    const flag = poly([...top, [270, 136 + wv(9)], ...bot.reverse()]);
    ink(ctx, t, .2, flag, col, { seed: 7, shc: o.shc });
    ink(ctx, t, .45, P(p => { [[-150, 30], [-115, 30], [-80, 30]].forEach(([a]) => { const c = Math.cos(a * R), sn = Math.sin(a * R); p.moveTo(130 + c * 30 - sn * 4, 62 + sn * 30 + c * 4); p.lineTo(130 + c * 58 - sn * 6, 62 + sn * 58 + c * 6); p.lineTo(130 + c * 58 + sn * 6, 62 + sn * 58 - c * 6); p.lineTo(130 + c * 30 + sn * 4, 62 + sn * 30 - c * 4); p.closePath(); }); }), col, { seed: 8, shadow: false });
    if (o.base !== false) ink(ctx, t, 0, P(p => { p.ellipse(130, 384, 70, 18, 0, Math.PI, 0); p.closePath(); }), o.pole || C.G4, { seed: 9, shadow: false });
  });

  // lupa: anel de tinta (vazado evenodd), lente escura translúcida (o.lens), brilho em crescente, cabo com anel laranja
  const lupa = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    ink(ctx, t, .1, poly([[246, 284], [284, 246], [378, 340], [340, 378]]), o.k || C.BLK, { seed: 3, shc: o.shc });
    ink(ctx, t, .15, poly([[232, 270], [270, 232], [296, 258], [258, 296]]), o.a || C.OR, { seed: 4, shadow: false });
    const a = seg(t, 0, .3); if (a > 0) { ctx.fillStyle = `rgba(18,18,18,${((o.lens ?? .18) * a).toFixed(3)})`; ctx.beginPath(); ctx.arc(170, 170, 100, 0, 7); ctx.fill(); }
    ink(ctx, t, 0, P(p => { p.arc(170, 170, 128, 0, 7); p.moveTo(270, 170); p.arc(170, 170, 100, 0, 7); }), o.c || C.CRM, { seed: 5, rule: 'evenodd', shc: o.shc });
    ink(ctx, t, .3, P(p => { p.arc(170, 170, 82, 195 * R, 255 * R); p.arc(170, 170, 64, 255 * R, 195 * R, true); p.closePath(); }), o.c || C.CRM, { seed: 6, shadow: false });
  });

  // cartão de papel recortado com borda serrilhada (o.w × o.h, centrado); o conteúdo é do compositor
  const cartao = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const w = o.w || 340, h = o.h || 220, x0 = 200 - w / 2, y0 = 200 - h / 2, z = [];
    for (let i = 0; i <= w / 16; i++) z.push([x0 + i * 16, y0 + (i % 2 ? 9 : 0)]);
    for (let i = Math.floor(w / 16); i >= 0; i--) z.push([x0 + i * 16, y0 + h - (i % 2 ? 9 : 0)]);
    ink(ctx, t, 0, poly(z), o.c || C.CRM, { seed: 4, dir: 'y', blade: o.blade, shc: o.shc || C.BLK });
  });

  // alvo: anéis concêntricos chapados que estouram do centro, cada um com 2 cortes e girando em sentido oposto ao vizinho.
  // o.n anéis, o.c / o.c2 tintas alternadas, o.spin (rad/s), o.flood (s): o miolo cresce e inunda o quadro
  const alvo = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const n = o.n || 4, Rr = 175, st = Rr / (n + .6), c1 = o.c || C.OR, c2 = o.c2 || C.BLK, sp = o.spin ?? .5;
    for (let i = 0; i < n; i++) {
      const u = seg(t, (n - 1 - i) * .08, (n - 1 - i) * .08 + .32); if (u <= 0) continue; const k = bk(u, 2.2);
      const ro = Rr - i * st, ri = ro - st * .82, a = (i % 2 ? -1 : 1) * t * sp + i;
      const ring = P(p => { for (const g of [0, Math.PI]) { p.moveTo(Math.cos(a + g + .1) * ro, Math.sin(a + g + .1) * ro); p.arc(0, 0, ro, a + g + .1, a + g + Math.PI - .1); p.arc(0, 0, ri, a + g + Math.PI - .1, a + g + .1, true); p.closePath(); } });
      ctx.save(); ctx.translate(200, 200); ctx.scale(k, k);
      ink(ctx, 9, 0, ring, i % 2 ? c2 : c1, { seed: 10 + i, shadow: i === 0 && o.shadow !== false, shc: o.shc, sx: 10, sy: 10, sheen: false });
      ctx.restore();
    }
    const u = seg(t, (n - 1) * .08 + .1, (n - 1) * .08 + .4); if (u <= 0) return;
    const fl = o.flood == null ? 0 : ei(seg(t, o.flood, o.flood + .45)), r = lerp(st * .78 * bk(u, 2.4), 2600 / s, fl);
    ink(ctx, 9, 0, circle(200, 200, r), c1, { seed: 20, shadow: false, sheen: false, speck: fl < .2 });
  });

  // check de tinta: pincelada chapada em V puxada da esquerda, sombra dura laranja-escura 8 px abaixo
  const check = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    ink(ctx, t, 0, poly([[58, 214], [104, 168], [170, 232], [304, 82], [352, 124], [172, 328], [150, 322]]), o.c || C.OR, { seed: 31, dur: .22, sx: 0, sy: 9, shc: o.shc || C.SH });
  });

  // seta chapada (aponta para a direita; o.ang gira em graus: -45 = ↗, 90 = ↓), cresce pelo rodo
  const seta = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, { ...o, rot: (o.rot || 0) + (o.ang || 0) }, () => {
    ink(ctx, t, 0, poly([[30, 168], [236, 168], [236, 100], [372, 200], [236, 300], [236, 232], [30, 232]]), o.c || C.OR, { seed: 32, dur: o.dur || .3, sx: 0, sy: 9, shc: o.shc || C.SH });
  });

  // X de tinta em duas puxadas de rodo (a segunda em o.t2 s)
  const xis = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const c = o.c || C.OR, q = { dur: .2, sx: 0, sy: 9, shc: o.shc || C.SH };
    ink(ctx, t, 0, poly([[70, 112], [112, 70], [330, 282], [334, 330], [286, 328]]), c, { seed: 33, ...q });
    ink(ctx, t, o.t2 ?? .3, poly([[288, 70], [330, 112], [116, 330], [70, 332], [72, 286]]), c, { seed: 34, ...q, dx: 2, dy: -2 });
  });

  // folha de lista do dia: faixa de título (o.title), linhas que imprimem nos tempos o.at e checks laranja nos tempos o.ck
  const lista = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const at = o.at || [.4, .7, 1], ck = o.ck || [];
    ink(ctx, t, 0, poly([[70, 30], [330, 30], [330, 372], [70, 372]]), o.c || C.CRM, { seed: 40, dir: 'y', shc: o.shc || C.BLK });
    if (ink(ctx, t, .2, poly([[70, 30], [330, 30], [330, 110], [70, 110]]), o.a || C.OR, { seed: 41, shadow: false, dx: 2, dy: 2 }) && o.title) {
      ctx.save(); ctx.font = '600 52px Aspekta'; ctx.letterSpacing = '4px'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.BLK; ctx.fillText(o.title, 96, 72); ctx.restore();
    }
    at.forEach((a, i) => ink(ctx, t, a, P(p => { const yy = 150 + i * 72; p.rect(98, yy, 38, 38); p.rect(106, yy + 8, 22, 22); p.rect(156, yy + 12, i % 2 ? 120 : 150, 15); }), C.BLK, { seed: 42 + i, rule: 'evenodd', shadow: false, dur: .2 }));
    ck.forEach((a, i) => check(ctx, t - a, 120, 162 + i * 72, .26, { bob: 0 }));
  });

  // calendário/planner: argolas pretas, cabeçalho de tinta, grade de 2 px, número do dia gigante; vira as folhas em o.flips
  const calendario = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const days = o.days || ['12', '13', '14'], fl = o.flips || [], a = o.a || C.OR;
    const page = (d, tt) => {
      ink(ctx, tt, 0, poly([[60, 80], [340, 80], [340, 360], [60, 360]]), o.c || C.CRM, { seed: 50, dir: 'y', shc: o.shc || C.BLK });
      ink(ctx, tt, .15, poly([[60, 80], [340, 80], [340, 140], [60, 140]]), a, { seed: 51, shadow: false, dx: 2, dy: -2 });
      if (tt < .3) return;
      ctx.save(); ctx.fillStyle = 'rgba(18,18,18,.45)'; for (let i = 1; i < 7; i++) ctx.fillRect(60 + i * 40, 150, 2, 200); for (let j = 1; j < 4; j++) ctx.fillRect(66, 150 + j * 50, 268, 2);
      ctx.font = '600 170px Aspekta'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.BLK; ctx.fillText(d, 200, 320); ctx.restore();
    };
    let k = 0; fl.forEach(f => { if (t >= f) k++; }); k = Math.min(k, days.length - 1);
    const f = fl[k], u = f == null ? 0 : seg(t, f, f + .35);
    page(days[Math.min(k + (u > 0 ? 1 : 0), days.length - 1)], u > 0 ? 9 : t);
    if (u > 0 && u < 1) {   // folha de cima levantando pelas argolas
      ctx.save(); ctx.translate(0, 80); ctx.scale(1, Math.cos(u * Math.PI)); ctx.translate(0, -80);
      if (u < .5) page(days[k], 9); else ink(ctx, 9, 0, poly([[60, 80], [340, 80], [340, 360], [60, 360]]), C.G4, { seed: 52, shadow: false });
      ctx.restore();
    }
    ink(ctx, t, .25, P(p => { for (let i = 0; i < 10; i++) { const xx = 78 + i * 27.5; p.roundRect(xx - 6, 56, 12, 46, 6); } }), C.BLK, { seed: 53, sx: 3, sy: 4, shc: 'rgba(0,0,0,.4)' });
  });

  // despertador de tinta: mostrador creme, sinos e pés, marcas e ponteiros chapados que giram (o.spin rad/s); dissolve em grãos em o.dis
  const relogio = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const g = o.k || C.G4, sp = o.spin ?? 2.2;
    const draw = c => {
      ink(c, t, 0, P(p => { p.moveTo(70, 135); p.arc(108, 100, 50, 205 * R, 25 * R); p.closePath(); p.moveTo(250, 64); p.arc(292, 100, 50, 155 * R, 335 * R); p.closePath(); p.moveTo(110, 300); p.lineTo(140, 320); p.lineTo(98, 372); p.lineTo(80, 360); p.closePath(); p.moveTo(290, 300); p.lineTo(260, 320); p.lineTo(302, 372); p.lineTo(320, 360); p.closePath(); }), g, { seed: 60, shc: o.shc });
      ink(c, t, .05, circle(200, 215, 140), g, { seed: 61, shc: o.shc });
      ink(c, t, .1, circle(200, 215, 118), o.c || C.CRM, { seed: 62, shadow: false });
      ink(c, t, .25, P(p => { for (let i = 0; i < 12; i++) { const a = i * 30 * R, l = i % 3 ? 14 : 26, w = i % 3 ? 4 : 7; p.moveTo(...rot([[200 - w, 107], [200 + w, 107], [200 + w, 107 + l], [200 - w, 107 + l]], i * 30, 200, 215)[0]); rot([[200 + w, 107], [200 + w, 107 + l], [200 - w, 107 + l]], i * 30, 200, 215).forEach(q => p.lineTo(...q)); p.closePath(); void a; } }), C.BLK, { seed: 63, shadow: false });
      if (t < .3) return;
      const hand = (len, w, ang) => poly(rot([[200 - w, 230], [200 + w, 230], [200 + w * .4, 215 - len], [200 - w * .4, 215 - len]], ang, 200, 215));
      c.save(); c.translate(4, 5); c.fillStyle = 'rgba(0,0,0,.25)'; c.fill(hand(88, 7, t * sp * 57.3)); c.fill(hand(58, 10, t * sp * 4.8 + 120)); c.restore();
      c.fillStyle = C.BLK; c.fill(hand(88, 7, t * sp * 57.3)); c.fill(hand(58, 10, t * sp * 4.8 + 120));
      c.fillStyle = o.a || C.OR; c.beginPath(); c.arc(200, 215, 14, 0, 7); c.fill();
    };
    const u = o.dis == null ? 0 : seg(t, o.dis, o.dis + .6);
    if (u <= 0) return draw(ctx);
    if (u >= 1) return;
    const [cv, c] = scratch('il-clock', 600 * s, 600 * s); c.setTransform(s, 0, 0, s, 100 * s, 100 * s); draw(c);
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; const pts = [];
    for (let gy = 0; gy < 60; gy++) for (let gx = 0; gx < 60; gx++) { const h = hash(gx * 61.3 + gy * 7.7) * .7 + (1 - gy / 60) * .3; if (h < u) { c.fillRect(gx * 10 - 100, gy * 10 - 100, 10.5, 10.5); if (h > u - .2 && (gx + gy) % 3 === 0) pts.push([gx * 10 - 100, gy * 10 - 100, u - h, gx + gy * 60]); } }
    ctx.drawImage(cv, -100, -100, 600, 600);
    pts.forEach(([px, py, k, i]) => { ctx.fillStyle = i % 2 ? (o.c || C.CRM) : g; ctx.fillRect(px + (hash(i) - .4) * 260 * k, py - 320 * k, 7, 7); });
  });

  // pedra de tinta: bloco com facetas (valor, não linha) e chanfro de luz; racha em o.crack (vazado na cor do papel o.paper)
  const pedra = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const cr = o.crack == null ? 0 : eo(seg(t, o.crack, o.crack + .25)), sh = cr > 0 ? (hash(Math.floor(t * 40)) - .5) * 10 * (1 - seg(t, o.crack, o.crack + .2)) : 0;
    ctx.translate(sh, 0);
    ink(ctx, t, 0, poly([[62, 300], [56, 218], [108, 128], [198, 88], [292, 108], [348, 192], [342, 302], [300, 346], [108, 350]]), o.c || C.BLK, { seed: 70, dir: 'y', blade: o.blade, shc: o.shc });
    ink(ctx, t, .15, poly([[108, 128], [198, 88], [232, 170], [150, 206], [56, 218]]), C.G2, { seed: 71, shadow: false });
    ink(ctx, t, .2, poly([[198, 88], [292, 108], [262, 160], [232, 170]]), C.G3, { seed: 72, shadow: false });
    ink(ctx, t, .25, poly([[60, 214], [106, 126], [196, 86], [200, 96], [112, 134], [68, 216]]), C.G4, { seed: 73, shadow: false });
    if (cr > 0) {
      const w = 11 * cr, zz = [[208, 90], [190, 150], [222, 205], [186, 262], [210, 310], [196, 350]], m = Math.round(zz.length * Math.min(1, cr * 1.3));
      const L = zz.slice(0, m).map(([a, b]) => [a - w, b]), Rt = zz.slice(0, m).map(([a, b]) => [a + w, b]).reverse();
      ctx.fillStyle = o.paper || C.CRM; ctx.fill(poly([...L, ...Rt]));
      for (let i = 0; i < 5; i++) { const k = seg(t, o.crack, o.crack + .5); if (k >= 1) break; ctx.fillStyle = o.c || C.BLK; ctx.fillRect(205 + (hash(i + 3) - .5) * 260 * k, 120 + i * 40 - 120 * k + 200 * k * k, 12, 10); }
    }
  });

  // túnel em faixas escalonadas (claro na boca, preto no fundo) com a recompensa laranja longe; o.flood (s) a luz inunda
  const tunel = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const cols = o.cols || ['#7A7671', '#625E5A', '#4B4844', '#383532', '#282624', '#1B1A18', '#0E0E0D'], vp = [200, 250];
    const arch = (k) => { const w = 380 * k, h = 400 * k, cx = lerp(vp[0], 200, k), cy = lerp(vp[1], 210, k); return P(p => { p.moveTo(cx - w / 2, cy + h / 2); p.lineTo(cx - w / 2, cy - h / 2 + w / 2); p.arc(cx, cy - h / 2 + w / 2, w / 2, Math.PI, 0); p.lineTo(cx + w / 2, cy + h / 2); p.closePath(); }); };
    cols.forEach((c, i) => ink(ctx, t, i * .07, arch(1 - i * .135), c, { seed: 80 + i, dir: 'y', shadow: i === 0 && o.shadow !== false, shc: o.shc, sheen: false }));
    const u = seg(t, cols.length * .07, cols.length * .07 + .3); if (u <= 0) return;
    const fl = o.flood == null ? 0 : ei(seg(t, o.flood, o.flood + .5)), r0 = 9 * (1 + .15 * Math.sin(t * 5)) * eo(u);
    ctx.fillStyle = 'rgba(255,163,77,.16)'; ctx.beginPath(); ctx.arc(vp[0], vp[1], r0 * 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,163,77,.28)'; ctx.beginPath(); ctx.arc(vp[0], vp[1], r0 * 2, 0, 7); ctx.fill();
    ctx.fillStyle = o.c || C.OR1; ctx.beginPath(); ctx.arc(vp[0], vp[1], lerp(r0, 2800 / s, fl), 0, 7); ctx.fill();
  });

  // silhueta de perfil com mochila (cabeça com cabelo e nuca, sem rosto); pés em (x, y), altura ~100*s
  const pessoa = (pp, x, y, k = 1, step = 0) => P(p => {
    const T = (a, b) => [x + a * k, y + b * k], L = (pts) => { pts.forEach((q, i) => i ? p.lineTo(...T(...q)) : p.moveTo(...T(...q))); p.closePath(); };
    const sw = Math.sin(step * Math.PI) * 8;
    L([[-6, -46], [4, -46], [10 + sw, -4], [18 + sw, 0], [6 + sw, 0], [-4, -30]]); L([[-6, -46], [4, -46], [-4 - sw * .6, 0], [-14 - sw * .6, 0], [-12, -4]]);
    L([[-10, -82], [8, -82], [12, -60], [6, -44], [-8, -44], [-12, -60]]);
    p.moveTo(...T(12, -94)); p.arc(x + 1 * k, y - 94 * k, 11 * k, 0, Math.PI * 2);   // cabeça redonda + nuca, cabelo em coque atrás, nariz
    p.moveTo(...T(-6, -100)); p.arc(x - 9 * k, y - 100 * k, 6 * k, 0, Math.PI * 2);
    L([[10, -96], [16, -92], [11, -89]]); L([[-4, -86], [6, -86], [5, -80], [-3, -80]]);
    void pp;
  });
  const mochila = (x, y, k = 1) => P(p => p.roundRect(x - 26 * k, y - 82 * k, 18 * k, 34 * k, 5 * k));
  const mochileiro = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    ink(ctx, t, 0, mochila(200, 330, 2.6), o.a || C.G4, { seed: 90, dir: 'y', shc: o.shc });
    ink(ctx, t, .05, pessoa(0, 200, 330, 2.6, o.step || 0), o.c || C.CRM, { seed: 91, dir: 'y', shc: o.shc });
  });

  // escada de 6 degraus em bloco (topo claro, frente média), construída um a um (o.step s), bandeira no topo,
  // mochileiro subindo entre o.climb=[t0, t1]; o.lit (s) acende o último degrau em laranja
  const escada = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const n = 6, st = o.step || .15, sw = 52, sh = 44, x0 = 36, yb = 380;
    for (let i = 0; i < n; i++) {
      const xx = x0 + i * sw, yt = yb - (i + 1) * sh, lit = i === n - 1 && o.lit != null && t >= o.lit, t0 = i * st;
      ink(ctx, t, t0, poly([[xx, yt], [xx + sw, yt], [xx + sw, yb], [xx, yb]]), lit ? C.OR : C.G2, { seed: 100 + i, dir: 'y', shc: o.shc, sheen: lit });
      ink(ctx, t, t0 + .05, poly([[xx, yt], [xx + sw, yt], [xx + sw + 18, yt - 14], [xx + 18, yt - 14]]), lit ? C.OR1 : C.G4, { seed: 110 + i, shadow: false });
      if (i === n - 1) ink(ctx, t, t0 + .05, poly([[xx + sw, yt], [xx + sw + 18, yt - 14], [xx + sw + 18, yb - 14], [xx + sw, yb]]), lit ? C.SH : C.G1, { seed: 120, shadow: false });
    }
    const top = [x0 + (n - 1) * sw + 34, yb - n * sh - 7];
    if (t > n * st) bandeira(ctx, t - n * st, top[0] + 24, top[1] - 62, .34, { bob: 0, base: false, c: o.flag || C.CRM });
    const [a, b] = o.climb || [n * st, n * st + 2.5], pr = 4 * seg(t, a, b), i = Math.min(3, Math.floor(pr)), f = pr - i, e = eio(Math.min(1, f * 1.6));
    if (t < n * st * .5) return;
    const fx = x0 + sw * .5 + (i + e) * sw + 4, fy = yb - (i + 1) * sh - 9 - (e - 0) * sh - Math.sin(Math.min(1, f * 1.6) * Math.PI) * 16;
    const u = seg(t, n * st * .5, n * st * .5 + .3); ctx.save(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.rect(-100, -100, 600, fy + 14 - (1 - u) * 110 + 100); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.translate(5, 5); ctx.fill(pessoa(0, fx, fy, .62, f)); ctx.translate(-5, -5);
    ctx.fillStyle = o.pack || C.G4; ctx.fill(mochila(fx, fy, .62)); ctx.fillStyle = o.fig || C.CRM; ctx.fill(pessoa(0, fx, fy, .62, f)); ctx.restore();
  });

  // balão RD: elipse 1:1,25 laranja com sombra chapada interna, brilho creme em arco, nó, fio de 3 px que balança; sobe ao entrar
  const balao = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y + (1 - eo(seg(t, 0, .8))) * 260 * s, s, o, () => {
    const c = o.c || C.OR, sw = Math.sin(t * 1.6) * 22;
    if (t > .1) { ctx.save(); ctx.strokeStyle = o.fio || 'rgba(245,240,232,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(200, 332); ctx.bezierCurveTo(200 + sw, 410, 200 - sw, 470, 200 + sw * .5, 560); ctx.stroke(); ctx.restore(); }
    const body = P(p => p.ellipse(200, 180, 120, 150, 0, 0, 7));
    ink(ctx, t, 0, body, c, { seed: 130, dir: 'y', shc: o.shc });
    ctx.save(); ctx.clip(body); ink(ctx, t, .1, P(p => { p.rect(60, 10, 280, 340); p.ellipse(180, 164, 118, 146, 0, 0, 7); }), C.SH, { seed: 131, rule: 'evenodd', shadow: false, sheen: false }); ctx.restore();
    ink(ctx, t, .2, poly([[184, 340], [216, 340], [200, 326]]), C.SH, { seed: 132, shadow: false });
    ink(ctx, t, .3, P(p => { p.ellipse(200, 180, 92, 120, 0, 200 * R, 252 * R); p.ellipse(200, 180, 74, 100, 0, 252 * R, 200 * R, true); p.closePath(); }), o.luz || C.LUZ, { seed: 133, shadow: false });
    if (o.txt && t > .4) { ctx.save(); ctx.font = '600 110px Aspekta'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.CRM; ctx.fillText(o.txt, 200, 196); ctx.restore(); }
  });

  // selo extrudado tipo BLACK RD: texto laranja com 16 passos de extrusão, −8°, riscos de grunge; entra em slam (1.4→1 + tremor)
  const selo = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, { rot: -8, ...o }, () => {
    const u = seg(t, 0, .3); if (u <= 0) return;
    const txt = o.txt || 'JÁ', fs = o.fs || 230, k = 1.4 - .4 * bk(u, 2), sk = t > .3 && t < .45 ? (hash(Math.floor(t * 60)) - .5) * 12 : 0;
    ctx.save(); ctx.translate(200 + sk, 200); ctx.scale(k, k);
    ctx.font = `600 ${fs}px Aspekta`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '-4px';
    ctx.fillStyle = o.ext || C.DK; for (let i = 16; i >= 1; i--) ctx.fillText(txt, i * 1.2, i * 1.2);
    const tw = ctx.measureText(txt).width + 60, th = fs * 1.3, q = s * k;
    const [cv, c] = scratch('il-selo', tw * q, th * q); c.setTransform(q, 0, 0, q, tw * q / 2, th * q / 2);
    c.font = ctx.font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = '-4px';
    c.fillStyle = o.c || C.OR; c.fillText(txt, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = o.c1 || C.OR1; c.fillRect(-tw / 2, -th / 2, tw, th * .42);
    c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; const r = mulberry(o.seed || 140);
    for (let i = 0; i < 160; i++) { const px = (r() - .5) * tw, py = (r() - .5) * th, l = 6 + r() * 26, a = r() * 7; c.lineWidth = 1 + r(); c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke(); }
    ctx.drawImage(cv, -tw / 2, -th / 2, tw, th); ctx.restore();
  });

  // pílula da palavra-chave: cápsula laranja com sombra dura #A8460A 8 px, texto preto puxado pelo mesmo rodo
  const pilula = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const fs = o.fs || 54; ctx.font = `600 ${fs}px Aspekta`; ctx.letterSpacing = '2px';
    const tw = ctx.measureText(o.txt || '').width, h = fs * 1.7, w = tw + fs * 1.5;
    ctx.translate(200 - w / 2, 200 - h / 2);
    const pill = P(p => p.roundRect(0, 0, w, h, h / 2)), q = { w: w + 40, h: h + 40, dur: o.dur || .3 };
    ink(ctx, t, 0, pill, o.c || C.OR, { seed: 150, sx: 0, sy: 8, shc: o.shc || C.SH, ...q });
    const u = seg(t, .05, .05 + q.dur); if (u <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(-10, -10, (w + 20) * u, h + 20); ctx.clip(); ctx.fillStyle = o.tc || C.BLK; ctx.textBaseline = 'middle'; ctx.fillText(o.txt || '', fs * .75, h / 2 + fs * .04); ctx.restore();
  });

  // botão da CTA: pílula laranja com glow curto, círculo preto com seta ↗ chapada, pulso 1↔1.03
  const botao = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s * (1 + .03 * Math.sin(Math.max(0, t - .4) * 4)), { ...o, bob: 0 }, () => {
    const fs = o.fs || 50; ctx.font = `600 ${fs}px Aspekta`; ctx.letterSpacing = '3px';
    const tw = ctx.measureText(o.txt || 'APROVEITAR').width, h = fs * 2, w = tw + fs * 1.2 + h;
    ctx.translate(200 - w / 2, 200 - h / 2);
    const u = eo(seg(t, 0, .35)); if (u <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(-40, -40, (w + 80) * u, h + 80); ctx.clip();
    ctx.fillStyle = C.SH; ctx.beginPath(); ctx.roundRect(0, 8, w, h, h / 2); ctx.fill();
    ctx.save(); ctx.shadowColor = 'rgba(238,122,30,.35)'; ctx.shadowBlur = 24; ctx.fillStyle = o.c || C.OR; ctx.beginPath(); ctx.roundRect(0, 0, w, h, h / 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.roundRect(h * .3, 5, w - h * .6, h * .22, h * .11); ctx.fill();
    ctx.fillStyle = C.BLK; ctx.textBaseline = 'middle'; ctx.fillText(o.txt || 'APROVEITAR', fs * .8, h / 2 + fs * .04);
    const cx = w - h / 2, cy = h / 2, r = h * .38; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.fillStyle = o.c || C.OR; ctx.fill(poly(rot([[cx - r * .5, cy - r * .12], [cx + r * .05, cy - r * .12], [cx + r * .05, cy - r * .38], [cx + r * .55, cy], [cx + r * .05, cy + r * .38], [cx + r * .05, cy + r * .12], [cx - r * .5, cy + r * .12]], -45, cx, cy)));
    ctx.restore();
  });

  // sunburst de tinta: o.n cunhas girando 6°/s a partir do centro (cx, cy); já presente no frame 0. o.c cor da cunha
  const sunburst = (ctx, t, cx, cy, s = 1, o = {}) => {
    const n = o.n || 14, a0 = (o.a0 || 0) + t * 6 * R, r = 2600 * s, hw = Math.PI / n / 2;
    ctx.save(); ctx.fillStyle = o.c || '#202020'; ctx.globalAlpha = o.alpha ?? .55; ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = a0 + i * Math.PI * 2 / n; ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a - hw, a + hw); ctx.closePath(); }
    ctx.fill(); ctx.restore();
  };

  // pilha de tarefas: 5 pastas de arquivo (corpo cinza, aba creme de papel saindo) caindo uma a uma; a de cima é a laranja (a aversiva).
  // o.weigh (s): a pilha achata e treme sob o próprio peso
  const pilha = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const n = 5, wg = o.weigh == null ? 0 : seg(t, o.weigh, o.weigh + .5), sq = 1 - .1 * eo(wg), tr = wg > 0 && wg < 1 ? (hash(Math.floor(t * 50)) - .5) * 8 : wg >= 1 ? Math.sin(t * 30) * 1.5 : 0;
    ctx.translate(200, 372); ctx.scale(1 + (1 - sq) * .6, sq); ctx.translate(-200, -372);
    for (let i = 0; i < n; i++) {
      const u = seg(t, i * .12, i * .12 + .35); if (u <= 0) continue;
      const fall = (1 - bk(u, 1.6)) * -260, ox = [0, -16, 12, -8, 6][i] + tr * (i / n), yy = 372 - (i + 1) * 58 + fall, top = i === n - 1;
      ctx.save(); ctx.translate(ox, 0);
      ink(ctx, 9, 0, poly([[118, yy - 12], [168, yy - 12], [176, yy], [118, yy]]), top ? C.SH : C.G3, { seed: 200 + i, shadow: false });
      ink(ctx, 9, 0, poly([[78, yy], [322, yy], [322, yy + 54], [78, yy + 54]]), top ? C.OR : (i % 2 ? C.G2 : C.G3), { seed: 210 + i, sx: 10, sy: 10, sheen: false });
      ink(ctx, 9, 0, poly([[96, yy - 6], [300, yy - 9], [302, yy + 8], [96, yy + 8]]), C.CRM, { seed: 220 + i, shadow: false });
      ink(ctx, 9, 0, poly([[78, yy + 40], [322, yy + 40], [322, yy + 54], [78, yy + 54]]), 'rgba(0,0,0,.35)', { seed: 230 + i, shadow: false, rim: false, ghost: false, sheen: false, speck: false });
      ctx.restore();
    }
  });

  // flecha com haste grossa e penas laranja, voa da esquerda com borrão (6 cópias) e crava a ponta em (x+180*s, y), vibrando.
  // o.txt escrito na haste em creme; o.c cor da haste
  const flecha = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, { bob: 0, ...o }, () => {
    const hit = o.dur || .35, u = seg(t, 0, hit); if (u <= 0) return;
    const off = -(1 - ei(u)) * 900, wob = t > hit ? Math.sin((t - hit) * 42) * Math.exp(-(t - hit) * 5) * 4 : 0;
    const L = o.len || 420, x0 = 380 - L;
    const draw = (a) => {
      ctx.save(); ctx.globalAlpha = a;
      ink(ctx, 9, 0, poly([[x0 + 40, 176], [324, 176], [324, 224], [x0 + 40, 224]]), o.c || C.G2, { seed: 240, sx: 8, sy: 8, sheen: false, speck: a > .9 });
      ink(ctx, 9, 0, poly([[316, 150], [380, 200], [316, 250], [330, 200]]), C.LUZ, { seed: 241, sx: 8, sy: 8, sheen: false, speck: a > .9 });
      ink(ctx, 9, 0, P(p => { p.moveTo(x0, 130); p.lineTo(x0 + 34, 130); p.lineTo(x0 + 96, 176); p.lineTo(x0 + 50, 176); p.closePath(); p.moveTo(x0, 270); p.lineTo(x0 + 34, 270); p.lineTo(x0 + 96, 224); p.lineTo(x0 + 50, 224); p.closePath(); }), o.a || C.OR, { seed: 242, sx: 8, sy: 8, sheen: false, speck: a > .9 });
      if (o.txt && a > .9) { ctx.save(); ctx.font = `600 ${o.fs || 34}px Aspekta`; ctx.letterSpacing = '3px'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.CRM; ctx.fillText(o.txt, x0 + 108, 202); ctx.restore(); }
      ctx.restore();
    };
    ctx.translate(380, 200); ctx.rotate(wob * R); ctx.translate(-380 + off, -200);
    if (u < 1) for (let i = 6; i >= 1; i--) { ctx.save(); ctx.translate(-i * 40 * (1 - u), 0); draw(.5 - i * .07); ctx.restore(); }
    draw(1);
  });

  // gráfico que cai: massa cinza com grão sob uma curva descendente, borda laranja de 16 px com ponta em seta para baixo.
  // revela da esquerda (.8 s); o.drop (s) a ponta afunda mais
  const grafico = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const u = eio(seg(t, 0, .8)), dr = o.drop == null ? 0 : bk(seg(t, o.drop, o.drop + .5), 1.4), N = 24;
    const f = i => { const k = i / N; return 90 + 170 * k * k + 26 * Math.sin(k * 9) * (1 - k) + dr * 70 * k * k * k; };
    const pts = []; for (let i = 0; i <= N; i++) pts.push([30 + i * 340 / N, f(i)]);
    ctx.save(); ctx.beginPath(); ctx.rect(-40, -40, 70 + 340 * u + 40, 500); ctx.clip();
    ink(ctx, 9, 0, poly([...pts, [370, 380], [30, 380]]), C.G2, { seed: 250, sx: 12, sy: 12, sheen: false });
    ink(ctx, 9, 0, poly([...pts.map(([a, b]) => [a, b - 8]), ...pts.slice().reverse().map(([a, b]) => [a, b + 8])]), o.c || C.OR, { seed: 251, shadow: false, sheen: false });
    ctx.restore();
    if (u > .95) { const [ex, ey] = pts[N]; ink(ctx, 9, 0, poly([[ex - 30, ey - 6], [ex + 26, ey - 14], [ex + 8, ey + 42]]), o.c || C.OR, { seed: 252, sx: 0, sy: 8, shc: C.SH, sheen: false }); }
  });

  // degrau-bloco em perspectiva (topo claro, frente média, lateral escura) com pictograma gravado na frente em #CFCFCF.
  // o.icon: livro | halter | laptop | coracao | moedas | bandeira; o.lit pinta o bloco de laranja (pictograma preto)
  const ICON = {
    livro: p => { p.moveTo(-50, -30); p.lineTo(-4, -22); p.lineTo(-4, 32); p.lineTo(-50, 24); p.closePath(); p.moveTo(50, -30); p.lineTo(4, -22); p.lineTo(4, 32); p.lineTo(50, 24); p.closePath(); },
    halter: p => { p.rect(-36, -6, 72, 12); p.roundRect(-58, -30, 16, 60, 4); p.roundRect(-42, -22, 10, 44, 3); p.roundRect(42, -30, 16, 60, 4); p.roundRect(32, -22, 10, 44, 3); },
    laptop: p => { p.moveTo(-40, -36); p.lineTo(40, -36); p.lineTo(40, 16); p.lineTo(-40, 16); p.closePath(); p.moveTo(-34, -30); p.lineTo(-34, 10); p.lineTo(34, 10); p.lineTo(34, -30); p.closePath(); p.moveTo(-56, 22); p.lineTo(56, 22); p.lineTo(48, 34); p.lineTo(-48, 34); p.closePath(); },
    coracao: p => { p.moveTo(0, 34); p.bezierCurveTo(-70, -10, -40, -50, 0, -18); p.bezierCurveTo(40, -50, 70, -10, 0, 34); p.closePath(); },
    moedas: p => { for (let i = 0; i < 4; i++) { p.moveTo(36, 26 - i * 16); p.ellipse(0, 26 - i * 16, 36, 11, 0, 0, Math.PI * 2); } p.moveTo(70, -20); p.arc(46, -20, 24, 0, Math.PI * 2); },
    bandeira: p => { p.rect(-30, -40, 8, 76); p.moveTo(-22, -40); p.lineTo(36, -28); p.lineTo(-22, -10); p.closePath(); },
  };
  const degrau = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y + (1 - bk(seg(t, 0, .4), 1.8)) * 40 * s, s, o, () => {
    if (t <= 0) return; const lit = o.lit != null && t >= o.lit;
    ink(ctx, t, 0, poly([[70, 150], [290, 150], [290, 330], [70, 330]]), lit ? C.OR : C.G2, { seed: 260, dir: 'y', dur: .25, sheen: lit });
    ink(ctx, t, .05, poly([[70, 150], [290, 150], [340, 110], [120, 110]]), lit ? C.OR1 : C.G4, { seed: 261, shadow: false, dur: .2 });
    ink(ctx, t, .05, poly([[290, 150], [340, 110], [340, 290], [290, 330]]), lit ? C.SH : C.G1, { seed: 262, shadow: false, dur: .2 });
    const ic = ICON[o.icon || 'livro'], u = seg(t, .2, .45); if (!ic || u <= 0) return;
    ctx.save(); ctx.translate(180, 240); ctx.scale(1.25 * bk(u, 2), 1.25 * bk(u, 2));
    const path = P(ic); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.translate(-3, -3); ctx.fill(path, 'evenodd'); ctx.translate(3, 3);
    ctx.fillStyle = lit ? C.BLK : '#CFCFCF'; ctx.fill(path, 'evenodd'); ctx.restore();
  });

  // risco de pincel à mão: faixa laranja de espessura irregular, levemente subindo, puxada da esquerda (o.dur), sombra dura #A8460A
  const risco = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, { bob: 0, rot: -4, ...o }, () => {
    const w = o.w || 440, x0 = 200 - w / 2, N = 20, top = [], bot = [];
    for (let i = 0; i <= N; i++) { const xx = x0 + i * w / N, th = 24 + 5 * Math.sin(i * .9) + (hash(i + 270) - .5) * 3, yy = 200 + Math.sin(i * .35) * 6; top.push([xx, yy - th]); bot.push([xx, yy + th * .8]); }
    const path = poly([[x0 - 18, 196], ...top, [x0 + w + 22, 204], ...bot.reverse()]);
    ink(ctx, t, 0, path, o.c || C.OR, { seed: 270, dur: o.dur || .32, sx: 0, sy: 8, shc: o.shc || C.SH, sheen: false });
  });

  // busto de costas (sem rosto): ombros arredondados, pescoço grosso, cabeça oval com cabelo v (0 coque, 1 cacheado, 2 rabo, 3 curto)
  const busto = (cx, by, k, v, jag = 0) => P(p => {
    const J = i => jag ? (hash(i * 3.1 + cx) - .5) * jag * k : 0;
    p.moveTo(cx - 64 * k, by); p.bezierCurveTo(cx - 66 * k, by - 50 * k + J(1), cx - 46 * k, by - 76 * k, cx - 18 * k, by - 80 * k + J(2));
    p.lineTo(cx - 15 * k, by - 98 * k); p.lineTo(cx + 15 * k, by - 98 * k); p.lineTo(cx + 18 * k, by - 80 * k + J(3));
    p.bezierCurveTo(cx + 46 * k, by - 76 * k, cx + 66 * k, by - 50 * k + J(4), cx + 64 * k, by); p.closePath();
    p.moveTo(cx + 29 * k, by - 128 * k); p.ellipse(cx, by - 128 * k, 29 * k, 35 * k, 0, 0, Math.PI * 2);
    if (v === 0) { p.moveTo(cx + 15 * k, by - 168 * k); p.arc(cx, by - 168 * k, 15 * k, 0, Math.PI * 2); }
    if (v === 1) for (let i = 0; i < 6; i++) { const a = Math.PI * (1.05 + i * .18), qx = cx + Math.cos(a) * 30 * k, qy = by - 132 * k + Math.sin(a) * 34 * k; p.moveTo(qx + 13 * k, qy); p.arc(qx, qy, 13 * k, 0, Math.PI * 2); }
    if (v === 2) { p.moveTo(cx - 6 * k, by - 120 * k); p.ellipse(cx, by - 100 * k, 9 * k, 26 * k, 0, 0, Math.PI * 2); }
  });
  // multidão: 3 fileiras de vultos cinza com desfoque de movimento horizontal e, na frente, o busto amarelo #F5C400 de ombro irregular.
  // largura ~760 caixa (sangra para fora de 0..400); o.rise (s) o amarelo cresce e sai do grupo, com a base virando laranja
  const multidao = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, { bob: 0, ...o }, () => {
    const rows = [[8, .55, 250, '#3A3836'], [7, .72, 320, '#55524E'], [6, .9, 400, '#7A7671']], dr = Math.sin(t * .8) * 10;
    rows.forEach(([n, k, by, col], r) => {
      const u = bk(seg(t, r * .12, r * .12 + .4), 1.4); if (u <= 0) return;
      for (let i = 0; i < n; i++) {
        const cx = -180 + (i + (r % 2 ? .5 : .2)) * 760 / n + dr * (r + 1) * .5, yy = by + (1 - u) * 120;
        if (r === 2 && Math.abs(cx - 200) < 70) continue;
        const path = busto(cx, yy, k, (i + r) % 4);
        for (let j = 8; j >= 1; j--) { ctx.fillStyle = col; ctx.globalAlpha = .045 * (9 - j); ctx.fill(busto(cx - j * 9 * k, yy, k, (i + r) % 4)); }
        ctx.globalAlpha = 1; ink(ctx, 9, 0, path, col, { seed: 290 + r * 9 + i, shadow: false, sheen: false, ghost: false });
      }
    });
    const u = seg(t, .35, .75); if (u <= 0) return;
    const ri = o.rise == null ? 0 : eio(seg(t, o.rise, o.rise + .7)), k = (1.05 + .45 * ri) * bk(u, 1.8), by = 420 - 120 * ri;
    const fig = busto(200, by, k, 1, 14);
    ink(ctx, 9, 0, fig, o.c || '#F5C400', { seed: 300, sx: 14, sy: 14, sheen: false });
    if (ri > 0) { ctx.save(); ctx.clip(fig); const g = ctx.createLinearGradient(0, by, 0, by - 110 * k); g.addColorStop(0, `rgba(238,122,30,${ri})`); g.addColorStop(1, 'rgba(238,122,30,0)'); ctx.fillStyle = g; ctx.fillRect(0, by - 200 * k, 400, 200 * k);
      const r = mulberry(301); ctx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 70 * ri; i++) ctx.fillRect(200 + (r() - .5) * 140 * k, by - r() * r() * 30 * k, 3, 3); ctx.restore(); }
  });

  // medidor horizontal: cápsula #1D1D1D com calha preta, barra laranja (brilho em cima) e 9 entalhes; o.txt rótulo creme acima.
  // nível vai de o.from (1) a o.to (.1) entre o.drop e o.drop+1,2 s; a barra treme ao chegar
  const medidor = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const u = eo(seg(t, 0, .4)), d = o.drop ?? .8, k = eio(seg(t, d, d + 1.2)), lv = lerp(o.from ?? 1, o.to ?? .1, k) * eo(seg(t, .2, .7));
    ctx.translate(0, (1 - u) * 40); ctx.globalAlpha = u;
    ink(ctx, 9, 0, P(p => p.roundRect(10, 160, 380, 110, 55)), C.G1, { seed: 310, sx: 12, sy: 12, sheen: false });
    ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.roundRect(30, 180, 340, 70, 35); ctx.fill();
    if (lv > .02) { const w = Math.max(70, 340 * lv); ink(ctx, 9, 0, P(p => p.roundRect(30, 180, w, 70, 35)), lv < .25 && Math.floor(t * 5) % 2 ? C.OR1 : C.OR,{ seed: 311, shadow: false, sheen: false }); ctx.fillStyle = 'rgba(255,248,236,.28)'; ctx.beginPath(); ctx.roundRect(52, 188, Math.max(20, w - 44), 12, 6); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 1; i < 10; i++) ctx.fillRect(30 + i * 34, 252, 3, 14);
    if (o.txt) { ctx.font = `600 ${o.fs || 40}px Aspekta`; ctx.letterSpacing = '8px'; ctx.fillStyle = C.CRM; ctx.textBaseline = 'alphabetic'; ctx.fillText(o.txt, 20, 140); }
  });

  // bateria: corpo cinza com polo, 4 células laranja que se apagam uma a uma entre o.drain=[t0,t1]; a última pisca em #D42A00 a partir de o.blink
  const bateria = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const [a, b] = o.drain || [.6, 2], left = 4 - Math.floor(4 * seg(t, a, b) + 1e-6), bl = o.blink != null && t >= o.blink;
    ink(ctx, t, 0, P(p => { p.roundRect(30, 110, 310, 180, 28); p.roundRect(338, 160, 40, 80, 10); }), C.G2, { seed: 320, sx: 14, sy: 14 });
    ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.roundRect(52, 132, 266, 136, 16); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const u = seg(t, .2 + i * .1, .4 + i * .1); if (u <= 0) continue; const on = i < Math.max(1, left);
      let col = on ? C.OR : '#1D1D1D'; if (i === 0 && left <= 1 && bl) col = Math.floor((t - o.blink) * 6) % 2 ? '#D42A00' : '#1D1D1D';
      ctx.save(); ctx.translate(0, (1 - bk(u, 2)) * 20); ink(ctx, 9, 0, P(p => p.roundRect(64 + i * 63, 144, 52, 112, 10)), col, { seed: 321 + i, shadow: false, sheen: false, speck: on }); ctx.restore();
    }
    ink(ctx, t, .1, P(p => p.roundRect(52, 118, 250, 10, 5)), 'rgba(255,248,236,.25)', { seed: 326, shadow: false, rim: false, ghost: false, sheen: false, speck: false });
  });

  // fita laranja inclinada (−6°) de borda a borda com texto preto em marquee; entra em wipe da esquerda (.5 s, expo).
  // fora da caixa 400: (x, y) é o centro em px, o.w largura (1500), o.h altura (140), o.speed px/s, o.c/o.tc cores
  const fita = (ctx, t, x, y, s = 1, o = {}) => {
    const w = o.w || 1500, h = (o.h || 140) * s, u = seg(t, 0, .5), e = u < .5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2; if (u <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate((o.rot ?? -6) * R); ctx.beginPath(); ctx.rect(-w / 2, -h, w * e, h * 2 + 20); ctx.clip();
    ctx.fillStyle = o.shc || C.SH; ctx.fillRect(-w / 2, -h / 2 + 10, w, h);
    ink(ctx, 9, 0, P(p => p.rect(-w / 2, -h / 2, w, h)), o.c || C.OR, { seed: 330, shadow: false, sheen: false, speck: false });
    ctx.font = `600 ${Math.round(h * .58)}px Aspekta`; ctx.letterSpacing = '2px'; ctx.textBaseline = 'middle'; ctx.fillStyle = o.tc || C.BLK;
    const txt = (o.txt || 'BLACK FRIDAY • ') + ' ', tw = ctx.measureText(txt).width, sh = ((t * (o.speed ?? 160)) % tw);
    for (let xx = -w / 2 - sh; xx < w / 2; xx += tw) ctx.fillText(txt, xx, h * .04);
    ctx.restore();
  };

  // card escuro (#1D1D1D, raio 16, borda branca 10 %, sombra dura 10 px, ±6°): microtexto creme espaçado em cima e o.txt grande em o.tc.
  // pop de 40 px abaixo com overshoot; o.w/o.h tamanho em caixa
  const card = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y + (1 - bk(seg(t, 0, .4), 1.8)) * 40 * s, s, { rot: 6, ...o }, () => {
    if (t <= 0) return; const w = o.w || 360, h = o.h || 220, x0 = 200 - w / 2, y0 = 200 - h / 2;
    ctx.globalAlpha = Math.min(1, t / .15);
    ink(ctx, 9, 0, P(p => p.roundRect(x0, y0, w, h, 16)), o.c || C.G1, { seed: 340, sx: 10, sy: 10, sheen: false });
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x0 + 1.5, y0 + 1.5, w - 3, h - 3, 15); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    if (o.label) { ctx.font = '600 22px Aspekta'; ctx.letterSpacing = '6px'; ctx.fillStyle = 'rgba(255,248,236,.7)'; ctx.fillText(o.label, x0 + 30, y0 + 52); }
    if (o.txt) { let fs = o.fs || 64; ctx.letterSpacing = '0px'; ctx.font = `600 ${fs}px Aspekta`; const mw = ctx.measureText(o.txt).width; if (mw > w - 60) { fs *= (w - 60) / mw; ctx.font = `600 ${fs}px Aspekta`; } ctx.fillStyle = o.tc || C.OR; ctx.fillText(o.txt, x0 + 30, y0 + h - 40); }
  });

  // contorno de espinhos em elipse (cx, cy, rx, ry) de a0 a a1 graus; k 0..1 recolhe as pontas (0 = liso)
  const spikes = (cx, cy, rx, ry, len, n, a0, a1, k, seed) => { const pts = []; for (let i = 0; i <= n * 2; i++) { const a = (a0 + (a1 - a0) * i / (n * 2)) * R, l = i % 2 ? len * k * (.8 + .4 * hash(seed + i)) : 0; pts.push([cx + Math.cos(a) * (rx + l), cy + Math.sin(a) * (ry + l)]); } return pts; };
  // triângulo de espinho com base em (bx, by), apontando para ang graus
  const thorn = (p, bx, by, ang, w, l) => { const c = Math.cos(ang * R), s = Math.sin(ang * R); p.moveTo(bx - s * w, by + c * w); p.lineTo(bx + c * l, by + s * l); p.lineTo(bx + s * w, by - c * w); p.closePath(); };

  // ouriço de perfil (olha para a direita): 3 fileiras de espinhos (sombra, laranja, luz), focinho cinza, olho e nariz pretos.
  // espinhos crescem com overshoot ao entrar; o.smooth (s) recolhe tudo e o bicho fica liso; o.c/o.c1 tintas dos espinhos
  const ourico = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    let k = bk(seg(t, .12, .5), 2.2); if (o.smooth != null) k *= 1 - eo(seg(t, o.smooth, o.smooth + .5));
    const back = c => [...c, [300, 300], [80, 310]];
    ink(ctx, t, 0, poly(back(spikes(185, 250, 128, 98, 78, 13, 160, 345, k, 1))), o.shc2 || C.SH, { seed: 200, dir: 'y', shc: o.shc });
    ink(ctx, t, .05, poly(back(spikes(188, 252, 116, 88, 58, 12, 165, 340, k, 5))), o.c || C.OR, { seed: 201, shadow: false });
    ink(ctx, t, .1, poly(back(spikes(178, 246, 84, 62, 36, 9, 185, 320, k, 9))), o.c1 || C.OR1, { seed: 202, shadow: false });
    ink(ctx, t, .15, P(p => { p.ellipse(190, 300, 140, 46, 0, 0, Math.PI * 2); }), C.G2, { seed: 203, shadow: false });
    ink(ctx, t, .2, poly([[246, 214], [300, 226], [366, 272], [380, 292], [330, 322], [248, 328], [226, 268]]), o.face || C.G4, { seed: 204, shadow: false });
    ink(ctx, t, .3, P(p => { p.ellipse(130, 340, 26, 16, 0, 0, 7); p.moveTo(286, 340); p.ellipse(260, 340, 26, 16, 0, 0, 7); }), C.G2, { seed: 205, shadow: false });
    if (t < .35) return;
    ctx.fillStyle = C.BLK; ctx.beginPath(); ctx.arc(380, 290, 13, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(312, 260, 9, 0, 7); ctx.fill();
    ctx.fillStyle = C.LUZ; ctx.beginPath(); ctx.arc(309, 257, 3, 0, 7); ctx.fill();
    ctx.fillStyle = C.G3; ctx.beginPath(); ctx.arc(272, 226, 15, 0, 7); ctx.fill();
  });

  // tarefa aversiva: caixa de papelão em bloco (frente, topo, lateral), fita creme e etiqueta com linhas, espinhos laranja saindo dos lados.
  // o.shake (s) treme; o.smooth (s) os espinhos recolhem (vira liso); o.crack (s) racha em zigue-zague e as metades se afastam
  const caixa = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    let k = bk(seg(t, .3, .65), 2.2); if (o.smooth != null) k *= 1 - eo(seg(t, o.smooth, o.smooth + .5));
    const sh = o.shake != null && t > o.shake ? Math.sin(t * 75) * 7 * (o.crack != null && t > o.crack + .3 ? .2 : 1) : 0;
    const draw = tt => {
      const sp = P(p => { const L = 62 * k; if (L < 1) return; for (let i = 0; i < 4; i++) { thorn(p, 92, 178 + i * 46, 180, 17, L); thorn(p, 348, 138 + i * 46, -12, 17, L); thorn(p, 150 + i * 56, 112, -98 + i * 4, 17, L * .9); } thorn(p, 140, 352, 120, 16, L * .7); thorn(p, 290, 352, 70, 16, L * .7); });
      ink(ctx, tt, .3, sp, o.c || C.OR, { seed: 210, shc: C.SH, sx: 8, sy: 8, sheen: false });
      ink(ctx, tt, 0, poly([[90, 150], [310, 150], [310, 350], [90, 350]]), C.G3, { seed: 211, dir: 'y', shc: o.shc });
      ink(ctx, tt, .05, poly([[90, 150], [310, 150], [350, 112], [130, 112]]), C.G4, { seed: 212, shadow: false });
      ink(ctx, tt, .05, poly([[310, 150], [350, 112], [350, 312], [310, 350]]), C.G1, { seed: 213, shadow: false });
      ink(ctx, tt, .15, poly([[184, 150], [216, 150], [256, 112], [224, 112]]), C.LUZ, { seed: 214, shadow: false });
      ink(ctx, tt, .15, poly([[184, 150], [216, 150], [216, 210], [184, 210]]), C.LUZ, { seed: 215, shadow: false, dir: 'y' });
      ink(ctx, tt, .22, P(p => { p.rect(118, 236, 164, 92); }), C.CRM, { seed: 216, shadow: false });
      ink(ctx, tt, .28, P(p => { p.rect(134, 254, 90, 14); p.rect(134, 280, 128, 10); p.rect(134, 302, 70, 10); }), C.BLK, { seed: 217, shadow: false });
    };
    ctx.translate(sh, 0);
    const cr = o.crack == null ? 0 : eo(seg(t, o.crack, o.crack + .35));
    if (cr <= 0) return draw(t);
    const zz = [[236, 60], [214, 140], [240, 200], [200, 262], [228, 312], [206, 420]];
    [[-1, [[-100, -100], ...zz, [-100, 520]]], [1, [[520, -100], ...zz, [520, 520]]]].forEach(([d, pts]) => {
      ctx.save(); ctx.translate(200, 360); ctx.rotate(d * 7 * cr * R); ctx.translate(-200 + d * 26 * cr, -360);
      ctx.clip(poly(pts)); draw(t); ctx.restore();
    });
    for (let i = 0; i < 6; i++) { const u = seg(t, o.crack, o.crack + .6); if (u >= 1) break; ctx.fillStyle = i % 2 ? C.G4 : C.OR; ctx.fillRect(218 + (hash(i + 21) - .5) * 300 * u, 140 + i * 36 - 140 * u + 260 * u * u, 12, 12); }
  });

  // sinal de "não": anel grosso + barra diagonal chapados (o.c, padrão laranja), sombra dura; entra em slam e a barra é puxada depois
  const proibido = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const u = seg(t, 0, .35); if (u <= 0) return; const k = 1.4 - .4 * bk(u, 2);
    ctx.translate(200, 200); ctx.scale(k, k); ctx.translate(-200, -200);
    const c = o.c || C.OR, q = { sx: 0, sy: 10, shc: o.shc || C.SH };
    ink(ctx, 9, 0, P(p => { p.arc(200, 200, 170, 0, 7); p.moveTo(328, 200); p.arc(200, 200, 128, 0, 7); }), c, { seed: 220, rule: 'evenodd', ...q });
    ctx.save(); ctx.clip(circle(200, 200, 140));
    ink(ctx, t, .2, poly(rot([[40, 176], [360, 176], [360, 224], [40, 224]], 45, 200, 200)), c, { seed: 221, dur: .2, ...q });
    ctx.restore();
  });

  // mira que se fecha sobre a palavra: 4 cantos em L de 22 px, anel com 4 cortes girando e 4 cunhas apontando para dentro.
  // o.hw/o.hh meia-largura/altura do quadro (150); o.c tinta (creme); o.crack (s) o anel racha em 4 arcos que voam com estilhaços
  const mira = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, { bob: 0, ...o }, () => {
    const e = eo(seg(t, 0, .55)), d = lerp(1.8, 1, e), hw = (o.hw || 150) * d, hh = (o.hh || 150) * d, c = o.c || C.CRM, q = { shc: o.shc || 'rgba(0,0,0,.5)', sx: 8, sy: 8, sheen: false };
    if (e <= 0) return;
    const cr = o.crack == null ? 0 : eo(seg(t, o.crack, o.crack + .5)), jolt = cr > 0 && cr < .6 ? (hash(Math.floor(t * 50)) - .5) * 10 : 0;
    ctx.translate(jolt, 0);
    ctx.save(); ctx.globalAlpha = Math.min(1, e * 1.5);
    ink(ctx, 9, 0, P(p => { const a = 74, w = 22; [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { const cx = 200 + sx * hw, cy = 200 + sy * hh; p.moveTo(cx, cy); p.lineTo(cx - sx * a, cy); p.lineTo(cx - sx * a, cy - sy * w); p.lineTo(cx - sx * w, cy - sy * w); p.lineTo(cx - sx * w, cy - sy * a); p.lineTo(cx, cy - sy * a); p.closePath(); }); }), c, { seed: 230, ...q });
    const rr = Math.min(hw, hh) * .78, sp = t * .6 + (1 - e) * 2;
    for (let i = 0; i < 4; i++) {
      const a0 = sp + i * Math.PI / 2 + .16, a1 = a0 + Math.PI / 2 - .32, mid = (a0 + a1) / 2, fl = 90 * cr;
      ctx.save(); ctx.translate(Math.cos(mid) * fl, Math.sin(mid) * fl + 160 * cr * cr); ctx.translate(200, 200); ctx.rotate(cr * (i % 2 ? .6 : -.6)); ctx.translate(-200, -200);
      ink(ctx, 9, 0, P(p => { p.arc(200, 200, rr, a0, a1); p.arc(200, 200, rr - 18, a1, a0, true); p.closePath(); }), c, { seed: 231 + i, ...q });
      ctx.restore();
    }
    ink(ctx, 9, 0, P(p => { [0, 90, 180, 270].forEach(a => { const ca = Math.cos(a * R), sa = Math.sin(a * R), r0 = rr + 16, r1 = rr + 64; p.moveTo(200 + ca * r0, 200 + sa * r0); p.lineTo(200 + ca * r1 - sa * 16, 200 + sa * r1 + ca * 16); p.lineTo(200 + ca * r1 + sa * 16, 200 + sa * r1 - ca * 16); p.closePath(); }); }), o.a || C.OR, { seed: 235, ...q });
    if (cr > 0 && cr < 1) for (let i = 0; i < 10; i++) { const a = hash(i + 40) * 7, r = rr + 200 * cr; ctx.fillStyle = i % 2 ? c : (o.a || C.OR); ctx.fillRect(200 + Math.cos(a) * r, 200 + Math.sin(a) * r + 120 * cr * cr, 11, 11); }
    ctx.restore();
  });

  // dois círculos desenhados à mão (borda irregular) ligados por fio tracejado; rótulos o.l1/o.l2 abaixo.
  // o.merge (s): andam um para o outro e viram um só círculo laranja com o.l3 dentro. o.c1/o.c2 tintas, o.fio cor do fio
  const circulos = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const m = o.merge == null ? 0 : eio(seg(t, o.merge, o.merge + .55)), c1 = o.c1 || C.BLK, c2 = o.c2 || C.OR, q = { sx: 10, sy: 10, shc: o.shc, sheen: false };
    const lab = (txt, cx, cy, col, a, fs = 34) => { if (!txt || a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.font = `600 ${fs}px Aspekta`; ctx.letterSpacing = '2px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(txt, cx, cy); ctx.restore(); };
    if (m < .9) {
      const dx = 120 * (1 - m), k1 = bk(seg(t, 0, .4), 2), k2 = bk(seg(t, .15, .55), 2), u = seg(t, .45, .9);
      if (u > 0 && m < .3) { ctx.save(); ctx.strokeStyle = o.fio || 'rgba(18,18,18,.6)'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]); ctx.lineDashOffset = -t * 30; ctx.beginPath(); ctx.moveTo(200 - dx + 60, 200); ctx.lineTo(200 - dx + 60 + (2 * dx - 120) * eo(u), 200); ctx.stroke(); ctx.restore(); }
      [[200 - dx, k1, c1, 240, o.l1], [200 + dx, k2, c2, 250, o.l2]].forEach(([cx, kk, col, sd, l]) => {
        if (kk <= 0) return; ctx.save(); ctx.translate(cx, 200); ctx.scale(kk, kk); ctx.translate(-cx, -200);
        ink(ctx, 9, 0, poly(blob(cx, 200, 82 + 20 * m, 18, sd, .06)), col, { seed: sd, ...q }); ctx.restore();
        lab(l, cx, 330, o.lc || C.BLK, Math.min(1, kk) * (1 - m * 2), o.fs || 34);
      });
    } else {
      const k = bk(seg(t, o.merge + .5, o.merge + .9), 2.6), r = 130 * (.8 + .2 * k);
      ink(ctx, 9, 0, poly(blob(200, 200, r, 20, 260, .05)), c2, { seed: 260, ...q });
      ink(ctx, 9, 0, P(p => { p.arc(200, 200, r * .78, 200 * R, 250 * R); p.arc(200, 200, r * .64, 250 * R, 200 * R, true); p.closePath(); }), o.luz || C.OR1, { seed: 261, shadow: false, sheen: false });
      lab(o.l3, 200, 204, o.tc || C.BLK, seg(t, o.merge + .6, o.merge + .8), o.fs3 || 52);
    }
  });

  // botão giratório (volume/freio): 11 marcas em arco que acendem até o nível, corpo serrilhado em bloco, ponteiro laranja.
  // o.lv nível 0..1 (.7); o.osc amplitude da oscilação (.18); o.to/o.at muda o nível para o.to a partir de o.at s
  const knob = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const lv0 = o.lv ?? .7, lv = o.to == null ? lv0 : lerp(lv0, o.to, eio(seg(t, o.at || 1, (o.at || 1) + .6)));
    const v = clamp(lv * eo(seg(t, .25, .85)) + (o.osc ?? .18) * Math.sin(Math.max(0, t - .85) * 4.2) * seg(t, .85, 1.2), 0, 1), A0 = 135, A1 = 405, ang = A0 + (A1 - A0) * v;
    for (let i = 0; i < 11; i++) {
      const a = A0 + (A1 - A0) * i / 10, on = a <= ang + .5, big = i % 5 === 0;
      ink(ctx, t, i * .03, poly(rot([[200 - (big ? 11 : 8), 22], [200 + (big ? 11 : 8), 22], [200 + 6, 52], [200 - 6, 52]], a + 90, 200, 210)), on ? (o.a || C.OR) : C.G3, { seed: 270 + i, shadow: false, sheen: false });
    }
    const gear = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r = i % 2 ? 138 : 128; gear.push([200 + Math.cos(a) * r, 210 + Math.sin(a) * r]); }
    ink(ctx, t, .05, poly(gear), C.G1, { seed: 281, dir: 'y', shc: o.shc });
    ink(ctx, t, .1, circle(200, 210, 108), o.c || C.G3, { seed: 282, shadow: false });
    ink(ctx, t, .15, P(p => { p.arc(200, 210, 100, 190 * R, 260 * R); p.arc(200, 210, 80, 260 * R, 190 * R, true); p.closePath(); }), C.G4, { seed: 283, shadow: false });
    if (t < .2) return;
    const ptr = poly(rot([[188, 196], [212, 196], [210, 120], [190, 120]], ang + 90, 200, 210));
    ctx.save(); ctx.translate(6, 7); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill(ptr); ctx.restore();
    ctx.fillStyle = o.a || C.OR; ctx.fill(ptr); ctx.fillStyle = C.G1; ctx.beginPath(); ctx.arc(200, 210, 22, 0, 7); ctx.fill();
  });

  // barras em bloco que descem em degraus da esquerda para a direita (frente, topo claro, lateral escura); sobem em cascata.
  // o.n barras (5), o.hs alturas (0..1), o.drop (s) todas caem para .35 da altura; o.c frente, o.a pinta a última (a menor)
  const barras = (ctx, t, x, y, s, o = {}) => box(ctx, t, x, y, s, o, () => {
    const hs = o.hs || [1, .78, .56, .36, .18], n = hs.length, bw = 300 / n, yb = 370, H = 330, dr = o.drop == null ? 1 : lerp(1, .35, eio(seg(t, o.drop, o.drop + .7)));
    hs.forEach((h, i) => {
      const k = bk(seg(t, i * .12, i * .12 + .4), 1.8); if (k <= 0) return;
      const x0 = 40 + i * bw, w = bw - 14, top = yb - H * h * k * (i ? dr : 1), last = o.a && i === n - 1;
      ink(ctx, 9, 0, poly([[x0, top], [x0 + w, top], [x0 + w, yb], [x0, yb]]), last ? o.a : (o.c || C.BLK), { seed: 290 + i, shc: o.shc, sx: 10, sy: 10, sheen: false });
      ink(ctx, 9, 0, poly([[x0, top], [x0 + w, top], [x0 + w + 12, top - 10], [x0 + 12, top - 10]]), last ? C.OR1 : C.G4, { seed: 300 + i, shadow: false, sheen: false });
      ink(ctx, 9, 0, poly([[x0 + w, top], [x0 + w + 12, top - 10], [x0 + w + 12, yb - 10], [x0 + w, yb]]), last ? C.SH : C.G2, { seed: 310 + i, shadow: false, sheen: false });
    });
  });

  return { ourico, caixa, proibido, mira, circulos, knob, barras, C, ink, speck, box, pilha, flecha, grafico, degrau, risco, busto, multidao, medidor, bateria, fita, card, folha, bandeira, lupa, cartao, alvo, check, seta, xis, lista, calendario, relogio, pedra, tunel, mochileiro, escada, balao, selo, pilula, botao, sunburst };
})();
