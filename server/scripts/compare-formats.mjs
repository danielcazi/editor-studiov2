#!/usr/bin/env node
// Compara os formatos: corta um vídeo em N segundos e cria um projeto por formato visível, rodando a ingestão de cada um em sequência.
//
//   node server/scripts/compare-formats.mjs <video> [--seconds 10] [--brand <id>] [--server http://127.0.0.1:4400] [--name compara]
//
// Precisa do servidor no ar (./start.sh). Depois de rodar, cada projeto fica no Roteiro: aprove o roteiro de cada um na UI
// (ou rode com --motion para o script aprovar e disparar a Revisão sozinho). Formatos com refVideo (Reação) usam o mesmo corte como vídeo de reação.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i === -1 ? d : args[i + 1]; };
const flag = k => args.includes(`--${k}`);
const VALUED = ['seconds', 'brand', 'server', 'name'];
const video = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(args[i - 1].replace(/^--/, ''))));
const SECONDS = Number(opt('seconds', 10)), SERVER = opt('server', 'http://127.0.0.1:4400'), NAME = opt('name', 'compara');
if (!video || !existsSync(video)) { console.error('uso: node server/scripts/compare-formats.mjs <video> [--seconds 10] [--brand id] [--server url] [--motion]'); process.exit(1); }

const api = async (method, path, body) => {
  const r = await fetch(SERVER + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

// 1. corte de N segundos (reencodado, para o corte cair no frame certo), ao lado do vídeo original
const dir = resolve(video, '..', 'compara'); mkdirSync(dir, { recursive: true });
const clip = resolve(dir, `${basename(video, extname(video))}-${SECONDS}s.mp4`);
if (!existsSync(clip)) {
  console.log(`✂️  Cortando ${SECONDS} s de ${basename(video)} → ${clip}`);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-t', String(SECONDS), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', clip], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ffmpeg falhou'); process.exit(1); }
}

// 2. marca e formatos
const brands = await api('GET', '/brands');
const brand = opt('brand', brands[0]);
if (!brands.includes(brand)) { console.error(`marca ${brand} não existe; marcas: ${brands.join(', ')}`); process.exit(1); }
const formatIds = await api('GET', '/formats');
const formats = await Promise.all(formatIds.map(id => api('GET', `/formats/${id}`)));
console.log(`🎨 Marca ${brand} · ${formats.length} formatos: ${formats.map(f => f.id).join(', ')}`);

// 3. um projeto por formato (o nome vira o id com a data: AAAA-MM-DD-compara-<formato>)
const created = [];
for (const f of formats) {
  const name = `${NAME}-${f.id}`;
  try {
    const st = await api('POST', '/projects', { name, video: clip, preEdited: true, brand, formatId: f.id, ...(f.refVideo ? { reactVideo: { path: clip } } : {}) });
    created.push(st.id); console.log(`✅ ${st.id}`);
  } catch (e) { console.error(`❌ ${name}: ${e.message}`); }
}

// 4. ingestão em sequência (Whisper e o recorte pesam; dois ao mesmo tempo só atrasam os dois). O servidor encadeia o roteiro.
const wait = async id => { for (;;) { const o = (await api('GET', '/projects/overview')).find(p => p.id === id); if (!o?.running) return o; await new Promise(r => setTimeout(r, 3000)); } };
for (const id of created) {
  console.log(`⏳ Ingestão: ${id}`);
  try { await api('POST', `/projects/${id}/ingest`); } catch (e) { console.error(`❌ ${id}: ${e.message}`); continue; }
  await wait(id); await new Promise(r => setTimeout(r, 2000)); const o = await wait(id);   // ingest, then the chained script step
  console.log(`   → ${o?.step} (${o?.stepLabel ?? ''})`);
  if (flag('motion')) { try { await api('POST', `/projects/${id}/motion`); await wait(id); console.log('   → Revisão pronta'); } catch (e) { console.error(`   ❌ motion: ${e.message}`); } }
}

console.log('\nProjetos para comparar:');
for (const id of created) console.log(`  ${SERVER}/#/p/${id}`);
if (!flag('motion')) console.log('\nAprove o roteiro de cada um na UI (ou rode de novo com --motion para ir direto à Revisão).');
