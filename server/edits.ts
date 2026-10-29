// Step "Edição": manual layer edits (<project>/layers.json) applied on top of the composition the AI wrote.
// The AI's index.html is kept as index.ai.html and index.html is rewritten from it with the edits. A fresh AI pass writes
// an index.html without the marker, which becomes the new index.ai.html: the edits then apply to it again, by layer id.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Text = { i: number; from: string; to: string };
export type LayerEdit = {
  hidden?: boolean; original?: boolean; row?: string; colors?: { from: string; to: string }[];   // row: the editor's track for this layer (UI only)
  z?: number; crop?: [number, number, number, number]; x?: number; y?: number; scale?: number; rotation?: number; opacity?: number; volume?: number;   // crop: % hidden from top, right, bottom, left
  start?: number; duration?: number; mediaStart?: number;   // clips only (elements with data-start)
  cuts?: number[]; gaps?: [number, number][];                  // razor points (UI only) and the stretches cut out of the layer
  texts?: Text[];
  font?: { size?: number; weight?: number; italic?: boolean; family?: string };   // the AI's text, restyled
};
export const ADDED_KINDS = ['text', 'title', 'captions', 'image', 'video', 'audio', 'model'] as const;
export type Added = {
  id: string; kind: typeof ADDED_KINDS[number]; start: number; duration: number; track: number; name?: string;
  src?: string; mediaStart?: number; text?: string; lines?: { t: number; end: number; text: string }[];
  size?: number; color?: string; bg?: string; weight?: number; italic?: boolean; family?: string; w?: number; anim?: 'pop' | 'slide' | 'fade' | 'type' | 'none';
  rights?: Rights;
};
// Where a clip came from and whether its license is settled. 'unlicensed' only draws a red mark on the timeline: it never blocks a render.
export type Rights = { status: 'licensed' | 'unlicensed'; source?: string; license?: string; author?: string; url?: string };
export function checkRights(r: any, who: string): Rights | undefined {
  if (r === undefined) return undefined;
  if (!r || !['licensed', 'unlicensed'].includes(r.status)) bad(`${who}: rights.status must be licensed or unlicensed`);
  const s = (k: string) => r[k] === undefined ? [] : typeof r[k] === 'string' && r[k].length <= 300 ? [[k, r[k]]] : bad(`${who}: rights.${k} is text up to 300 characters`);
  return { status: r.status, ...Object.fromEntries(['source', 'license', 'author', 'url'].flatMap(s)) };
}
export type Layers = { layers: Record<string, LayerEdit>; added: Added[]; order?: string[]; kfSplit?: boolean };   // kfSplit: the editor already cut the speaker at the AI's moves once; order: the editor's track order, top first
export type Layer = { id: string; kind: string; start: number; end: number; track: number; clip: boolean; src?: string; comp?: string; volume?: number; texts: { i: number; text: string }[]; colors: string[] };

