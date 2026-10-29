# Guia do compositor (Motion Completo)

Você compõe o reel inteiro, cena a cena, em HyperFrames 0.8.192 + GSAP 3.14.2. `brief.md` diz o que e para quem; este guia diz como. Dentro das regras abaixo, a liberdade criativa é sua: invente dinâmicas de texto, cards e transições; `kit.py` é um ponto de partida, não um limite. Pode escrever HTML/JS próprio em `back`/`front`, criar helpers em `scenes.py` e usar qualquer asset de `assets/`.

## Fluxo
1. Leia `brief.md` e `assets/transcript.json` (tempo de cada palavra: os cortes caem nas palavras).
2. Escreva `scenes.py`: `from kit import *`, chamadas `scene(...)`, `render()` no fim. Rode `python3 -B scenes.py`.
3. `npx --yes hyperframes@0.8.192 check --json > check.json` (meta: 0 erros), depois `npx --yes hyperframes@0.8.192 snapshot --at "<meio de cada cena>" --no-end -o snaps` e olhe as folhas de contato.
4. Corrija o que viu e repita. Só então renderize: `npx --yes hyperframes@0.8.192 render -o out.mp4 --fps 30 --quality delivery`.

## Camadas (z-index)
1 `#pcam` plate desfocado · 2 `bNN` fundo + texto gigante atrás (callback `back=`) · 3 `#ccam` locutor recortado (RVM, 1920×1080 com alfa) · 4 `sNN` frente (callback `front=`). Voz na trilha 8; efeitos em rodízio nas trilhas 9–14.
- **Tipografia Gigante / Texto Atrás**: OBRIGATORIAMENTE em `back` (camada 2, z-index 2). O locutor recortado (`#ccam`, z-index 3) fica naturalmente por cima. NUNCA coloque tipografia gigante em `front` (z-index 4) tampando o locutor, e NUNCA use contorno artificial grosso (`-webkit-text-stroke`) para forçar o texto na frente do corpo.
- **Camada `front` (z-index 4)**: Apenas para UI, mockups, cartões, recibos e badges na altura do peito ou topo, sem obstruir o rosto do locutor.

## Enquadramentos do locutor (rosto em x≈980 de 1920)
M 0,95 · L 1,2 (padrão) · XL 1,5 (punch-in) · XXL 1,8 (mão erguida, CTA). Modos de câmera: `hold`, `snap`, `push`, `shake`. Troque de enquadramento a cada 2–4 s. Nunca "locutor pequeno no canto".

## Recorte e centro do rosto
- Recorte sempre RVM (`rvm_mobilenetv3_fp32.onnx`), nunca u2net: a máscara u2net fazia o braço sumir em 9 cenas e tremia.
- O recorte NÃO é pré-cortado em 9:16: usa a largura inteira da fonte (1920×1080, alfa fora do corpo), ancorado na base. Um corte 9:16 de 608 px corta os braços (o corpo tem ≈840 px).
- O rosto de cada fonte fica em `faceX` (compose.json, da trilha do nariz). 980 vale para fonte de 1920 px de largura. Se a checagem avisar `cabeça centrada em x=…`, corrija o `faceX` e o crop do plate, não o enquadramento.
- `#ccam` fica em `left = W/2 − faceX`, `top = H − 1080`, `transform-origin: faceX px 1080px`. Todo zoom parte de (faceX, base): o rosto não anda de lado ao trocar de enquadramento.
- Fonte 9:16 (2160×3840, por exemplo): o recorte vira uma faixa de ≈608 px no meio do palco, e o braço que sai do quadro da fonte já não existe no arquivo. Esse caso aparece como aviso "braço ou corpo cortado pela borda da faixa". Não se resolve no compositor: refilme ou exporte em 16:9 com o braço no quadro.
- Plate (fundo desfocado): 608 px centrados no rosto, `crop=608:1080:(faceX−304):0,scale=540:960,gblur=sigma=18,scale=1080:1920`.

## Regras de layout (do cliente)
1. Braços nunca cortados no meio da tela: o recorte usa a largura inteira, sem borda reta visível.
2. Um destaque por cena (palavra gigante atrás, contorno vazado, número no card ou palavra no B-roll). Sem legenda simples; a mesma palavra nunca aparece duas vezes.
3. Texto não sobrepõe texto. Pílulas só com informação nova.
4. Texto atrás o mais alto possível: borda de cima em 10,4% (200 px), ≥50% da palavra visível. Se a cabeça cobrir mais, desça o locutor (M ou L), nunca o texto. Se a mão cobrir, traga o texto para a frente.
5. Nada sobre o rosto: cards e imagens acima da cabeça; apoio na altura do peito.
6. CTA: locutor XXL; destaque, botão menor e URL pequena, tudo acima de 380 px da base, sem encostar no queixo.
7. Zonas seguras: topo 200, base 380, laterais 70 px.
8. Ritmo: nada sem mudança visual por mais de 3 s; ~1,5 s por estímulo; card de 1,2 a 3 s; nunca o mesmo tipo de card duas vezes seguidas; gancho forte nos 3 primeiros segundos; corte seco.
9. Texto cabe inteiro na zona segura: meça a largura e reduza o corpo até caber; nunca cortado pelas laterais nem coberto por faixa, card ou locutor.
10. Número grande em cor forte da paleta sobre fundo claro (ou o inverso), contraste de pelo menos 4,5:1; nunca vermelho sobre vinho ou preto.
11. Imagem só quando mostra o que a fala diz. Print de notícia, logo ou tela sem ligação com a frase fica fora.
12. Fundos sólidos alternam entre as cores da paleta a cada cena; nunca dois fundos escuros seguidos. Alterne também o enquadramento do locutor (XL, L, M) entre cenas vizinhas.

