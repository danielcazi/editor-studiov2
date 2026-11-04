# ILUSTRACAO.md — RD · Black Friday "de verdade"

Guia para DESENHAR as ilustrações dos reels em código (Canvas 2D e three.js). Fonte: screenshots do hero, a ilustração cérebro-escada, capas de trilha em duotone (Autoconhecimento, Sono, Ansiedade, Vícios), capas do Desafio (amarelo/preto), thumbs de curso e logo creme/vermelho.
Conflito resolvido: o site é preto + laranja; o brand.md é vinho + ouro. Regra: **fundo preto/vinho-preto, UM acento por quadro** (laranja no que vende, ouro só em número/palavra-chave). Sem arco-íris, sem glassmorphism claro, sem card branco com sombra suave.

## 1. Essência
Pôster de capa de revista em movimento: objeto grande, material tátil, luz dramática de um lado, grão por cima. Cada ilustração é UM objeto específico da fala (a escada de 5 degraus, o celular que puxa a cabeça, a fechadura com olho), nunca um símbolo genérico.
Duas linguagens, escolher uma por cena:
- **Editorial cinza com grão** (cérebro-escada): massas suaves, sombra esfumada, poucos pictogramas pequenos DENTRO de objetos maiores.
- **Duotone / recorte chapado** (capas de trilha, silhueta amarela do Desafio): uma cor + preto, forma recortada, desfoque de movimento ao redor.
**NÃO é:**
- Pictograma de pessoa com cabeça redonda e corpo de palito.
- Ícone de linha fina de 1–2px (exceto o monograma RD e fios de diagrama).
- Emoji ou clipart.
- Balão de fala com texto de exemplo.
- Card branco centralizado, gradiente arco-íris, neon de verdade.
- Personagem sorridente "corporativo".
Pessoa, quando houver: **silhueta sem rosto, de costas ou de perfil, com cabeça de forma própria** (cabelo, nuca, ombros, mochila), ou recorte de foto em duotone.

## 2. Materiais e render (Canvas 2D)
Resolução base 1080×1920. Toda ilustração é desenhada em canvas offscreen (`oc`), depois composta e recebe grão.
- **Papel preto:** `#000` com `#121212` radial no centro (raio 900px). Raios de sunburst: 12–16 cunhas `#202020`, alpha .55, via `ctx.moveTo(cx,cy); ctx.arc(...)` com `fill`, giro 6°/s.
- **Massa editorial (pincel de grão):** preencher a forma com gradiente linear `#2a2a2a→#8a8a8a` e depois, com `globalCompositeOperation='source-atop'`, desenhar 4–6k pontos de 1–2px alpha .08–.18 (branco e preto) com `Math.random` fixo por seed (ruído que não pisca entre frames).
- **Sombra dura:** nunca `shadowBlur` em forma. Clonar a silhueta, deslocar +14px/+14px (luz no canto superior esquerdo), `fill '#000'` alpha .55. Sombra de botão laranja: bloco `#A8460A` deslocado 8px para baixo.
- **Extrusão tipo selo BLACK RD:** repetir o glifo/forma 12–18 vezes em passos de 1px na diagonal (+1,+1), cor `#1a0a00`, depois a face por cima com gradiente laranja.
- **Contorno:** sem contorno fino. Separar formas por valor, não por linha. Quando precisar de borda (card, selo): `lineWidth 3`, `rgba(255,255,255,.10)`; selo: contorno creme `#F5F0E8` 6px.
- **Duotone:** desenhar a imagem/forma em cinza, depois `globalCompositeOperation='multiply'` com cor chapada (lilás `#8B6DDB`, vinho `#7A1F3D`, laranja-vermelho `#D42A00`) e `'lighten'` com `#ffffff` alpha .15 nas altas-luzes. Fundo com gradiente vertical da cor +12% claro (topo) a −20% (base).
- **Textura riscada (grunge):** 300–500 riscos `lineWidth 1–3`, comprimento 6–40px, ângulo aleatório, cor do fundo, `destination-out` sobre a face laranja.
- **Desfoque de movimento:** 6–10 cópias da forma deslocadas no eixo do movimento, alpha decrescente (.5→.05). Não usar `ctx.filter='blur'` em loop pesado.
- **Grão final (obrigatório):** tile de ruído 256×256 gerado uma vez, composto 4–6% `overlay`, deslocado aleatoriamente a cada 2 frames.
- **Vinheta:** `createRadialGradient` de transparente (r=45% da altura) a `rgba(0,0,0,.6)` nos cantos.

