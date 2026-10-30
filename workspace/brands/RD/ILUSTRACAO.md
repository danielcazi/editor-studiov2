# ILUSTRACAO.md — RD Brand

> Guia de desenho para reels 1080×1920 (Canvas 2D e three.js). Fonte: `brand.md`. Não encontrei screenshots do site nem imagens no projeto, então todas as regras abaixo vêm da direção de arte escrita. Quando os prints aparecerem, conferir contra eles.

## 1. Essência
Ilustração de **revista de negócios impressa**: objetos sólidos recortados em papel, impressos em 2 cores (vinho + papel), com grão de serigrafia/riso e sombra dura deslocada. Um objeto por quadro, grande (40–70% da largura), cortado pela borda quando ajudar, sempre o objeto **concreto** que a fala cita (não "dinheiro", e sim a nota dobrada; não "tempo", e sim o cronômetro de bolso com a coroa).
- Massa antes de linha: a forma se lê pela silhueta cheia, não pelo traço.
- Linha fina (1,5–2px branca) só para diagrama/seta/conexão **ao redor** do objeto, nunca para desenhar o objeto.
- O que NÃO é: nunca pictograma de pessoa com cabeça redonda; nunca ícone de linha fina (estilo Feather/Lucide); nunca emoji; nunca balão de fala com texto de exemplo ("Olá!", "Lorem"); nunca card branco com sombra suave; nunca flat de app com cantos de 24px; nunca gradiente.

## 2. Materiais e render (Canvas 2D)
Ordem de camadas por objeto: **sombra dura → massa → luz (recorte) → detalhe → grão**.
- **Papel (massa):** preenchimento chapado, sem gradiente. `ctx.fillStyle='#750800'; ctx.fill(path)`. Cantos levemente vivos: `lineJoin='miter'`, raio máx. 6px.
- **Sombra dura:** mesma silhueta deslocada `+14px,+14px` (escala 1080), cor `#3d0400` ou `rgba(0,0,0,.35)` sobre vídeo. Sem blur: `ctx.shadowBlur=0` sempre. Desenhar como segundo `fill` em `ctx.translate(14,14)`.
- **Luz (duotone):** um recorte de luz `#ffeef5` com 20–30% da área, no lado superior-esquerdo, feito por `ctx.save(); ctx.clip(path); ctx.fillRect(...)` com polígono diagonal (45°). Nada de rampa; luz é uma segunda tinta.
- **Contorno:** só quando o objeto está sobre vídeo e precisa descolar: `strokeStyle='#ffffff'; lineWidth=4` **por fora** (desenhar o stroke antes do fill, com lineWidth=8). Nunca contorno preto.
- **Pincel/borda impressa:** borda com leve tremor de registro. Em vez de traço à mão, deslocar a camada de luz 2–3px em relação à massa (desregistro de riso). Para pinceladas de faixa: retângulo + `ctx.filter='url(#rough)'` não; usar path com vértices a cada 40px e ruído ±1,5px fixo por seed (não animar o ruído a cada frame).
- **Grão:** gerar 1 vez um canvas 256×256 de ruído (`ImageData`, alfa 0–28), `createPattern(noise,'repeat')`, aplicar com `globalCompositeOperation='multiply'` dentro do `clip` do objeto, opacidade 0,35. Deslocar o pattern 1px a cada 2 frames (grão vivo, 12fps).
- **Halftone (opcional, 1 por reel):** pontos de 3–6px em grade 45° dentro da sombra ou da área de luz, `arc` com raio proporcional ao tom.
- **Ouro:** tinta especial. Só no detalhe que é o ponto da fala (o número na tela, a moeda, a ponta da seta). Chapado `#f7b708`, sem brilho metálico.

