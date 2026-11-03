// Synthetic voices (ElevenLabs, Google Text-to-Speech). Only the connection: nothing in the pipeline calls this yet, and each call spends
// the user's own credits, so it only runs when a route asks for it.
import { getKey, redact } from './keys.ts';
import { UserError } from './pipeline.ts';

export interface Voice { id: string; name: string; language?: string; gender?: string; preview?: string }
export const VOICE_PROVIDERS = ['elevenlabs', 'google_tts'] as const;
const MAX_CHARS = 5000;

const need = (p: string) => {
  if (!(VOICE_PROVIDERS as readonly string[]).includes(p)) throw new UserError(`unknown voice provider ${JSON.stringify(p)}`);
  return getKey(p) ?? (() => { throw new UserError('sem chave salva para este provedor: cole em Configurações → Chaves de API'); })();
};

async function call(url: string, key: string, init: RequestInit = {}) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    if (r.ok) return r;
    throw new UserError(r.status === 401 || r.status === 403 ? 'chave recusada' : `erro ${r.status}: ${redact((await r.text()).slice(0, 200), key)}`);
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError(redact(`sem conexão: ${(e as Error).message}`, key));
  }
}

export async function listVoices(provider: string, language = 'pt-BR'): Promise<Voice[]> {
  const key = need(provider);
  if (provider === 'elevenlabs') {
    const j = await (await call('https://api.elevenlabs.io/v1/voices', key, { headers: { 'xi-api-key': key } })).json() as any;
    return (j.voices ?? []).map((v: any): Voice => ({ id: v.voice_id, name: v.name, gender: v.labels?.gender, language: v.labels?.language, preview: v.preview_url }));
  }
  const j = await (await call(`https://texttospeech.googleapis.com/v1/voices?${new URLSearchParams({ key, languageCode: language })}`, key)).json() as any;
  return (j.voices ?? []).map((v: any): Voice => ({ id: v.name, name: v.name, gender: v.ssmlGender?.toLowerCase(), language: v.languageCodes?.[0] }));
}

/** One MP3 for the text. `language` is only used by Google (a Google voice name already carries it). */
export async function synthesize(provider: string, o: { text: unknown; voice: unknown; language?: string }): Promise<Buffer> {
  const key = need(provider);
  if (typeof o.text !== 'string' || !o.text.trim()) throw new UserError('text is empty');
  if (o.text.length > MAX_CHARS) throw new UserError(`text is longer than ${MAX_CHARS} characters`);
  if (typeof o.voice !== 'string' || !/^[\w.-]{1,80}$/.test(o.voice)) throw new UserError('voice is required (an id or name from the voice list)');
  if (provider === 'elevenlabs') {
    const r = await call(`https://api.elevenlabs.io/v1/text-to-speech/${o.voice}?output_format=mp3_44100_128`, key, {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ text: o.text, model_id: 'eleven_multilingual_v2' }) });
    return Buffer.from(await r.arrayBuffer());
  }
  const language = o.language ?? /^[a-z]{2,3}-[A-Z]{2}/.exec(o.voice)?.[0] ?? 'pt-BR';
  const r = await call(`https://texttospeech.googleapis.com/v1/text:synthesize?${new URLSearchParams({ key })}`, key, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { text: o.text }, voice: { languageCode: language, name: o.voice }, audioConfig: { audioEncoding: 'MP3' } }) });
  const audio = ((await r.json()) as any).audioContent;
  if (typeof audio !== 'string') throw new UserError('o Google não devolveu áudio');
  return Buffer.from(audio, 'base64');
}

const MAX_TOTAL = 30_000;

/** Splits at sentence ends into pieces of at most `max` characters; a single sentence longer than that is cut at a space. */
export function chunkText(text: string, max = MAX_CHARS - 500): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*\s*/g) ?? []) {
    for (let rest = s; rest; ) {
      let piece = rest;
      if (piece.length > max) { const at = piece.lastIndexOf(' ', max); piece = piece.slice(0, at > 0 ? at : max); }
      rest = rest.slice(piece.length);
      if (cur.length + piece.length > max && cur) { out.push(cur.trim()); cur = ''; }
      cur += piece;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** One MP3 for a script of any length (up to 30k characters): one call per chunk, buffers joined (MP3 frames concatenate). */
export async function synthesizeLong(provider: string, o: { text: unknown; voice: unknown; language?: string }): Promise<Buffer> {
  if (typeof o.text !== 'string' || !o.text.trim()) throw new UserError('text is empty');
  if (o.text.length > MAX_TOTAL) throw new UserError(`text is longer than ${MAX_TOTAL} characters`);
  const parts: Buffer[] = [];
  for (const text of chunkText(o.text)) parts.push(await synthesize(provider, { ...o, text }));
  return Buffer.concat(parts);
}
