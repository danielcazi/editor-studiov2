// API keys for the b-roll and voice providers. Kept in the user's home, never in the repo or the workspace (projects are git repos).
// shortcut: plain JSON with mode 0600, fine for one local user; move to the macOS Keychain if this ever leaves one machine.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { UserError } from './pipeline.ts';

export interface Provider { id: string; name: string; kind: 'broll' | 'voice'; needsKey: boolean; testable: boolean }

export const PROVIDERS: Provider[] = [
  { id: 'pexels', name: 'Pexels', kind: 'broll', needsKey: true, testable: true },
  { id: 'pixabay', name: 'Pixabay', kind: 'broll', needsKey: true, testable: true },
  { id: 'commons', name: 'Wikimedia Commons', kind: 'broll', needsKey: false, testable: true },
  { id: 'artlist', name: 'Artlist', kind: 'broll', needsKey: true, testable: false },
  { id: 'higgsfield', name: 'Higgsfield', kind: 'broll', needsKey: true, testable: false },
  { id: 'elevenlabs', name: 'ElevenLabs', kind: 'voice', needsKey: true, testable: true },
  { id: 'google_tts', name: 'Google Text-to-Speech', kind: 'voice', needsKey: true, testable: true },
];

// read on every call so tests (and a changed env) can point it elsewhere
const file = () => process.env.EDITOR_KEYS_FILE ?? join(homedir(), '.config', 'editor-7', 'keys.json');

function read(): Record<string, string> {
  try { return JSON.parse(readFileSync(file(), 'utf8')); } catch { return {}; }
}
function write(keys: Record<string, string>) {
  const f = file();
  mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
  writeFileSync(f, JSON.stringify(keys, null, 2), { mode: 0o600 });
  chmodSync(f, 0o600);   // writeFileSync keeps the old mode when the file already exists
}

const provider = (id: string) => PROVIDERS.find(p => p.id === id) ?? (() => { throw new UserError(`unknown provider ${JSON.stringify(id)}`); })();

/** For server-side use only (providers, scripts). Never send this to the UI. */
export const getKey = (id: string): string | undefined => read()[provider(id).id];

const mask = (k: string) => k.length <= 8 ? '••••' : `••••${k.slice(-4)}`;

export function listKeys() {
  const keys = read();
  return PROVIDERS.map(p => ({ ...p, hasKey: !!keys[p.id], masked: keys[p.id] ? mask(keys[p.id]) : null, file: file() }));
}

export function setKey(id: string, key: unknown) {
  const p = provider(id);
  if (!p.needsKey) throw new UserError(`${p.name} does not use a key`);
  if (typeof key !== 'string' || !key.trim()) throw new UserError('key is empty');
  if (/\s/.test(key.trim())) throw new UserError('key has spaces or line breaks: paste only the key');
  write({ ...read(), [p.id]: key.trim() });
  return listKeys();
}

export function deleteKey(id: string) {
  const p = provider(id), keys = read();
  delete keys[p.id];
  existsSync(file()) && write(keys);
  return listKeys();
}

// Error text from fetch can carry the URL, and Pixabay and Google take the key in the query string.
export const redact = (s: string, key?: string) => (key ? s.split(key).join('••••') : s).replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1••••');

const UA = 'Editor7/1.0 (local video editor)';   // Wikimedia asks for an identifying User-Agent

/** One cheap call to see if the key works. Returns {ok, message}; never throws, never echoes the key. */
export async function testKey(id: string) {
  const p = provider(id), key = getKey(p.id);
  if (p.needsKey && !key) return { ok: false, message: 'sem chave salva' };
  if (!p.testable) return { ok: true, message: 'chave salva; sem teste automático para este provedor' };
  const k = encodeURIComponent(key ?? '');
  const req: Record<string, [string, Record<string, string>]> = {
    pexels: ['https://api.pexels.com/v1/curated?per_page=1', { Authorization: key! }],
    pixabay: [`https://pixabay.com/api/?key=${k}&per_page=3`, {}],
    commons: ['https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json', {}],
    elevenlabs: ['https://api.elevenlabs.io/v1/user', { 'xi-api-key': key! }],
    google_tts: [`https://texttospeech.googleapis.com/v1/voices?key=${k}&languageCode=pt-BR`, {}],
  };
  const [url, headers] = req[p.id];
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) return { ok: true, message: 'conectada' };
    return { ok: false, message: r.status === 401 || r.status === 403 ? 'chave recusada' : `erro ${r.status}` };
  } catch (e) {
    return { ok: false, message: redact(`sem conexão: ${(e as Error).message}`, key) };
  }
}
