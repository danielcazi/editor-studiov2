// Mede as `zonasTexto` das proporções 4:5 e 16:9 de cada modelo e grava no manifesto (formatos[prop].zonasTexto): o que a moldura
// desenha por cima da janela do vídeo, em frações do quadro. Rodar depois de mexer no css de um modelo: node scripts/zonas-embrulhos.ts
// A 9:16 fica com as zonas anotadas à mão em `zonasTexto`, na raiz do manifesto.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarEmbrulho, EMB, fecharNavegador, listarEmbrulhos, type Prop, renderCamadas } from '../embrulhos.ts';

const tmp = mkdtempSync(join(tmpdir(), 'zonas-')), r4 = (v: number) => +v.toFixed(4);
for (const id of listarEmbrulhos()) {
  const m = carregarEmbrulho(id), arq = join(EMB, id, 'manifest.json'), man = JSON.parse(readFileSync(arq, 'utf8'));
  for (const prop of (Object.keys(m.formatos) as Prop[]).filter(p => p !== '9x16')) {
    const campos = { ...Object.fromEntries(m.campos.map(c => [c.id, c.padrao || c.id])), perfil_nome: 'Sua marca', perfil_arroba: '@suamarca' };
    const { caixas = [] } = await renderCamadas(m, campos, { prop, destino: join(tmp, `${id}-${prop}`) }), s = m.formatos[prop]!.slots.video;
    man.formatos[prop].zonasTexto = caixas.filter(c => !/^(slot|quadro|div|sombra|rosa)/.test(c.k)).map(c => {
      const x = Math.max(c.x, s.x), y = Math.max(c.y, s.y), w = Math.min(c.x + c.w, s.x + s.w) - x, h = Math.min(c.y + c.h, s.y + s.h) - y;
      return { x: r4(x), y: r4(y), w: r4(w), h: r4(h) }; }).filter(z => z.w > 0 && z.h > 0 && z.w * z.h > 0.002);
    console.log(id, prop, JSON.stringify(man.formatos[prop].zonasTexto));
  }
  writeFileSync(arq, JSON.stringify(man, null, 2) + '\n');
}
await fecharNavegador(); rmSync(tmp, { recursive: true, force: true });
