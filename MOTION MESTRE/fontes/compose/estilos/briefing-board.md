# Quadro de briefing (briefing-board)

> Uma parede de quadro branco de verdade, filmada: luz de janela no esmalte, fantasmas de marcador apagado, moldura e calha. Fotos recortadas pousam nela com peso; etiquetas, ímãs, régua e carimbo se prendem a ela; a tinta do marcador se desenha em três cores com significado fixo. A câmera percorre as linhas de fato em fato e só no fim recua para mostrar o briefing inteiro.
> Adaptado de `lemo-opuscar/styles/briefing-board/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (explicadores filmados numa parede de mapa; o recuo longo sobre uma parede coberta de trabalho; convenções de desenho técnico: cota, linha de projeção, hachura): nunca copie um quadro, nome ou marca real.

**Serve para:** explicar com evidência, comparação com número real, roteiro de passos, veredito. **Encaixe:** com locutor ★★★ (o recorte é a foto principal presa no quadro; os prints do site em `assets/img/` são as outras) · só motion ★★★ · marcas com fotos reais e um site com prints ★★★.

## 1. Essência (e o que não é)
Um **quadro físico numa sala**: esmalte, queda de luz da janela, reflexo diagonal deslizando, fantasmas de trabalho anterior, moldura. **Coisas reais presas nele**: fotos recortadas (o locutor e os prints do site), a milímetros do esmalte, com sombra de uma janela só, em parallax; são evidência, nunca imagem gerada apresentada como real. **Tinta que significa**: grafite para nomes e regras, tinta de medida para cotas e números medidos, vermelho só para a decisão; ideia rejeitada é apagada até virar fantasma. **Uma parede contínua**: sem páginas, a câmera viaja por linhas, projeções e chamadas. **A parede inteira, uma vez**: cada cena é um recorte do briefing final, visto completo só no recuo do fim, como pôster. Não é "whiteboard explainer" (mão desenhando line art numa página chapada): o quadro é objeto filmado, os sujeitos são fotos. Não é data storytelling: comparação é cota em unidade real ao lado de coisa real. Não é keynote: sem cabeçalho, bullets centralizados, virada de página.

## 2. Com o locutor
- O recorte do locutor é **a foto recortada principal** presa no quadro: dê a ele a sombra de janela dos outros prints (`<style>#ccam{filter:drop-shadow(16px 22px 14px rgba(0,0,0,.35))}</style>` no html de `back`; se pesar no render, uma elipse BLK a 25 % no chão, em `back`) e um ímã em `front` no ombro, nunca na cabeça.
- A tinta escreve em volta dele: nomes, regras e a palavra gigante em `back`, acima da cabeça (borda de cima em 200 px); cotas, números medidos e etiquetas em `front` na altura do peito, só se não encostarem no queixo. Prints do site pousam acima da cabeça em `front`, 420–520 px de largura.
- Enquadramentos: L ou XL enquanto a tinta desenha em volta; M quando a cota precisa do peito; XXL só na CTA, com o mundo em `scale=.9`: o locutor cresce enquanto a parede recua, e esse contraste é a revelação. Só motion: a linha principal fica entre 300 e 1500 px; o resto é camada secundária.

## 3. Materiais em `canvas()` (1080×1920, desenhe com sobra `x=-80, y=-80, w=W+160, h=H+160`)
**Motor pronto:** `canvas(p, draw, d, engine='briefing')` põe `BB` no escopo do draw (código em `engines/briefing.js`, demo em `engines/demos/briefing.py`). Use as funções dele antes de desenhar à mão; as receitas abaixo são o que elas implementam e o que falta nelas.
`BB.board(ctx,w,h,seed)` esmalte com luz de janela e fantasmas · `BB.ink(ctx,t,t0,pontos,cor,{width,speed})` traço de caneta por comprimento · `BB.arrow(...)` seta · `BB.letter(ctx,t,t0,texto,x,y,size,cor,{cps,seed,tilt,align})` letras de caneta glifo a glifo · `BB.dimension(ctx,t,t0,x0,y0,x1,y1,rótulo,cor)` cota com setas · `BB.projection(...)` tracejado entre vistas · `BB.image(src)` + `BB.pin(ctx,t,t0,img,x,y,w,h,{tilt,magnet})` foto recortada que pousa com peso · `BB.magnet(ctx,t,t0,x,y,cor)` · `BB.tag(ctx,t,t0,texto,x,y)` etiqueta que balança · `BB.stamp(ctx,t,t0,texto,x,y,cor,{rot})` carimbo do veredito · `BB.ghost(ctx,chave,w,h,draw)` ideia apagada · `BB.hatch(ctx,path,cor,espaço)`

