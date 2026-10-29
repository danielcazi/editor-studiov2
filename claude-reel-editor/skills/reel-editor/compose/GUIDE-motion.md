# Guia do compositor (Só Motion)

Reel 100% de animação e infográfico: **não há locutor na tela**. A voz (`assets/voice.m4a`) é só a trilha de narração. Você compõe cena a cena em HyperFrames 0.8.192 + GSAP 3.14.2. `brief.md` diz o quê; este guia diz como. A liberdade criativa é sua: o `kit.py` é ponto de partida, não limite. Pode escrever HTML/SVG/JS próprio em `back`/`front`.

## Referência visual
`ref_site/` tem capturas do site da marca e `ref_site/site.md` tem paleta, fonte e textos. Olhe as imagens com Read antes de escrever. Reproduza a linguagem do site (fundo preto, títulos em âmbar grosso, cards arredondados e inclinados em cores vivas, balão como logo), não copie o layout de página.

## Fluxo
1. Leia `brief.md`, `ref_site/site.md` e `assets/transcript.json` (cada corte cai numa palavra).
2. Escreva `scenes.py`: `from kit import *`, chamadas `scene(n, a, b, bg, None, back=..., front=...)` (câmera sempre `None`), `render()` no fim. Rode `python3 -B scenes.py`.
3. `npx --yes hyperframes@0.8.192 check --json > check.json` (meta: 0 erros), depois `npx --yes hyperframes@0.8.192 snapshot --at "<meio de cada cena>" --no-end -o snaps` e olhe as folhas de contato com Read.
4. Corrija o que viu e repita. Só então renderize: `npx --yes hyperframes@0.8.192 render -o out.mp4 --fps 30 --quality delivery`.

## O que NÃO existe neste modo
Sem `cut.webm`, sem `plate.mp4`, sem enquadramentos M/L/XL/XXL, sem regras de rosto/braço/queixo. Ignore o que o roteiro falar do locutor.

## Regras de layout
1. Cada cena ocupa a tela inteira: nenhum quadro vazio ou meio vazio. Hierarquia clara: um elemento dominante e apoio menor.
2. Infográficos de verdade: números que contam, barras e linhas que se desenham, comparações, listas que se preenchem, diagramas, mapas de trilhas. O dado vem da fala.
3. Texto não sobrepõe texto. A mesma palavra gigante nunca aparece duas vezes seguidas.
4. Zonas seguras: topo 200, base 380, laterais 70 px para texto importante.
5. Ritmo: algo novo a cada ~1,5 s; cena de 1,2 a 3 s; nunca o mesmo tipo de cena duas vezes seguidas; gancho forte nos 3 primeiros segundos; cortes secos ou transição curta (≤0,3 s).
6. CTA final: botão grande e URL legível.

