// Pure helpers for the pipeline: no I/O, so they are unit-tested in test/lib.test.ts.

export type Word = { text: string; start: number; end: number };
export type Span = [number, number];
export type Plan = { transcribe: 'whisper' | 'srt'; cut: 'tighten' | 'srt' | 'none' };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// SPEC §3 step 1: the shortcut matrix. Pre-edited skips cutting; an SRT replaces Whisper.
export function shortcutPlan(preEdited: boolean, hasSrt: boolean): Plan {
  return { transcribe: hasSrt ? 'srt' : 'whisper', cut: preEdited ? 'none' : hasSrt ? 'srt' : 'tighten' };
}

// Source-clip time -> time in the cut master (a time inside a removed gap lands on the join).
export function remapTime(t: number, spans: Span[], speed: number): number {
  let acc = 0;
  for (const [a, b] of spans) {
    if (t < a) break;
    if (t <= b) return r3((acc + t - a) / speed);
    acc += b - a;
  }
  return r3(acc / speed);
}

// The user's .srt with its cues moved to the cut master; a cue that was cut out entirely is dropped.
export function remapSrt(srt: string, spans: Span[], speed: number): string {
  const sec = (s: string) => { const [h, m, rest] = s.split(':'); return +h * 3600 + +m * 60 + +rest.replace(',', '.'); };
  const fmt = (t: number) => new Date(Math.round(t * 1000)).toISOString().slice(11, 23).replace('.', ',');
  const cues = srt.replace(/^\uFEFF/, '').trim().split(/\r?\n\s*\r?\n/).flatMap(block => {
    const m = block.match(/(\d\d:\d\d:\d\d[,.]\d{3}) --> (\d\d:\d\d:\d\d[,.]\d{3})\s*\n([\s\S]*)/);
    if (!m) return [];
    const a = remapTime(sec(m[1]), spans, speed), b = remapTime(sec(m[2]), spans, speed);
    return b - a < 0.05 ? [] : [[a, b, m[3].trim()] as const];
  });
  return cues.map(([a, b, text], i) => `${i + 1}\n${fmt(a)} --> ${fmt(b)}\n${text}`).join('\n\n') + '\n';
}

// Source-clip word times -> times in the cut master (spans in play order, then the speed-up).
// Replaces the fork's second Whisper pass over master.mp4: cut.py trims exactly at these spans.
export function remapWords(words: Word[], spans: Span[], speed: number): Word[] {
  const out: Word[] = [];
  let acc = 0;
  for (const [a, b] of spans) {
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      if (mid < a || mid > b) continue;
      out.push({ text: w.text, start: r3((acc + Math.max(w.start, a) - a) / speed), end: r3((acc + Math.min(w.end, b) - a) / speed) });
    }
    acc += b - a;
  }
  return out;
}

// Brand override for one project: objects merge, everything else (arrays included) replaces.
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(out[k], v);
  return out as T;
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// Output formats, in render order. The final step renders the ones picked, always in this order; null = invalid pick.
export const FORMATS = ['16:9', '9:16', '4:3', '1:1', '4:5'];
export function pickFormats(f: unknown): string[] | null {
  if (!Array.isArray(f) || !f.length || f.some(x => !FORMATS.includes(x))) return null;
  return FORMATS.filter(x => f.includes(x));
}

// Path segments that come from a URL or a request body (project, brand, icon ids).
export const safeId = (s: unknown): s is string => typeof s === 'string' && /^[\w][\w.-]{0,80}$/.test(s) && !s.includes('..');

// Cut-out windows of a format (format.json "janelas.cut": [[a, b], ["head", n], ["tail", n]], seconds): the speaker is cut out only there,
// the rest of the reel shows him in a panel or not at all. Clipped to the clip and merged when they touch; null = cut out everywhere.
export type CutSpec = Array<[number, number] | ['head' | 'tail', number]>;
export function cutWindows(spec: CutSpec | undefined | null, dur: number): Span[] | null {
  if (!spec) return null;
  const raw: Span[] = spec.map(w => w[0] === 'head' ? [0, w[1] as number] : w[0] === 'tail' ? [dur - (w[1] as number), dur] : [w[0], w[1]] as Span);
  const out: Span[] = [];
  for (const [a0, b0] of raw.map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(dur, Math.max(a, b))] as Span).sort((x, y) => x[0] - y[0])) {
    if (b0 <= a0) continue;
    const last = out[out.length - 1];
    if (last && a0 <= last[1]) last[1] = Math.max(last[1], b0); else out.push([a0, b0]);
  }
  return out;
}

