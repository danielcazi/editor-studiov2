// Trust boundary for everything a model (or the UI) writes into edit.json. build_reel.py trusts edit.json,
// so a card that fails here never reaches the render.

export const CARD_TYPES = ['shot', 'image', 'sticker', 'motion', 'follow', 'custom'] as const;

// Card types a format adds to the model's vocabulary: tier needs the Ranking table, backdrop needs the person cut-out,
// broll is the Personal Reels' own footage.
// Elsewhere build_reel.py skips them, so they are only offered where they render.
export function formatCardTypes(f: any): string[] {
  return [...CARD_TYPES, ...(f?.layout === 'tier-list-bottom' ? ['tier'] : []), ...(f?.cutout ? ['backdrop'] : []), ...(f?.layout === 'cutout-widgets' ? ['broll'] : [])];
}

const REQUIRED: Record<string, string[]> = {
  shot: ['src'],
  image: ['src'], backdrop: ['src'], tier: ['tier', 'text'], broll: ['src'], sticker: ['src'], motion: ['name'], follow: ['words'], custom: ['html'],
};

// custom cards: no network, no extra scripts, nothing non-deterministic (the same edit.json must render the same video)
const BANNED_MARKUP = [/<\s*(script|iframe|object|embed|link|meta|base|form|img|video|audio|foreignObject)\b/i, /\son\w+\s*=/i,
  /javascript:/i, /(https?:)?\/\/[\w-]/i, /url\s*\(/i, /@import/i, /\b(src|href)\s*=/i];
const BANNED_JS = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|import|require|eval|Function|setTimeout|setInterval|requestAnimationFrame|Math\.random|Date|performance|crypto|localStorage|sessionStorage|document|window|globalThis|navigator|location|this|constructor|__proto__|prototype|ownerDocument|defaultView|contentWindow)\b|\b(top|self|parent|frames)\b(?!\s*:)/;   // `top:` is a GSAP/CSS property
// shortcut: a word list, not a sandbox - `this`, `constructor` and the paths to `window` are banned because they were the way around it; upgrade to running the js in an isolated frame if Opus starts probing it
const MAX_CUSTOM = 100_000;