## Estilos prontos do kit
Helpers testados (cada um devolve `(html, js)`; junte com `both(...)`; `at` é relativo ao início da cena; `k=` separa duas instâncias na mesma cena). Use como ponto de partida, não em toda cena: um estilo novo por cena, sem repetir o mesmo dois seguidos.
- **Tipografia estrutural** (palavras com papel físico): `lintel` palavra-viga que aperta a frase numa fresta · `hang` palavra descida por cabos que verga a base · `column` palavra que sobe e gira até virar coluna · `platform` palavras anteriores formam um piso justificado e a final assenta nele · `aperture` parede com a palavra cuja letra vira íris e abre a cena (no início da cena; escolha uma letra do meio da palavra) · `phrase` frase que sobe por máscara em grupos (`|`).
- **Vídeo como código**: `slam` uma palavra por batida, a última invertida · `code` editor digitado com sintaxe · `diff` linhas +/− · `count` número que conta e pousa · `braces` assinatura `{ TÍTULO }` · `typeline` linha monoespaçada digitada.
- **UI que se transforma**: `morph` um objeto que passa por estados sem corte · `iris` revelação circular de uma camada · `flood` cor inundando a tela · `glass` painel de vidro que nasce como gota · `pay` botão → loader → check · `toggle` · `tabs` abas com indicador líquido · `island` ilha dinâmica no topo · `toast` · `cmdk` paleta ⌘K que filtra · `widget` card de métrica com gráfico.
- **Textura e sinal**: `scope` osciloscópio: o feixe varre um traço de 10×8 e deixa cauda de fósforo · `papel` recorte de papel: duas folhas entram girando com sombra dura e borda serrilhada · `crt` glitch RGB sobre linhas de varredura, com tremor em passos fixos · `frame` moldura de edição: rótulo e timecode que conta no topo, cantos e régua de progresso embaixo (vá em `front`, acima do locutor).
- **Abertura e letreiro**: `flap` placa split-flap · `outline` palavra desenhada em contorno e preenchida · `bento` grade de recursos · `title_seq` título de abertura com letras se fechando e faixa de luz.
- `stack_rise` pilha de cartões: o mestre gira para o verso e até dois cartões de trás abrem em leque (`master`, `back`, `rear`).
- `hud_lens` lente HUD: anel de marcas giratórias, cantoneiras nos cantos e linhas de dados em sequência (`title`, `rows`).
- `bars_3d` barras pseudo-3D que crescem pela base, com reflexo no chão; a mais alta sai em destaque (`values`, `labels` opcional).
- `grid_net` rede: linhas saem do centro até os nós, cada nó entra na ponta e o centro pulsa no fim (`hub`, `nodes`).
- `chat_sim` conversa com IA: mensagem entra, três pontos pulsam e a resposta é digitada letra a letra (`user`, `answer`).
- `steps3` três cards empilhados que sobem em sequência, cada um com número, título e texto (`items`, até 3).
- `slide_head` divisor que desce, rótulo, título que entra deslizando e subtítulo opcional (`eyebrow`, `headline`, `sub`).
- `phone_alert` título que cai do topo e celular que sobe com um alerta deslizando para dentro da tela (`title`, `alert`).
- `compare_bars` duas barras crescendo do mesmo chão, cinza (antes) e âmbar (depois), com valor acima de cada uma (`a`, `b` como `(valor, rótulo)`).
- **Movimento medido (reimplementado)**: `ripple` (`colors` em anéis que crescem do centro, uma cor por anel) · `zoom_through` (cartão de `cw` px que cresce em escala log até preencher a tela; `inner` é o quadro inteiro da próxima cena, centrado) · `follow` (`inner` seguido por mola amortecida; `knots` = [(t, dx, dy)] em px do repouso) · `carousel_loop` (`items` em esteira de velocidade `v`, freia a partir de `brake_at` e para num card; precisa de `len(items)·gap ≥ 1080 + cw`) · `light_field` (campo de luz no chão que infla e drena; `color`).
Componentes pretos (`island`, `pay`, `toggle`) precisam de fundo que contraste (vermelho, âmbar, creme).

## Componentes HyperFrames prontos (pasta motions/)
Composições do catálogo HyperFrames já instaladas em `motions/`. Use **de vez em quando**: 1 ou 2 por reel, só no momento em que a fala pede exatamente aquilo (número que conta, notificação, chat, clique, gráfico), com as cores da marca nas variáveis. Fora disso, invente. Abra o arquivo com Read para ver variáveis, tamanho e duração. Monte dentro de `back`/`front` como host de sub-composição:
`<div class="clip" data-composition-id="<id do arquivo>" data-composition-src="motions/<arquivo>.html" data-variable-values='{"end":99}' data-start="<s>" data-duration="<s>" data-track-index="<n>" data-width="<w>" data-height="<h>" style="position:absolute;left:..px;top:..px;width:<w>px;height:<h>px;transform:scale(..);transform-origin:0 0"></div>` (confira o tempo no snapshot: o host fica dentro da composição da cena).
- `count-up` número que conta e pousa · `chart-story` gráfico que se monta com valores · `animated-bar-chart` barras comparando números · `mk-line-graph` crescimento no tempo
- `chat-message` balão de DM/chat · `native-notification-pop` uma notificação iOS/macOS · `notification-stack` alertas empilhando · `yt-comment-card` comentário respondido
- `code-terminal-run` comando digitado · `oversized-cursor` clique num botão de print (`target_x`, `target_y`, `click_label`)
- `hw-arrow` seta desenhada à mão · `hw-underline` sublinhado/círculo à mão · `caption-camera-follow` texto que segue a câmera
- `carousel-circle-1`, `carousel-orbit-1`, `carousel-path-1`, `carousel-vision-1` carrosséis de imagens (`image1..N` com arquivos de assets/img)
- `instagram-follow`, `x-follow-card` CTA de seguir

## Regras de código
- GSAP determinístico: `fromTo` (não `from`), sem `Math.random`, `Date.now`, `repeat:-1`, `onUpdate`.
- Texto gigante: `data-layout-allow-overlap data-layout-allow-occlusion`.
- Uma timeline pausada por composição em `window.__timelines[id]`.
- Cenas encostadas cobrindo 0→DUR (o `render()` confere com assert).
- Imagens: só as que já estão em `assets/img/`. Não baixe nada da internet.

## O que olhar nas folhas de contato
Texto fora da tela ou encostando na borda; cena vazia; dois textos sobrepostos; palavra repetida; elemento cortado reto; cor fora da paleta do site.
