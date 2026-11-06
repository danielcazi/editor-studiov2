// Asset sources: search and download for Pexels, Pixabay, Wikimedia Commons, Openverse (CC images), Iconify (SVG icons) and Poly Pizza (CC0 3D models).
// Every result carries a stated license.
// Artlist and Higgsfield are not here: they have no public search/download API that we could confirm; see keys.ts.
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getKey } from './keys.ts';
import { UserError } from './pipeline.ts';
import type { Rights } from './edits.ts';

export type Kind = 'video' | 'image' | 'model';   // model: a .glb for three.js (obj3d in kit.py)
export interface Candidate {
  provider: string; id: string; kind: Kind; title: string; author: string;
  license: string; pageUrl: string; previewUrl: string; downloadUrl: string;
  width?: number; height?: number; duration?: number;
}
interface Source { id: string; needsKey: boolean; hosts: RegExp; search(q: string, kind: Kind, limit: number, key?: string): Promise<Candidate[]> }

const UA = 'Editor7/1.0 (local video editor)';
async function getJson(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new UserError(r.status === 401 || r.status === 403 ? 'chave recusada' : `erro ${r.status}`);
  return r.json() as Promise<any>;
}
const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
const text = (html: unknown) => String(html ?? '').replace(/<[^>]*>/g, '').trim();

const pexels: Source = {
  id: 'pexels', needsKey: true, hosts: /(^|\.)pexels\.com$/,
  async search(q, kind, limit, key) {
    const headers = { Authorization: key! };
    if (kind === 'image') {
      const j = await getJson(`https://api.pexels.com/v1/search?${qs({ query: q, per_page: limit, orientation: 'portrait' })}`, headers);
      return (j.photos ?? []).map((p: any): Candidate => ({ provider: 'pexels', id: String(p.id), kind, title: p.alt || q, author: p.photographer, license: 'Pexels License',
        pageUrl: p.url, previewUrl: p.src.medium, downloadUrl: p.src.large2x ?? p.src.original, width: p.width, height: p.height }));
    }
    const j = await getJson(`https://api.pexels.com/videos/search?${qs({ query: q, per_page: limit, orientation: 'portrait' })}`, headers);
    return (j.videos ?? []).flatMap((v: any): Candidate[] => {
      // the largest file that is not 4K: a reel is 1080 wide and 4K only makes the download slow
      const f = (v.video_files ?? []).filter((x: any) => x.file_type === 'video/mp4' && x.width <= 2160 && x.height <= 2160).sort((a: any, b: any) => b.width * b.height - a.width * a.height)[0];
      return f ? [{ provider: 'pexels', id: String(v.id), kind, title: q, author: v.user?.name ?? '', license: 'Pexels License', pageUrl: v.url,
        previewUrl: v.image, downloadUrl: f.link, width: f.width, height: f.height, duration: v.duration }] : [];
    });
  },
};

const pixabay: Source = {
  id: 'pixabay', needsKey: true, hosts: /(^|\.)pixabay\.com$/,
  async search(q, kind, limit, key) {
    if (kind === 'image') {
      const j = await getJson(`https://pixabay.com/api/?${qs({ key: key!, q, image_type: 'photo', orientation: 'vertical', per_page: Math.max(3, limit) })}`);
      return (j.hits ?? []).slice(0, limit).map((p: any): Candidate => ({ provider: 'pixabay', id: String(p.id), kind, title: p.tags, author: p.user, license: 'Pixabay Content License',
        pageUrl: p.pageURL, previewUrl: p.webformatURL, downloadUrl: p.largeImageURL, width: p.imageWidth, height: p.imageHeight }));
    }
    const j = await getJson(`https://pixabay.com/api/videos/?${qs({ key: key!, q, per_page: Math.max(3, limit) })}`);
    return (j.hits ?? []).slice(0, limit).flatMap((v: any): Candidate[] => {
      const f = v.videos?.large?.url ? v.videos.large : v.videos?.medium;
      return f?.url ? [{ provider: 'pixabay', id: String(v.id), kind, title: v.tags, author: v.user, license: 'Pixabay Content License', pageUrl: v.pageURL,
        previewUrl: `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg`, downloadUrl: f.url, width: f.width, height: f.height, duration: v.duration }] : [];
    });
  },
};