const MARK = '<!--hf-edits-->', ORIGINAL = 'media/_original.mp4';
const bad = (m: string): never => { throw Object.assign(new Error(m), { user: true }); };
const num = (v: unknown, lo: number, hi: number, what: string) => v === undefined ? undefined : typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : bad(`${what} must be a number from ${lo} to ${hi}`);
const FAMILY = /^[\w ,'-]{1,60}$/, ID = /^[A-Za-z][\w-]{0,40}$/, HEXC = /^#[0-9a-f]{6}$/i;

const fontOf = (f: any, id: string) => Object.fromEntries(Object.entries({
  size: num(f?.size, 8, 600, 'size'), weight: num(f?.weight, 100, 900, 'weight'), italic: f?.italic === undefined ? undefined : !!f.italic,
  family: f?.family === undefined ? undefined : typeof f.family === 'string' && FAMILY.test(f.family) ? f.family : bad(`${id}: font family is a plain font name`),
}).filter(([, v]) => v !== undefined));

// Validation at the API boundary: these values end up inside HTML, CSS and a <script>.
export function checkLayers(doc: any): Layers {
  if (!doc || typeof doc !== 'object') bad('layers must be an object');
  const layers: Record<string, LayerEdit> = {};
  for (const [id, e] of Object.entries<any>(doc.layers ?? {})) {
    if (!ID.test(id)) bad(`layer id ${id}: letters, digits, - and _ only`);
    const pair = (g: any) => Array.isArray(g) && g.length === 2 && g.every(n => Number.isFinite(n) && n >= 0) && g[1] > g[0] ? [g[0], g[1]] as [number, number] : bad(`${id}: gaps are [start, end] pairs`);
    const texts = e.texts === undefined ? undefined : Array.isArray(e.texts) ? e.texts.map((t: any) =>
      Number.isInteger(t?.i) && t.i >= 0 && typeof t.from === 'string' && typeof t.to === 'string' && t.to.length <= 2000 ? { i: t.i, from: t.from, to: t.to } : bad(`${id}: texts are {i, from, to}`)) : bad(`${id}: texts must be an array`);
    layers[id] = Object.fromEntries(Object.entries({
      hidden: e.hidden === undefined ? undefined : !!e.hidden, original: e.original === undefined ? undefined : !!e.original,
      z: num(e.z, 0, 9999, 'z'),
      row: e.row === undefined ? undefined : typeof e.row === 'string' && /^[\w-]{1,20}$/.test(e.row) ? e.row : bad(`${id}: row must be a short word`),
      colors: e.colors === undefined ? undefined : Array.isArray(e.colors) && e.colors.length <= 60 && e.colors.every((c: any) => HEXC.test(c?.from) && HEXC.test(c?.to)) ? e.colors.map((c: any) => ({ from: c.from.toLowerCase(), to: c.to.toLowerCase() })) : bad(`${id}: colors are {from, to} as #rrggbb`),
      crop: e.crop === undefined ? undefined : Array.isArray(e.crop) && e.crop.length === 4 && e.crop.every((n: any) => Number.isFinite(n) && n >= 0 && n <= 100) ? e.crop as [number, number, number, number] : bad(`${id}: crop is [top, right, bottom, left] in %`),
      x: num(e.x, -10000, 10000, 'x'), y: num(e.y, -10000, 10000, 'y'), scale: num(e.scale, 0, 2000, 'scale'),
      rotation: num(e.rotation, -3600, 3600, 'rotation'), opacity: num(e.opacity, 0, 100, 'opacity'), volume: num(e.volume, 0, 4, 'volume'),
      start: num(e.start, 0, 36000, 'start'), duration: num(e.duration, 0.04, 36000, 'duration'), mediaStart: num(e.mediaStart, 0, 36000, 'mediaStart'),
      cuts: e.cuts === undefined ? undefined : Array.isArray(e.cuts) && e.cuts.every((n: any) => Number.isFinite(n) && n >= 0) ? e.cuts.slice(0, 500) : bad(`${id}: cuts must be seconds`),
      gaps: e.gaps === undefined ? undefined : Array.isArray(e.gaps) ? e.gaps.slice(0, 500).map(pair) : bad(`${id}: gaps must be an array`),
      texts,
      font: e.font === undefined ? undefined : fontOf(e.font, id),
    }).filter(([, v]) => v !== undefined));
  }
  const ids = new Set<string>();
  const added = (Array.isArray(doc.added) ? doc.added : doc.added === undefined ? [] : bad('added must be an array')).slice(0, 300).map((a: any): Added => {
    if (!ID.test(a?.id ?? '') || ids.has(a.id)) bad(`added layer id ${a?.id}: unique, letters, digits, - and _`);
    ids.add(a.id);
    if (!ADDED_KINDS.includes(a.kind)) bad(`${a.id}: kind must be one of ${ADDED_KINDS.join(', ')}`);
    if (['image', 'video', 'audio', 'model'].includes(a.kind) && !/^media\/[\w.-]+$/.test(a.src ?? '')) bad(`${a.id}: src must be media/<file>`);
    const str = (v: unknown, max: number) => v === undefined ? undefined : typeof v === 'string' && v.length <= max ? v : bad(`${a.id}: text too long`);
    const color = (v: unknown) => v === undefined ? undefined : typeof v === 'string' && /^(#[0-9a-f]{3,8}|transparent)$/i.test(v) ? v : bad(`${a.id}: colors are #hex`);
    return Object.fromEntries(Object.entries({
      id: a.id, kind: a.kind, name: str(a.name, 80), src: a.src,
      start: num(a.start, 0, 36000, 'start')!, duration: num(a.duration, 0.04, 36000, 'duration')!, track: num(a.track, 0, 99, 'track')!,
      mediaStart: num(a.mediaStart, 0, 36000, 'mediaStart'), text: str(a.text, 2000),
      lines: a.lines === undefined ? undefined : Array.isArray(a.lines) ? a.lines.slice(0, 2000).map((l: any) =>
        Number.isFinite(l?.t) && Number.isFinite(l?.end) && l.end > l.t && typeof l.text === 'string' ? { t: l.t, end: l.end, text: l.text.slice(0, 300) } : bad(`${a.id}: lines are {t, end, text}`)) : bad(`${a.id}: lines must be an array`),
      size: num(a.size, 8, 600, 'size'), weight: num(a.weight, 100, 900, 'weight'), italic: a.italic === undefined ? undefined : !!a.italic,
      family: a.family === undefined ? undefined : typeof a.family === 'string' && FAMILY.test(a.family) ? a.family : bad(`${a.id}: font family is a plain font name`), w: num(a.w, 10, 4000, 'w'),
      color: color(a.color), bg: color(a.bg), rights: checkRights(a.rights, a.id),
      anim: a.anim === undefined ? undefined : ['pop', 'slide', 'fade', 'type', 'none'].includes(a.anim) ? a.anim : bad(`${a.id}: anim must be pop, slide, fade, type or none`),
    }).filter(([, v]) => v !== undefined)) as Added;
  });
  const order = doc.order === undefined ? undefined : Array.isArray(doc.order) && doc.order.every((k: any) => typeof k === 'string' && /^[\w-]{1,20}$/.test(k)) ? doc.order.slice(0, 200) : bad('order must be track keys');
  return { layers, added, ...(order ? { order } : {}), ...(doc.kfSplit ? { kfSplit: true } : {}) };
}

// ---- HTML text runs: the visible text between tags (not in <script>/<style>), with the ids of the elements around it ----
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TOKEN = /<(script|style)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/gi;
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|#39|apos|nbsp);/gi, (_, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as any)[e.toLowerCase()]);
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Run = { i: number; text: string; ids: string[]; at: number; raw: string };
export function textRuns(html: string): Run[] {
  const runs: Run[] = [], stack: { tag: string; id: string }[] = [];
  for (const m of html.matchAll(TOKEN)) {
    const t = m[0];
    if (t[0] !== '<') {
      if (t.trim() && stack.length) runs.push({ i: runs.length, text: decode(t).trim(), ids: stack.map(s => s.id).filter(Boolean).reverse(), at: m.index!, raw: t });
      continue;
    }
    const close = /^<\/([\w-]+)/.exec(t), open = /^<([\w-]+)/.exec(t);
    if (close) {
      const k = stack.map(s => s.tag).lastIndexOf(close[1].toLowerCase());
      if (k >= 0) stack.length = k;
    } else if (open && !VOID.has(open[1].toLowerCase()) && !t.endsWith('/>')) {
      stack.push({ tag: open[1].toLowerCase(), id: /\sid="([^"]*)"/.exec(t)?.[1] ?? '' });
    }
  }
  return runs;
}

// edits a run by index when it still says what it said; otherwise the one run with that text; otherwise reports it
export function applyTexts(html: string, texts: Text[], warn: (m: string) => void) {
  const runs = textRuns(html), out: { at: number; raw: string; to: string }[] = [];
  for (const t of texts) {
    const r = runs[t.i]?.text === t.from ? runs[t.i] : runs.filter(r => r.text === t.from).length === 1 ? runs.find(r => r.text === t.from) : undefined;
    if (!r) { warn(`texto "${t.from.slice(0, 40)}" não existe mais na composição; a edição foi ignorada`); continue; }
    out.push({ at: r.at, raw: r.raw, to: r.raw.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, a, b) => a + encode(t.to) + b) });
  }
  for (const o of out.sort((a, b) => b.at - a.at)) html = html.slice(0, o.at) + o.to + html.slice(o.at + o.raw.length);
  return html;
}

