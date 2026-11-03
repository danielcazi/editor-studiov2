# ILUSTRACAO.md · Ínsula Build: guia de estilo para ilustração em código

> Fontes: as telas do site (top_desktop e top_mobile) e as imagens 01, 03, 04, 05, 12, 14, 15, 16, 18, 21, 22, 24 e 25. Formato do reel: 1080×1920. Todos os px estão nessa escala, que é cerca de 2x a do site.

## 1. Essência
- **O estilo é "a interface vira objeto".** Cada ilustração é uma peça do editor tratada como coisa física: um cartão branco grosso, uma pílula roxa que brilha, a caixa de seleção ciano com alças, a página-demo amarela com sombra dura preta. Tudo pousa sobre o "papel" creme do canvas, que tem grade de pontos.
- **Sensação geral:** é uma mesa de trabalho de designer, limpa, com luz difusa vindo de cima e um único roxo que manda. A cor forte (amarelo, vermelho-laranja) só existe *dentro* da página que o usuário está construindo, como prova de resultado.
- Cada ilustração mostra o objeto exato da fala. Se a fala é "o bloco fica onde você largou", desenhe aquele bloco, com alças, com X 475 / Y 451 no painel e sombra de pouso. Uma "seta genérica" não serve.
- **O que NÃO é:**
  - Nunca um pictograma de pessoa com cabeça redonda. Gente só aparece em foto real em duotone (04, 21, 25), e nunca como protagonista.
  - Nunca um ícone de linha fina (estilo Lucide/Feather) como ilustração. Esses ícones podem existir, no máximo com 40px, dentro de um tile bege.
  - Nunca emoji. O único glifo permitido é o ✦ da IA, desenhado como forma preenchida.
  - Nunca balão de fala com texto de exemplo ou lorem. Quando houver texto, ele vem da fala; quando não, use barras-esqueleto.
  - Nunca isometria de "startup" com bonequinhos, nunca mão 3D de plástico, nunca gradiente arco-íris como marca.

## 2. Materiais e render (Canvas 2D)
- **Papel (fundo):** `fillStyle='#F5F4EF'`. Por cima, um radial lavanda: `createRadialGradient(540,0,0,540,0,1300)` com stops `#E9E7F8`→`#F5F4EF`. Depois a grade de pontos: a cada 32px um `arc(x,y,1.6)` em `rgba(201,199,191,.35)`. A grade se move a 0.5x da câmera (parallax).
- **Grão:** gere uma vez um canvas de ruído 256×256 com `ImageData` aleatório em tons de cinza. Aplique com `createPattern(noise,'repeat')`, `globalCompositeOperation='overlay'` e `globalAlpha=.05`. Desloque o padrão alguns px aleatórios a cada 2 frames, para o grão "ferver".
- **Cartão branco (o material-mestre):** `roundRect(x,y,w,h,44)`, fill `#FFFFFF` e borda 2px `#E5E2D9`. A sombra é dupla e macia. Primeiro passe: `shadowColor='rgba(31,30,29,.22)'`, `shadowBlur=80`, `shadowOffsetY=40`. Segundo passe: `rgba(31,30,29,.06)`, blur 24, offsetY 8. Faça `ctx.save()/restore()` entre os dois e zere a sombra antes de desenhar o conteúdo.
- **Janela:** é um cartão com raio 44 e uma faixa de 56px no topo. Nela vão três círculos de r=9 a partir de x+32, com 28px entre eles: `#FF5F57`, `#FEBC2E`, `#28C840`. Dentro da janela vai o print real (`drawImage`) recortado por `clip()` no mesmo roundRect, com raio 24.
- **Pílula roxa (luz da marca):** `roundRect(...,h/2)` preenchida com `createLinearGradient` vertical de `#6563C2` a `#5857B0`. A sombra é um glow: `shadowColor='rgba(88,87,176,.40)'`, blur 56, offsetY 20. Por cima, um brilho interno: linha de 2px `rgba(255,255,255,.25)` a 3px do topo.
- **Vidro lavanda (painéis, selos):** fill `rgba(236,235,250,.85)`, borda 2px `#D6D5F2`, sem sombra ou com sombra sutil (blur 20, alpha .08). Imagens 22 e 24.
- **Contorno tracejado (bloco não selecionado):** `setLineDash([10,8])`, `lineWidth=2`, `strokeStyle='#C9C7BF'`. É assim que o editor mostra "existe um bloco aqui".
- **Hachura (área de trabalho):** um pattern de 24×24 com uma diagonal de 45° com 2px em `rgba(31,30,29,.06)`. É o "pincel" desta marca, porque aqui não existe pincel orgânico. Use dentro de seções e de páginas-demo (03, 24).
- **Sombra dura (só na página-demo, estilo neo-brutalista):** primeiro desenhe o mesmo roundRect deslocado 10px para a direita e 10px para baixo, em `#1F1E1D`. Depois desenhe o objeto por cima com borda 3px `#1F1E1D`. Raio 4 ou nenhum. Só para objetos "do cliente": navbar, botão vermelho, selo.
- **Duotone (fotos de pessoas ou produtos dos clientes):** `filter='grayscale(1) contrast(1.15)'` e `drawImage`. Depois `globalCompositeOperation='color'` e `fillStyle='#5857B0'` com alpha .85. Por fim, `'screen'` com `#2E2C78` a .25. Sempre dentro de um cartão, nunca solta.

