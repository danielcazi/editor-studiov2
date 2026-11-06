// Trust boundary for what the UI and the models write into a brand: icons, fonts and the caption style.

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

// brand.json captionStyle (SPEC §2). Every field is optional.
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

// format.json (SPEC-v9 §2.1): a palette of speaker shots plus an agenda. `cam` of every scene() in the kit is one of PLANOS.
export const PLANOS = ['cut', 'panel', 'panel-top', 'raw', 'none', 'react'];
export function validateFormat(f: any): string[] {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['formato: objeto esperado'];
  const e: string[] = [];
  if (!Array.isArray(f.planos) || !f.planos.length) e.push('planos: lista não vazia');
  else {
    for (const p of f.planos) if (!PLANOS.includes(p)) e.push(`plano desconhecido: ${p} (use ${PLANOS.join(', ')})`);
    if (f.speaker === false && f.planos.some((p: string) => p !== 'none')) e.push('formato sem locutor só pode ter o plano none');
    if (f.planos.some((p: string) => p === 'panel' || p === 'panel-top') && !(f.panel?.top > 0 && f.panel.top < 1)) e.push('panel.top: fração de 0 a 1 da altura (planos panel e panel-top)');
  }
  if (f.janelas != null) {
    const cut = f.janelas.cut;
    if (!Array.isArray(cut)) e.push('janelas.cut: lista de [início, fim] ou ["head"|"tail", segundos]');
    else for (const w of cut) {
      const ok = Array.isArray(w) && w.length === 2 && typeof w[1] === 'number' && w[1] > 0 &&
        (w[0] === 'head' || w[0] === 'tail' || (typeof w[0] === 'number' && w[0] >= 0 && w[1] > w[0]));
      if (!ok) e.push(`janela inválida: ${JSON.stringify(w)}`);
    }
    if (Array.isArray(cut) && cut.length && !f.planos?.includes('cut')) e.push('janelas.cut sem o plano cut');
  }
  if (f.regras != null && typeof f.regras !== 'string') e.push('regras: texto');
  return e;
}
