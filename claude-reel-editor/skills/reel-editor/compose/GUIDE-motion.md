# Guia do compositor (Só Motion)

Reel 100% de animação e infográfico: **não há locutor na tela**. A voz (`assets/voice.m4a`) é só a trilha de narração. Você compõe cena a cena em HyperFrames 0.8.217 + GSAP 3.14.2. `brief.md` diz o quê; este guia diz como. A liberdade criativa é sua: o `kit.py` é ponto de partida, não limite. Pode escrever HTML/SVG/JS próprio em `back`/`front`.

## Referência visual
`ref_site/` tem capturas do site da marca e `ref_site/site.md` tem paleta, fonte e textos. Olhe as imagens com Read antes de escrever. Reproduza a linguagem do site (fundo preto, títulos em âmbar grosso, cards arredondados e inclinados em cores vivas, balão como logo), não copie o layout de página.

## Fluxo
1. Leia `brief.md`, `DIRETOR.md`, `treatment.md` (se existir), `ref_site/site.md` e `assets/transcript.json` (cada corte cai numa palavra).
2. Escreva `scenes.py`: `from kit import *`, chamadas `scene(n, a, b, bg, None, back=..., front=...)` (câmera sempre `None`), `render()` no fim. Rode `python3 -B scenes.py`. Todo tempo de batida vem de `T('palavra')` / `T('frase', after=, end=True)` (segundos do reel; dentro da cena use `T(...) - a`); uma palavra que não existe na fala vira aviso no render.
3. `npx --yes hyperframes@0.8.217 check --json > check.json` (meta: 0 erros), depois `npx --yes hyperframes@0.8.217 snapshot --at "<meio de cada cena>" --no-end -o snaps` e olhe as folhas de contato com Read.
4. Corrija o que viu e repita. Só então renderize: `npx --yes hyperframes@0.8.217 render -o out.mp4 --fps 30 --quality delivery`.

## O que NÃO existe neste modo
Sem `cut.webm`, sem `plate.mp4`, sem enquadramentos M/L/XL/XXL, sem regras de rosto/braço/queixo. Ignore o que o roteiro falar do locutor.

## Regras de layout
1. Cada cena ocupa a tela inteira: nenhum quadro vazio ou meio vazio. Hierarquia clara: um elemento dominante e apoio menor.
2. Infográficos de verdade: números que contam, barras e linhas que se desenham, comparações, listas que se preenchem, diagramas, mapas de trilhas. O dado vem da fala.
3. Texto não sobrepõe texto. A mesma palavra gigante nunca aparece duas vezes seguidas.
4. Zonas seguras: topo 200, base 380, laterais 70 px para texto importante.
5. Ritmo: algo novo a cada ~1,5 s; cena de 1,2 a 3 s; nunca o mesmo tipo de cena duas vezes seguidas; gancho forte nos 3 primeiros segundos; passagem entre cenas pelo `tr=` de `scene()` (`push`, `fade`, `slide`, `wipe`; `cut` só na batida forte).
6. CTA final: botão grande e URL legível.