## 3. Lógica de cor
| Função | Cores |
|---|---|
| Fundo | `#F5F4EF` / `#F8F7F6` · lavanda `#E9E7F8` / `#ECEBFA` · escuro de impacto `#2E2C78` ou terminal `#16161E` (18) |
| Forma | branco `#FFFFFF` · bordas `#E5E2D9` e `#D6D5F2` · tile bege `#F1EFE8` · texto e contorno `#1F1E1D` |
| Acento | roxo `#5857B0` (forte `#4644A3`, claro `#6F6FC9`) · seleção ciano `#3BC4D0`, só em traço e alças |
| Explosão (só dentro da página-demo) | mostarda `#F7D96A` · vermelho-laranja `#F24E2E` · preto `#1F1E1D` |
| Luz | glow `rgba(88,87,176,.35–.45)` · highlight `rgba(255,255,255,.25)` · sombra quente `rgba(31,30,29,…)`, nunca `#000` |

- **Proporção por quadro:** 70% creme ou branco, 20% neutros, 8% roxo, 2% ciano ou explosão. Cada quadro tem um único objeto roxo.
- **Nunca combine:**
  - verde (`#25D366`, `#2E9E6A`) como cor de marca. Ele só aparece no botão Salvar ou Aplicar;
  - vermelho-laranja encostado no roxo dentro do mesmo objeto;
  - ciano como preenchimento;
  - amarelo direto no creme sem contorno preto, porque some;
  - roxo em degradê com rosa ou azul (o arco-íris da imagem 14 só aparece como thumbnails dentro da grade);
  - sombra preta pura.

## 4. Linha e forma
- **Silhueta:** sempre retângulo arredondado ou pílula. Use só os raios 8, 12, 22, 44 (cartão e janela) e 999 (pílula). Círculo só para alças, semáforo, botão de enviar e o selo do logo.
- **Espessuras (1080px):**
  - borda de cartão: 2px;
  - seleção ciano: 3px;
  - alças: círculos de r=9 com fill branco e stroke 3px ciano;
  - contorno brutalista: 3px;
  - tracejado: 2px;
  - régua: traço de 1.5px a cada 50 unidades, números Inter 500 a 18px em `#7C7A73`.
- **Proporções:**
  - janela-mestre: 920×640 a 960×700 (ou 72% da largura);
  - botão pílula: 560×112;
  - tile da paleta: 200×120 com raio 20;
  - toolbar flutuante: 520×72 com raio 16.
- **Simplificar um objeto real em 3 passos:**
  1. reduza a forma a um retângulo arredondado com a proporção verdadeira;
  2. mantenha um único detalhe identificador (o semáforo da janela, o notch do celular, o ✦ do prompt, os números X/Y);
  3. aplique o material e a sombra.

  Mais de 3 níveis de detalhe vira screenshot falso. Nesse caso, use o print real.
- **Texto dentro das ilustrações:** só palavras da fala, em Inter 800 com tracking -0.03em, ou barras-esqueleto (altura 16, raio 8, `#E5E2D9`, larguras 100%/82%/64%).
- **Glifo ✦:** são 4 curvas `quadraticCurveTo` com ponto de controle no centro, preenchidas em `#5857B0`, dentro de um círculo `#ECEBFA` de r=36.