// Fields build_reel.py writes into inline CSS, JS and HTML attributes: they must be the right kind of value, never code.
const NUM_FIELDS = ['x', 'y', 'size', 'rotate', 'dim'], STR_FIELDS = ['text', 'top', 'bottom', 'title', 'label', 'name', 'bg', 'tier', 'framing', 'smear'];
const COLOR = /^(#[0-9a-f]{3,8}|var\(--[\w-]+\))$/i;
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');

export function validateFields(c: any): string[] {
  const e: string[] = [];
  for (const k of NUM_FIELDS) if (c[k] !== undefined && !finite(c[k])) e.push(`${k} must be a number`);
  for (const k of STR_FIELDS) if (c[k] !== undefined && typeof c[k] !== 'string') e.push(`${k} must be text`);
  if (c.color !== undefined && !(typeof c.color === 'string' && COLOR.test(c.color))) e.push('color must be a #hex or var(--token)');
  if (c.type === 'motion' && typeof c.name === 'string' && !/^[\w-]+$/.test(c.name)) e.push('motion name: letters, digits, - and _ only');
  if (c.box !== undefined && !(Array.isArray(c.box) && c.box.length === 4 && c.box.every(finite))) e.push('box must be [x, y, w, h] numbers');
  if (c.row_times !== undefined && !(Array.isArray(c.row_times) && c.row_times.every(finite))) e.push('row_times must be numbers');
  if (c.rows !== undefined && !strings(c.rows)) e.push('rows must be a list of text');
  if (c.src !== undefined && typeof c.src !== 'string' && !strings(c.src)) e.push('src must be a path or a list of paths');
  if (c.words !== undefined && !(Array.isArray(c.words) && c.words.every((w: any) => typeof w?.text === 'string'))) e.push('words must be a list of {text}');
  const sfx = c.sfx;
  if (sfx !== undefined && sfx !== false && !(sfx && typeof sfx === 'object' && /^\w+$/.test(sfx.name) && (sfx.db === undefined || finite(sfx.db)))) e.push('sfx must be false or {name, db}');
  return e;
}

export function validateCard(c: any, dur: number, palette: string[]): string[] {
  const e: string[] = [];
  if (!c || typeof c !== 'object') return ['card is not an object'];
  if (!CARD_TYPES.includes(c.type) && !['backdrop', 'tier', 'broll'].includes(c.type)) return [`unknown type ${JSON.stringify(c.type)}`];
  if (typeof c.start !== 'number' || c.start < 0) e.push('start must be a number >= 0');
  // always an explicit end: an open card can swallow every caption after it (REUSE.md, test finding 2)
  if (typeof c.end !== 'number' || !(c.end > c.start)) e.push('end must be a number after start');
  if (typeof c.end === 'number' && c.end > dur + 0.05) e.push(`end ${c.end} is past the video (${dur}s)`);
  for (const k of REQUIRED[c.type]) if (c[k] === undefined || c[k] === '' || (Array.isArray(c[k]) && !c[k].length)) e.push(`${c.type} needs ${k}`);
  if (c.type === 'custom') e.push(...validateCustom(c, palette));
  e.push(...validateFields(c));
  // tier: shown at start, slides into its row at end (the grade) and stays there; the slide takes 0.5 s
  if (c.type === 'tier' && !['S', 'A', 'B', 'C', 'D', 'F'].includes(c.tier)) e.push('tier must be one of S, A, B, C, D, F');
  if (c.type === 'tier' && c.end - c.start < 0.8) e.push('tier card needs at least 0.8 s before the grade');
  return e;
}

export function validateCustom(c: any, palette: string[]): string[] {
  const e: string[] = [];
  const html = String(c.html ?? ''), css = String(c.css ?? ''), js = String(c.js ?? '');
  if (html.length + css.length + js.length > MAX_CUSTOM) e.push(`custom card is over ${MAX_CUSTOM} characters`);
  for (const re of BANNED_MARKUP) if (re.test(html) || re.test(css)) e.push(`html/css not allowed: ${re}`);
  if (/<\/?style/i.test(html)) e.push('put styles in css, not in html');
  if (css.includes('@')) e.push('no @-rules in css (animate with GSAP; build_reel scopes plain rules only)');
  const bad = js.match(BANNED_JS);
  if (bad) e.push(`js not allowed: ${bad[0]} (only tl, T and el.querySelector*)`);
  if (js && !syntaxOk(js)) e.push('js does not parse');
  return e;
}

function syntaxOk(js: string) {
  try { new Function('tl', 'T', 'el', js); return true; } catch { return false; }   // parse only, never called
}

// Icons uploaded to a brand. PNG is checked by magic bytes; SVG is rendered by the browser, so it gets the markup rules.
export function validateIcon(name: string, bytes: Buffer): string[] {
  if (bytes.length > 2_000_000) return ['icon is over 2 MB'];
  if (/\.png$/i.test(name)) return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? [] : ['not a PNG file'];
  if (!/\.svg$/i.test(name)) return ['icons must be .svg or .png'];
  const svg = bytes.toString('utf8');
  if (!/<svg[\s>]/i.test(svg)) return ['not an SVG file'];
  const e: string[] = [];
  if (/<\s*(script|foreignObject|iframe|object|embed)\b/i.test(svg)) e.push('SVG contains script or embedded content');
  if (/\son\w+\s*=/i.test(svg) || /javascript:/i.test(svg)) e.push('SVG contains event handlers');
  if (/(href|src)\s*=\s*["']\s*(?!#)/i.test(svg) || /url\s*\(\s*['"]?\s*(?!#)/i.test(svg)) e.push('SVG references external content');
  return e;
}

// Fonts uploaded to a brand: extension and magic bytes must agree (the render's Chrome loads them).
const FONT_MAGIC: Record<string, string[]> = { ttf: ['00010000', '74727565'], otf: ['4f54544f'], woff2: ['774f4632'] };
export function validateFont(name: string, bytes: Buffer): string[] {
  const ext = /\.(ttf|otf|woff2)$/i.exec(name)?.[1].toLowerCase();
  if (!ext) return ['fonts must be .ttf, .otf or .woff2'];
  if (bytes.length > 3_000_000) return ['font is over 3 MB'];
  return FONT_MAGIC[ext].includes(bytes.subarray(0, 4).toString('hex')) ? [] : [`not a .${ext} file`];
}

// brand.json captionStyle (SPEC §2). Every field is optional; build_reel.py falls back to the fork's captions/colors keys.
export const CAPTION_PRESETS = [
  'word-pop',
  'karaoke',
  'block',
  'minimal',
  'scale-pop',
  'fade-word',
  'scale-fade',
  'slide-scale',
  'slide-word',
  'bounce',
  'blur-fade',
  'zoom-in',
  'headline-stack',
  'giant-word',
  'ribbon',
  'highlight-bar'
] as const;
export function validateCaptionStyle(cs: any): string[] {
  if (cs === undefined || cs === null) return [];
  if (typeof cs !== 'object' || Array.isArray(cs)) return ['captionStyle must be an object'];
  const e: string[] = [];
  if (cs.preset && !CAPTION_PRESETS.includes(cs.preset)) e.push(`captionStyle.preset: one of ${CAPTION_PRESETS.join(', ')} (or empty)`);
  if (cs.font && !['head', 'body', 'accent'].includes(cs.font)) e.push('captionStyle.font: head, body or accent');
  if (cs.case && !['lower', 'upper', 'as-is', 'capitalize'].includes(cs.case)) e.push('captionStyle.case: lower, upper, as-is or capitalize');
  for (const k of ['color', 'highlight']) if (cs[k] && !/^#[0-9a-f]{6}$/i.test(cs[k])) e.push(`captionStyle.${k} must be a #rrggbb hex`);
  const num = (k: string, lo: number, hi: number) => cs[k] === undefined || cs[k] === '' || cs[k] === 0 ||
    (Number.isInteger(cs[k]) && cs[k] >= lo && cs[k] <= hi) || e.push(`captionStyle.${k}: a whole number from ${lo} to ${hi}`);
  num('maxWords', 1, 8); num('size', 30, 220); num('y', 0, 1900);
  if (cs.anim !== undefined) e.push(...validateAnim(cs.anim));
  return e;
}

// captionStyle.anim (SPEC ajustes 4.1): closed vocabularies and numeric limits, so the render never gets code or a crash from it.
const IN_TYPES = ['pop', 'fade', 'scale', 'scale-fade', 'slide-scale', 'slide-up', 'slide-down', 'blur-in', 'typewriter', 'none'];
const EASE = /^((power[1-4]|expo|sine|circ)\.(in|out|inOut)|back\.out(\(\d(\.\d)?\))?|elastic\.out|linear|none)$/;
const FROM_LIMITS: Record<string, [number, number]> = { opacity: [0, 1], scale: [0, 3], x: [-400, 400], y: [-400, 400], rotation: [-360, 360], blur: [0, 40] };
export function validateAnim(a: any): string[] {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return ['captionStyle.anim must be an object'];
  const e: string[] = [], within = (path: string, v: unknown, lo: number, hi: number) =>
    (typeof v === 'number' && v >= lo && v <= hi) || e.push(`${path}: a number from ${lo} to ${hi}`);
  const one = (path: string, v: unknown, list: readonly string[]) => list.includes(v as string) || e.push(`${path}: one of ${list.join(', ')}`);
  if (a.unit !== undefined) one('anim.unit', a.unit, ['word', 'line', 'char']);
  if (a.hold !== undefined) one('anim.hold', a.hold, ['line', 'word']);
  if (a.stagger !== undefined) within('anim.stagger', a.stagger, 0, 1);
  if (a.maxWords !== undefined) within('anim.maxWords', a.maxWords, 1, 8);
  if (a.sizeMul !== undefined) within('anim.sizeMul', a.sizeMul, 0.3, 2);
  for (const k of ['box', 'accentWords']) if (a[k] !== undefined && typeof a[k] !== 'boolean') e.push(`anim.${k}: true or false`);
  for (const k of ['in', 'out']) {
    const t = a[k];
    if (t === undefined) continue;
    if (!t || typeof t !== 'object') { e.push(`anim.${k} must be an object`); continue; }
    if (t.type !== undefined) one(`anim.${k}.type`, t.type, k === 'in' ? IN_TYPES : ['fade', 'slide-up', 'slide-down', 'blur-in', 'pop', 'scale', 'none']);
    if (t.duration !== undefined) within(`anim.${k}.duration`, t.duration, 0, 2);
    if (t.delay !== undefined) within(`anim.${k}.delay`, t.delay, 0, 2);
    if (t.ease !== undefined && !(typeof t.ease === 'string' && EASE.test(t.ease))) e.push(`anim.${k}.ease: power1-4/expo/sine/circ .in/.out/.inOut, back.out, elastic.out or linear`);
    for (const [p, v] of Object.entries(t.from ?? {})) FROM_LIMITS[p] ? within(`anim.${k}.from.${p}`, v, ...FROM_LIMITS[p]) : e.push(`anim.${k}.from.${p}: unknown property`);
  }
  const act = a.active;
  if (act !== undefined) {
    if (!act || typeof act !== 'object') e.push('anim.active must be an object');
    else {
      if (act.type !== undefined) one('anim.active.type', act.type, ['color']);
      if (act.to && !/^(#[0-9a-f]{6}|@\w+)$/i.test(act.to)) e.push('anim.active.to: #rrggbb or an @token');
      if (act.scale !== undefined) within('anim.active.scale', act.scale, 0, 3);
      if (act.duration !== undefined) within('anim.active.duration', act.duration, 0, 2);
    }
  }
  return e;
}