## 3. Lógica de cor (por função)
| Função | Cor | Uso |
|---|---|---|
| Fundo | `#000`, `#121212` | 70–80% do quadro |
| Fundo de marca | vinho `#750800` | faixas diagonais, bloco de tipografia, nunca o quadro todo |
| Forma/massa | `#1D1D1D`, `#2A2A2A`, cinzas `#7A7671` | corpos, cards, degraus |
| Acento | laranja `#FFA34D→#F3984B→#EE7A1E` (sombra `#A8460A`) | o objeto que vende |
| Destaque | ouro `#F7B708` / amarelo `#F5C400` | UMA palavra/número ou a silhueta do Desafio |
| Luz | creme `#F5F0E8`, branco só no ponto mais forte | brilho, tela de celular, bandeira |
| Universos | lilás `#6F6FC9`/`#B04FE0`, vermelho `#C62E2E`, azul `#1B2A4E` | só dentro da capa/recorte daquele tema |
**Regras:** um acento por quadro (laranja OU ouro, não os dois competindo). Duotone usa uma única matiz. **Nunca:** laranja com roxo no mesmo objeto, ouro sobre laranja, branco puro em grandes áreas, cinza azulado frio ao lado de laranja (usar cinza neutro/quente), sombra colorida saturada.

## 4. Linha e forma
- **Silhueta primeiro:** o objeto tem de ser reconhecido preenchido de preto. Se não, redesenhar.
- Simplificar a 3–5 formas grandes. Exemplo: cérebro = 1 massa de nuvem com 6–8 lóbulos (círculos de r 90–160px unidos com `arc` + `fill`), sem giros desenhados em linha.
- Proporção de pessoa em silhueta: cabeça = 1/7 da altura, ombros = 2 cabeças, sem pescoço fino; detalhe único que a identifica (mochila, cabelo cacheado, celular).
- Cantos: cards e thumbs `roundRect` raio 16px (capas 28px). Formas orgânicas sem canto vivo; objetos duros (degrau, fechadura) com ângulos retos e 1 chanfro de 6px.
- Espessuras permitidas: fio de diagrama 2px (só tracejado `setLineDash([4,8])`, creme alpha .5); contorno de selo 6px; degrau/aresta 14–24px. Nada entre 3 e 5px sem motivo.
- Pictogramas internos (livro, haltere, laptop, coração, grupo, moedas): 44–56px, preenchidos, cinza claro `#CFCFCF` gravados na face do degrau, nunca soltos no ar.
- Inclinação: selos −8°, cards ±6°, marquee −6°. Nada fica a 0° exceto o texto de leitura.
- Composição assimétrica; o objeto principal ocupa 55–70% da largura e pode sangrar para fora da borda.

## 5. Luz e profundidade em 3D (scene3d / three.js)
- **Renderer:** `antialias:true`, `toneMapping=ACESFilmicToneMapping`, exposure 1.05, `outputColorSpace=SRGBColorSpace`, `setClearColor(0x050505)`; sem skybox colorido.
- **Material:** `MeshStandardMaterial` com `roughness .45–.6`, `metalness 0–.1`. Laranja: `color #F3984B`, `emissive #A8460A`, `emissiveIntensity .25`. Duro e fosco, como plástico/borracha de selo, não cromado nem vidro.
- **Luzes (3 pontos):** key `DirectionalLight` creme `#FFEFD8`, int 2.4, de cima-esquerda (−4,6,5), `castShadow`, shadow map 2048, `radius 1` (sombra DURA); rim laranja `#EE7A1E` int 3 por trás-direita (5,2,−4); fill `HemisphereLight(#2a2a2a,#000,.35)`. Sem `AmbientLight` forte (mantém contraste).
- **Sombra:** chão `ShadowMaterial` opacity .5 em y=−1; o objeto sempre projeta sombra.
- **Extrusão:** formas 2D → `ExtrudeGeometry` com `depth 0.6, bevelEnabled, bevelSize .04, bevelSegments 3` (reproduz o selo BLACK RD).
- **Fundo:** plano atrás com textura de sunburst (CanvasTexture da seção 2), `fog` preto densidade .06; grão e vinheta via pós (`ShaderPass` de ruído 5%) ou overlay Canvas por cima.
- **Câmera:** `PerspectiveCamera` fov 32–38 (lente longa, achatada), posição frontal levemente baixa/alta (±8°), nunca fov >50. Órbita máx. ±12°, `lookAt` no objeto.
- Objetos 3D flutuam com bob (seção 6), nunca estáticos.

## 6. Movimento nativo (6 moves)
Todos com easing; proibido linear. Entrada 0,3–0,5s; saída 0,2–0,3s (mais rápida que a entrada).
1. **Slam:** escala 1.4→1 com `easeOutBack` (overshoot ~1.15), shake de 6px por 150ms e flash de raios (alpha 0→.8→0 em 120ms).
2. **Pop em cascata:** itens entram com `easeOutBack` defasados 0,12s, vindo 40px abaixo, com 6 cópias de desfoque de movimento que somem em 100ms.
3. **Wipe de faixa:** faixa vinho/laranja inclinada −6° cruza a tela (`easeInOutExpo`, 0,5s) e a ilustração aparece atrás dela (clip `ctx.clip()` pela faixa).
4. **Desenho sequencial:** o objeto se constrói em partes (degraus um a um, 0,15s cada) e uma figura sobe. O fio tracejado se estende com `lineDashOffset`.
5. **Vida (idle):** bob senoidal ±12px, período 3–4s, fases defasadas; rotação ±2°; sunburst gira 6°/s; escala 1↔1.02. Nunca parado.
6. **Saída por corte de máscara:** a forma é varrida na diagonal (wipe inverso) ou encolhe 1→.85 com alpha→0 em 0,2s; o próximo objeto já entra no mesmo frame.
Número: contador rola com `easeOutCubic`, unidade pequena ao lado.