// colors: #rrggbb only (rgb(), names and #rgb stay as they are); the palette of a layer is what its own markup uses
const HEX = /#[0-9a-f]{6}(?![0-9a-f])/gi;
export const colorsOf = (s: string) => [...new Set((s.match(HEX) ?? []).map(c => c.toLowerCase()))];
export function applyColors(s: string, cs: { from: string; to: string }[]) {
  const m = new Map(cs.map(c => [c.from.toLowerCase(), c.to]));
  return m.size ? s.replace(HEX, c => m.get(c.toLowerCase()) ?? c) : s;
}
// start and end of the element with this id, its whole markup (<style> and <script> inside included)
export function elementSpan(html: string, id: string): [number, number] | undefined {
  let depth = 0, start = -1;
  for (const m of html.matchAll(TOKEN)) {
    const t = m[0];
    if (t[0] !== '<' || /^<(script|style)\b/i.test(t) || t.startsWith('<!--')) continue;
    const close = /^<\/([\w-]+)/.exec(t), open = /^<([\w-]+)/.exec(t), single = !!open && (VOID.has(open[1].toLowerCase()) || t.endsWith('/>'));
    if (start < 0) {
      if (open && new RegExp(`\\sid="${id}"`).test(t)) { start = m.index!; if (single) return [start, start + t.length]; depth = 1; }
    } else if (close) { if (--depth === 0) return [start, m.index! + t.length]; }
    else if (open && !single) depth++;
  }
}

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/\s([\w:-]+)(?:="([^"]*)")?/g)].map(m => [m[1], m[2] ?? '']));
const setAttr = (tag: string, k: string, v: string) => new RegExp(`\\s${k}="[^"]*"`).test(tag)
  ? tag.replace(new RegExp(`(\\s${k}=")[^"]*"`), `$1${v}"`) : tag.replace(/\s*\/?>$/, m => ` ${k}="${v}"${m}`);