- **Esmalte:** `fillStyle=CRM` na tela toda; queda de luz = `createRadialGradient(-200,300,0,-200,300,1600)` branco .18 → transparente; canto oposto `rgba(0,0,0,.10)`; fantasmas = 10 traços BLK de largura 30 e alfa .06 com semente fixa (`mulberry(seed)`), sem `filter` (blur por quadro pesa); reflexo = paralelogramo branco a .07, 260 px de largura, andando `x = lerp(-300, 1300, t/d)`; moldura de 40 px BLK a .85 desenhada **só na sobra** (`x<0`, `x>w`): aparece apenas no recuo final. Respiração de mão: `ctx.translate(vnoise(t*.7)*3, vnoise(t*.7+9)*3)` antes de tudo.
- **Tinta de marcador:** `lineCap='round'`, `lineJoin='round'`, largura 14 (conteúdo) ou 22 (veredito), `globalCompositeOperation='multiply'`, `globalAlpha=.9`; núcleo claro = o mesmo traço com largura 4 e branco a .18 por cima; brilho da ponta molhada = ponto branco r 5 a .6 na ponta que está desenhando. Desenho à velocidade da mão: `setLineDash([L,L]); lineDashOffset = L*(1-seg(t,t0,t0+L/1400))` (1400 px/s, `L` = comprimento do traço, constante no draw).
- **Letras de marcador:** `ctx.font='600 120px Aspekta'`, um glifo por vez a 12 glifos/s (`n = Math.floor(seg(t,t0,t0+len/12)*len)`), cada glifo com `rotate` de ±3° e linha-base ±4 px vindos de `mulberry(seed)`; `strokeText` largura 6 na mesma cor sob o `fillText` engorda como caneta.
- **Cota (linha de medida):** linha de tinta de medida largura 8, linhas de extensão 2 px BLK a .4, setas de 26 px que pousam com um toque (escala 1.4 → 1 em 3 quadros, `ei`); o número ao lado em 100–140 px escrito depois da seta. Uma escala só por reel (ex.: 1 px = 1 real): grandezas comparadas dividem a mesma régua, 900×60 em BLK a .75 com marcas CRM a cada 20 px.
- **Print do site:** `<img src="assets/img/...">` em `front`, sem borda, `filter:saturate(.8) sepia(.08) contrast(.95)` igual em todos (uma gradação só), `rotate` de 2–6°; pousa vindo do lado da lente: `fromTo` escala 1.14 → 1, y −40 → 0, `back.out(1.2)` em .45 s, e no mesmo tween `box-shadow` de `24px 36px 40px rgba(0,0,0,.25)` para `8px 12px 14px rgba(0,0,0,.35)` (a sombra aperta ao pousar). Sem ampliar além da fonte: 420 px de print com push 1.3 precisam de ≥ 546 px de fonte (abra com Read e meça).
- **Ímã:** círculo r 22 em BLK (neutro) ou RED (veredito), brilho `rgba(255,255,255,.35)` r 14 deslocado (−6,−6), sombra elipse deslocada (4,6) a .3; clack = escala 1.35 → 1 em .1 s (`ei`), alfa 0 → 1 em 1 quadro. Removido: escala 1 → 1.6 e alfa → 0 em .2 s (`ei`), sai na direção da lente.
- **Carimbo:** texto 230–400 px em RED (ou BLK), `rotate(-8°)`, `globalAlpha=.88`; impressão falhada = 70 furos r 2–5 de `mulberry(seed)` dentro da caixa do texto com `destination-out`; pousa escala 1.18 → 1 em 4 quadros (`ei`) e o quadro inteiro tranca 6 px por 2 quadros (`Math.floor(t*30)` entre t1 e t1+2/30).
- **Apagar para fantasma:** retângulo de feltro 120×60 em CRM a .9 varre o traço em .35 s (`ss`); o que sobra é o mesmo traço com largura ×2.2 e alfa .07. Grão: só o do kit mais `grain(ctx,w,h,2500,.05,seed)` por cima do esmalte.

