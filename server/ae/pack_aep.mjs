#!/usr/bin/env node
// Torna o projeto do After Effects independente de links e de outros jobs.
//   node editor-studio/tools/ae/pack_aep.mjs <id>           só relata: links simbólicos, tamanho, fontes usadas
//   node editor-studio/tools/ae/pack_aep.mjs <id> --copy    copia filme/ae (seguindo os links) e o .aep para videos/<id>/out/pacote-ae/
// Motivo: filme/assets/seq e mseq são links para o filme de outro job; apagar o outro job quebra o .aep.
import { readdirSync, lstatSync, readlinkSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const id = process.argv[2];
if (!id) { console.error('uso: pack_aep.mjs <job-id> [--copy]'); process.exit(2); }
const job = join(REPO, 'videos', id);
const filme = join(job, 'filme');
const links = [];
const walk = (p, depth = 0) => {
  for (const f of readdirSync(p)) {
    if (f === 'node_modules' || f === 'out') continue;
    const q = join(p, f); const st = lstatSync(q);
    if (st.isSymbolicLink()) links.push({ de: q.replace(REPO + '/', ''), para: readlinkSync(q), existe: existsSync(q) });
    else if (st.isDirectory() && depth < 3) walk(q, depth + 1);
  }
};
if (existsSync(filme)) walk(filme);
const du = (p) => (existsSync(p) ? spawnSync('du', ['-shL', p], { encoding: 'utf8' }).stdout.split('\t')[0] : '—');
console.log(`filme/ae: ${du(join(filme, 'ae'))} · filme/assets (com links): ${du(join(filme, 'assets'))}`);
if (links.length) { // agrupa por pasta: sequências têm milhares de links
  const g = new Map();
  for (const l of links) { const d = dirname(l.de); const x = g.get(d) || { n: 0, quebrados: 0, ex: l.para }; x.n++; if (!l.existe) x.quebrados++; g.set(d, x); }
  console.log('links simbólicos:');
  for (const [d, x] of g) console.log(`  ${x.quebrados ? '✗ ' + x.quebrados + ' QUEBRADO(S)' : '✓'} ${d}: ${x.n} link(s), ex.: → ${x.ex}`);
}
else console.log('sem links simbólicos');
const rep = join(filme, 'ae', 'ae_report.json');
if (existsSync(rep)) { const r = JSON.parse(readFileSync(rep, 'utf8')); if (r.fontes) console.log('fontes usadas (instale antes de abrir):', [].concat(r.fontes).join(', ')); }
if (!process.argv.includes('--copy')) process.exit(links.some((l) => !l.existe) ? 1 : 0);

const dest = join(job, 'out', 'pacote-ae');
mkdirSync(dest, { recursive: true });
const cp = (a, b) => spawnSync('cp', ['-RL', a, b], { stdio: 'inherit' }).status === 0;
if (existsSync(join(filme, 'ae'))) cp(join(filme, 'ae'), join(dest, 'ae'));
for (const f of existsSync(join(job, 'out')) ? readdirSync(join(job, 'out')) : []) if (f.endsWith('.aep') || f === 'final.mp4') cp(join(job, 'out', f), join(dest, f));
console.log(`pacote em ${dest.replace(REPO + '/', '')} (${du(dest)}). Abra o .aep de dentro dele; os links foram trocados por cópias.`);