const openTag = (html: string, id: string) => new RegExp(`<[a-z][\\w-]*\\b[^>]*\\sid="${id}"[^>]*>`, 'i').exec(html);

// the element whose z-index decides a layer's stacking: its ancestor right under the root, when that one has an id
export function stackTarget(html: string, id: string) {
  const stack: { id: string; root: boolean; tag: string }[] = [];
  for (const m of html.matchAll(TOKEN)) {
    const t = m[0], close = /^<\/([\w-]+)/.exec(t), open = /^<([\w-]+)/.exec(t);
    if (close) { const k = stack.map(s => s.tag).lastIndexOf(close[1].toLowerCase()); if (k >= 0) stack.length = k; continue; }
    if (!open || t.startsWith('<!')) continue;
    const tid = /\sid="([^"]*)"/.exec(t)?.[1] ?? '';
    if (tid === id) {
      const r = stack.findIndex(s => s.root);
      return r >= 0 ? stack.slice(r + 1).find(s => s.id)?.id ?? id : id;
    }
    if (!VOID.has(open[1].toLowerCase()) && !t.endsWith('/>')) stack.push({ id: tid, root: /\sdata-composition-id="/.test(t), tag: open[1].toLowerCase() });
  }
  return id;
}

// The layers the editor shows: every clip of the root composition (data-start), plus the cards and captions of a card reel
// (no clips of their own: their windows come from edit.json).
export function listLayers(html: string, extra: Omit<Layer, 'texts' | 'clip' | 'colors'>[] = []): Layer[] {
  const rootId = /data-composition-id="([^"]+)"/.exec(html)?.[1];
  const runs = textRuns(html), out: Layer[] = [];
  for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\sdata-start="[^"]*"[^>]*>/gi)) {
    const a = attrs(m[0]), tag = m[1].toLowerCase();
    if (!a.id || a['data-composition-id'] === rootId) continue;
    const src = a.src || undefined, comp = a['data-composition-src'] || undefined, start = Number(a['data-start']) || 0;
    const kind = tag === 'video' ? (/cut/i.test(src ?? '') ? 'cutout' : /plate/i.test(src ?? '') ? 'plate' : 'video') : tag === 'audio' ? (/voice/i.test(a.id + src) ? 'voice' : /sfx/i.test(src ?? '') ? 'sfx' : 'audio')
      : comp ? (/^s\d/.test(a.id) ? 'title' : 'scene') : tag === 'img' ? 'image' : 'element';
    out.push({ id: a.id, kind, start, end: start + (Number(a['data-duration']) || 0), track: Number(a['data-track-index']) || 0, clip: true, src, comp,
      volume: a['data-volume'] ? Number(a['data-volume']) : undefined, texts: comp ? [] : runs.filter(r => r.ids[0] === a.id).map(({ i, text }) => ({ i, text })), colors: comp ? [] : colorsOf(html.slice(...(elementSpan(html, a.id) ?? [0, 0]))) });
  }
  for (const e of extra) if (openTag(html, e.id)) out.push({ ...e, clip: false, texts: runs.filter(r => r.ids.includes(e.id)).map(({ i, text }) => ({ i, text })), colors: colorsOf(html.slice(...(elementSpan(html, e.id) ?? [0, 0]))) });
  return out;
}

