# Editor 4.0: servidor

Servidor local (Node ≥ 23.6, TypeScript sem build) que roda as 5 etapas da SPEC sobre os scripts do fork.
UI em `http://127.0.0.1:4400/` (`ui.html`, sem build); a mesma API aceita curl. Escuta só em `127.0.0.1`.

```bash
# Claude Code instalado e logado (`claude` no PATH, ou CLAUDE_BIN=/caminho/claude)
# etapas 2, 3 (texto livre), 4 e o resumo do QA usam esse login; sem chave de API
cd server && npm install
npm start                                    # http://127.0.0.1:4400, workspace em ../workspace (ou WORKSPACE=...)
npm test                                     # matriz, spans/remap, validação do card custom, ícones, fontes, captionStyle, SRT
```

## Fluxo

```bash
H=http://127.0.0.1:4400
J='content-type: application/json'   # o servidor só aceita JSON em POST/PUT/DELETE (barra páginas de outros sites)
curl -H "$J" -X POST $H/brands -d '{"id":"padrao"}'                     # parte do exemplo do fork
curl -H "$J" -X POST $H/projects -d '{"name":"meu reel","video":"/caminho/clip.mp4","subtitle":"/caminho/clip.srt","preEdited":false,"brand":"padrao"}'
P=2026-10-20-meu-reel
curl -N $H/projects/$P/events &                                  # progresso (SSE)
curl -H "$J" -X POST $H/projects/$P/ingest                               # 1: sem LLM, segue a matriz de atalhos
curl -H "$J" -X POST $H/projects/$P/script                               # 2: Haiku segmenta, Opus escreve script.json
curl -H "$J" -X POST $H/projects/$P/brand -d '{"override":{"colors":{"main":"#222222"}}}'   # 3: ou {"text":"deixa mais sóbrio"}
curl -H "$J" -X POST $H/projects/$P/motion                               # 4: Opus compõe o reel em compose/ (sem render)
curl -H "$J" -X POST $H/projects/$P/final -d '{"formats":["16:9","9:16","4:3"]}'   # 5: render final + QA por formato (Full HD)
curl $H/projects/$P                                              # state.json: etapa, plano e log de custo por modelo
```

Outros: `PUT /projects/:id/script` (Manter/Mudar/Remover), `POST /projects/:id/brand/save-default`,
`PUT /brands/:id {brand, md}`, `GET /projects`, `GET /projects/:id/files/{script.json,preview.mp4,final-16-9.mp4,final-9-16.mp4,final-4-3.mp4}`,
`POST /brands/:id/icons {"name","tags","path"}` (SVG/PNG validados),
`POST /brands/:id/fonts {"role":"head|body|accent","file":"X.otf","data":"<base64>"}` ou `{"role","google":"Inter","weight":700}`
(.ttf/.otf/.woff2 conferidos pelos magic bytes, salvos em `brands/<id>/fonts/`), `GET /brands/:id/fonts/<arquivo>` (prévia da UI).

Legenda: `brand.json` `captionStyle` = `{preset: word-pop|karaoke|block|minimal, font: head|body|accent, size, color,
highlight, y, case: lower|upper|as-is, maxWords}`. Tudo opcional: sem `preset` fica o estilo do fork; campos vazios caem
em `captions`/`colors`.


Cada projeto tem o próprio git (`workspace/projects/<id>`): cada etapa e cada edição vira um commit.
