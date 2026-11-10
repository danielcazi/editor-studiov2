/* Parâmetros por URL: ?c=<base64url JSON dos campos> &quadro=<imagem> &avatar=<imagem> &semavatar=1 (esconde a foto de perfil) &layer=fundo|frente &marca=1
   &tx=<px> &ty=<px> &ts=<escala> movem e escalam os blocos de texto (.t e [data-mv]); com &tg=1 escalam juntos, em volta do centro do grupo
   Texto estático: window.seek não anima nada. Cada .t[data-c="campo"] recebe o texto; data-fit="max,min" encolhe a fonte até caber. */
(() => {
  const q = new URLSearchParams(location.search);
  let C = {}; try { if (q.get('c')) C = JSON.parse(decodeURIComponent(escape(atob(q.get('c').replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) {}
  window.CAMPOS = C;
  if (q.get('layer')) document.body.classList.add('layer-' + q.get('layer'));
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
  window.DURATION = 1; window.FPS = 30; window.SFX = [];
  window.seek = async () => {};
  window.__ready = (async () => { await document.fonts.ready; await Promise.all([...document.images].filter((i) => i.src).map((i) => i.decode().catch(() => {}))); document.querySelectorAll('[data-fit]').forEach(fit); mover(); })();
})();