// Rhythm toggle. every = something new on screen every N s; scene = min/max scene length; framing = speaker reframe every N s; hold = warn when the speaker sits still longer than N s.
// shortcut: lento and normal are first guesses, calibrate on the reference reel; dinamico is the pace every reel had before the toggle.
export type Pace = 'lento' | 'normal' | 'dinamico';
export const PACE: Record<Pace, { every: number; scene: [number, number]; framing: [number, number]; hold: number }> = {
  lento: { every: 3.5, scene: [3, 5], framing: [5, 7], hold: 8 },
  normal: { every: 2.2, scene: [2, 3.5], framing: [3, 5], hold: 6 },
  dinamico: { every: 1.5, scene: [1.2, 3], framing: [2, 4], hold: 4 },
};

// Who answers each question (SPEC-v9 §1). A skill locks format, look and rhythm; without one, format + style + rhythm toggle are independent
// (a style's paceHint is only the starting value of the toggle). Colours: site reference > the skill's locked hex > brand.
// The cut-out toggle off (state.recorte === false): the format keeps its layout but loses the cut-out shot, so RVM never runs.
// Ignored when the cut-out is the format's only speaker shot (Recorte): there the speaker would vanish.
export function semRecorte(f: any) {
  const planos: string[] = (f?.planos ?? ['cut', 'none']).filter((p: string) => p !== 'cut');
  if (!planos.some(p => p !== 'none')) return f;
  return { ...f, planos, janelas: null, semRecorte: true };
}
export function resolveChoices(i: { format: any; style?: any; skill?: any; pace?: Pace; site?: boolean; noBrand?: boolean; recorte?: boolean }) {
  const { style, skill, pace, site, noBrand } = i;
  const format = !skill && i.recorte === false ? semRecorte(i.format) : i.format;   // a skill locks the cut-out on
  // a skill locks the speaker shots even when it does not list them: the chosen format keeps only size and safe zones, the
  // speaker is cut out the whole reel (no Speech Screen windows, no panel) and the skill's framing says when
  // a skill cloned from a reel with nobody on camera (format.speaker false) is motion only: no speaker shot, no cut-out, like the Só Motion format
  const mudo = skill?.format?.speaker === false;
  if (skill) return {
    format: { ...format, janelas: null, panel: undefined, regras: mudo ? '' : skill.format?.camera?.framing ?? '', ...(skill.format?.planos ? {} : { planos: ['cut', 'none'] }), ...skill.format, ...(mudo ? { planos: ['none'] } : {}) },
    look: skill.look ?? null, rhythm: skill.rhythm ?? null,
    // colours: the site, then the chosen brand; with brand "Nenhuma" (or a skill that locks them) the skill's palette
    sources: { format: 'skill', look: 'skill', rhythm: 'skill', colors: site ? 'site' : skill.colorsLocked || noBrand ? 'skill' : 'brand' },
  };
  const hint: Pace | undefined = style?.paceHint && style.paceHint in PACE ? style.paceHint : undefined;
  return {
    format, look: style ?? null, rhythm: PACE[pace ?? hint ?? 'dinamico'],
    sources: { format: 'format', look: style ? 'style' : 'none', rhythm: pace ? 'toggle' : hint ? 'hint' : 'default', colors: site ? 'site' : 'brand' },
  };
}