## 7. Motivos (objeto + receita)
1. **Cérebro-escada (caminho pronto):** massa de nuvem cinza com 7 lóbulos e grão; 6 degraus em perspectiva isométrica subindo à direita, cada um com pictograma gravado.
   Silhueta de pessoa de mochila no 3º degrau (cabeça com cabelo, não círculo), bandeira creme no topo com 3 riscos de brilho.
2. **Selo BLACK RD:** texto condensado em laranja, extrusão de 16 passos, rotação −8°, textura riscada em `destination-out`.
   Balão RD dentro do "D" (elipse + fio de 2px); faixa preta "A BLACK DE VERDADE" por baixo.
3. **Card de desconto:** `roundRect` 16px `#1D1D1D`, borda branca 10%, rotação ±6°, microtexto creme espaçado em cima.
   Número condensado laranja gigante embaixo; sombra dura de 10px, sem blur.
4. **Pílula da palavra-chave:** cápsula com gradiente `#FFA34D→#EE7A1E`, texto preto, sombra dura `#A8460A` 8px; cresce até cobrir a tela no wipe.
5. **Silhueta amarela na multidão (procrastinação):** busto recortado chapado `#F5C400` com borda do ombro irregular; ao redor, 20 vultos cinza em desfoque de movimento horizontal (10 cópias). A base do busto vira laranja e dissolve.
6. **Fechadura com olho (autoconhecimento):** fundo lilás duotone, buraco de fechadura em preto-roxo (círculo r 110 + trapézio), olho em tons roxos dentro; íris com 2 anéis e brilho creme de 6px.
7. **Celular que puxa a cabeça (vício):** perfil de nuca/cabelo cacheado em vinho duotone; tela como retângulo creme com cone de luz e 25 fios de repuxo curvos do rosto até a tela.
8. **Homem na nuvem (sono):** nuvem de 9 círculos lilás com gradiente de luz de cima, corpo deitado de silhueta chapada roxo-escuro, braços caindo; bob lento de 5s.
9. **Rosto tremido (ansiedade):** vermelho-laranja `#D42A00`, silhueta de rosto repetida 5× com offset horizontal 6–18px em alpha decrescente, sem traço definido.
10. **Pilha de bônus:** 3 capas em leque (−8°, 0°, +8°) com sombra dura, tag "BÔNUS" ouro em canto; cada capa com cor de universo própria.
    Planner = retângulo creme com espiral de 10 argolas pretas e grade de 2px.
11. **Grade de 5 aulas em cascata:** 5 cards `#1D1D1D` com círculo fino central e 4 pontos de grid nos cantos (como a capa do Desafio), título amarelo condensado; caem com `easeOutBack` 0,15s de intervalo.
12. **Balão RD (marca):** elipse 1:1.25 com gradiente laranja, brilho creme em arco, nó triangular e fio de 2px ondulado (`bezierCurveTo`) que balança; usar como assinatura final sobre vermelho `#C62E2E` com logo creme.
Extra de produto: monitor/iPad/iPhone recriados em retângulos pretos `roundRect` 20px com capas coloridas dentro; sem moldura branca.

## 8. Armadilhas (parece amador)
- Gradiente suave e sem grão: tudo digital e plástico. Sempre grão + sombra dura.
- Ícone de linha fina, pessoa de palito, emoji, check verde genérico.
- Sombra com blur grande em card (cara de template). Glow só em botão laranja, e curto (raio 24px, alpha .35).
- Dois acentos disputando; laranja + ouro + roxo no mesmo objeto.
- Tudo centralizado e simétrico; objeto pequeno no meio de muito vazio.
- Rotações aleatórias que não seguem −8°/±6°/±2°.
- Movimento linear, entrada sem overshoot, objeto que nunca respira.
- Ruído de grão que pisca em cada frame ou é diferente a cada render (usar seed).
- Texto de exemplo ("Lorem", "Seu texto aqui") dentro da ilustração. Todo texto vem da fala.
- Rosto do locutor coberto por fundo opaco; ilustração dentro de 280px do rodapé (zona segura).
- Desenho genérico ("cérebro com lâmpada") quando a fala cita algo específico. Se a fala diz "sono", é a nuvem; "celular", é o repuxo de luz.