// Commons has no key, but each file carries its own license and author: read them from extmetadata, never assume.
const commons: Source = {
  id: 'commons', needsKey: false, hosts: /^upload\.wikimedia\.org$/,
  async search(q, kind, limit) {
    const j = await getJson(`https://commons.wikimedia.org/w/api.php?${qs({ action: 'query', format: 'json', generator: 'search', gsrnamespace: 6, gsrlimit: limit,
      gsrsearch: `${q} filetype:${kind === 'video' ? 'video' : 'bitmap'}`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 640 })}`);
    return Object.values<any>(j.query?.pages ?? {}).flatMap((p): Candidate[] => {
      const i = p.imageinfo?.[0], m = i?.extmetadata ?? {};
      if (!i) return [];
      return [{ provider: 'commons', id: String(p.pageid), kind, title: String(p.title).replace(/^File:/, ''), author: text(m.Artist?.value) || 'desconhecido',
        license: text(m.LicenseShortName?.value) || 'licença não informada', pageUrl: i.descriptionurl, previewUrl: i.thumburl ?? i.url, downloadUrl: i.url, width: i.width, height: i.height }];
    });
  },
};

// Openverse indexes CC and public-domain images from many hosts (Flickr, Wikimedia, museums); the file URL is on the original host.
// shortcut: hosts is open because the image lives wherever Openverse indexed it; tighten if the download ever goes beyond https
const openverse: Source = {
  id: 'openverse', needsKey: false, hosts: /./,
  async search(q, kind, limit) {
    if (kind !== 'image') return [];
    const j = await getJson(`https://api.openverse.org/v1/images/?${qs({ q, page_size: Math.min(limit, 20), license_type: 'commercial,modification' })}`);
    return (j.results ?? []).filter((r: any) => r.url).map((r: any): Candidate => ({ provider: 'openverse', id: String(r.id), kind, title: r.title || q, author: r.creator || 'desconhecido',
      license: `CC ${String(r.license).toUpperCase()}${r.license_version ? ` ${r.license_version}` : ''}`, pageUrl: r.foreign_landing_url || r.url, previewUrl: r.thumbnail || r.url, downloadUrl: r.url, width: r.width, height: r.height }));
  },
};

// Iconify: 200k SVG icons in sets, each set with its own license; the SVG is rendered by the API (color and size in the query).
const iconify: Source = {
  id: 'iconify', needsKey: false, hosts: /^api\.iconify\.design$/,
  async search(q, kind, limit) {
    if (kind !== 'image') return [];
    const j = await getJson(`https://api.iconify.design/search?${qs({ query: q, limit: Math.max(32, limit) })}`);
    return (j.icons ?? []).slice(0, limit).map((name: string): Candidate => {
      const [prefix, icon] = name.split(':'), col = j.collections?.[prefix] ?? {};
      return { provider: 'iconify', id: name, kind, title: `${col.name ?? prefix} / ${icon}`, author: col.author?.name ?? prefix, license: col.license?.title ?? 'ver coleção',
        pageUrl: `https://icon-sets.iconify.design/${prefix}/${icon}/`, previewUrl: `https://api.iconify.design/${prefix}/${icon}.svg?height=128`, downloadUrl: `https://api.iconify.design/${prefix}/${icon}.svg?height=512`, width: 512, height: 512 };
    });
  },
};

// Poly Pizza: low-poly CC0 / CC-BY models as .glb (free key from poly.pizza/settings/api). Field names follow the v1.1 API.
const polypizza: Source = {
  id: 'polypizza', needsKey: true, hosts: /(^|\.)poly\.pizza$/,
  async search(q, kind, limit, key) {
    if (kind !== 'model') return [];
    const j = await getJson(`https://api.poly.pizza/v1.1/search/${encodeURIComponent(q)}?${qs({ Limit: limit })}`, { 'X-Auth-Token': key! });
    return (j.results ?? []).filter((r: any) => r.Download).map((r: any): Candidate => ({ provider: 'polypizza', id: String(r.ID ?? r.id), kind, title: r.Title ?? q, author: r.Creator?.Username ?? '',
      license: r.Licence ?? r.License ?? 'CC0', pageUrl: `https://poly.pizza/m/${r.ID ?? r.id}`, previewUrl: r.Thumbnail ?? '', downloadUrl: r.Download }));
  },
};