## 3. Lógica de cor
| Função | Cor | Uso |
|---|---|---|
| Fundo | vídeo do locutor ou campo `#750800` | campo de cor só em faixa/bloco, nunca sobre o rosto |
| Forma | `#750800` sobre luz / `#ffffff` sobre vinho | massa do objeto |
| Luz | `#ffeef5` | recorte de luz, papel |
| Sombra | `#3d0400` (vinho −50% luz) | sombra dura, vão interno |
| Acento | `#f7b708` | **1 elemento por quadro**, ≤ 8% da área |
| Linha | `#ffffff` 1,5–2px | diagramas, setas, cotas |
- Máximo 3 tintas por objeto (massa + luz + sombra), +ouro opcional.
- Nunca combina: ouro sobre `#ffeef5` (some); ouro em duas coisas no mesmo quadro; vinho sobre vídeo escuro sem contorno branco; rosa `#ffeef5` como card branco; qualquer azul, verde, neon, arco-íris; transparência estilo vidro.

## 4. Linha e forma
- **Simplificar um objeto real em 3 passos:** (1) silhueta reconhecível de longe com 6–12 vértices; (2) um único vão interno que identifica (o furo do cadeado, o visor do celular); (3) um detalhe de assinatura (a coroa do cronômetro, a dobra da nota). Parou.
- Proporção: objetos levemente **atarracados** (largura +10%), base reta e pesada, para parecer peça impressa e estável.
- Ângulos: preferir 0°, 45° e 90°; curvas só onde o objeto real é curvo, com `arc`/`quadraticCurveTo` de raio grande.
- Espessuras (1080px): elemento estrutural do objeto ≥ 24px (alça, haste); detalhe interno 10–16px; linha de diagrama 1,5–2px; seta de diagrama: haste 2px, ponta triângulo cheio 18×14px.
- Escala: objeto principal 430–760px de largura; nunca abaixo de 300px (vira ícone).
- Composição: assimétrica, objeto ancorado num terço lateral, sangrando 10–20% para fora da borda; texto Aspekta Bold no lado oposto.
- Zona segura: rosto do locutor livre; objetos no terço inferior ou laterais; margens 80px laterais, 220px topo, 320px base (UI do app).

## 5. Luz e profundidade em 3D (scene3d)
Objetivo: parecer **papel/cartão impresso em 3D**, não plástico de render.
- **Material:** `MeshToonMaterial({color:0x750800, gradientMap})` com gradientMap de 3 tons (`DataTexture` 3×1, `NearestFilter`: `#3d0400`, `#750800`, `#ffeef5`). Ouro: mesmo material com `0xf7b708`. Sem `metalness`, sem envMap, sem bloom.
- **Grão:** pass final com ruído (ShaderPass simples, intensidade 0,06) ou sobrepor o pattern 2D por cima do canvas WebGL.
- **Luzes:** 1 `DirectionalLight(0xffffff, 2.2)` em `(-4, 6, 5)` (luz vem do alto-esquerda, igual ao 2D) + `AmbientLight(0xffffff, 0.35)`. Nada de hemisférica colorida.
- **Sombra:** dura. `renderer.shadowMap.type = THREE.BasicShadowMap`, mapSize 1024, `shadow.radius=0`. Chão invisível com `ShadowMaterial({opacity:.35, color:0x3d0400})`.
- **Geometria:** `ExtrudeGeometry` a partir dos mesmos paths 2D, `depth` 0,15–0,3 do tamanho, `bevelEnabled:false` (borda de cartão). Low-poly honesto, `flatShading:true`.
- **Fundo:** `alpha:true`, `setClearColor(0x000000,0)` sobre o vídeo; ou plano vinho chapado quando for quadro de bloco.
- **Câmera:** `PerspectiveCamera(28)` (tele, pouca distorção, cara de foto de produto) a ~8 unidades; inclinação 10–20°. Alternativa: `OrthographicCamera` em isométrico 30°/45°.
- **Animação de câmera:** só deriva (≤ 3° de órbita em 4 s). Nunca giro 360°.

