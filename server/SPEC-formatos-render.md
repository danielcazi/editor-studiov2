# SPEC: fazer o render aplicar os campos do `format.json`

Contexto para uma sessão nova. Leia também `CLAUDE.md` na raiz.

## 1. Estado atual (já feito, não refazer)

- `server/pipeline.ts`: função `formatGuide(st)` monta o guia criativo a partir de `workspace/formats/<id>/format.json` e injeta em `script` e `motion`. Typecheck e 24 testes passavam.
- Os 14 `format.json` foram revisados (10 estilos `order` 1–10 + 4 técnicos: `reel-9-16`, `feed-1-1`, `feed-portrait-4-5`, `youtube-16-9`). `fitted-captions` ganhou o campo `styleCatalog` (19 estilos).
- **Problema restante:** isso só orienta a IA. O render lê apenas `REEL_FORMAT` (resolução). Nada de `layout`, `cutout`, `camera`, `safeZones`, `editingStyle.punchIns`, `captionsStyle` chega ao vídeo.

## 2. Fatos do render (confirmados lendo `build_reel.py`, 522 linhas)

Arquivo: `claude-reel-editor/skills/reel-editor/scripts/build_reel.py`. Gera um projeto HyperFrames; `render.sh` o renderiza (`npx hyperframes@0.8.145 render`).

```
#cam (zoom/punch)
 ├─ #pan  → master.mp4 em tela cheia, segue o nariz
 └─ #back → cards "title" (por cima do vídeo)
#mid   → cards block/page/motion/custom
#front → cards, legendas
```

- Não existe camada atrás do locutor → recorte impossível hoje.
- O vídeo só aparece em tela cheia ou dentro de card (`block`, `page`), com `object-position` pelo nariz.
- Referências (linhas aproximadas): `_merge` 49, `ANIM` 52, `fit` 65, `nose_track()` 77, `centre(nx,ny,bw,bh)` 95, `objpos` 99, `mount(src)` 119, `font()` 152, `show(sel,a,b,fade)` 177, câmera/nariz 181–187, `edit.punch` ~190, `phrase_end` 200, dispatch `kind = c["type"]` 213, legendas 355–443, `package.json` 521.
- Tipos de card: `title, block, card, tag, cta, shot, image, sticker, page, motion, follow, custom`.
- `render.sh`: `REEL_FORMAT` → `--resolution portrait|landscape` (4:3 sem preset); `REEL_WORKERS` padrão 2; `--quality delivery`; mix final com `loudnorm` -14 LUFS.
- Ponto onde `REEL_FORMAT` é passado ao `render.sh` em `pipeline.ts`: ~linha 1662.
- `cutoutPerson(id, options?)` em `pipeline.ts` ~1899: extrai JPGs com ffmpeg, roda `swift tools/vision_cutout.swift framesDir cutoutDir first last`, grava PNG RGBA em `cutout/`, faz commit. Rota `POST /projects/:id/cutout` (`server.ts` linha 49). **Nunca é chamado automaticamente.** Em `pipeline.ts` ~880, `cutout` só aparece como texto no prompt do script.

**Não verificado (verificar primeiro):** se `auto_edit.py` já preenche `edit.punch`; se existe fluxo de ingest com dois vídeos (necessário ao Cut-out Backdrop); implementação de cada tipo de card além do dispatch.

## 3. Regras de produto (decididas pelo usuário)

- A marca (brand.md/brand.json) vence em cores, fontes, ícones, tom, estilo de legenda. O formato decide layout, estrutura, ritmo.
- Ritmo: algo muda na tela a cada ~2s; texto que precisa ser lido fica até a fala terminar.
- Quando o formato muda o layout, o vídeo do locutor continua sendo o `master.mp4` já cortado.

## 4. Entregas

### Passo 0: plumbing (≈10 linhas, `pipeline.ts`)

1. No ponto ~1662, ler `format.json` do projeto (mesma lógica de fallback de `formatGuide`: `st.formatId`, senão `business-reels`) e passar ao `render.sh` as env vars:
   - `REEL_LAYOUT` = `format.layout` (string, pode ser vazia)
   - `REEL_CUTOUT=1` se `format.cutout` for verdadeiro
   - `REEL_CAP_Y` derivado de `safeZones` (ver abaixo)