## 4. Cor (paleta do compose.json)
`CRM` esmalte e etiquetas · `BLK` grafite (nomes, regras, fatos, moldura, ímã neutro; a .35 vira o cinza de desenho técnico: extensão, hachura) · **uma** tinta de medida por reel, `RED2` ou `AMB` (cotas, linhas de projeção, números medidos) · `RED` só a decisão: rejeição, palavra-chave do veredito, o ímã que marca; no máximo 2–3 marcas vermelhas por quadro, nunca sobre um objeto vermelho. Cor cheia pertence às fotos; adereços ficam neutros. O fundo é o mesmo esmalte o reel inteiro (uma parede, não páginas): a alternância de fundo entre cenas vizinhas se faz invertendo o lado da luz (gradiente da janela à esquerda, depois à direita) e pela cor dominante do que entra (print, cota, carimbo). Tinta em `multiply` sobre a queda escura perde contraste: fatos ficam onde o esmalte está claro (≥ 4,5:1).

## 5. Tipografia
A fonte é a da marca (`Aspekta`, `assets/fonts/font.otf`); o estilo muda o tratamento, não a família. **Letras de marcador** (glifo a glifo, tombo e linha-base com semente): conteúdo 100–160 px, veredito 230–400 px, nunca mais de 2 linhas. **Etiquetas impressas** (tags, cards, carimbo): a mesma fonte reta, 36–44 px em caixa-alta, 1 a 3 palavras, em CRM com borda BLK 3 px. Linha de crédito/fonte do dado em monoespaçada 24 px (`MONO` do kit). Palavra gigante do kit (`giant`) em `back` vira letra de marcador: escrita, nunca por fade. Texto fica inteiro no quadro por letras ÷ 15 + 1,5 s a partir de quando termina de escrever; na parede final, o que deve ser lido tem ≥ 40 px desenhados (≥ 36 px na tela em `scale=.9`).

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **Sem passos:** tudo "on ones", nada em twos. Câmera de mundo com `ease='power2.inOut'` (inércia) ou `sine.inOut`; a respiração de mão (≤ 3 px) fica no canvas, nunca no `world=`; tremor só no impacto do carimbo.
- **Peso:** prints descem do lado da lente, pousam, quicam uma vez (`bk(seg(t,t0,t0+.45),1.2)`) e assentam enquanto a sombra aperta; ímãs estalam em .1 s; etiquetas balançam no pino `rotate = Math.sin(t*9)*8*Math.exp(-3*t)` graus; ímã removido pula para a lente; o que é golpeado tranca e volta. A câmera pode encontrar o pouso de perto (`world=dict(scale=1.25, d=.3)`) no detalhe mais eloquente e recuar.
- **Tinta à velocidade da mão:** 1400 px/s nas linhas, 12 glifos/s nas letras; cota pousa com toque de seta (3 quadros).
- A cada 1–2 batidas da fala algo pousa, se desenha ou balança; só os silêncios e o quadro de julgamento ficam parados (lá, o reflexo diagonal continua andando: é o movimento sustentado da cena).
- **Quadro de julgamento:** o item inteiro, o limite e o veredito, segurado ≥ 2,5 s; o veredito pousa depois que a câmera assenta (`world=` com `d=.8`, carimbo em `at=1.0`).
- **Nunca:** tween de `opacity` em texto, pop de escala em texto, `back.out` em UI, texto aparecendo sozinho. Entrada é pouso ou escrita; saída é apagar (fantasma), cobrir com um print ou a câmera deixar para trás.

## 7. Câmera de mundo (`world=`)
Projete a parede inteira em 1080×1920 (+80 px de sobra) como pôster; cada cena é um recorte dela com `scale` 1,15–1,3 e `x`, `y` até ±120. Antes do recuo: nunca as duas bordas laterais, nunca a zona reservada ao fim (camada secundária: prints pendurados, card de fonte, somas em post-it, um rascunho).
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Percorrer a linha (com a caneta ou a cota) | `dict(x=-110, ease='none')` | comprimentos comparados; rota; linha do tempo |
| Tilt pelas linhas de projeção | `dict(y=90, rx=-4)` | total → partes; planta → elevação |
| Push lento com leve holandês | `dict(scale=1.12, rz=2)` | problema chegando; prazo; estouro |
| Recuar e deslizar de lado | `dict(scale=.92, x=60)` | enunciar uma regra; virada do argumento |
| Chicote com a linha, passa, assenta | `dict(x=-100, d=.45, ease='expo.out')`; a ponta da linha passa 40 px e volta (`bk`) no canvas | resultado que excede; recorde |
| Subir pela linha de chamada | `dict(y=-100, scale=1.08)` | da evidência ao veredito; conclusão |
| Escada (cada item com o resultado anterior) | `dict(x=-60, y=60)` em cenas vizinhas sem `snap` (oner) | ranking; testes; opções |
| Quadro de julgamento | sem `world`, `move=1.0`, hold ≥ 2,5 s | aprovado/reprovado contra um limite; orçamento × teto |
| Recuo longo para a parede inteira | `dict(scale=.9, y=30)` na última cena, hold ≥ 3 s, `signature=True` | fim do argumento; CTA |