// phrases of up to 4 words for the simple captions, broken on a pause or the end of a sentence
export function captionLines(words: { text: string; start: number; end: number }[]) {
  const lines: { t: number; end: number; text: string }[] = [];
  let cur: typeof words = [];
  const flush = () => { if (cur.length) lines.push({ t: cur[0].start, end: cur[cur.length - 1].end, text: cur.map(w => w.text).join(' ') }); cur = []; };
  for (const w of words) {
    if (cur.length && (cur.length >= 4 || w.start - cur[cur.length - 1].end > 0.4)) flush();
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  return lines;
}

const css = (v: string) => v.replace(/[^#\w.%() -]/g, '');
function addedHtml(a: Added) {
  const z = 40 + a.track, base = `id="${a.id}" class="clip hf-add" data-start="${a.start}" data-duration="${a.duration}" data-track-index="${a.track + 10}"`;
  const box = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:${z}`;
  const font = `font-family:${a.family ? `'${a.family}',` : ''}inherit;font-size:${a.size ?? 96}px;font-weight:${a.weight ?? 800};${a.italic ? 'font-style:italic;' : ''}color:${css(a.color ?? '#ffffff')};text-align:center;line-height:1.05;white-space:pre-wrap;max-width:960px`;
  const pad = a.bg && a.bg !== 'transparent' ? `;background:${css(a.bg)};padding:.18em .45em;border-radius:.3em` : ';text-shadow:0 6px 24px rgba(0,0,0,.55)';
  const ms = a.mediaStart ? ` data-media-start="${a.mediaStart}"` : '';
  switch (a.kind) {
    case 'text': case 'title':
      return `<div ${base} style="${box}"><div class="in" style="${font}${pad}">${encode(a.text ?? '')}</div></div>`;
    case 'captions':
      return `<div ${base} style="${box};align-items:flex-end;padding-bottom:360px">${(a.lines ?? []).map((l, k) =>
        `<div class="in ln" id="${a.id}-l${k}" style="${font};position:absolute;bottom:360px;opacity:0${pad}">${encode(l.text)}</div>`).join('')}</div>`;
    case 'image':
      return `<div ${base} style="${box}"><img class="in" src="${a.src}" style="width:${a.w ?? 700}px;display:block"></div>`;
    case 'video':
      return `<div id="${a.id}-box" style="${box}"><video ${base}${ms} src="${a.src}" muted playsinline style="width:${a.w ?? 1080}px;display:block"></video></div>`;
    case 'audio':
      return `<audio ${base}${ms} src="${a.src}"></audio>`;
    case 'model':
      return `<div ${base} style="${box}"><canvas class="in hf-glb" data-src="${a.src}" width="${a.w ?? 900}" height="${a.w ?? 900}" style="width:${a.w ?? 900}px;height:${a.w ?? 900}px"></canvas></div>`;
  }
}

// what runs after the composition's own script, on its main timeline: gaps, entrance animations, captions, 3D
function editScript(d: Layers, visual: (id: string) => boolean) {
  const gaps = Object.entries(d.layers).filter(([id, e]) => e.gaps?.length && visual(id)).map(([id, e]) => [id, e.gaps]);
  const anims = d.added.filter(a => (a.kind === 'text' || a.kind === 'title') && (a.anim ?? (a.kind === 'title' ? 'pop' : 'none')) !== 'none')
    .map(a => [a.id, a.start, a.anim ?? 'pop']);
  const caps = d.added.filter(a => a.kind === 'captions').map(a => [a.id, a.start, (a.lines ?? []).map(l => [l.t, l.end])]);
  const models = d.added.filter(a => a.kind === 'model').map(a => [a.id, a.start, a.duration]);
  if (!gaps.length && !anims.length && !caps.length && !models.length) return '';
  const data = JSON.stringify({ gaps, anims, caps, models }).replace(/</g, '\\u003c');
  return `<script>(function(){var tl=window.__timelines&&window.__timelines.main;if(!tl||!window.gsap)return;var D=${data};
D.gaps.forEach(function(g){var el=document.getElementById(g[0]);if(!el)return;tl.set(el,{'--hfv':1},0);g[1].forEach(function(p){tl.set(el,{'--hfv':0},p[0]);tl.set(el,{'--hfv':1},p[1]);});});
D.anims.forEach(function(a){var el=document.querySelector('#'+a[0]+' .in');if(!el)return;var t=a[1]+0.001;
if(a[2]==='pop')tl.fromTo(el,{scale:.4,y:40,opacity:0},{scale:1,y:0,opacity:1,duration:.45,ease:'back.out(1.8)'},t);
else if(a[2]==='slide')tl.fromTo(el,{x:-160,opacity:0},{x:0,opacity:1,duration:.5,ease:'expo.out'},t);
else if(a[2]==='fade')tl.fromTo(el,{opacity:0},{opacity:1,duration:.4,ease:'none'},t);
else if(a[2]==='type'){var s=el.textContent;tl.fromTo({n:0},{n:0},{n:s.length,duration:Math.min(1.2,s.length*.04),ease:'none',onUpdate:function(){el.textContent=s.slice(0,Math.round(this.targets()[0].n));}},t);}});
D.caps.forEach(function(c){c[2].forEach(function(w,k){var el=document.getElementById(c[0]+'-l'+k);if(!el)return;tl.set(el,{opacity:1},w[0]);tl.set(el,{opacity:0},w[1]);});});
if(D.models.length&&window.THREE&&THREE.GLTFLoader){D.models.forEach(function(m){var cv=document.querySelector('#'+m[0]+' canvas');if(!cv)return;
var r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true,preserveDrawingBuffer:true}),sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(35,1,.01,100),g=new THREE.Group();
sc.add(g);sc.add(new THREE.HemisphereLight(0xffffff,0x444444,1.4));var dl=new THREE.DirectionalLight(0xffffff,1.6);dl.position.set(2,3,4);sc.add(dl);cam.position.set(0,0,3);
var draw=function(t){g.rotation.y=t*0.9;r.render(sc,cam);};
new THREE.GLTFLoader().load(cv.dataset.src,function(o){var b=new THREE.Box3().setFromObject(o.scene),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
o.scene.position.sub(c);g.scale.setScalar(1.6/Math.max(s.x,s.y,s.z));g.add(o.scene);draw(tl.time()-m[1]);});
var st={t:0};tl.fromTo(st,{t:0},{t:m[2],duration:m[2],ease:'none',onUpdate:function(){draw(st.t);}},m[1]);});}
})();</script>`;
}

// The composition with the edits: attributes on the clips, a stylesheet for transforms and switched-off layers, the added
// layers inside the root, and a script for gaps and animations. Pure: html in, html out.
export function applyEdits(html: string, d: Layers, warn: (m: string) => void = () => {}): string {
  const rootOpen = /<[a-z][\w-]*\b[^>]*\sdata-composition-id="[^"]+"[^>]*>/i.exec(html);
  if (!rootOpen) return html;
  // texts of the root file (cards, captions); the texts of a sub-composition are applied to its own file
  const rootTexts = Object.entries(d.layers).filter(([id]) => !/\sdata-composition-src="/.test(openTag(html, id)?.[0] ?? '')).flatMap(([, e]) => e.texts ?? []);
  if (rootTexts.length) html = applyTexts(html, rootTexts, warn);
  for (const [id, e] of Object.entries(d.layers)) {
    if (!e.colors?.length || /\sdata-composition-src="/.test(openTag(html, id)?.[0] ?? '')) continue;
    const sp = elementSpan(html, id);
    if (sp) html = html.slice(0, sp[0]) + applyColors(html.slice(sp[0], sp[1]), e.colors) + html.slice(sp[1]);
  }
  const at = /<[a-z][\w-]*\b[^>]*\sdata-composition-id="[^"]+"[^>]*>/i.exec(html)!;
  html = html.slice(0, at.index + at[0].length) + '\n' + d.added.map(addedHtml).join('\n') + html.slice(at.index + at[0].length);
  const known = (id: string) => !!openTag(html, id);
  const isAudio = (id: string) => /^<audio\b/i.test(openTag(html, id)?.[0] ?? '') || d.added.some(a => a.id === id && a.kind === 'audio');
  const rules: string[] = [];
  for (const [id, e] of Object.entries(d.layers)) {
    if (!known(id) && !d.added.some(a => a.id === id)) { warn(`a camada ${id} não existe mais na composição; as edições dela foram ignoradas`); continue; }
    const m = openTag(html, id);
    if (m) {
      let tag = m[0];
      const clip = /\sdata-start="/.test(tag);
      if (clip && e.start !== undefined) tag = setAttr(tag, 'data-start', String(e.start));
      if (clip && e.duration !== undefined) tag = setAttr(tag, 'data-duration', String(e.duration));
      if (clip && e.mediaStart !== undefined) tag = setAttr(tag, 'data-media-start', String(e.mediaStart));
      if (e.original && /^<video\b/i.test(tag)) tag = setAttr(tag, 'src', ORIGINAL);   // the AI's background is a blurred copy of it
      if (isAudio(id) || /^<video\b/i.test(tag)) {
        const vol = e.hidden && isAudio(id) ? 0 : e.volume;
        if (vol !== undefined) tag = setAttr(tag, 'data-volume', String(vol));
      }
      html = html.slice(0, m.index) + tag + html.slice(m.index + m[0].length);
    }
    if (isAudio(id)) continue;
    const p: string[] = [];
    if (e.x || e.y) p.push(`translate:${e.x ?? 0}px ${e.y ?? 0}px`);
    if (e.scale !== undefined && e.scale !== 100) p.push(`scale:${e.scale / 100}`);
    if (e.rotation) p.push(`rotate:${e.rotation}deg`);
    if ((e.opacity !== undefined && e.opacity !== 100) || e.gaps?.length) p.push(`filter:opacity(calc(var(--hfv,1)*${(e.opacity ?? 100) / 100}))`);
    if (e.hidden) p.push('display:none!important');
    if (e.font && Object.keys(e.font).length) {   // shortcut: one size/weight for every text inside the layer, not per run
      const f = e.font, q = [f.size && `font-size:${f.size}px`, f.weight && `font-weight:${f.weight}`, f.italic && 'font-style:italic', f.family && `font-family:'${f.family}',sans-serif`].filter(Boolean).map(x => x + '!important').join(';');
      rules.push(`#${id},#${id} *{${q}}`);
    }
    if (p.length) rules.push(`#${id}{${p.join(';')}}`);
    // the mask goes on the object itself: an added text or image is a full-frame box around its .in
    if (e.crop?.some(n => n > 0)) rules.push(`${d.added.some(a => a.id === id && a.kind !== 'video') ? `#${id} .in` : `#${id}`}{clip-path:inset(${e.crop.map(n => n + '%').join(' ')})}`);
    if (e.z !== undefined) rules.push(`#${stackTarget(html, id)}{z-index:${e.z}!important}`);
  }
  const three = d.added.some(a => a.kind === 'model')
    ? '<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script><script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js"></script>' : '';
  const tail = (rules.length ? `<style data-hf-edits>${rules.join('\n')}</style>` : '') + three + editScript(d, id => !isAudio(id));
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, tail + '</body>') : html + tail;
  return MARK + '\n' + html;
}

