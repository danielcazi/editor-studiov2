// Pure helpers for the pipeline: no I/O, so they are unit-tested in test/lib.test.ts.

export type Word = { text: string; start: number; end: number };
export type Span = [number, number];
export type Plan = { transcribe: 'whisper' | 'srt'; cut: 'tighten' | 'srt' | 'none' };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// SPEC §3 step 1: the shortcut matrix. Pre-edited skips cutting; an SRT replaces Whisper.
export function shortcutPlan(preEdited: boolean, hasSrt: boolean): Plan {
  return { transcribe: hasSrt ? 'srt' : 'whisper', cut: preEdited ? 'none' : hasSrt ? 'srt' : 'tighten' };
}

// SRT-guided cut: keep the spoken stretches, drop any gap between words longer than `gap`, `air` seconds either side.
export function spansFromWords(words: Word[], gap: number, air: number, dur: number): Span[] {
  const spans: Span[] = [];
  for (const w of words) {
    const last = spans.at(-1);
    if (last && w.start - last[1] <= gap) last[1] = w.end;
    else spans.push([w.start, w.end]);
  }
  return spans.map(([a, b]) => [r3(Math.max(0, a - air)), r3(Math.min(dur, b + air))]);
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
export function resolveChoices(i: { format: any; style?: any; skill?: any; pace?: Pace; site?: boolean }) {
  const { format, style, skill, pace, site } = i;
  if (skill) return {
    format: { ...format, ...skill.format }, look: skill.look ?? null, rhythm: skill.rhythm ?? null,
    sources: { format: 'skill', look: 'skill', rhythm: 'skill', colors: site ? 'site' : skill.colorsLocked ? 'skill' : 'brand' },
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
  const { id, name, description, camera, guide, motif, palette, motionRecipes, sfxRules, sfxGainDb, sfxForbidden, giantCase, speakerShadow,
    pace, beats, sfxPerMinute, clonedFrom, refineLog, ...rest } = s;
  const { framing, transitions, ...lookCam } = camera ?? {};
  return { id, name, description,
    format: framing || transitions ? { camera: { framing, transitions } } : {},
    look: { guide, motif, palette, ...(camera ? { camera: lookCam } : {}), motionRecipes, sfxRules, sfxGainDb, sfxForbidden, giantCase, speakerShadow, ...rest },
    rhythm: { pace, beats, sfxPerMinute },
    colorsLocked: false, clonedFrom, ...(refineLog ? { refineLog } : {}) };
}
// ... and back: the flat shape styleBrief and the refine step read
export function skillAsStyle(k: any) {
  const { camera: lookCam, ...look } = k.look ?? {};
  const cam = { ...(lookCam ?? {}), ...(k.format?.camera ?? {}) };
  return { id: k.id, name: k.name, description: k.description, ...look, ...(Object.keys(cam).length || lookCam ? { camera: cam } : {}),
    pace: k.rhythm?.pace, beats: k.rhythm?.beats, sfxPerMinute: k.rhythm?.sfxPerMinute, clonedFrom: k.clonedFrom, ...(k.refineLog ? { refineLog: k.refineLog } : {}) };
}
// the look of a flat clone and nothing else: a style cloned "only for the visual" carries no shots, rhythm or origin
export function lookOnly(s: any) {
  const { beats: _b, pace: _p, sfxPerMinute: _s, clonedFrom: _c, refineLog: _r, ...rest } = s;
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