// A cloned reel as a skill (SPEC-v9 §2.3): the flat style.json split into the three drawers. camera.framing and camera.transitions are how the
// speaker is shot (format); the rest of the camera, the palette, recipes and sounds are the look; pace and beats are the rhythm. A skill that does not
// know the reel's speaker shots leaves `format.planos` out, so the chosen format keeps deciding them.
export function styleToSkill(s: any) {
  const { id, name, description, camera, guide, motif, palette, motionRecipes, sfxRules, sfxGainDb, sfxForbidden, giantCase, speakerShadow, speaker,
    pace, beats, sfxPerMinute, clonedFrom, refineLog, ...rest } = s;
  const { framing, transitions, ...lookCam } = camera ?? {};
  return { id, name, description,
    format: { ...(framing || transitions ? { camera: { framing, transitions } } : {}), ...(speaker === false ? { speaker: false } : {}) },
    look: { guide, motif, palette, ...(camera ? { camera: lookCam } : {}), motionRecipes, sfxRules, sfxGainDb, sfxForbidden, giantCase, speakerShadow, ...rest },
    rhythm: { pace, beats, sfxPerMinute },
    colorsLocked: false, clonedFrom, ...(refineLog ? { refineLog } : {}) };
}
// ... and back: the flat shape styleBrief and the refine step read
export function skillAsStyle(k: any) {
  const { camera: lookCam, ...look } = k.look ?? {};
  const cam = { ...(lookCam ?? {}), ...(k.format?.camera ?? {}) };
  return { id: k.id, name: k.name, description: k.description, ...look, ...(Object.keys(cam).length || lookCam ? { camera: cam } : {}),
    ...(k.format?.speaker === false ? { speaker: false } : {}), pace: k.rhythm?.pace, beats: k.rhythm?.beats, sfxPerMinute: k.rhythm?.sfxPerMinute, clonedFrom: k.clonedFrom, ...(k.refineLog ? { refineLog: k.refineLog } : {}) };
}
// the look of a flat clone and nothing else: a style cloned "only for the visual" carries no shots, rhythm or origin
export function lookOnly(s: any) {
  const { beats: _b, pace: _p, sfxPerMinute: _s, clonedFrom: _c, refineLog: _r, speaker: _k, ...rest } = s;
  if (rest.camera) { const { framing: _f, transitions: _t, ...cam } = rest.camera; rest.camera = cam; }
  return rest;
}
// compose.json pace of a skill: its measured seconds per cut is `every`; the other limits follow the nearest toggle
export function paceFromSkill(k: any): (typeof PACE)[Pace] | null {
  const p = Number(k?.rhythm?.pace);
  if (!(p > 0)) return null;
  // shortcut: pace is seconds per CUT, and a continuous take (the 18 s Build) has few cuts yet many graphics, so `every` never gets slower than lento
  return { ...PACE[p <= 1.8 ? 'dinamico' : p <= 2.8 ? 'normal' : 'lento'], every: Math.min(p, PACE.lento.every) };
}

const luminance = (r: number, g: number, b: number) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** WCAG contrast of the text inside `box`, from two screenshots of the same frame (3 bytes per pixel, `w` px wide): `com` as rendered and
 *  `sem` with the text made transparent. A pixel is ink where the two differ; the text colour is read from `com` and the background under it from `sem`,
 *  on the half of the ink that differs most (antialiased edges stay out). null when under 3% of the box is ink: the text is hidden, covered or still entering. */
export function textContrast(com: Uint8Array, sem: Uint8Array, w: number, box: { x: number; y: number; w: number; h: number }): number | null {
  const ink: { d: number; a: number; b: number }[] = [], h = com.length / 3 / w;
  let n = 0;
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(h, box.y + box.h); y += 2) for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(w, box.x + box.w); x += 2) {
    const i = (y * w + x) * 3, d = Math.max(Math.abs(com[i] - sem[i]), Math.abs(com[i + 1] - sem[i + 1]), Math.abs(com[i + 2] - sem[i + 2]));
    n++;
    if (d >= 6) ink.push({ d, a: luminance(com[i], com[i + 1], com[i + 2]), b: luminance(sem[i], sem[i + 1], sem[i + 2]) });
  }
  if (n < 20 || ink.length < 0.03 * n) return null;
  const core = ink.sort((p, q) => q.d - p.d).slice(0, Math.ceil(ink.length / 2));
  const mid = (k: 'a' | 'b') => core.map(p => p[k]).sort((p, q) => p - q)[core.length >> 1];
  const fg = mid('a'), bg = mid('b');
  return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
}

// What we keep of a rea-video breakdown.json (github.com/JuneYaooo/rea-video, Apache 2.0): the cut times and one
// line per shot with its measured transition and element motion (time, box as fractions of the frame, direction, ease).
export function reaResumo(b: any): { cuts: number[]; texto: string } {
  const shots: any[] = Array.isArray(b?.shots) ? b.shots : [], n = (v: unknown) => +Number(v).toFixed(2);
  const linhas = shots.map(s => {
    const t = s.transition, evs: any[] = s.motion?.events ?? [];
    return `${n(s.start)}–${n(s.end)} s` + (t?.type && t.type !== 'cut' ? ` | enters by ${t.type}${t.direction ? ' ' + t.direction : ''} ${n(t.duration ?? 0)} s` : '') +
      evs.map(e => `\n  ${n(e.t0)}–${n(e.t1)} s ${e.kind} box x${n(e.box?.[0])} y${n(e.box?.[1])} w${n(e.box?.[2])} h${n(e.box?.[3])}` +
        (e.sweep ? ` unfolds ${e.sweep}` : e.slide ? ` slides ${e.slide}` : e.scale ? ' scales up' : '') + ` ${e.easing} ${e.colour ?? ''}`.trimEnd()).join('');
  });
  return { cuts: shots.slice(1).map(s => n(s.start)), texto: linhas.join('\n') };
}