// ---- the files: <dir> is the live composition (compose/ or proj/), <proj> the project with layers.json and media/ ----
export function readLayers(proj: string): Layers {
  const f = join(proj, 'layers.json');
  return existsSync(f) ? checkLayers(JSON.parse(readFileSync(f, 'utf8'))) : { layers: {}, added: [] };
}
// the AI's own version of a file: a file without the marker is fresh AI output and becomes the pristine copy
function pristine(file: string) {
  const ai = file.replace(/\.html$/, '.ai.html');
  const cur = readFileSync(file, 'utf8');
  if (!cur.startsWith(MARK)) { writeFileSync(ai, cur); return cur; }
  return existsSync(ai) ? readFileSync(ai, 'utf8') : cur.slice(MARK.length + 1);
}
export function syncEdits(dir: string, proj: string) {
  const index = join(dir, 'index.html'), warnings: string[] = [];
  if (!existsSync(index)) return { warnings };
  const d = readLayers(proj), warn = (m: string) => warnings.push(m);
  const base = pristine(index);
  // media the user added: copied next to the composition (proj/ is rebuilt from scratch by build_reel.py)
  const media = join(proj, 'media');
  if (existsSync(media)) {
    mkdirSync(join(dir, 'media'), { recursive: true });
    for (const f of readdirSync(media)) {
      const to = join(dir, 'media', f);
      if (!existsSync(to) || statSync(to).size !== statSync(join(media, f)).size) copyFileSync(join(media, f), to);
    }
  }
  // the project's own master.mp4, for a background switched back to the original picture
  if (Object.values(d.layers).some(e => e.original) && existsSync(join(proj, 'master.mp4'))) {
    const to = join(dir, ORIGINAL);
    mkdirSync(dirname(to), { recursive: true });
    if (!existsSync(to) || statSync(to).size !== statSync(join(proj, 'master.mp4')).size) copyFileSync(join(proj, 'master.mp4'), to);
  }
  // sub-compositions: their texts are edited in their own files
  for (const m of base.matchAll(/<[a-z][\w-]*\b[^>]*\sid="([^"]+)"[^>]*\sdata-composition-src="([^"]+)"[^>]*>/gi)) {
    const file = join(dir, m[2]);
    if (!existsSync(file) || !file.startsWith(dir + '/')) continue;
    const texts = d.layers[m[1]]?.texts ?? [], colors = d.layers[m[1]]?.colors ?? [], marked = readFileSync(file, 'utf8').startsWith(MARK);
    if (!texts.length && !colors.length && !marked) continue;
    const src = pristine(file);
    writeFileSync(file, texts.length || colors.length ? MARK + '\n' + applyColors(applyTexts(src, texts, warn), colors) : src);
  }
  writeFileSync(index, applyEdits(base, d, warn));
  return { warnings };
}

// render.sh calls this after build_reel.py: node edits.ts <proj dir>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? bad('usage: node edits.ts <composition dir>');
  for (const w of syncEdits(dir, dirname(dir)).warnings) console.log(`edição: ${w}`);
}
