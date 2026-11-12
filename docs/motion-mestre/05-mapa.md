# 05 · O mapa: da fala ao mp4

Cada linha é um passo. `[M]` é decisão de motion; `[P]` é peneira (controle); `[H]` é o humano.

```
vídeo + legenda opcional
  │
  ├─ ingest (pipeline.ts)           transcribe.py (Whisper, tempos por palavra) · corte · master.mp4 · RVM cut.webm em paralelo · faceX da trilha do nariz
  │
  ├─ script  [M]  Opus             lê brand.md + formatGuide + DIRETOR.md + PACE
  │                                 → script.json: momentos com destaque, câmera + motivo, PLANO-ASSINATURA, respiração
  │                                 → fetchAssets: biblioteca do reel (assets/manifest.json)
  │
  ├─ [H] aprova o roteiro (Roteiro)  → POST /motion
  │
  ├─ composeScaffold (pipeline.ts:2640)
  │     copia kit.py, GUIDE.md, DIRETOR.md, engines/, motions/, sfx/, biblioteca, locutor, fontes da marca
  │     copia o banco → estilos/banco/   (banco.ts copyBancoTo)
  │     resolveChoices (lib.ts:99): formato · estilo · ritmo, ou skill travando os três
  │     escreve compose.json (W, H, DUR, faceX, planos, panel, cutWindows, pace, colors, giantCase, speakerShadow, layoutCheck)
  │     escreve brief.md (formato, ritmo, marca/site, estilo ou lista, biblioteca, momentos, BANCO por momento, transcript)
  │
  ├─ treatment  [M]  Opus (compose:treatment, medium)
  │                                 → treatment.md: estilo, benchmark, estruturas, arco, shot list (cam, world, peça, batida, vivo), som, anti-clichê
  │
  ├─ composeScaffold de novo (agora com cut.webm pronto)
  │
  ├─ compose  [M]  Opus (compose, high, ≤ 70 turnos)
  │     escreve scenes.py  ──►  python3 scenes.py
  │                               │  kit.py render():
  │                               │    [P] lint_static · world_track · lint_sfx · text-stroke · giant em front   (erro)
  │                               │    [P] hold · vizinhos · lint_variety · T() · lint_banco                    (aviso)
  │                               │    escreve index.html, compositions/, scenes.json, motion_mask.json
  │                               │    [P] layout_check.mjs no Chrome: rosto, queixo, zona segura, painel        (erro/aviso)
  │     [P] npx hyperframes check
  │     [P] snapshot + Read das folhas de contato (autoavaliação 1–10, ≤ 2 rodadas)
  │                                 → index.html novo (fresh) ou falha
  │
  ├─ [H] Revisão: <hyperframes-player> ao vivo · notas pinadas (review.json) · POST /review/apply → compose só nas cenas anotadas · Aprovar
  │
  ├─ final (pipeline.ts:2395)       render out.mp4 por formato
  │     [P] qa.py → pace.py (mudança no vídeo, parados, na palavra) · duração da marca · palavras perdidas
  │
  └─ Entrega: final-<formato>.mp4 · After Effects (ae/) · embrulhos
```

## Paralelo: Motion Think (gosto como código, antes do reel)

```
trecho de referência (upload ou URL)
  ├─ range → trecho.mp4 (≤ 60 s)
  ├─ mtAnalyze  [M] Opus      cortes de cena → movimentos 1–10 s → quadros 8 fps + folha de contato
  │                            → analysis.json (o que move, entrada/vida/saída, medidas, momento, categoria)
  ├─ [H] apontamento           gosto / nao-gosto / neutro · momento · categoria · tags · texto · pins · não levar
  │                            nao-gosto → negativo.md
  ├─ mtSynthesize  [M] Opus   composeScaffoldDemo (kit + engines + banco + locutor de acervo)
  │                            → helper.py (geometria fixa, 2–4 parâmetros) · proposta.md · scenes.py · demo.mp4
  ├─ [H] veredito por rodada   até 3; a 3ª reprovação para o movimento
  └─ approve                   [P] test/banco.test.ts  → estilos/banco/<helper>.py + .jpg + .md + banco.json
                               → entra em todo compose seguinte (kit.py carrega; brief lista; lint_banco avisa)
```

## Onde cada arquivo de regra é lido

| Arquivo | Lido por |
|---|---|
| `compose/DIRETOR.md` | roteiro (system prompt), diretor, compositor |
| `compose/GUIDE.md` | diretor, compositor |
| `brief.md` (gerado) | diretor, compositor |
| `treatment.md` | compositor |
| `compose.json` (gerado) | kit.py (constantes), layout_check.mjs |
| `format.json`, `style.json`, `skill.json` | composeScaffold → compose.json e brief |
| `estilos/<pack>.md` + `engines/*.js` | diretor (ESTILO.md), compositor (`engine=`) |
| `estilos/banco/*` | kit.py (import), brief (fotos), síntese do Motion Think (não duplicar) |
| `assets/sfx/manifest.json` | kit.py (`lint_sfx`), compositor (`onset`/`peak`) |
