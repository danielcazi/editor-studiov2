// Local HTTP API + SSE progress. Bound to 127.0.0.1 only.
// shortcut: no auth and paths instead of uploads - local single user only; see SPEC §9 before exposing it anywhere.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pipeline } from 'node:stream';
import * as P from './pipeline.ts';
import * as K from './keys.ts';
import * as B from './broll.ts';
import * as V from './voice.ts';

process.chdir(import.meta.dirname);

const PORT = Number(process.env.PORT ?? 4400);
const MAX_BODY = 25_000_000;
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/, LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

const routes: [string, RegExp, (m: string[], body: any) => unknown][] = [
  ['GET', /^\/anim-presets$/, () => P.animPresets()],
  ['POST', /^\/broll\/search$/, (_, b) => B.search(b?.query, b)],
  ['GET', /^\/voices\/([^/]+)$/, m => V.listVoices(m[1])],
  ['POST', /^\/projects\/([^/]+)\/voice$/, (m, b) => P.speak(m[1], b)],
  ['GET', /^\/settings\/keys$/, () => K.listKeys()],
  ['PUT', /^\/settings\/keys\/([^/]+)$/, (m, b) => K.setKey(m[1], b?.key)],
  ['DELETE', /^\/settings\/keys\/([^/]+)$/, m => K.deleteKey(m[1])],
  ['POST', /^\/settings\/keys\/([^/]+)\/test$/, m => K.testKey(m[1])],
  ['GET', /^\/formats$/, () => P.listFormats()],
  ['GET', /^\/formats\/([^/]+)$/, m => P.getFormat(m[1])],
  ['POST', /^\/formats\/([^/]+)\/refine$/, (m, b) => P.refineFormat(m[1], b)],
  ['POST', /^\/formats\/clone$/, (_, b) => P.cloneFormat(b)],
  ['POST', /^\/formats$/, (_, b) => P.createFormat(b.id, b.format)],
  ['PUT', /^\/formats\/([^/]+)$/, (m, b) => P.updateFormat(m[1], b.format)],
  ['DELETE', /^\/formats\/([^/]+)$/, m => P.deleteFormat(m[1])],
  ['POST', /^\/projects\/([^/]+)\/ae$/, m => P.exportAfterEffects(m[1])],
  ['POST', /^\/projects\/([^/]+)\/embrulhos$/, m => P.generateHooks(m[1])],
  ['GET', /^\/brands$/, () => P.listBrands()],
  ['POST', /^\/brands$/, (_, b) => P.createBrand(b.id, b.brand, b.md)],
  ['POST', /^\/brands\/clone$/, (_, b) => P.cloneBrandWithOpus(b)],
  ['GET', /^\/brands\/([^/]+)$/, m => P.getBrand(m[1])],
  ['PUT', /^\/brands\/([^/]+)$/, (m, b) => P.updateBrand(m[1], b.brand, b.md)],
  ['POST', /^\/brands\/test$/, (_, b) => P.testClip(b.brand, b.project)],
  ['GET', /^\/brands\/([^/]+)\/md$/, m => P.getBrandMd(m[1])],
  ['POST', /^\/brands\/([^/]+)\/sync-md$/, (m, b) => P.syncBrandMarkdown(m[1], b.md)],
  ['GET', /^\/projects\/overview$/, () => P.listProjectsOverview()],
  ['GET', /^\/projects$/, () => P.listProjects()],
  ['GET', /^\/brands\/([^/]+)\/fonts$/, m => P.listBrandFonts(m[1])],
  ['GET', /^\/all-fonts$/, () => P.listAllFonts()],
  ['POST', /^\/brands\/([^/]+)\/fonts$/, (m, b) => P.addFont(m[1], b)],
  ['POST', /^\/brands\/([^/]+)\/characters\/([^/]+)\/poses$/, (m, b) => P.addPose(m[1], m[2], b.name, b.tags ?? [], b.path, b.description)],
  ['DELETE', /^\/brands\/([^/]+)\/characters\/([^/]+)$/, m => P.deleteCharacter(m[1], m[2])],
  ['DELETE', /^\/brands\/([^/]+)\/characters\/([^/]+)\/poses\/([^/]+)$/, m => P.deleteCharacter(m[1], m[2], m[3])],
  ['POST', /^\/brands\/([^/]+)\/icons$/, (m, b) => P.addIcon(m[1], b.name, b.tags ?? [], b.path)],
  ['POST', /^\/projects$/, (_, b) => P.createProject(b)],
  ['GET', /^\/projects\/([^/]+)$/, m => P.getProject(m[1])],
  ['GET', /^\/projects\/([^/]+)\/logs$/, m => P.getProjectLogs(m[1])],
  ['POST', /^\/projects\/([^/]+)\/log$/, (m, b) => P.logFromClient(m[1], b?.text)],
  ['POST', /^\/projects\/([^/]+)\/ingest$/, m => P.ingest(m[1])],
  ['POST', /^\/projects\/([^/]+)\/script$/, m => P.script(m[1])],
  ['PUT', /^\/projects\/([^/]+)\/script$/, (m, b) => P.putScript(m[1], b)],
  ['POST', /^\/projects\/([^/]+)\/brand$/, (m, b) => P.brandStep(m[1], b)],
  ['POST', /^\/projects\/([^/]+)\/brand\/save-default$/, m => P.saveBrandDefault(m[1])],
  ['POST', /^\/projects\/([^/]+)\/motion$/, m => P.motion(m[1])],
  ['POST', /^\/projects\/([^/]+)\/broll$/, m => P.brollFill(m[1])],
  ['POST', /^\/projects\/([^/]+)\/composer-mode$/, (m, b) => P.setComposerMode(m[1], b?.mode ?? 'agent')],
  ['POST', /^\/projects\/([^/]+)\/preview$/, m => P.renderPreview(m[1])],
  ['PUT', /^\/projects\/([^/]+)\/edit$/, (m, b) => P.putEdit(m[1], b)],
  ['POST', /^\/projects\/([^/]+)\/batch$/, (m, b) => P.batchEdit(m[1], b)],
  ['POST', /^\/projects\/([^/]+)\/cards\/(\d+)\/ask$/, (m, b) => P.askCard(m[1], Number(m[2]), b.instruction)],
  ['POST', /^\/projects\/([^/]+)\/final$/, (m, b) => P.final(m[1], b?.formats)],
  ['POST', /^\/projects\/([^/]+)\/formats$/, (m, b) => P.setFormats(m[1], b?.formats)],
  ['POST', /^\/projects\/([^/]+)\/complete$/, (m, b) => P.completeProject(m[1], b?.completed ?? true)],
  ['GET', /^\/projects\/([^/]+)\/review$/, m => P.getReview(m[1])],
  ['PUT', /^\/projects\/([^/]+)\/review$/, (m, b) => P.putReviewNotes(m[1], b.notes)],
  ['POST', /^\/projects\/([^/]+)\/review\/apply$/, m => P.applyReview(m[1])],
  ['POST', /^\/projects\/([^/]+)\/review\/build$/, m => P.buildReview(m[1])],
  ['GET', /^\/projects\/([^/]+)\/layers$/, m => P.getLayers(m[1])],
  ['PUT', /^\/projects\/([^/]+)\/layers$/, (m, b) => P.putLayers(m[1], b)],
  ['POST', /^\/projects\/([^/]+)\/media$/, (m, b) => P.addMedia(m[1], b.path)],
  ['GET', /^\/projects\/([^/]+)\/captions$/, m => P.captionDraft(m[1])],
  ['POST', /^\/projects\/([^/]+)\/cutout$/, (m, b) => P.cutoutPerson(m[1], b)],
  ['POST', /^\/projects\/([^/]+)\/compose$/, (m, b) => P.compose(m[1], typeof b?.note === 'string' ? b.note : undefined, typeof b?.mode === 'string' ? b.mode : undefined, typeof b?.format === 'string' ? b.format : undefined)],
  ['POST', /^\/projects\/([^/]+)\/compose-setup$/, m => P.composeScaffold(m[1])],
];

