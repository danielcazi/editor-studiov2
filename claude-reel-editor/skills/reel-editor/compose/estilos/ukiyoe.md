# Estampa ukiyo-e (ukiyoe)

> Xilogravura do período Edo em movimento: blocos de cor chapada fora de registro, linha-chave em sumi por cima, céu em bokashi, papel que se sente, e uma câmera que desliza sobre a estampa como quem desenrola um rolo. Cada vista é uma folha completa: borda dupla, cartucho vertical, selo vermelho.
> Adaptado de `lemo-opuscar/styles/ukiyoe/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (séries de "vistas" com um mesmo assunto em várias composições; estações de uma estrada com figuras pequenas e primeiro plano extremo): nunca reproduza uma estampa famosa, um personagem ou uma composição real.

**Serve para:** jornada/etapas (série de vistas), uma mesma coisa em 4 situações, antes/depois por "outra impressão" (mesma linha-chave, outras cores), respiração/pausa (corte para folha em branco). **Encaixe:** com locutor ★ (uma pessoa fotográfica dentro de uma estampa briga com ela; use só como estampa de fundo em cenas de jornada, com o locutor no plano da margem de papel) · só motion ★★★ (o rolo que desliza da direita para a esquerda sem cortes é a gramática) · marcas com paleta chapada e uma cor dominante escura ★★★.

## 1. Essência (e o que não é)
Cada cena é **uma estampa completa**: folha de papel (`CRM`), borda dupla de tinta (6 px grossa + 2 px fina, vão de 8 px), áreas de cor chapada impressas de blocos separados, linha-chave preta por cima, cartucho vertical com o título da vista e um selo vermelho. O mundo é chapado de propósito: profundidade vem de camadas horizontais empilhadas, faixas de névoa e corte ousado, nunca de perspectiva, luz ou sombra. O que faz ler como impresso e não como vetor: papel sempre visível (fibras longas, margem envelhecida); cada cor é um bloco fora de registro 2 px em relação à linha; áreas grandes mostram veio de madeira e marcas de baren; bokashi (degradê passado à mão) no céu e na água. Não é serigrafia (lá a tinta cobre tudo e não há linha; aqui a linha-chave manda e o papel aparece pela tinta), não é aquarela nem sumi-ê (nada escorre: a cor é impressa, não pintada), não é cel de anime (sem luz e sombra nas formas).

## 2. Com o locutor
- Uma pessoa fotográfica dentro de uma estampa briga com ela. Com locutor, a estampa é **só fundo** (`back`) em cenas de jornada ou etapas, e o locutor fica no plano da **margem de papel**: a folha impressa ocupa de y=200 a y≈1150 px, abaixo dela só papel (`CRM` com fibras, sem desenho), e o locutor em M ou L se apoia nessa margem como quem está diante de uma estampa pendurada. Nunca linha-chave contornando a foto nem tinta sobre o corpo.
- Nada sobre o rosto nem sobre o queixo: o cartucho horizontal com a informação (etapa, número, CTA) vai acima da cabeça em `back` ou no peito via `front`.
- O selo (`RED`, 90×90 px) fica num canto de cima da folha (x=110 ou x=880, y=260), nunca atrás da cabeça.
- Enquadramentos: M com a folha inteira visível acima dos ombros; L quando a estampa vira uma faixa de 600 px acima da cabeça; XXL só na CTA com a folha lavada para o papel. Só motion: a folha ocupa de 200 a 1540 px, margens de papel acima e abaixo, e o rolo desliza no eixo x.

## 3. Materiais em `canvas()` (1080×1920)
- **Papel (washi):** `fillStyle=CRM` na tela toda; fibras = 700 traços de 40–140 px, 1 px de largura, alfa .09, direção horizontal com ±6° (`mulberry(seed)`); envelhecimento = 40 elipses de 60–120 px em `BLK` a alfa .03, só a menos de 90 px das bordas. Desenhe as fibras **por último**, por cima da tinta: o papel aparece através da cor.
- **Folha e borda dupla:** retângulo de 940 px de largura centrado (x=70..1010), borda externa 6 px `BLK`, interna 2 px, vão de 8 px; `ctx.save(); ctx.clip()` nesse retângulo para tudo que é estampa. Fora dele é papel liso, parte da composição; nas passagens aparece o rolo de montagem (`CRM` escurecido 12 % com `multiply`, 120 px de vão entre folhas).
- **Um bloco por cor:** desenhe cada grupo em sequência com `ctx.translate(dx,dy)` fixo por bloco: dominante (+2,+1), secundária (−1.5,+2), vermelhos (+1,−2); a linha-chave em (0,0). Deslocamento fixo por bloco, nunca por quadro (por quadro lê como tremor).
- **Veio de madeira:** 28 iso-linhas horizontais ondulantes, `y + 14*vnoise(x*0.012 + i*3.7)` com um ponto a cada 8 px, espaçadas 24–40 px, largura 1.5, `BLK` a alfa .05, `globalCompositeOperation='source-atop'` sobre o bloco dominante (mais forte no céu e na água). **Baren:** 8–12 arcos de raio 120–260 px, `lineWidth` 10–18, `destination-out` a alfa .06, centros fora da folha. **Goma-zuri:** 1 200 pontos de 1–2 px em `destination-out` a alfa .3 (`mulberry(seed+1)`); o bloco da linha recebe só os pontos.
- **Bokashi por coluna:** para cada coluna de 4 px, `y0 = base + 28*(vnoise(x*0.004 + seed) - .5)` e `fillRect(x, y0, 4, 220)` com `createLinearGradient(0, y0, 0, y0+220)` da cor para transparente. Nunca faixas horizontais de `fillRect` (emenda vertical visível). Sumi-bokashi no topo do céu: `BLK` alfa .35 → 0 em 180 px.
- **Linha-chave:** 2.4–3 px `BLK`; contornos grandes como polígono preenchido de largura variável (`w = 2.6 + 0.9*vnoise(s*6)`, afinando a 0 nas duas pontas, um ponto a cada 12 px). O que está longe leva linha cinza (`BLK` alfa .45) ou nenhuma.
- **Névoa (faixas achatadas):** 3 a 5 retângulos de 600–900×44 px com pontas arredondadas, `CRM` a alfa .9, entre as camadas, sumindo nas duas pontas (`globalAlpha` × `ss(seg(u,0,.15))` × `ss(seg(1-u,0,.15))` ao longo da faixa).
- **Figuras e selo:** figuras de 80–130 px, silhueta chapada em uma cor com linha-chave e rosto em 2 ou 3 traços (nunca pictograma de cabeça redonda). Selo = quadrado `RED` de 90 px com cantos lascados (polígono de 12 pontos com ±4 px de `hash`) e 2 ou 3 "caracteres" vazados em `CRM` (`evenodd`), sempre em `source-over`.

## 4. Cor (paleta do compose.json)
Um conjunto de pigmentos, não um círculo cromático: 5 blocos sobre o papel. `CRM` é o papel e tudo o que é branco (espuma, neve, névoa, céu vazio: **o branco é papel, nunca pigmento**) · a cor dominante do reel (`RED2` ou `BLK`, o "azul da Prússia" vira a cor mais escura da marca) leva céu, água e o bloco maior · `AMB` secundária (campos, telhados, luz) · `BLK` linha-chave e sumi-bokashi · `RED` **raro**: o selo, um sol, uma peça de roupa, o número-chave. Longe = pálido e sem linha (a cor a alfa .55 sobre o papel); perto = saturado com linha escura. A alternância de fundos (GUIDE, regra 12) se cumpre trocando o bloco dominante entre vistas vizinhas (`RED2` → `AMB` → `BLK`), nunca dois escuros seguidos. Texto escolhe a tinta pelo contraste com o bloco de baixo (≥ 4,5:1).

## 5. Tipografia
A fonte é a da marca (`assets/fonts/font.otf`); o estilo muda o tratamento, não a família. Texto nunca flutua: mora **em cartuchos** (faixa `CRM` com borda dupla 4+1.5 px e um selo `RED` de 40 px na ponta esquerda). Cartucho vertical (120×520 px, num canto da folha, letras empilhadas ou texto a −90°) para o título da vista; cartucho horizontal (até 940×130 px, acima da cabeça) para o fato da cena, em caixa-alta espaçada para rótulos e `BLK` grande para números. Palavra gigante do kit (`giant`) em `back` entra como mais um bloco de cor: impressa em `RED2` fora de registro 2 px com a linha-chave `BLK` de 3 px por cima; sem sombra, sem brilho, sem `-webkit-text-stroke`.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **A estampa é parada.** Quase nada se move; cada vista tem uma ou duas ações pequenas (vapor, chuva, uma lanterna, uma folha caindo). Figuras e natureza andam em **8 fps** (`Math.floor(t*8)/8` dentro do `draw`); chuva e água rápida em **12 fps** (`Math.floor(t*12)/12`); a câmera de mundo anda em ones (30 fps): câmera escalonada treme.
- **Revelação por impressão:** cada bloco entra em ~0,3 s por uma varredura diagonal de baren com borda ruidosa (`clip` num polígono cuja borda avança `seg(t, t0, t0+.3)` com ±18 px de `vnoise`) e **desliza 5–6 px até o registro** ao pousar (`lerp(6, 0, eo(seg(t, t0+.2, t0+.35)))`). Ordem: linha-chave, dominante, secundária, vermelhos, 0,12 s entre blocos. Ruído puro na borda lê como mofo.
- **Cartuchos** caem (fade + deslize de 24 px com `eo`, 0,35 s); o **selo carimba** (escala 1,35 → 1 em 0,2 s com `bk`).
- Movimento sustentado enquanto o texto fica: a névoa deriva 20 px em 2 s (`none`), a fumaça sobe; o veio de madeira e as fibras não andam (são do papel, não do mundo).
- Um move nativo precisa de **uma batida segurada de ~1 s** para ser lido; um pico de menos de 1 s lê como ruído.
- Não existe fade para preto. A estampa sai por rolo (desliza), por nova impressão (a próxima cobre) ou por lavagem de volta ao papel (blocos somem em ordem inversa, 0,4 s).

## 7. Câmera de mundo (`world=`)
A câmera anda **sobre** a estampa e entre estampas; nunca gira em 3D dentro de uma (`rx`, `ry` só ao atravessar a margem). O rolo de verdade é desenhado dentro do `canvas()` (a folha seguinte entra pela direita: `ox = -1060 * ss(seg(t, t0, t0+.7))`, desenhado com sobra `x=-80, w=W+160`); `world=` dá só a parallax entre folha, locutor e frente.
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Quadro travado numa folha | sem world, `move=1.0` | um lugar; um retrato; um momento parado |
| Rolo direita → esquerda pelo vão de montagem (deslize mais curto = urgência) | `dict(x=-120, ease='none')` em cenas vizinhas sem `snap` (oner) | jornada; etapas; cadeia de passos (plano-assinatura típico) |
| Push muito lento para um objeto-moldura (janela, leque, portão) | `dict(scale=1.18, d=2.4)` | descoberta; o detalhe que importa |
| Tilt passando a borda para a margem | `dict(y=100, rx=-4)` | algo maior que a estampa; número que estoura |
| Pull-back de uma folha para várias | `dict(scale=.9, y=-40)` | resumo; linha do tempo; coleção |
| Crash-zoom na textura (fibras, pontos) | `dict(scale=1.35, d=.4, ease='power3.in')` | memória; "o que é isso de verdade" |
| Pan por um tríptico (três folhas lado a lado) | `dict(x=-120)` + arte desenhada com 3 folhas de sobra | panorama; três vozes; três planos |
| Corte seco para folha em branco | `tr='cut'`, sem world, hold ≥ 1 s | *ma*; respiração antes da virada ou da CTA |

## 8. Transições feitas no meio
- **Rolo:** a vista atual desliza para a esquerda dentro do mesmo `canvas()` (0,6–0,8 s com `ss`) e a próxima chega pela direita, passando pelo vão de montagem de 120 px; cena longa ou cenas vizinhas sem `snap`.
- **Impressão por cima:** a próxima vista imprime bloco a bloco sobre a atual (linha, dominante, secundária, vermelhos: 0,5 s no total).
- **Lavagem para o papel:** os blocos somem em ordem inversa (0,4 s) e a folha fica em branco antes da próxima; é a respiração.
- **Primeiro plano extremo cruza o quadro:** um galho, poste ou lanterna em `front` atravessa (0,4 s) e, atrás, a vista trocou; cobertura total num quadro, centrada na troca.
`tr=` do `scene()` é o fallback: `slide` imita o rolo; `cut` só para a folha em branco. Sem cross-dissolve, sem flip 3D.

## 9. Som (assets/sfx)
Sem trilha: só a voz e os sfx, e o silêncio é parte do estilo (*ma*). `whoosh-short` no rolo deslizando (atrito de papel) · `click-soft` em cada bloco que pousa no registro, `click` no último · `impact-bass-2` no selo carimbando · `pop` no cartucho caindo · `sparkle` no acento `RED` (sol, número) · `whoosh-cinematic` no tilt que rompe a margem · `riser` de 0,8 s antes do crash-zoom. Dois silêncios de verdade: um na folha em branco antes da virada (sem sfx) e um antes da CTA. O som do rolo começa 0,1 s antes do deslize.

## 10. Moves nativos (menu)
- **Série de vistas.** Um mesmo assunto composto diferente em cada folha; a história é *onde ele está no quadro*. *Serve:* prova (o mesmo resultado em 4 clientes); um produto em cinco situações.
- **O rolo.** Nada corta: a câmera desliza e a próxima estampa chega. *Serve:* passos; etapas de um método; linha do tempo (plano-assinatura).
- **Impressão bloco a bloco.** Linha primeiro, cada cor pousa fora e encaixa. *Serve:* gancho ("como isso é feito"); o número-chave sendo impresso.
- **O branco é papel.** Névoa, neve e céu vazio são papel não impresso; o branco pode inundar e lavar a estampa. *Serve:* o "antes" apagado; recomeço; respiração.
- **A moldura é objeto.** Borda, cartucho e selo são físicos; algo grande rompe a borda e invade a margem. *Serve:* número que estoura; oferta que "não cabe".
- **Outra impressão.** A mesma linha-chave reimpressa com outros blocos de cor (dia → noite, verão → inverno). *Serve:* antes/depois; com e sem o produto; 1 ano × 10 anos.
- **Tríptico.** Uma cena dividida em três folhas que se juntam num pan. *Serve:* três benefícios; três planos; três gerações.
- **Só o selo.** A estampa lava para o papel e sobra o selo `RED`. *Serve:* CTA; assinatura da marca; fecho.

## 11. Armadilhas
- Bokashi em faixas de `fillRect` deixa emendas verticais → por coluna de 4 px com `vnoise` no topo.
- Pontos e fibras demais fazem a área escura parecer lixa → goma-zuri alfa .3, fibras alfa .09, e só; o grão do kit já conta.
- Grade em perspectiva para campos lê como digital → camadas paralelas, inclinadas, chapadas; linhas cruzadas paralelas, nunca convergentes.
- Pinheiro como meio-disco lê como guarda-sol → almofadas chapadas de agulhas em leque.
- Contorno deslocado se cruza em curva fechada → construa a linha interna pelo lado suave e mantenha os pontos x-monotônicos.
- Romper a moldura precisa escapar das **duas** máscaras (clip da folha e clip da borda).
- Selo com `multiply` some sobre fundo escuro → `source-over`.
- Registro deslocado por quadro lê como tremor; figuras em 30 fps viram cel de anime → deslocamento fixo por bloco, `Math.floor(t*8)/8` nas figuras.
- Rolo só por `world=x` não anda: o limite é ±120 px → o deslize é desenhado dentro do `canvas()` com sobra; `world=` dá a parallax.
- Locutor "dentro" da estampa (tinta sobre o corpo, linha-chave na foto) → o locutor fica na margem de papel; a estampa é fundo em `back`.
- Cartucho sobre o rosto ou o queixo → acima da cabeça ou no peito; zona segura topo 200, base 380, laterais 70.
- Texto do cartucho fora da zona segura depois do tilt para a margem → desenhe com margem de 60 px ou reduza o `rx`.
