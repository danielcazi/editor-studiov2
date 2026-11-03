/* Parâmetros por URL: ?c=<base64url JSON dos campos> &quadro=<imagem> &avatar=<imagem> &layer=fundo|frente &marca=1
   Texto estático: window.seek não anima nada. Cada .t[data-c="campo"] recebe o texto; data-fit="max,min" encolhe a fonte até caber. */
(() => {
  const q = new URLSearchParams(location.search);
  let C = {}; try { if (q.get('c')) C = JSON.parse(decodeURIComponent(escape(atob(q.get('c').replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) {}
  window.CAMPOS = C;
  if (q.get('layer')) document.body.classList.add('layer-' + q.get('layer'));
  if (q.get('marca') === '1') document.body.classList.add('marca');
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
  window.DURATION = 1; window.FPS = 30; window.SFX = [];
  window.seek = async () => {};
  window.__ready = (async () => { await document.fonts.ready; await Promise.all([...document.images].filter((i) => i.src).map((i) => i.decode().catch(() => {}))); document.querySelectorAll('[data-fit]').forEach(fit); })();
})();