## 5. Luz e profundidade em 3D (scene3d)
- **Render:** `renderer.toneMapping=ACESFilmicToneMapping`, `outputColorSpace=SRGBColorSpace`, `shadowMap.type=PCFSoftShadowMap`. Fundo `scene.background=new Color('#F5F4EF')` com `Fog('#F5F4EF',18,40)`.
- **Geometria:** `RoundedBoxGeometry(w,h,0.12,6,0.08)` (de `three/examples/jsm/geometries`). Os blocos são placas finas: profundidade de 0.08 a 0.16 da largura.
- **Materiais:**
  - cartão: `MeshPhysicalMaterial({color:'#FFFFFF',roughness:.55,clearcoat:.3,clearcoatRoughness:.4})`;
  - roxo: `{color:'#5857B0',roughness:.35,clearcoat:.6}`, com `emissive:'#5857B0'` e `emissiveIntensity:.15` para o glow;
  - prints: `MeshBasicMaterial({map})` numa face, com `map.colorSpace=SRGB`;
  - ciano de seleção: `LineSegments(EdgesGeometry)` com `LineBasicMaterial('#3BC4D0')`, mais esferas de r=.04 nos cantos.
- **Luzes:**
  - `HemisphereLight('#FFFFFF','#E9E7F8',.9)`;
  - key `DirectionalLight('#FFFFFF',1.6)` em (3,8,5), `castShadow`, `shadow.mapSize=2048`, `shadow.radius=8`, `bias=-.0005`;
  - rim `PointLight('#6F6FC9',6,12)` atrás e acima, para recortar a borda.
- **Chão:** `PlaneGeometry(60,60)` com `ShadowMaterial({opacity:.14})`, mais um plano com textura da grade de pontos (CanvasTexture) a 0.3 de opacidade.
- **Câmera:** `PerspectiveCamera(28,1080/1920)` em 3/4 de cima (posição (4,6,9), `lookAt` (0,0.5,0)). A órbita é lenta, de ±6° em 4s, e o dolly vai de 1.00 a 1.04 durante toda a cena. Nunca use olho de peixe nem FOV acima de 40.
- **Pilha de camadas (o logo):** 3 placas roxas de raio grande, separadas por 0.18 em y. Na abertura, a separação cresce de 0 para 0.35.

## 6. Movimento nativo
Easing base `cubic-bezier(.65,0,.35,1)`. Nos encaixes, ease-out-back com overshoot de 5%. Por baixo de tudo, drift contínuo de escala 1.00→1.04.
1. **Seleção-encaixe:** o retângulo ciano se desenha com `lineDashOffset` de perímetro até 0 em 280ms. As 8 alças fazem pop (escala 0→1.15→1, com 30ms de stagger). A toolbar branca desce 8px com fade em 200ms.
2. **Levanta-e-pousa:** o cursor chega por uma bezier e "segura" o bloco. O bloco sobe para escala 1.03, a sombra cresce (blur 80→120, offsetY 40→70) e ele inclina 1.5°. Ao soltar, cai com bounce de 6px, e os números X/Y rolam como odômetro (180ms por dígito).
3. **Empilhar:** objetos entram como placas que caem de -60px uma sobre a outra, com 90ms de stagger e sombra que nasce no pouso. É o gesto do logo de camadas e serve para seções, planos e listas.
4. **Prompt que monta:** typewriter a 38 caracteres por segundo com cursor piscando a 530ms. O botão ✦ pulsa uma vez e o campo se desfaz em barras-esqueleto. As barras ganham cor e viram a página-demo de baixo para cima (400ms).
5. **Pílula que expande:** o "+ Adicionar seção" cresce de 280×64 até o quadro inteiro (raio 999→0, 450ms) e sua cor vira o fundo da próxima cena.
6. **Preset acende:** numa grade (sombras, fundos, paleta), cada tile ganha borda roxa e glow em cascata diagonal de 40ms. O último fica selecionado com o anel ciano.
- **Vida em repouso:** a sombra respira (alpha ±.03 em 3s), o glow do CTA vai de 1→1.04 em 1.2s em loop e o grão ferve.
- **Saída:** sempre fade com subida de 12px em 220ms. Nunca corte seco de elemento.

