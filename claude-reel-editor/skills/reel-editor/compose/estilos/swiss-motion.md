# Suíço em movimento (swiss-motion)

> Estilo tipográfico internacional em movimento: grade modular, uma fonte, uma cor-sinal e movimento exato como prensa. Tudo encaixa na grade, todo movimento pousa numa palavra da fala, nada quica.
> Adaptado de `lemo-opuscar/styles/swiss-motion/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (pôsteres de Zurique dos anos 50–70 para grade, texto alinhado à esquerda e contraste de escala; sistemas de identidade em movimento para o snap na batida): nunca copie a composição de um pôster histórico (nada de círculos concêntricos ou leques), nunca nomeie instituição real.

**Serve para:** número grande, lista de regras, oferta com preço, comparação em células. **Encaixe:** com locutor ★★★ (grade, uma cor-sinal, numeral gigante atrás do locutor, snaps na batida da fala) · só motion ★★★ · marcas com uma cor forte e fonte grotesca ★★★.

## 1. Essência (e o que não é)
**Design gráfico 2D puro animado numa grade**: papel chapado, tipo e barras pretas, um cinza muito claro e **uma** cor-sinal saturada. **Todo elemento encaixa na grade, todo movimento pousa numa batida, nada quica.** Rigor com uma exceção: o quadro inteiro obedece a um sistema, então o único elemento que desobedece vira personagem. **Contraste extremo de escala**: um numeral gigante ao lado de notas técnicas minúsculas. Não é keynote (sem degradê, brilho, mockup de aparelho), não é tipografia cinética de lyric video (palavras não voam, giram nem quicam), não é visualização de dados (barras têm massa como forma gráfica, não como quantidade, a menos que a grade dê esse sentido), não é pastiche Bauhaus de formas primárias. O grão e a vinheta do kit e a luz radial dos fundos contradizem o estilo: a página é um `canvas()` chapado em `back` cobrindo o plate, e `grain` em compose.json vai a 0.

## 2. Com o locutor
- O spread vira vertical: **programa** (numeral, regra, notas) em `back` acima da cabeça, entre 200 e 720 px; **artefato** é o próprio locutor. Numeral de 200 a 720 px fica livre da cabeça em M e L, no máximo um terço coberto em XL; nunca com XXL (a cabeça cobre mais de 50 %, o `render()` reprova).
- Grade do quadro: **6 colunas de 136 px, calhas de 24, margens 72** (coincidem com a zona segura lateral), linha-base 24 px, 1340 px úteis entre 200 e 1540. Coluna `c` começa em `x = 72 + c*160`; `n` colunas medem `n*160 − 24`.
- Nada sobre o rosto: a barra-sinal passa **atrás** do locutor (`back`); em `front` só notas e preço na altura do peito, com até 2 colunas de largura. CTA: locutor XXL, o programa desce para o peito em `front`, URL em nota técnica de 34 px.
- Só motion: o spread é topo (programa) e base (artefato) com a calha em y = 960; o artefato ocupa 1540 − 960 = 580 px.

## 3. Materiais em `canvas()` (1080×1920, sobra `x=-80, y=-80, w=W+160, h=H+160`)
**Motor pronto:** `canvas(p, draw, d, engine='swiss')` põe `SW` no escopo do draw (código em `engines/swiss.js`, demo em `engines/demos/swiss.py`). Use as funções dele antes de desenhar à mão; as receitas abaixo são o que elas implementam e o que falta nelas.
`SW.grid({cols,margin,gutter,base})` → `g.x(c)`, `g.span(n)`, `g.row(r)` · `SW.page(ctx,w,h,cor)` · `SW.gridLines(ctx,g,h,cor,alfa)` · `SW.snap(t,t0,dur)` curva única de snap · `SW.linear(t,t0,t1)` a exceção · `SW.riseText(ctx,t,t0,texto,x,y,font,cor,{t1,align})` texto que sobe por clip · `SW.numeral(ctx,t,t0,texto,x,y,size,cor,{steps,module})` numeral gigante em degraus · `SW.bar(ctx,t,t0,x,y,w,h,cor,{dir})` · `SW.rule(...)` filete linear · `SW.wipe(ctx,t,t0,x,y,w,h,draw,{dir})` · `SW.knife(ctx,t,t0,x,y,w,h,draw)` corte de faca · `SW.playhead(ctx,t,t0,t1,x0,x1,y,cor)` · `SW.caption(ctx,t,t0,linhas,x,y,{width})` notas com filete · `SW.cells(x,y,w,h,n,m)` células iguais · `SW.ripple(cx,cy,x,y)` atraso por distância

- **Página e papel:** `fillStyle=CRM` na tela toda, depois `rgba(0,0,0,.04)` por cima (página); células e cards são CRM puro (papel) e aparecem por wipe (`ctx.rect(x, y, w*eio(seg(t,t0,t0+.25)), h); ctx.clip()`). Sem `createLinearGradient`, sem sombra, sem partícula, sem `grain()`.
- **Linhas da grade:** 1 px BLK a .08 nas 7 verticais, crescendo do topo (`seg` linear, .3 s, 1 quadro de atraso entre colunas) enquanto a página se monta; depois ficam a .04 sob tudo.
- **Barras e blocos:** `fillRect` encaixado na grade; células consecutivas de uma mesma unidade viram um retângulo só, com 1 px de sobra nas emendas (`w+1`) para não aparecer fio ao girar ou escalar.
- **Numeral gigante:** `ctx.font='600 640px Aspekta'`, `ctx.letterSpacing='-13px'` (−2 %), `textBaseline='alphabetic'`; alinhado opticamente: `x = 72 − measureText(s).actualBoundingBoxLeft`. Sobe em degraus: 4 passos de um módulo (96 px) com `eio` de .12 s cada, pousando o último na palavra.
- **Texto por máscara:** `ctx.rect(x, base − size, w, size*1.15); ctx.clip()`; entra `y = base + size*(1 − eio(seg(t,t0,t0+.3)))` (sobe de baixo da linha-base), sai `y = base − size*ei(seg(t,t1,t1+.25))` (para cima). Nunca alfa.
- **Corte de faca:** linha BLK de 2 px cruza o elemento em .12 s (`seg` linear, 1400 px/s); depois o elemento colapsa para a linha do meio: `scaleY = 1 − ei(seg(t,t1,t1+.2))` em torno do centro.
- **Playhead e exceção:** linha de 4 px ou o elemento-sinal andando `x = lerp(x0, x1, t/d)` linear, sem snap, podendo parar no meio (`seg` em dois trechos); ao lado, um readout de 32 px que muda de "na grade" para "fora da grade" no quadro em que `x % 160 !== 72`.
- **Notas técnicas:** 32–36 px peso único, régua de 1 px BLK a .3 logo acima, em canto de coluna (tamanho do módulo, contagem, contador de barras). **Voz secundária:** os mesmos blocos em BLK a .12 sob os pretos: profundidade sem segunda cor.

## 4. Cor (paleta do compose.json)
`CRM` página e papel · `BLK` tinta; os cinzas são `BLK` a .08 / .16 / .30 · **uma** cor-sinal por reel, `RED` **ou** `AMB`, escolhida pelo assunto e nunca trocada; só **uma** coisa por cena a carrega, e é a única autorizada a ser inexata · `RED2` não entra: seria a segunda cor. Sobreposição permitida: tipo BLK sobre a cor-sinal. A alternância de fundos entre cenas vizinhas (regra 12) se cumpre com a página inteira na cor-sinal com tinta preta a cada 3 cenas, nunca com uma cor nova. Contraste do numeral ≥ 4,5:1 (BLK sobre CRM, CRM sobre RED).

## 5. Tipografia
A fonte é a da marca (`Aspekta`, `assets/fonts/font.otf`), uma família para o reel inteiro; o estilo muda o tratamento, não a família. Tracking −2 % a partir de 90 px (`letterSpacing` no canvas; meça **depois** de definir fonte e tracking). Títulos podem ser minúsculos. **Alinhado à esquerda, direita desalinhada**, tudo numa linha da grade; o branco grande é parte do layout. Corpos: numeral 520–720 px (optical flush-left), afirmação 72–96 px, lead-in 34 px em BLK a .5, notas 32–36 px, URL da CTA 34 px monoespaçada (`MONO`). Palavra gigante do kit (`giant`): aqui é o numeral ou uma palavra de 2 linhas em `back`, entrando por máscara; `phrase` do kit (sobe por máscara em grupos) combina; helpers com `back.out` (pop, slam de escala) ficam fora. Tempo de leitura: letras ÷ 15 + 1,5 s, segurado onde a câmera para.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **Duas curvas só:** snap = `ease:'power3.inOut'` nos tweens GSAP e `eio` no canvas; linear (`ease:'none'`, `seg`) para linhas sendo traçadas, playhead e a exceção. Nada de `back`, `elastic`, `bounce`, `spring`, `bk`.
- **A batida é a palavra:** cada chegada pousa no `start` de uma palavra de `assets/transcript.json`; o snap dura .2 s e começa .2 s antes (`at = start − .2`); movimento longo .4 s; onset em quadro inteiro (`at = round(t*30)/30`), senão tremula.
- **Entradas são wipes ou máscaras, nunca fade:** palavras sobem de baixo da linha-base e saem para cima; linhas crescem no comprimento; papel aparece por wipe; numeral sobe em degraus. **Remoção é corte de faca.**
- **Ondas ordenadas por distância** da causa: cada célula espera `dist/1000` s (duas células por subdivisão).
- **A exceção anda diferente:** linear, sem snap, talvez pausando no meio; ela é também o movimento sustentado da cena (regra de nunca 1 s parado): quando não há exceção, um playhead linear de 4 px cruza a grade em > 1 s.
- `move=1.0` em toda cena (prensa não deriva); a câmera de mundo faz os snaps com `d` ≤ .4 começando numa palavra. Sem twos, sem passos: precisão digital, não mão.

## 7. Câmera de mundo (`world=`)
Vocabulário, não rota: só com a curva precisa (`ease='power3.inOut'`) e só na batida.
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Spread travado | sem `world`, `move=1.0` | regra aplicada; antes/depois; comparação |
| Pan duro de uma coluna | `dict(x=-120, d=.25, ease='power3.inOut')` | próximo passo; catálogo; linha do tempo |
| Girar 90° e parar | o artefato gira no canvas (`ctx.rotate`, `eio` .4 s) e `dict(rz=-4, d=.4)` acompanha | a mesma coisa lida de outro jeito: tabela como mapa |
| Pull out para a parede de artefatos | `dict(scale=.9, d=.5)` sobre a parede desenhada em 2×3 células (`ctx.scale(.33)`) | sistema; linha de produtos; série |
| Push num módulo | `dict(scale=1.3, x=-80, y=60, d=.3)` | detalhe; a unidade; um dado |
| Grade além da página | `dict(scale=.92, d=.4)` com as linhas da grade desenhadas na sobra de 80 px | escala; ambição; sair da restrição |
| Dividir em células iguais | sem `world`; 2–4 células abrem por wipe em sequência de 2 quadros | opções; variantes; planos |
| Rolagem vertical por uma coluna | `dict(y=-120, ease='none')` numa cena longa, `signature=True` | lista; manifesto; tabela de preços |

## 8. Transições feitas no meio
- **Barra-sinal varre:** a barra cresce de 1 para 6 colunas em .25 s (`eio`), cobre o quadro, `tr='cut'` por baixo, e na cena seguinte recua revelando a nova página.
- **Corte de faca no quadro inteiro:** a linha cruza a tela, tudo colapsa para a linha do meio; corte; a próxima cena abre da linha do meio (`scaleY` 0 → 1 em .2 s).
- **Re-flow:** numa cena longa, os elementos se rearranjam no layout seguinte, os mais próximos da mudança primeiro.
- **Pan de página:** o conteúdo do canvas anda 1080 px em .25 s (`eio`) e o `world=` anda 120 px no mesmo sentido para o locutor acompanhar com parallax.
`tr='wipe'` é o fallback; `cut` só sob a barra ou a faca; `push` e `fade` nunca (têm fade e zoom).

## 9. Som (assets/sfx)
Não há trilha com pulso: o pulso é a voz, e um som por snap, no máximo um a cada .25 s. Foley de prensa, seco: `click` no bloco que encaixa e no numeral que pousa (a .5 junto com `impact-bass-2` a .4 no degrau final) · `click-soft` na linha sendo traçada · `key-press` no texto que sobe por máscara · `whoosh-short` no wipe e no pan · `error` uma vez, no corte de faca que remove · `typing` sob o readout da exceção · `sparkle` ou `chime` só para a exceção (o único elemento que canta), uma vez · `riser` nunca em cena vizinha de um silêncio. Dois silêncios de verdade: tudo para num pouso e o snap seguinte vira evento. O som da próxima cena começa 0,1 s antes do corte.

## 10. Moves nativos (menu)
- **A grade significa algo.** Colunas e linhas viram quantidade (dias, aulas, parcelas). *Serve:* número; passos; oferta (12 parcelas = 12 células).
- **Snap = batida.** Toda chegada numa palavra. *Serve:* lista de regras; passos; contagem regressiva.
- **Programa.** Regras aplicadas uma a uma a um artefato, depois o mesmo programa gerando vários. *Serve:* prova (o método); oferta (o que está incluso).
- **Contraste extremo de escala.** Numeral gigante como cartão de capítulo ao lado de notas minúsculas. *Serve:* gancho; número; preço.
- **A exceção.** Um elemento sai da grade, linear e sem snap. *Serve:* gancho (você × a média); prova (o caso que fugiu); CTA (o botão que anda sozinho).
- **Corte de faca.** Um elemento apagado por uma linha. *Serve:* objeção cortada; "sem taxa"; antes/depois.
- **Re-flow.** Tudo se rearranja em volta de uma mudança, mais perto primeiro. *Serve:* comparação (uma célula cresce, as outras cedem); passos que mudam de ordem.
- **Parede de artefatos.** Um programa, muitas saídas. *Serve:* CTA (tudo o que vem junto); série.

## 11. Armadilhas
- Muitas colunas finas parecem gráfico → 6 colunas de 136 px; módulos que dão massa.
- Composição "melhor" que não é obviamente melhor → uma diagonal forte com ritmo longo/curto, elemento-sinal maior, sangria, tipo sobre cor; só inclinar não basta.
- Girar e rotular ao mesmo tempo lê como ruído → gira, segura, depois rotula.
- Emendas de barras aparecem depois de girar → 1 px de sobra.
- `letterSpacing` muda o `measureText` → defina fonte e tracking antes de medir.
- Onset entre quadros tremula → `at` em quadro inteiro.
- Sinal em duas coisas é dois protagonistas; `RED2` é segunda cor → fora.
- Numeral coberto pela cabeça > 50 % → numeral entre 200 e 720 com locutor M/L; nunca XXL com numeral; notas no peito só em `front` e até 2 colunas; nada sobre o rosto (zona segura: topo 200, base 380, laterais 70).
- Texto fora da zona segura depois do push → com `scale=1.3` o texto lido fica entre x 180–900 e y 380–1400 em px de mundo (zona segura dividida pela escala, a partir do centro).
- Grão, vinheta e luz radial do kit sobre a página chapada → canvas cobre o plate, `grain` em 0.