function events(id: string, res: ServerResponse) {
  P.getProject(id);   // 400 if it doesn't exist
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const off = P.subscribe(id, (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  const cur = P.getBusy(id);
  if (cur) res.write(`event: step\ndata: ${JSON.stringify({ step: cur.step, status: 'start', startedAt: cur.startedAt })}\n\n`);
  res.on('close', off);
}

const TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', glb: 'model/gltf-binary', aac: 'audio/aac', html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css',
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4' };
// mp4 with Range so the <video> can seek; also brand fonts, project JSON and the live composition's files
function file(path: string, req: IncomingMessage, res: ServerResponse) {
  const size = statSync(path).size, ext = path.split('.').pop()!.toLowerCase();
  const type = TYPES[ext] ?? `font/${ext}`;
  // pipeline (not .pipe) closes the file when the client goes away: seeking a video aborts many requests
  const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (!r) return void pipeline(createReadStream(path), res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }), () => {});
  const a = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2])), b = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
  if (a > b || a >= size) return void res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
  pipeline(createReadStream(path, { start: a, end: b }), res.writeHead(206, { 'content-type': type, 'content-length': b - a + 1, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }), () => {});
}
const UI = new URL('./ui.html', import.meta.url);

async function body(req: IncomingMessage) {
  req.setEncoding('utf8');   // chunk by chunk, a multi-byte letter (ç, ã) split at a chunk edge would turn into �
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new P.UserError('request body too large');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new P.UserError('body is not JSON'); }
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  try {
    // local-only: a web page elsewhere (or a DNS name rebound to 127.0.0.1) must not drive this server
    if (!LOCAL_HOST.test(req.headers.host ?? '')) throw new P.UserError('forbidden host');
    if (req.headers.origin && !LOCAL_ORIGIN.test(req.headers.origin)) throw new P.UserError('forbidden origin');
    // application/json is not CORS-safelisted: a cross-site page cannot send it without a preflight, which this server never answers
    if (req.method !== 'GET' && path !== '/upload' && !/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new P.UserError('content-type must be application/json');
    if (req.method === 'POST' && /^\/(pick-file|probe|upload)$/.test(path)) {
      const q = new URL(req.url!, 'http://x').searchParams;
      const b = path === '/upload' ? null : await body(req);
      const out = path === '/upload' ? await P.upload(q.get('kind')!, q.get('name')!, req) : path === '/probe' ? await P.probeMedia(b.paths || b.path) : await P.pickFile(b.kind);
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    }
    if (req.method === 'GET' && path === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(UI));
    if (req.method === 'GET' && path === '/gsap.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(P.GSAP));   // same file the render embeds
    const f = path.match(/^\/projects\/([^/]+)\/files\/([^/]+)$/);
    if (req.method === 'GET' && f) return file(P.projectFile(decodeURIComponent(f[1]), decodeURIComponent(f[2])), req, res);
    const lv = path.match(/^\/projects\/([^/]+)\/live\/(.+)$/);
    if (req.method === 'GET' && lv) return file(P.liveFile(decodeURIComponent(lv[1]), decodeURIComponent(lv[2])), req, res);
    const hf = path.match(/^\/hf\/([^/]+)$/);
    if (req.method === 'GET' && hf) return file(P.hfFile(hf[1]), req, res);
    const tc = path.match(/^\/tests\/([^/]+)\/final\.mp4$/);
    if (req.method === 'GET' && tc) return file(P.testFile(decodeURIComponent(tc[1])), req, res);
    const ff = path.match(/^\/brands\/([^/]+)\/fonts\/([^/]+)$/);
    if (req.method === 'GET' && ff) return file(P.fontFile(decodeURIComponent(ff[1]), decodeURIComponent(ff[2])), req, res);
    const cp = path.match(/^\/brands\/([^/]+)\/characters\/([^/]+)\/([^/]+)$/);
    if (req.method === 'GET' && cp) return file(P.poseFile(decodeURIComponent(cp[1]), decodeURIComponent(cp[2]), decodeURIComponent(cp[3])), req, res);
    const ev = path.match(/^\/projects\/([^/]+)\/events$/);
    if (req.method === 'GET' && ev) return events(decodeURIComponent(ev[1]), res);
    for (const [method, re, fn] of routes) {
      const m = path.match(re);
      if (m && req.method === method) {
        const out = await fn(m.map(decodeURIComponent), await body(req));
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
        return;
      }
    }
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
  } catch (e) {
    const user = e instanceof P.UserError;
    if (!user) console.error(e);
    if (!res.headersSent) res.writeHead(user ? 400 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Editor 7.0 server on http://127.0.0.1:${PORT} (workspace: ${P.WS})`));