## 8. Transições feitas no meio
- **A câmera percorre:** sem corte; a cena seguinte continua a pose (sem `snap`) e a tinta da anterior sai do quadro pelo pan.
- **Um print pousa e cobre:** a foto pousa sobre o desenho e enche o centro por 1 quadro; a próxima cena nasce atrás dela (`tr='cut'` escondido pelo pouso).
- **Apagar e reescrever:** o feltro varre (.35 s) deixando o fantasma; a tinta nova escreve por cima (antes/depois).
- **Carimbo que tranca:** o quadro tranca 2 quadros no impacto e o corte vai dentro deles.
`tr='push'` é o fallback; `cut` só sob pouso ou carimbo.

## 9. Som (assets/sfx)
Não há som de ambiente nem rangido de caneta: os dois silêncios são só a voz. `click-soft` na ponta que toca o quadro (início de cada traço e primeiro glifo) · `key-press` na seta da cota pousando · `click` no ímã (fileira: volumes .5 → .9, um por batida, como alturas diferentes) · `pop` no ímã removido · `impact-bass-2` a .6 no pouso de print · `impact-bass-1` no carimbo · `error` uma vez, no apagar que rejeita · `whoosh-short` no chicote · `whoosh` no recuo final · `chime` no círculo em volta da resposta. O som do que vai pousar começa 0,1 s antes do corte; o primeiro som depois de um silêncio é um impacto.

## 10. Moves nativos (menu)
- **A parede inteira.** Projete a parede primeiro, cada cena é um recorte, uma zona só aparece no fim. *Serve:* CTA (lockup com tudo o que foi provado); resumo de passos.
- **Percorrer a cota.** Uma grandeza desenhada como comprimento real; a câmera anda com a ponta. *Serve:* número; comparação (3 planos, 4 prazos).
- **Linhas de projeção.** Tracejado de medida leva uma borda de um desenho ao outro, na mesma escala. *Serve:* prova (o número do site ↔ o número da fala); total → partes.
- **Ímãs contáveis.** Unidades estalam no ritmo e saltam fora quando uma regra as remove. *Serve:* passos; vagas; "só restam 12" (oferta).
- **Apagar para fantasma.** A ideia rejeitada some mas fica legível por baixo. *Serve:* antes/depois; "o que você fazia × o que fazer".
- **O carimbo.** O veredito pousa com baque e tranco. *Serve:* veredito; gancho (carimbo primeiro, depois o porquê).
- **Chamada ao veredito.** Seta do número decisivo até a conclusão. *Serve:* gargalo; "é por isso"; CTA.
- **A resposta física.** O print real pousado como solução. *Serve:* oferta; produto; prova.

## 11. Armadilhas
- Texto visto de passagem reprova o tempo de leitura → palavras onde a câmera descansa; cada item novo enquadrado com o resultado anterior.
- Só close-ups: o espectador nunca vê o item inteiro contra o limite → detalhe → quadro de julgamento → hold → veredito.
- Prints que não combinam → o mesmo `filter`, a mesma direção de sombra (+x, +y) e a mesma família de ponto de vista em todos.
- Print ampliado fica mole no push → confira a largura da fonte; se faltar, limite o `scale`.
- Letreiro dentro da foto (placa, logo de terceiro) → outra foto, ou corte a área.
- Parede vista cedo demais gasta o fim; parede final rala desperdiça → nunca as duas bordas antes do recuo; camada secundária enche o meio.
- Tinta, cota ou print sobre o rosto ou o queixo → nomes acima da cabeça (topo 200), cotas no peito, ímã só no ombro; o `render()` reprova.
- Texto fora da zona segura depois do push → com `scale=1.3` o texto lido fica entre x 180–900 e y 380–1400 em px de mundo (zona segura dividida pela escala, a partir do centro).
