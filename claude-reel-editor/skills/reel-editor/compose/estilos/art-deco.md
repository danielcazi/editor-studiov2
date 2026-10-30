# Art déco (art-deco)

> Laca preta, linha dourada gravada e geometria aerografada: um pôster dos anos 30 que se move. Tudo tem um eixo central, as passagens abrem ou fecham por ele, e a luz chega como lâmpadas acendendo uma a uma.
> Adaptado de `lemo-opuscar/styles/art-deco/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (pôsteres de Cassandre: geometria gigante, aerógrafo dentro de borda dura; ornamento de arranha-céu: degraus, sunburst, chevron; coreografias vistas de cima; letreiro de ouro se desenhando sobre preto): nunca copie um pôster, um prédio, um personagem ou um desenho de tipo real.

**Serve para:** contagem regressiva, oferta/lançamento, prêmio, número-marco, CTA de luxo. **Encaixe:** com locutor ★★★ (laca = `BLK`, "ouro" = `AMB` em faixas metálicas, acento = `RED`; o locutor fica no eixo diante de um sunburst ou arco escalonado; o letreiro de lâmpadas conta a oferta; mostradores e relógios carregam o número) · só motion ★★★.

## 1. Essência (e o que não é)
Um mundo de **linhas de ouro sobre preto quente**, preenchido por **volumes duros aerografados**, organizado num **único eixo vertical**. O ornamento é a imagem: sunburst é fundo, arco escalonado é moldura, mostrador é barra de progresso, letreiro de lâmpadas é revelação. O movimento é **mecânico e simétrico**: as coisas se desdobram do centro, portas se abrem pela fenda, luzes acendem em ordem contada. Registro nativo: glamour com um relógio correndo (evento, prazo, lançamento). Não é slideshow de folha de ouro (tudo tem volume e se move), não é art nouveau (sem curva chicoteada, sem flor), não é vetor chapado (os volumes têm aerógrafo e fio de luz), não é abertura de espião anos 60 (sem silhueta em cor chapada).

## 2. Com o locutor
- O locutor **é o eixo**: rosto em x≈540, e todo ornamento é simétrico a esse x. Sunburst e arco escalonado vão em `back` com centro em (540, 720), atrás da cabeça; os raios passam por trás dele, nunca na frente. Um `world=` de pan só dentro de um plano que volta a `x=0` antes do corte.
- O letreiro de lâmpadas e o título-arquitetura ficam em `back` entre y 220 e 700 (locutor em L ou M). O mostrador vai acima da cabeça (`back`) ou no peito (`front`, centro em y≈1350, locutor em L); nunca sobre o rosto. Nada de dourado encostando no queixo.
- O recorte é a única coisa fotográfica e não aceita fio de luz na máscara; o que o prende ao pôster é um **palco** em `back`: elipse de chão `AMB` alfa .25 em (540, 1900), 520×60, `shadowBlur=40`, mais o ornamento simétrico atrás dele.
- Enquadramentos: L com sunburst inteiro atrás (gancho, oferta), XL no mostrador (número), XXL na CTA com o arco fechando por trás. Só motion: o eixo é x=540 do mesmo jeito; o letreiro desce para y 900–1100.

## 3. Materiais em `canvas()` (1080×1920)
**Motor pronto:** `canvas(p, draw, d, engine='deco')` põe `AD` no escopo do draw (código em `engines/deco.js`, demo em `engines/demos/deco.py`). Use as funções dele antes de desenhar à mão; as receitas abaixo são o que elas implementam e o que falta nelas.
`AD.lacquer(ctx,w,h)` laca quente · `AD.gold(ctx,x0,y0,x1,y1,{base,sheen})` gradiente de ouro em faixas · `AD.gline(ctx,t,t0,pontos,{width,dur,glow,double,close})` linha dourada gravada que se desenha · `AD.airbrush(ctx,path,[x,y,w,h],{light,shade})` volume aerografado com fio de ouro · `AD.sunburst(ctx,t,t0,cx,cy,{n,r1,alpha,spread})` · `AD.arch(ctx,t,t0,cx,y,w,h,{steps})` arco escalonado · `AD.titleBar(ctx,t,t0,texto,cx,y,w,h)` barra de título que abre do centro · `AD.marquee(ctx,t,t0,texto,x,y,{size,step,beat,times,chase})` letreiro de lâmpadas por batida · `AD.dial(ctx,t,t0,cx,cy,r,v0,v1,{dur,label})` mostrador · `AD.doors(ctx,t,t0,w,h,{close,dur})` portas pelo eixo · `AD.sparkle(ctx,t,t0,x,y,r,cor)`

- **Laca:** `fillStyle=BLK` na tela toda, depois radial `RED2` alfa .10 em (540, 700) raio 900 (preto quente, nunca cinza) e um retângulo `rgba(255,255,255,.03)` por cima: ouro sobre preto puro vira ponto perdido; o fundo nunca é #000.
- **Ouro em faixas (metal):** preencha a forma com `AMB`; com `globalCompositeOperation='source-atop'`, pinte um linear de 5 paradas inclinado 20°, largura 1,4× a forma: 0 `rgba(0,0,0,.45)` · .3 transparente · .5 `CRM` alfa .7 (faixa quente) · .7 transparente · 1 `rgba(0,0,0,.45)`. Varredura de brilho = deslocar x0/x1 do gradiente por `lerp(-w, w, seg(t, t1, t1+.6))`.
- **Linha dourada gravada (a assinatura):** para um path com espessura L: (a) `strokeStyle=BLK` alfa .85, `lineWidth=L+1.6`, `translate(0, 1.2)` (o sulco gravado embaixo); (b) o mesmo path com `strokeStyle=` o ouro em faixas, `lineWidth=L`; (c) `CRM` alfa .35, `lineWidth=.8`, `translate(0,-.8)` (fio de luz em cima). Brilho opcional antes de (a): `shadowColor=AMB; shadowBlur=14`, alfa .35. Gêmea (`double`): a mesma linha 7 px para fora. L = 1,2 fio · 2,5 ornamento · 4 barra de título. Nada recebe contorno preto de desenho animado: o escuro fica sob a linha, não ao redor da forma.
- **Volume aerografado:** borda dura + `save(); clip(path)`; linear de cima-esquerda para baixo-direita: 0 `CRM` alfa .28 → .55 transparente → 1 `BLK` alfa .55; **uma só direção de luz no reel inteiro** (vetor −.7,−.7). Fio na beira iluminada: dentro do clip, `stroke` do mesmo path deslocado (+2,+2) com `AMB` 3 px: só sobra a beira de cima-esquerda. Volume de verdade (coluna, torre, taça): `scene3d()` com `clay(AMB)` e `matte(BLK)`, `fog=(BLK, 6, 14)`, `rim=AMB`.
- **Sunburst:** 28 cunhas de 360/28° a partir de (540, 720), alternando `BLK` e `AMB` alfa .10; raio 1400. Abrem do eixo: cunha i entra em `t = .03·|i−14|`, raio `1400·eo(seg(t, ti, ti+.6))`. Linha gravada 1,2 px numa cunha sim, outra não.
- **Arco escalonado (moldura):** 5 degraus de 56 px, larguras 940 · 820 · 700 · 580 · 460 a partir de y=1500 subindo até 260; linha gravada 2,5 px, interior `RED2` alfa .18. Desdobra do centro: `scale(sx,1)` com origem em x=540, `sx = eio(seg(t, 0, .5))`, degraus escalonados .06 s.
- **Letreiro de lâmpadas:** a grade de lâmpadas vem de `cache('letreiro', w, 220, (c, w, h) => {...})`: nesse canvas estático, `fillText` do texto com a fonte da marca (`c.font='600 150px Aspekta'`) e `getImageData` numa grade de passo 22 px, uma vez só (nunca por quadro); por quadro, só se desenha uma lâmpada em cada célula com alfa > 128. Apagada: círculo r=7 `AMB` alfa .18 com anel `BLK` 1 px. Acesa: `AMB` com `shadowBlur=18 shadowColor=AMB`; **sobrepico de ignição** r×1,6 assentando em .18 s (`bk(seg(t, ti, ti+.18), 2.2)`). Ordem contada: agrupe as lâmpadas por letra (`measureText` por caractere) e acenda **uma letra por batida da fala**. Depois de aceso, chase: lâmpada `(Math.floor(t*18)+i)%6===0` a 1,3× de brilho.
- **Mostrador / relógio:** arco de −225° a 45°, raio 240; 60 marcas (a cada 5, linha gravada 14 px; as outras `CRM` alfa .5, 7 px); numerais na fonte da marca 28 px; ponteiro = linha gravada 3 px com contrapeso `BLK` r=14 e miolo `AMB` r=6; arco de progresso `AMB` 10 px do início até o ponteiro. Movimento de máquina: `eio` em .6 s e assentamento `bk(x, 1.2)`; nada flutua. Medalhão = círculo com linha gravada dupla e centro `RED2` aerografado.

## 4. Cor (paleta do compose.json)
Três constantes: **`BLK` laca** (fundo, portas, contrapesos), **`AMB` ouro** (linha, metal, lâmpadas, ponteiros), **`CRM` marfim** (faixa quente do metal, texto pequeno, luz). **`RED` é a única cor saturada e pertence ao protagonista** (o produto, o número, o botão): uma área grande por quadro, para o olho achar em qualquer plano aberto. `RED2` é a joia secundária (interior do arco, centro do medalhão, aquecimento da laca), nunca competindo em área com `RED`. Texto sobre barra dourada é `BLK` (ouro sobre ouro reprova o contraste de 4,5:1); texto solto sobre laca é `CRM`, e `AMB` só em título com linha gravada.

## 5. Tipografia
A fonte é a da marca (`assets/fonts/font.otf`); o estilo muda o tratamento, não a família: caixa-alta com tracking de .18 em, **títulos são arquitetura**: barra de título com pontas escalonadas (3 degraus de 18 px) sobre arco ou sunburst, linha gravada dupla, texto `BLK` sobre ouro ou `CRM` vazado. Entra como tudo aqui: ponto → fio → barras abrem do centro (`scaleX` com `eio`, .45 s) → texto sobe (.3 s) → varredura de brilho. Números carregam enredo sem narração: mostrador, relógio, medalhão, placa. Palavra gigante do kit (`giant`) vai em `back` com a linha gravada por trás (um `canvas()` com o mesmo texto, L=1,2, deslocado +3 px) e sem preenchimento sólido.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **Tudo se desdobra do centro** em ordem fixa: ponto (.1 s) → fio (.2 s) → barras simétricas (.45 s, `eio`) → texto (.3 s) → asas e faísca de 4 pontas (.2 s). Saída na ordem inversa, .3 s, `ei`.
- **Linha que se desenha** (`setLineDash([L·seg(t,t0,t1), 1e5])`) no ritmo da frase embaixo dela: começa na primeira palavra, pousa na última (tempos de `assets/transcript.json`).
- **Ritmo contado:** uma lâmpada/letra/marca por batida da fala; aceleração dividindo a batida em 2 e em 4 antes do número final (uma, duas, rajada).
- **Ease mecânico:** portas, mostradores e ponteiros com `eio` firme e assentamento de 1 % (`bk(…,1.2)`); nada flutua, nada é `sine` solto. Movimento sustentado enquanto o texto fica: a varredura de brilho (1,2 s) ou o chase do letreiro.
- **Twos** só no caleidoscópio (objetos espelhados girando): `Math.floor(t*12)/12` no ângulo do padrão; câmera, lâmpadas, linha e brilho em ones.
- **O eixo nunca anda:** a simetria gira ou abre, nunca sai de x=540.

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Contra-plongée Cassandre | `dict(rx=6, y=70, scale=1.1)` | meta lá no alto; escala; lançamento |
| Push no mostrador ou medalhão | `dict(scale=1.3, y=-50, d=.8, ease='power2.inOut')` | prazo; contagem; marco |
| Oblíqua baixa ao longo do letreiro | `dict(ry=-7, x=-80, ease='none')`, volta a `x=0` na cena seguinte | nome revelado letra a letra; oferta |
| Pull do detalhe à fachada | `dict(scale=.9, y=30)` | depois; efeito no todo; escala |
| Roll do caleidoscópio | `dict(rz=4, scale=1.08)` | sistema de partes; equipe; celebração |
| Fenda simétrica (portas) | sem `world`, transição em `front` | novo capítulo; revelação atrás da fachada |
| Match-cut de forma (círculo → círculo) | `tr='cut'` com a mesma pose da cena anterior | dois lugares, uma rima; de departamento em departamento |

## 8. Transições feitas no meio
- **Portas de limiar:** duas folhas de laca (`BLK`, linha gravada 2,5 px na borda interna, aerógrafo `CRM` .12 na dobradiça) fecham em `front` das laterais ao eixo em .35 s `eio`, cobrem 2 quadros na troca e abrem na cena seguinte (`rotateY` com `perspective:1200px`, dobradiça na borda externa). Só as folhas: atrás continua o plano vivo, nunca um "interior" chapado.
- **Porta giratória:** `clip` de um setor de 90° girando `360·eo(seg(t,0,.5))` em torno de (540, 960); a próxima cena aparece dentro do setor.
- **Arco que abre:** o arco escalonado vira íris: `clip` do mesmo path escalando de 0 a 3× em .5 s `eio`, origem (540, 960).
- **Varredura que troca:** a faixa quente do metal cruza a tela (.4 s) e a cena atrás muda sob a faixa, 1 quadro de cobertura.
`tr='push'` ou `'wipe'` são o fallback; `fade` e `slide` não existem neste estilo.

## 9. Som (assets/sfx)
Um hit por unidade de luz contada: `click` em cada letra que acende (por letra, não por lâmpada), `key-press` como o "chunk" da chave-faca que liga o letreiro, `sparkle` na varredura de brilho, `impact-bass-2` nas portas fechando (começa .1 s antes do corte), `whoosh-cinematic` no sunburst abrindo, `ping` no ponteiro pousando, `chime` no número vencedor ou prêmio, `riser` 1 s antes da revelação, `typing` numa fita de telégrafo. Dois silêncios de verdade: antes do número final e antes da CTA, só a voz e um `click-soft` por segundo fazendo de relógio; o primeiro som depois dele é o `chime`. Nunca o mesmo sfx em cenas vizinhas.

## 10. Moves nativos (menu)
- **Luz contada.** O letreiro acende uma letra por batida; a audiência conta junto. *Serve:* contagem regressiva; oferta ("50% OFF"); número-marco.
- **Portas de limiar.** Toda troca de capítulo é uma fenda pelo eixo. *Serve:* passos; antes/depois; os módulos de um curso.
- **Mostrador carrega o enredo.** Ponteiro, relógio ou termômetro no lugar da narração. *Serve:* número; prazo; meta de vendas; vagas restantes.
- **Corte arquitetônico.** Pull até o prédio virar seção e o destaque um ponto `RED` com linhas de velocidade subindo andar por andar. *Serve:* passos de um processo; funil; jornada do cliente.
- **Caleidoscópio de máquina.** Muitos iguais espelhados e girando (twos) que travam num símbolo. *Serve:* prova (mil alunos viram o logotipo); equipe; sistema.
- **Varredura / linha que se desenha.** Luz cruza o ouro no hit; a linha se grava no ritmo da frase. *Serve:* prova (assinatura, selo, troféu); CTA de luxo.
- **A única cor.** Um elemento `RED` num mundo de ouro. *Serve:* gancho; oferta (o produto entre os concorrentes); o botão da CTA.
- **As luzes se apagam.** O letreiro desliga em ordem inversa até sobrar uma lâmpada. *Serve:* escassez; CTA ("resta 1 vaga"); fim do prazo.

## 11. Armadilhas
- Letreiro de esqueleto de glifo quebra nas curvas (G, S, R) → amostre o `fillText` numa grade de 22 px; cada célula cheia é uma lâmpada.
- Escama de peixe lê como tijolo → semicírculos **inferiores** fila por fila, cada fila cobrindo a anterior, mais um arco interno.
- Folhas de porta sobre um "interior" chapado leem como quadro vazio → só as folhas, fechando sobre o plano vivo.
- Ponto de ouro sobre preto puro some → laca aquecida com `RED2` .10 e o véu de .03; cunhas escuras nunca #000.
- Ouro sobre ouro (texto `AMB` em barra `AMB`) → `BLK` sobre ouro, `CRM` sobre laca.
- Sunburst ou arco com centro no rosto → centro em (540, 720), ornamento em `back`, raios passando por trás; mostrador em `front` só no peito (y≈1350, locutor em L), nunca sobre o rosto.
- Pan de mundo que deixa a simetria torta no corte → todo plano assimétrico volta ao eixo (`x=0`) antes da próxima cena.
- Título que sai da zona segura depois de um push de 1,3 → desenhe com margem de 60 px ou reduza para 1,2 (zona segura: topo 200, base 380, laterais 70).