2. `render.sh` repassa as variáveis ao `build_reel.py` (verificar se o env é herdado; senão exportar).
3. Punch-ins: gerar `edit.punch` a partir de `editingStyle.punchIns` (`intervalSeconds`, `zoomScale`). Só depois de confirmar se `auto_edit.py` já faz isso; se faz, apenas alimentar os parâmetros do formato.
4. Câmera: ler `headroomPercent` e `zoomFactor` em `build_reel.py` nas linhas 181–187 (hoje ignorados).
5. Safe zones: ligar `CAP_Y` (posição vertical da legenda) ao `safeZones` do formato.

Pronto quando: um projeto com `youtube-16-9` e outro com `reel-9-16` produzem posição de legenda e punch diferentes.

### Passo 1: layout de painel (≈30 linhas, `build_reel.py`)

Sustenta Explainer Panel.

- `REEL_LAYOUT=bottom-panel-60-40`: `#pan` vira moldura ~1080×770 na base, cantos arredondados, `overflow:hidden`. `centre()` usa o tamanho da moldura em vez do canvas. Os 60% superiores ficam livres para cards `motion`/`custom`/`card` com `box`/`y`.
- Legenda na fronteira dos painéis (`CAP_Y` ≈ 1150 em 1080×1920).
- Ranking Format não precisa de layout novo (vídeo cheio + tabela como card `custom` embaixo; mudar apenas o valor de `layout` já feito para `tier-list-bottom`).
- Split Reel: card `page` precisa de variante 50/50 (vídeo de referência em cima, diagrama embaixo) **enquanto o vídeo de referência roda**. Interpretação ainda não confirmada com o usuário.

Pronto quando: render de um projeto Explainer Panel mostra locutor na faixa de baixo com cantos arredondados e o card de cima visível; layout vazio continua idêntico ao atual (regressão zero).

### Passo 2: recorte (o mais difícil)

- **2a. Spike (fazer antes de tudo):** testar se HyperFrames renderiza `.webm` com alfa (VP9 `yuva420p`). Se não, alternativas: sequência PNG ou máscara CSS. O resultado define 2b–2d.
- **2b.** Quando `format.cutout`, chamar `cutoutPerson` depois do corte final (`master.mp4`), com cache (como `nose.json`). Encodar um único vídeo com alfa e apagar os PNGs (~1800 quadros por 60s).
- **2c.** `build_reel.py`: nova camada `under` atrás do locutor (backdrop, texto atrás) e `#pan2` com o vídeo recortado por cima, mesma regra de nariz e punch.
- **2d.** Novo tipo de card `backdrop` `{src, dim}` (fundo gerado pela IA, ou vídeo de fundo enviado pelo usuário, que vira a base de todo o vídeo e dispensa imagens da IA).
- Serve: Business (modo locutor recortado), Personal, Image Cluster, Cut-out Backdrop, Fitted Captions (texto atrás do locutor).

### Passo 3: estilos tipográficos (depois)

Presets dos 19 estilos de `styleCatalog` (Fitted Captions) em `claude-reel-editor/skills/reel-editor/anim-presets.json`, usados por `ANIM` (linha 52) e `renderStyleAnim` em `ui.html`. Maior volume de design; cores ilustrativas, destaque sempre da marca.

## 5. Pendências menores

- `styleCatalog` e regras de ritmo ainda não entram em `motion:ask`, no ajuste de um card do `script:ask` nem em `askCard`.
- Os 4 formatos técnicos não têm `promptGuide` (provavelmente só ritmo/câmera/safe zones).
- Nenhum projeto real foi rodado para validar o efeito da mudança de prompt.

## 6. Riscos

- Recorte: peso e tempo do Vision (~1800 quadros) e uso de disco.
- Fluxo de dois vídeos pode não existir.
- `build_reel.py` não tem testes. Verificação = renderizar projeto de exemplo e inspecionar quadros (`ffmpeg -ss` em instantes-chave); manter um render de referência com `layout` vazio para comparar regressão.
- Não rodar render pesado sem confirmar `REEL_WORKERS`.

## 7. Ordem recomendada

Passo 0 → Passo 1 (entrega Explainer e Glass completos, baixo risco) → spike 2a → decidir 2b–2d → Passo 3.

Testes: `cd server && npm run check && npm test` após cada passo; toda lógica nova em TS vai em `lib.ts`/`validate.ts` com teste em `test/lib.test.ts`.