## Site de referência (quando o brief traz um)
- O site é a campanha atual: fundos, destaques e botões seguem a paleta do site (compose.json), não a do brand.md. O print do site decide qual cor é fundo, destaque e botão.
- Conecte a fala ao site: quando ele cita trilha, tema, plataforma, depoimento, palco ou número, a cena mostra a imagem ou o dado do site (`<img src="assets/img/...">` em card acima da cabeça, leque de cards, mural rolando ou B-roll em tela cheia com Ken Burns). Pelo menos uma imagem do site a cada ~10 s.
- Abra cada imagem com Read antes de usá-la: o nome do arquivo não diz o que ela mostra.
- Número da fala diferente do site: vale o da fala; não invente.

## Estilos prontos do kit
Helpers testados (cada um devolve `(html, js)`; junte com `both(...)`; `at` é relativo ao início da cena; `k=` separa duas instâncias na mesma cena). Use como ponto de partida, não em toda cena: um estilo novo por cena, sem repetir o mesmo dois seguidos. `render()` avisa quando a composição usa menos de 5 helpers distintos do kit, nenhum componente de `motions/`, ou quando mais de 70% dos tweens só animam opacity/x/y/scale: trate esses avisos como os outros.
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
- `obj3d(p, kind, x, y, size, at, d, color, spin, tilt, seed, k)` objeto 3D "clay" brilhante em Three.js (`cursor`, `card`, `layers`, `bolt`), cor da marca em `color`: entra com mola, flutua e sai em `at+d`. Use em `back`/`front` dentro de `both()`. Cada um cria um canvas WebGL; mantenha poucos por cena (até ~4) e dê `k` e `seed` diferentes a cada um.
- `steps3` três cards empilhados que sobem em sequência, cada um com número, título e texto (`items`, até 3).
- `slide_head` divisor que desce, rótulo, título que entra deslizando e subtítulo opcional (`eyebrow`, `headline`, `sub`).
- `phone_alert` título que cai do topo e celular que sobe com um alerta deslizando para dentro da tela (`title`, `alert`).
- `compare_bars` duas barras crescendo do mesmo chão, cinza (antes) e âmbar (depois), com valor acima de cada uma (`a`, `b` como `(valor, rótulo)`).
- **Movimento medido (reimplementado)**: `ripple` (`colors` em anéis que crescem do centro, uma cor por anel) · `zoom_through` (cartão de `cw` px que cresce em escala log até preencher a tela; `inner` é o quadro inteiro da próxima cena, centrado) · `follow` (`inner` seguido por mola amortecida; `knots` = [(t, dx, dy)] em px do repouso) · `carousel_loop` (`items` em esteira de velocidade `v`, freia a partir de `brake_at` e para num card; precisa de `len(items)·gap ≥ 1080 + cw`) · `light_field` (campo de luz no chão que infla e drena; `color`).
Com locutor: os de texto grande (`lintel`, `hang`, `platform`, `slam`, `count`) vão em `back` (atrás do recorte, acima da cabeça); os de UI e cards vão em `front` na altura do peito ou com o locutor em M; `aperture`, `iris`, `flood`, `bento` e `title_seq` cobrem a tela: cena com câmera `None` ou transição curta.

## Componentes HyperFrames prontos (pasta motions/)
Composições do catálogo HyperFrames já instaladas em `motions/`. Use **pelo menos um por reel** (1 a 3), no momento em que a fala pede exatamente aquilo (número que conta, notificação, chat, clique, gráfico), com as cores da marca nas variáveis. Fora disso, invente. Abra o arquivo com Read para ver variáveis, tamanho e duração. Monte dentro de `back`/`front` como host de sub-composição:
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

## Checagem automática do locutor
Roda sozinha dentro de `render()` (`kit.py`), só com locutor. Erro para o render; aviso fica para a sua revisão. Medido no Chrome com o runtime do HyperFrames (`server/layout_check.mjs`) e no alfa do `cut.webm`.
- **Erro, na hora (lint do kit)**: câmera fora de `FR`/modos; `broll` com locutor; CTA (`cta=True` em `scene(...)`) sem XXL; `-webkit-text-stroke`; tipografia gigante (`class="giant"`) em `front`.
- **Erro, medido**: cartão ou texto da frente sobre o rosto ou o queixo; cabeça cobrindo mais de 50% de palavra atrás (desça o locutor); texto fora das zonas seguras (topo 200, base 380, laterais 70 px).
- **Aviso**: mesmo enquadramento em cenas vizinhas; cena de locutor parado por mais de 4 s; corpo ou mão cobrindo mais de 50% de palavra atrás; cabeça fora do `faceX` em mais de 50 px; resto de cenário no topo do recorte.
- Grava `review/recorte.png`: 10 quadros do recorte sobre verde. Olhe antes de montar.
- A cabeça (topo ≈170, queixo ≈445, meia-largura ≈110, em px da fonte) foi medida num clipe real. Se outro enquadramento não bater, ajuste `head` em compose.json.

## O que olhar nas folhas de contato
Reprove e refaça a cena se: braço, mão ou punho cortado reto; palavra encostando na borda; texto atrás coberto >50%; texto ou card sobre rosto ou queixo; dois textos encostados ou palavra repetida; CTA na zona de baixo; resto de cenário no recorte; texto cortado, coberto ou sem contraste; dois fundos escuros seguidos. A checagem automática cobre o que é medível; o resto é com os olhos. Avisos intencionais podem ficar.

## Limite conhecido
- rd-09: o gesto de soco cruza o queixo por volta de 61,2 s. Não resolvido. A checagem não pega, porque não é texto nem cartão.