## Ilustração em código (ILUSTRACAO.md)
`ILUSTRACAO.md` é o estilo de desenho desta marca (materiais, cor, linha, luz, moves nativos, motivos): leia antes do treatment. Toda ilustração de uma cena é uma destas três coisas: desenhada em `canvas()` (Canvas 2D), construída em `scene3d()` (three.js com luz, sombra e névoa) ou uma imagem do site em `assets/img/`. Proibido como ilustração: pictograma de pessoa (cabeça redonda e corpo), ícone de linha fina, emoji, balão de fala com texto de exemplo ("Hi!", "Hello!"), texto em outra língua que a fala não diz. Cada ilustração é um objeto específico do que a fala diz, com material, luz e textura (grão, papel, duotone, sombra dura), seguindo as receitas do ILUSTRACAO.md; quando o brief pede "muita ilustração", pelo menos uma cena desenhada a cada ~10 s. A ilustração tem câmera própria (parallax entre camadas do desenho, `world=` da cena) e entra, vive e sai como o ILUSTRACAO.md §6 descreve.
- `canvas(p, draw, d, x, y, w, h, at, k)`: `draw` é o corpo JS de `(ctx, t, w, h) => {...}`, função pura de `t` (0 a `d`). No escopo: `clamp, lerp, seg, ss, eo, ei, eio, bk, spring, mulberry(seed), hash, vnoise, grain(ctx,w,h,n,a,seed)`. Camada que não depende de `t` (papel, folha, grade, fibras, desfoque pesado, letreiro amostrado) desenhe uma vez com `cache('nome', w, h, (c, w, h) => {...})` e `ctx.drawImage(cache(...), 0, 0)` a cada quadro: `getImageData`, `filter='blur(..)'` e milhares de traços por quadro travam o render. Sem `Math.random`, sem estado fora da função. Desenhe em camadas (fundo, sombra, forma, luz, grão) e anime cada camada por `t`. Com `world=` de pan ou orbit na cena, desenhe com sobra (`x=-80, y=-80, w=W+160, h=H+160`) para a borda do canvas não aparecer.
- **Motores por estilo** (`engines/<nome>.js`): `canvas(p, draw, d, engine='silkscreen'|'briefing'|'swiss'|'deco'|'sketch'|'launch'|'cinetic')` põe `SK`, `BB`, `SW`, `AD`, `SB`, `LA` ou `CN` no escopo do draw, e `scene3d(..., ortho=11, engine='diorama')` põe `DI` no `build`, com as funções testadas do estilo (lista na seção 3 do pacote em `estilos/`; demo em `engines/demos/<nome>.py`). Com um estilo que tem motor, desenhe com ele; receita à mão só para o que o motor não faz. `over=80, bg=cor` dá sobra ao canvas para pan e orbit sem mudar as coordenadas do draw.
- `scene3d(p, build, d, x, y, w, h, at, fov, dist, fog, rim, k)`: `build` é JS que recebe `(T, sc, cam, clay, matte)`, adiciona meshes à cena (`clay(cor)` e `matte(cor)` são materiais prontos; `castShadow`/`receiveShadow` ligados dão sombra real) e devolve `update(t)`. Luz de chave com sombra, luz de recorte na cor da marca e névoa (`fog=(cor, perto, longe)`) já vêm montadas. Até ~2 por cena.

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
Composições do catálogo HyperFrames já instaladas em `motions/`. Use só no momento em que a fala pede exatamente aquilo (número que conta, notificação, chat, clique, gráfico), com as cores da marca nas variáveis. Fora disso, invente. Abra o arquivo com Read para ver variáveis, tamanho e duração. Monte dentro de `back`/`front` como host de sub-composição:
`<div class="clip" data-composition-id="<id do arquivo>" data-composition-src="motions/<arquivo>.html" data-variable-values='{"end":99}' data-start="<s>" data-duration="<s>" data-track-index="<n>" data-width="<w>" data-height="<h>" style="position:absolute;left:..px;top:..px;width:<w>px;height:<h>px;transform:scale(..);transform-origin:0 0"></div>` (confira o tempo no snapshot: o host fica dentro da composição da cena).
- `count-up` número que conta e pousa · `chart-story` gráfico que se monta com valores · `animated-bar-chart` barras comparando números · `mk-line-graph` crescimento no tempo
- `chat-message` balão de DM/chat · `native-notification-pop` uma notificação iOS/macOS · `notification-stack` alertas empilhando · `yt-comment-card` comentário respondido
- `code-terminal-run` comando digitado · `oversized-cursor` clique num botão de print (`target_x`, `target_y`, `click_label`)
- `hw-arrow` seta desenhada à mão · `hw-underline` sublinhado/círculo à mão · `caption-camera-follow` texto que segue a câmera
- `carousel-circle-1`, `carousel-orbit-1`, `carousel-path-1`, `carousel-vision-1` carrosséis de imagens (`image1..N` com arquivos de assets/img)
- `instagram-follow`, `x-follow-card` CTA de seguir