## 7. Motivos
1. **Bloco selecionado:** roundRect branco com texto da fala em 800, anel ciano de 3px a 12px de distância e 8 alças r=9. A toolbar branca flutua 24px acima, com 5 quadradinhos de 28px em `#55534D`.
2. **Cursor arrastando:** seta preenchida `#1F1E1D` (path de 7 pontos, 56px) com borda branca de 3px. Embaixo dela vai o bloco levantado, com sombra dobrada e ghost tracejado no lugar de origem.
3. **Janela do editor:** cartão de raio 44 com semáforo e print real recortado. Duas janelas sobrepostas, com 60px de deslocamento e parallax 1x/0.8x (imagem 01).
4. **Pilha de camadas:** 3 losangos arredondados brancos sobre um círculo `#5857B0` de r=120. Em 3D, placas roxas que se abrem.
5. **"+ Adicionar seção":** pílula `#5857B0` de 280×64 com "+" desenhado por 2 rects brancos de 4px e glow roxo, cortando uma linha tracejada horizontal entre duas seções.
6. **Régua e coordenadas:** régua de 64px de altura `#F8F7F6` com traços a cada 50. Ao lado, campos X/Y em tiles bege, com os números da fala em Inter 700 rolando.
7. **Prompt de IA:** cartão branco de 900×360 com borda 2px `#D6D5F2`, o ✦ no círculo lavanda acima e o texto real da fala digitando. Botão de enviar: círculo `#5857B0` r=40 com triângulo branco.
8. **Celular 480:** roundRect de 420×860 com raio 56, moldura `#1F1E1D` de 14px e notch pílula de 120×28. Dentro, a página-demo com o botão roxo de largura total.
9. **Grade de fundos (100 fundos):** 3×4 tiles de 260×160 com raio 22, cada um com o gradiente real da imagem 14 (pôr do sol `#2A1A3E→#F5A623`, oceano `#0B4F6C→#4FD1E0`). Eles acendem em cascata.
10. **Funil que vaza (módulo Funis):** 4 barras brancas empilhadas, cada uma 18% mais estreita, com borda 2px. Na terceira, uma fenda de onde saem gotas-quadrado `#F24E2E` e um rótulo-pílula com o número da fala.
11. **Contagem do lote:** 2 cartões flip de 160×220 com raio 22 e dígito Inter 900 a 160px. A dobra central é uma linha de 2px `#E5E2D9`, e a metade de cima gira em `rotateX` (no Canvas, `scale(1,cos)`).
12. **Publicar no domínio:** barra de URL branca em pílula com cadeado preenchido roxo (corpo roundRect de 28×24 e arco de 3px), mais o domínio real da fala. O botão "Publicar" roxo se aperta (escala .96) e solta um anel de glow.

## 8. Armadilhas
- **Ícone Lucide ampliado como protagonista:** parece template e já foi rejeitado. Desenhe o objeto preenchido, com material e sombra.
- **Inventar UI:** se existe print real (03, 05, 12, 14, 15, 16), recorte e emoldure o print. A ilustração só complementa: cursor, seleção, sombra, empilhamento.
- **Sombra dura e sombra macia no mesmo objeto, ou sombra dura em peça da marca:** a dura pertence só à página-demo do cliente.
- **Mais de um roxo dominante por quadro**, ou roxo na legenda *e* no objeto *e* no fundo ao mesmo tempo.
- **Ciano como preenchimento ou glow:** ele é a cor da seleção, e só faz sentido como traço fino.
- **Raios misturados (10, 16, 30) e bordas de 1px:** a 1080px elas somem e parecem bug de escala.
- **Grão acima de 7%, vinheta escura ou fundo branco chapado sem grade:** ficam com cara de slide.
- **Texto falso:** lorem, "Seu título aqui" ou nomes inventados dentro dos objetos. Use a fala ou barras-esqueleto.
- **Objeto estático ou que some no corte:** todo elemento entra com um dos 6 moves e sai com fade e 12px para cima.
- **Elementos fora da zona segura:** nada importante abaixo de 80% da altura nem a menos de 86px das laterais. A legenda nunca cobre o objeto ilustrado.