export const SOURCES: Source[] = [pexels, pixabay, commons, openverse, iconify, polypizza];

/** Searches every source that has a key (Commons always). One source failing does not hide the others. */
export async function search(q: unknown, opts: { kind?: Kind; providers?: string[]; limit?: number } = {}) {
  if (typeof q !== 'string' || !q.trim()) throw new UserError('query is empty');
  const kind: Kind = opts.kind === 'image' || opts.kind === 'model' ? opts.kind : 'video', limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  const wanted = SOURCES.filter(s => !opts.providers || opts.providers.includes(s.id));
  if (!wanted.length) throw new UserError('no known provider in the list');
  const errors: Record<string, string> = {}, results: Candidate[] = [];
  await Promise.all(wanted.map(async s => {
    const key = getKey(s.id);
    if (s.needsKey && !key) return void (errors[s.id] = 'sem chave salva');
    try { results.push(...await s.search(q.trim(), kind, limit, key)); } catch (e) { errors[s.id] = (e as Error).message; }
  }));
  return { results, errors };
}

const MAX_BYTES = 500_000_000;
/** The URL comes from a candidate the page sent back, so it must still point at the provider's own host over https. */
export async function download(c: Candidate, dest: string) {
  const src = SOURCES.find(s => s.id === c.provider) ?? (() => { throw new UserError('unknown provider'); })();
  const u = new URL(c.downloadUrl);
  if (u.protocol !== 'https:' || !src.hosts.test(u.hostname)) throw new UserError(`download URL is not from ${src.id}`);
  const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok || !r.body) throw new UserError(`download failed (${r.status})`);
  if (Number(r.headers.get('content-length') ?? 0) > MAX_BYTES) throw new UserError('file is larger than 500 MB');
  await pipeline(Readable.fromWeb(r.body as any), createWriteStream(dest));
  return dest;
}

// ---- from a candidate to a clip in the lower band of the frame ----
const MEDIA_RE = /\.(mp4|webm|mov|jpe?g|png|webp|svg|glb)$/i;
/** The file extension the composition can play; null for anything else (ogv and the like are skipped). */
export const extOf = (c: Candidate) => { try { return MEDIA_RE.exec(new URL(c.downloadUrl).pathname)?.[0].toLowerCase() ?? null; } catch { return null; } };

const RANK: Record<string, number> = { pexels: 0, pixabay: 1, commons: 2 };
/** The best playable candidate: long enough first, then Pexels, Pixabay, Commons. */
export function pick(cands: Candidate[], need: number): Candidate | undefined {
  return cands.filter(c => extOf(c) && !(c.kind === 'video' && c.duration !== undefined && c.duration < 1.5))
    .sort((a, b) => Number((a.duration ?? Infinity) < need) - Number((b.duration ?? Infinity) < need) || (RANK[a.provider] ?? 9) - (RANK[b.provider] ?? 9))[0];
}

/** Pexels and Pixabay state their license; Commons does per file, and anything that is not CC or public domain stays flagged. */
export function rightsOf(c: Candidate): Rights {
  const ok = !['commons', 'openverse'].includes(c.provider) || /^(CC[ -]|CC0|public domain|PD)/i.test(c.license);
  return { status: ok ? 'licensed' : 'unlicensed', source: c.provider, license: c.license.slice(0, 300), author: c.author.slice(0, 300), url: c.pageUrl.slice(0, 300) };
}

// shortcut: a fixed band (86% of the width, 27% of the height) sitting just above the format's bottom safe zone; upgrade to read each beat's own layout
/** Width and vertical offset (from the frame centre) for a clip in the lower band. */
export function band(fmt: { width?: number; height?: number; visualAssets?: { safeZones?: { bottom?: number } } }, c: Candidate) {
  const W = fmt.width || 1080, H = fmt.height || 1920, bottom = fmt.visualAssets?.safeZones?.bottom ?? 380;
  const boxW = Math.round(W * 0.86), boxH = Math.round(H * 0.27), aspect = c.width && c.height ? c.width / c.height : 16 / 9;
  return { w: Math.max(10, Math.min(boxW, Math.round(boxH * aspect))), y: Math.max(0, Math.round(H - bottom - boxH / 2 - H / 2)) };
}