## Fluidez e acabamento (o cliente reprovou animação travada, texto fora da tela e visual chapado)
- **Toda entrada tem saída.** Cada elemento entra com ease-out (`power3.out`, `expo.out`, `back.out`, .4–.7 s) e sai antes do fim da cena com ease-in (`power2.in`, .25–.4 s): nada aparece ou some de um quadro para o outro. O `render()` avisa quando mais da metade dos tweens dura ≤ 0,3 s.
- **Movimento sustentado em toda cena:** enquanto o texto fica, algo anda devagar (> 1 s, `sine.inOut` ou `none`): deriva da imagem, rotação lenta, parallax entre fundo e card, linha que se desenha. Nunca um quadro parado por mais de 1 s.
- **Transição e câmera de cena (`scene(..., tr=, move=)`):** `tr` = `push` (padrão: a nova cena entra com zoom e fade, a anterior sai por baixo em 0,3 s) · `fade` · `slide` (da direita) · `wipe` (de baixo) · `cut` (seco, só para batida forte). `move` = escala final do fundo ao longo da cena (padrão 1.05, push-in lento; 1.0 parado; 1.1 para cena dramática). Alterne `tr` entre cenas vizinhas; `cut` no máximo 1 a cada 4 cenas.
- **Câmera de mundo (`scene(..., world=, signature=)`):** `world=` é a pose-alvo no fim da cena, dict com `x`, `y` (px, até ±120), `scale` (0,9 a 1,35), `rx`, `ry` (graus, até ±8), `rz` (até ±6), e opcionais `d` (segundos, padrão a cena inteira), `ease` (padrão `sine.inOut`) e `snap=True` (pula para a pose no início da cena). As quatro camadas (plate, fundo, locutor, frente) andam juntas com parallax real (profundidades diferentes). A pose fica para a cena seguinte: um oner é uma cena longa ou cenas vizinhas sem `snap`. Gramáticas que o lint conta: `push` (scale sobe), `pull`, `pan` (x), `crane` (y), `tilt` (rx), `orbit` (ry), `roll` (rz); use ao menos 4 no reel e marque o plano-assinatura com `signature=True` (DIRETOR.md §3). Fora dos limites é erro.
- **Textura (automática e sua):** o kit põe grão de filme e vinheta sobre tudo (`grain` em compose.json, 0 desliga) e os fundos `black/amber/cream/red` já têm luz radial. Por cima disso, dê corpo ao que entra: imagens com `box-shadow` longa e `rotate` de 2–6°, duotone (`filter:grayscale(1) contrast(1.1)` + camada de cor em `mix-blend-mode:multiply`), gradientes de 2 tons da paleta, borda de papel ou vidro (`glass`, `papel`). Nada de ícone de linha fina sobre sólido chapado: é o visual "brega" que o cliente recusou.
- **Ilustração:** a arte bonita já existe em `assets/img/` (as ilustrações do site, abertas com Read): use-as como peça principal da cena, com Ken Burns, parallax e máscara, em vez de desenhar SVG de linha (celular, cérebro, infinito) do zero. SVG próprio só para diagrama que precisa animar (seta, gráfico, caminho) e com a espessura e as cores do site. O `ICON` do kit é último recurso.
- **Texto na zona segura, sempre:** todo texto inteiro dentro de topo 200, base 380, laterais 70 px, medido no Chrome pelo `render()` (erro para o render, com ou sem locutor). Palavra gigante que não cabe: reduza o corpo (`_fit`) ou quebre em duas linhas; nunca deixe sangrar.
- **Componente do catálogo `motions/` só com o texto da fala:** nunca com o conteúdo de exemplo do arquivo ("Deploy live", "Hi!", "Checks passed"). Se a fala não pede um chat, notificação, gráfico ou contador, não use.

## Regras de código
- GSAP determinístico: `fromTo` (não `from`), sem `Math.random`, `Date.now`, `repeat:-1`. `onUpdate` só dentro de `canvas`, `scene3d` e `obj3d`, onde o desenho é função pura de `tl.time()`.
- Texto gigante: `data-layout-allow-overlap data-layout-allow-occlusion`.
- Uma timeline pausada por composição em `window.__timelines[id]`.
- Cenas encostadas cobrindo 0→DUR (o `render()` confere com assert).
- Imagens: só as que já estão em `assets/img/`. Não baixe nada da internet.

## O que olhar nas folhas de contato
Texto fora da tela ou encostando na borda; cena vazia; dois textos sobrepostos; palavra repetida; elemento cortado reto; cor fora da paleta do site.
