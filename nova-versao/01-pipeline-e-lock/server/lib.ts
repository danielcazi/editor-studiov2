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

// Batch edit of edit.json, the part that needs no model. Accent marks and field edits go first, while the indices are still the
// ones the person saw; deletions go last (deleteCards), highest index first, so the other cards keep their place.
export type EditItem = { type: string; cardIndex?: number; card?: any; captionIndex?: number; wordIndex?: number; accent?: boolean };
export function applyDirectEdits(edit: any, items: EditItem[]) {
  for (const it of items) {
    if (it.type === 'word_accent') {
      const cap = edit.captions?.[Number(it.captionIndex)], wi = Number(it.wordIndex);
      if (!cap?.words?.[wi]) continue;
      if (it.accent !== false) for (const w of cap.words) w.accent = false;   // spec: one accent word per caption
      cap.words[wi].accent = it.accent !== false;
    } else if (it.type === 'card_edit') {
      const idx = Number(it.cardIndex);
      if (edit.cards?.[idx] && it.card) edit.cards[idx] = { ...edit.cards[idx], ...it.card };
    }
  }
}
export function deleteCards(edit: any, items: EditItem[]) {
  const idx = [...new Set(items.filter(i => i.type === 'card_delete').map(i => Number(i.cardIndex)))].sort((a, b) => b - a);
  for (const i of idx) if (i >= 0 && i < edit.cards.length) edit.cards.splice(i, 1);
}
