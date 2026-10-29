// Indexa <raiz>/referencias/<cat>/*.mp4: duração, cortes (scene detect), folha de contato e nota ao lado.
// Cache por nome+tamanho+mtime: só reprocessa o que mudou. Uso: node tools/index_refs.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REFS = path.join(ROOT, 'referencias');
const IDX = path.join(REFS, '.index');
const CATS = ['edicao', 'lettering', 'motion'];
const EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });

const all = [];
for (const cat of CATS) {
  const dir = path.join(REFS, cat);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir).sort()) {
    if (!EXT.has(path.extname(f).toLowerCase())) continue;
    const file = path.join(dir, f), st = fs.statSync(file);
    const base = f.slice(0, -path.extname(f).length);
    const id = slug(base);
    const out = path.join(IDX, cat, id);
    const metaFile = path.join(out, 'meta.json');
    const sig = `${st.size}-${Math.round(st.mtimeMs)}`;
    const noteFile = ['.txt', '.md'].map((e) => path.join(dir, base + e)).find(fs.existsSync);
    const note = noteFile ? fs.readFileSync(noteFile, 'utf8').trim() : '';
    let meta; try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
    if (meta && meta.sig === sig) { if (meta.note !== note) { meta.note = note; fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2)); } all.push(meta); continue; }
    try {
      fs.mkdirSync(out, { recursive: true });
      const pr = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,r_frame_rate,codec_type', '-of', 'json', file]));
      const v = pr.streams.find((s) => s.codec_type === 'video') || {};
      const dur = parseFloat(pr.format.duration) || 0;
      // cortes: scene > 0.12 (showinfo escreve no stderr)
      const r = sceneLog(file);
      const cuts = [...r.matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2));
      // folha de contato: 12 quadros espaçados, 6x2, 270px de largura
      const n = 12, step = Math.max(dur / n, 0.1);
      run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `fps=1/${step.toFixed(3)},scale=270:-2,tile=6x2`, '-frames:v', '1', '-q:v', '4', path.join(out, 'sheet.jpg')]);
      meta = { id, cat, file: path.relative(ROOT, file), name: base, sig, dur: +dur.toFixed(2), w: v.width, h: v.height, fps: v.r_frame_rate,
        cuts, cutsPerMin: dur ? +(cuts.length / dur * 60).toFixed(1) : 0, sheet: path.relative(ROOT, path.join(out, 'sheet.jpg')), note };
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
      all.push(meta);
      console.log('indexado', cat, f, `${meta.dur}s`, `${cuts.length} cortes`);
    } catch (e) { console.error('falhou', f, String(e.message).slice(0, 200)); }
  }
}
fs.mkdirSync(IDX, { recursive: true });
fs.writeFileSync(path.join(IDX, 'index.json'), JSON.stringify({ updatedAt: new Date().toISOString(), items: all }, null, 2));
console.log(`banco de referências: ${all.length} vídeo(s)`);

function sceneLog(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', "select='gt(scene,0.12)',showinfo", '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return r.stderr || '';
}