## 6. Movimento nativo
Entrada 0,3–0,5 s `expo.out`/`power4.out`; saída 0,2–0,3 s `power3.in`; enquanto vive, deriva lenta. Nunca parado morto.
1. **Corte de faixa:** faixa vinho diagonal (−12°) atravessa em 0,35 s; o objeto está "atrás" dela via `clip` e aparece quando ela passa.
2. **Carimbo:** objeto entra em escala 1,25→1 em 0,3 s `expo.out`, sombra dura nasce depois (offset 0→14px em 0,15 s): peça batida no papel.
3. **Registro de impressão:** as 3 tintas entram separadas, deslocadas 30px, e se alinham em 0,4 s (massa, depois luz, depois ouro).
4. **Linha que vira objeto:** linha branca 2px desenha a cota/seta (`setLineDash` + `lineDashOffset`, 0,4 s) e no fim revela o objeto por máscara.
5. **Deriva de papel:** vivo na tela: `y += sin(t·0.6)·6px`, rotação ±1,5°, escala 1→1,03 em 4 s. A sombra se move a 60% (parallax).
6. **Saída por recorte:** máscara retangular fecha na diagonal em 0,22 s `power3.in`, ou o objeto desliza 120px na direção da próxima ideia e some. Nunca fade longo.
- Detalhe ouro sempre entra por último (+0,12 s) e é o único com pequeno overshoot (`back.out(1.6)`).

## 7. Motivos (objetos da fala de negócios/vendas/marketing)
1. **Funil de vidro opaco:** trapézio vinho + bico retângulo; 3 discos ouro/brancos caindo, só um sai pelo bico.
2. **Gráfico em papel milimetrado:** folha `#ffeef5` com grade 1px vinho a 30%; barras vinho chapadas, a última em ouro sangrando para cima da folha.
3. **Cronômetro de bolso:** círculo vinho 24px de aro, coroa retangular no topo; ponteiro único em ouro, fundo luz.
4. **Nota de dinheiro dobrada:** retângulo branco dobrado em V (2 paralelogramos), o lado de sombra `#3d0400`; número em Aspekta no meio.
5. **Celular recortado:** retângulo vertical vinho raio 6px, tela `#ffeef5`, uma única notificação em barra ouro; nada de UI de exemplo.
6. **Megafone:** cone trapézio + cabo retangular, boca em elipse de luz; 3 arcos grossos (12px) brancos saindo, não linha fina.
7. **Ímã em U:** arco grosso vinho de 90px de espessura, pontas retangulares brancas; pequenos quadrados ouro atraídos.
8. **Cadeado de contrato:** corpo retângulo atarracado + alça em arco 28px; buraco da chave recortado (`destination-out`).
9. **Escada de degraus:** 4–5 blocos em L subindo a 45°, sombra dura em cada um; o último degrau ouro.
10. **Carimbo de "aprovado":** cabo cilíndrico + base retangular; a marca no papel é um retângulo vinho com borda irregular (sem palavra genérica, só o número/termo da fala).
11. **Alvo de papel furado:** 3 anéis concêntricos vinho/luz alternados, um furo (`destination-out`) fora do centro e outro cravado em ouro.
12. **Agenda/calendário de mesa:** bloco com 2 argolas no topo, folha luz, um dia marcado com quadrado ouro; folhas anteriores em leque atrás.

## 8. Armadilhas (o que faz parecer amador)
- Desenhar o objeto com traço fino e sem massa: vira ícone de app.
- Gradiente, glow, `shadowBlur`, sombra suave: quebra a impressão em duas tintas.
- Ouro em mais de um lugar, ou ouro decorativo sem relação com a fala.
- Objeto pequeno e centralizado flutuando no meio do quadro.
- Detalhe demais (parafusos, reflexos, texturas realistas); passou de 12 vértices + 1 vão + 1 assinatura, cortar.
- Grão recalculado aleatório a cada frame (pisca como TV) ou grão ausente (fica vetor de template).
- Símbolo genérico no lugar do objeto citado (lâmpada para "ideia", engrenagem para "processo", foguete para "crescer").
- Bonecos, mãos de clipart, balões de fala, emojis, mockup de UI inventado.
- Entrada lenta com fade e saída mais lenta que a entrada; objeto parado sem deriva.
- 3D com cara de plástico (metalness, envMap, bevel arredondado, sombra difusa) ou girando 360°.
- Cobrir o rosto do locutor com campo opaco.
- Repetir o mesmo move de entrada em dois quadros seguidos.
