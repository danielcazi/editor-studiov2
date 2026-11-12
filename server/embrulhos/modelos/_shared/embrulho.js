/* Parâmetros por URL: ?c=<base64url JSON dos campos> &quadro=<imagem> &avatar=<imagem> &semavatar=1 (esconde a foto de perfil) &layer=fundo|frente &marca=1
   &tx=<px> &ty=<px> &ts=<escala> movem e escalam os blocos de texto (.t e [data-mv]); com &tg=1 escalam juntos, em volta do centro do grupo
   &p=4x5|16x9 troca o quadro de 1080×1920 por 1080×1350 ou 1920×1080 (classe p-<prop> no <html>)
   &el=<base64url JSON {peça: [dx, dy, escala]}> move e escala cada peça da moldura. Peça = filho direto do body; os que têm o mesmo
   data-g andam juntos; sem data-g o nome vem das classes. window.CAIXAS = onde cada peça ficou (frações do quadro), medido com as duas camadas à vista.
   Texto estático: window.seek não anima nada. Cada .t[data-c="campo"] recebe o texto; data-fit="max,min" encolhe a fonte até caber. */
(() => {
  const q = new URLSearchParams(location.search);
  let C = {}; try { if (q.get('c')) C = JSON.parse(decodeURIComponent(escape(atob(q.get('c').replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) {}
  window.CAMPOS = C;
  if (q.get('p')) document.documentElement.classList.add('p-' + q.get('p'));   // proporção: 4x5 (1080×1350) ou 16x9 (1920×1080)
  if (q.get('marca') === '1') document.body.classList.add('marca');
  if (q.get('semavatar') === '1') document.querySelectorAll('.avatar').forEach((e) => { e.style.display = 'none'; });
  const S = document.getElementById('stage') || document.body;
  document.querySelectorAll('[data-c]').forEach((e) => {
    const v = C[e.dataset.c];
    if (v == null || v === '') { if (e.hasAttribute('data-opt')) e.style.display = 'none'; else e.textContent = ''; return; }
    if (e.hasAttribute('data-split')) {          // "Chamada: resto" → chamada em cor de destaque
      const i = String(v).indexOf(':');
      if (i > 0) { e.innerHTML = ''; const a = document.createElement('span'); a.className = 'ch'; a.textContent = v.slice(0, i + 1); const b = document.createElement('span'); b.textContent = ' ' + v.slice(i + 1).trim(); e.append(a, '\n', b); return; }
    }
    e.textContent = v;
  });
  document.querySelectorAll('img[data-src]').forEach((i) => { const s = q.get(i.dataset.src); if (s) i.src = s; else if (!i.getAttribute('src')) i.style.display = 'none'; });
  const fit = (e) => { const [mx, mn] = (e.dataset.fit || '60,24').split(',').map(Number); let f = mx; e.style.fontSize = f + 'px'; while ((e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) && f > mn) { f -= 2; e.style.fontSize = f + 'px'; } };
  const mover = () => {
    const tx = +q.get('tx') || 0, ty = +q.get('ty') || 0, ts = +q.get('ts') || 1;
    if (!tx && !ty && ts === 1) return;
    const els = [...document.querySelectorAll('.t, [data-mv]')], r = els.map((e) => e.getBoundingClientRect());
    const cx = (Math.min(...r.map((b) => b.left)) + Math.max(...r.map((b) => b.right))) / 2, cy = (Math.min(...r.map((b) => b.top)) + Math.max(...r.map((b) => b.bottom))) / 2;
    els.forEach((e, i) => { if (q.get('tg') === '1') e.style.transformOrigin = `${cx - r[i].left}px ${cy - r[i].top}px`; e.style.transform = `translate(${tx}px, ${ty}px) scale(${ts}) ` + (getComputedStyle(e).transform === 'none' ? '' : getComputedStyle(e).transform); });
  };
  const pecas = () => { const G = {}; [...document.body.children].forEach((e, i) => { if (/^(SCRIPT|STYLE|LINK)$/.test(e.tagName)) return;
    const k = e.dataset.g || (e.getAttribute('class') || '').split(/\s+/).filter((c) => c && !/^(abs|t|frente|avatar)$/.test(c)).join('-') || 'peca' + i; (G[k] ??= []).push(e); }); return G; };
  const visiveis = (els) => els.map((e) => [e, e.getBoundingClientRect()]).filter(([, b]) => b.width > 0 && b.height > 0);
  const borda = (r) => { const x = Math.min(...r.map((b) => b.left)), y = Math.min(...r.map((b) => b.top)); return { x, y, w: Math.max(...r.map((b) => b.right)) - x, h: Math.max(...r.map((b) => b.bottom)) - y }; };
  const mexer = () => {
    let E = {}; try { if (q.get('el')) E = JSON.parse(atob(q.get('el').replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) {}
    const G = pecas();
    for (const [k, [dx = 0, dy = 0, s = 1]] of Object.entries(E)) {
      const v = visiveis(G[k] || []); if (!v.length) continue;
      const g = borda(v.map(([, b]) => b)), gx = g.x + g.w / 2, gy = g.y + g.h / 2;
      // a escala é em volta do centro do grupo, qualquer que seja o transform-origin da peça: o translate compensa a diferença
      v.forEach(([e, b]) => { const o = getComputedStyle(e).transformOrigin.split(' ').map(parseFloat), ox = e.offsetLeft != null ? e.offsetLeft + o[0] : b.left + b.width / 2, oy = e.offsetTop != null ? e.offsetTop + o[1] : b.top + b.height / 2;
        e.style.translate = `${dx + (1 - s) * (gx - ox)}px ${dy + (1 - s) * (gy - oy)}px`; e.style.scale = s; });
    }
    window.CAIXAS = Object.entries(G).flatMap(([k, els]) => { const v = visiveis(els); if (!v.length) return []; const c = borda(v.map(([, b]) => b)); const W = document.body.offsetWidth, H = document.body.offsetHeight; return [{ k, x: c.x / W, y: c.y / H, w: c.w / W, h: c.h / H }]; });
  };
  window.DURATION = 1; window.FPS = 30; window.SFX = [];
  window.seek = async () => {};
  window.__ready = (async () => { await document.fonts.ready; await Promise.all([...document.images].filter((i) => i.src).map((i) => i.decode().catch(() => {}))); document.querySelectorAll('[data-fit]').forEach(fit); mover(); mexer(); if (q.get('layer')) document.body.classList.add('layer-' + q.get('layer')); })();
})();
