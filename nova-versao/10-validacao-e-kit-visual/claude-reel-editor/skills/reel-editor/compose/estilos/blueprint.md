# Planta de engenharia (blueprint)

> Desenhos técnicos que ganham vida numa folha de cianotipia: linha branca sobre azul-da-prússia, traçada na ordem em que um projetista desenha, com anotações que se mexem.
> Adaptado de `lemo-opuscar/styles/blueprint/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (desenhos de patente do século XIX com Fig. 1 / Fig. 2, balões de peça e hachura fina; páginas de caderno de inventor; créditos de filme feitos de desenho técnico em movimento): nunca copie uma patente, uma máquina ou uma assinatura real.

**Serve para:** como funciona, mecanismo, passos de um processo, planta de um método, anotações vivas com medida. **Encaixe:** com locutor ★★ (a folha azul é o fundo atrás do locutor; o azul é variante de cena, não paleta da marca: `BLK` sob um véu azul, linha em `CRM`; o locutor é a mão do engenheiro, a coisa desenhada é o personagem) · só motion ★★★.

## 1. Essência (e o que não é)
O reel inteiro acontece **sobre uma folha de planta** e a câmera a lê como um olho lê um desenho. **Linha clara sobre azul irregular**: linhas de centro, contornos, hachura, cotas, linhas de chamada com balões numerados, carimbo de título, coluna de notas. **Linguagem de desenho 2D**: projeção ortográfica e oblíqua são permitidas; render 3D, nunca (a única exceção é a "coisa real", §10). A convenção rigorosa carrega o tom: o desenho é seco e exato; as notas podem ter humor, calor ou gravidade. **A coisa projetada é o personagem**: máquina, objeto, método ou plano agem pelas peças. Não é HUD holográfico (sem wireframe brilhante nem órbita 3D), não é quadro branco (sem pincel sobre branco), não é gravura (sem hachura tonal como a imagem toda).

## 2. Com o locutor
- A folha vai em `back`, em `canvas()` com sobra (`x=-80, y=-80, w=W+160, h=H+160`), e o desenho principal fica **ao lado da cabeça ou acima dela**: coluna esquerda x 70–430, coluna direita x 650–1010, ou faixa y 220–760 com o locutor em L/M. A linha nunca cruza o rosto.
- O locutor é **a mão do engenheiro**: a peça perto da mão dele se desenha quando ele aponta (alinhe o início do draw-on à palavra da fala em `assets/transcript.json` e confira o gesto na folha de contato). Balões e cotas que o corpo cobriria vão em `front`, na altura do peito (y ≥ 1200 em L), nunca sobre o rosto.
- Carimbo de título no canto superior direito (x 700–1010, y 220–330, `back`); coluna de NOTAS GERAIS à esquerda (x 70–400, y 220–700). O pé da folha (linha de terra, base, carimbo clássico) não existe: a base de 380 px é do locutor.
- Enquadramentos: M quando o desenho precisa do peito (planta inteira ao lado), L padrão, XL só no close da engrenagem (o desenho sobe para y 220–520). Só motion: a folha é a tela toda, o desenho ocupa ⅓ a ½ da altura, centrado.

## 3. Materiais em `canvas()` (1080×1920)
- **Folha (cianotipia):** `fillStyle=BLK` na tela toda, véu `rgba(28,78,160,.55)` por cima (o azul é desta cena, não do compose.json); irregularidade = 14 elipses `rgba(0,0,0,.08)` de 300–700 px com `mulberry(seed)` e `filter='blur(60px)'`, tudo isto dentro de `cache('folha', w, h, ...)` e desenhado por quadro com um só `drawImage` (o desfoque por quadro trava o render); 40 estrias de revestimento quase verticais `CRM` alfa .03, 2–6 px; 1200 fibras de 10–30 px alfa .04; bordas desbotadas = 4 lineares `CRM` alfa .06 de 90 px para dentro; 80 pintas de 1 px. **Dobras:** 2 vincos (1 vertical em x≈700, 1 horizontal em y≈1180): linha `CRM` alfa .18 de 1 px colada a uma `rgba(0,0,0,.25)` de 2 px, e um clareado de 20 px alfa .05 ao longo. Variante clara para alternar fundos (regra 12 do GUIDE): papel vegetal `CRM` com linha `BLK` alfa .8, mesmas fibras.
- **Linha:** `strokeStyle=CRM`, `lineCap='round'`, levemente macia (`shadowColor=CRM; shadowBlur=1.5`), com quebra de tinta: `globalAlpha = .85 + .15·vnoise(i·.7)` por segmento. **Quatro espessuras:** contorno 3,5 px · detalhe 2,2 · fina 1,4 · fio 1,0. Numa cena com push de mundo até `scale=S`, desenhe tudo com `lineWidth·S^-0.35` (1,35 → ×0,9) para o close não virar salsicha e o plano aberto não sumir.
- **Tracejados (convenção):** linha de centro `setLineDash([36,8,6,8])` · oculta `[8,6]` · fantasma/plano de corte `[36,8,6,8,6,8]`; `lineDashOffset` fixo por elemento (nunca correndo, exceto na corrente §6).
- **Draw-on por comprimento:** `setLineDash([L·seg(t, t0, t1), 1e5])` no path de comprimento L; **pena brilhante** na ponta: ponto `CRM` r=3 com `shadowBlur=10` no ponto do path a esse comprimento (acumule os segmentos da polilinha). Itens escalonados .08 s dentro da camada.
- **Ordem de desenho (cada camada numa batida da fala):** linhas de centro → contornos → detalhe → hachura → cotas → balões → rótulos. **Oclusão por ordem de pintura:** todo sólido é preenchido com a cor da folha antes de ter o contorno traçado. Extrusão oblíqua: `stroke` do contorno em N=6 passos de profundidade (dx=dy=6 px) a 2× a espessura, depois `fill` com a folha nos mesmos passos; a silhueta sobrevive limpa.
- **Hachura:** 45°, espaçamento 10–14 px, espessura fio, dentro de `clip(path)`; para seção, solo, peso. Entra linha a linha em .4 s.
- **Cotas e balões:** cota = fina, setas de 10 px fechadas, número na fonte da marca 26 px caixa-alta sobre um vão de 60 px na linha; o número muda com a peça (`Math.round(lerp(a, b, x))`). Balão = círculo r=18 fio + número 22 px, linha de chamada fio até a peça; balão voa junto com a peça na vista explodida.
- **Carimbo (o veredito):** retângulo girado −6°, borda `RED` 4 px, texto `RED` 54 px caixa-alta, alfa .9 com falhas (`grain` só dentro do clip do carimbo, n=600, a=.35); pousa com `bk(seg(t, t0, t0+.25), 2.5)` de scale 1,6 → 1. **Água:** gota = radial `rgba(10,30,90,.35)` com linha de maré `CRM` alfa .25 de 2 px; dentro do clip da gota, as linhas são retraçadas com `shadowBlur=6`.

## 4. Cor (paleta do compose.json)
**Azul e branco só:** a folha é `BLK` sob o véu azul (varia em valor: revestimento, manchas, dobras), a linha é `CRM` (varia em espessura e maciez, nunca em matiz). **Uma cor fora do azul, usada exatamente uma vez no reel:** o carimbo em `RED` (APROVADO, REPROVADO, REV. 3), que carrega o veredito. `AMB` só na "coisa real" (§10) como luz, nunca como linha. `RED2` não entra. A variante clara (papel vegetal `CRM` + linha `BLK`) alterna com a folha azul para nunca ter dois fundos escuros seguidos; o carimbo continua `RED` nas duas.

## 5. Tipografia
A fonte é a da marca (`assets/fonts/font.otf`); o estilo muda o tratamento, não a família: rótulos e notas em caixa-alta 26–32 px, tracking .12 em, `CRM` alfa .9; campos do carimbo de título em 22 px; o título do reel é o **cabeçalho da folha** (y 220–300, 44 px, com a linha dupla de borda embaixo). **Texto é lettering:** entra da esquerda para a direita com um `clip` de largura `w·seg(t, t0, t0+.35)` e a pena brilhante na frente, nunca por fade. Palavra gigante do kit (`giant`) vai em `back` como contorno traçado (um `canvas()` com `strokeText` em `CRM` 2,2 px e `fillText` na cor da folha por baixo), com uma cota medindo a largura dela.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **Câmera e draw-on em ones**; cortes secos nas batidas fortes entre seções; um tremor de câmera só em impacto físico (carimbo, tapa na folha: `world=dict(y=6, d=.08, ease='power4.out')`, voltando a `y=0` na cena seguinte).
- **Ordem de desenho** (§3) com cada camada começando numa palavra da fala; escalonamento de .08 s entre itens de uma camada.
- **Vistas explodidas:** as peças saem em sequência nas subdivisões da batida (`eo`, .3 s, 120–260 px para os lados), e voltam uma por grupo de batida com `click`.
- **Mecanismos andam na grade** como um escapo: a engrenagem avança um dente por subdivisão (`ang = (Math.floor(t·8) + eo((t·8)%1))·2π/n`); engrenagem B = `−angA·(nA/nB) + π/nB` para os dentes encaixarem de verdade; a corrente anda com o pinhão (`lineDashOffset = −raio·angA`).
- **A máquina atua:** ângulo, caimento e ponteiro são o rosto. Falha = desacelerar, pender, parar em ~1,5 s (`1 − ei(seg)`); alegria = endireitar num tranco, ponteiro passando do ponto (`bk(…, 2)`).
- Movimento sustentado enquanto o texto fica: hachura entrando, uma cota medindo, a pena andando.

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Folha inteira sobre a mesa | `dict(scale=.9, y=20)` | estabelecer; veredito; série de folhas |
| Médio na figura (sujeito ~80 % da altura) | `dict(scale=1.2, y=-40)` | o projeto sendo desenhado; explicar uma peça |
| Travelling por um caminho de força (corrente, cano, viga) | `dict(x=-110, ease='none')` numa cena longa, `signature=True` | como funciona; sequência de operações |
| Close 2× cortado na batida | `dict(scale=1.35, snap=True)` com `tr='cut'` | o coração do mecanismo; uma válvula; uma junta |
| Travado, um compasso parado | sem `world`, `move=1.0` | deliberação; uma revisão; uma decisão |
| Pan lateral Fig. 1 → Fig. 2 → Fig. 3 | `dict(x=120)` e `dict(x=-120)` em cenas vizinhas sem `snap` | versões; passos; tempo |
| Push lento sem voz | `dict(scale=1.15, d=3)` | admiração; a coisa real |
| Profundidade oblíqua 0 → .5 | no `canvas()` (fator de extrusão por `t`), com `dict(ry=5)` | de planta a objeto; revelar espessura |

## 8. Transições feitas no meio
- **Reescrita de Fig.:** "FIG. 1" riscada (traço fio por `seg`, .2 s) e "FIG. 2 · VISTA EXPLODIDA" letrada ao lado; o desenho novo começa a se traçar sob o rótulo.
- **Linha de corte varrendo:** o plano de corte (fantasma, 2,2 px) cruza a tela em .4 s com `whoosh-short`; atrás da linha a cena anterior vira hachura e a próxima se traça no vão.
- **Papel vegetal levantado:** uma folha `CRM` alfa .14 com sombra sobe em `front` (.45 s, `power3.in`) e revela a próxima folha; cobre 2 quadros na troca.
- **A folha enrola:** o canto inferior direito sobe num cilindro (`scale(1, 1 − …)` por faixas de 12 px com sombra), .5 s.
`tr='cut'` na batida e `tr='wipe'` são o fallback; `fade` e `slide` não existem neste estilo.

## 9. Som (assets/sfx)
Foley de material: `typing` em cada rajada de lettering (rótulo, nota, cota), `click-soft` um por grupo de batida no escapo (nunca por dente), `click` na peça que volta ao lugar na vista explodida, `pop` no balão que pousa, `key-press` no número da cota que muda, `whoosh-short` na linha de corte, `whoosh` no papel vegetal e na folha enrolando, `error` no mecanismo que falha e pende, `impact-bass-1` no carimbo (começa .1 s antes do pouso), `riser` + `sparkle` na coisa real. Dois silêncios de verdade: antes do carimbo e antes da coisa real, só a voz; deixe o momento mais emocional sem SFX e sem fala por 1 s. Nunca o mesmo sfx em cenas vizinhas.

## 10. Moves nativos (menu)
- **Ordem de desenho.** O objeto se traça como um engenheiro faria, uma camada por batida. *Serve:* como funciona; o método em planta; gancho ("isso aqui é o que eu uso").
- **Anotações vivas.** Cotas medem peças em movimento e o número muda; balões voam com as peças. *Serve:* número; prova com medida; antes/depois medido.
- **Fig. como transição.** FIG. 1 riscada e reescrita FIG. 2. *Serve:* passos; versões do produto; etapas de um processo.
- **Projeção como câmera.** O fator oblíquo anima e as peças explodem pelo eixo de profundidade. *Serve:* de planta a objeto; a estrutura de um curso; um sistema em camadas.
- **Um símbolo feito real** (uma vez, se tanto). Uma convenção sai da linguagem do desenho: `scene3d()` com `clay(CRM)`, luz `rim=AMB`, `fog=(BLK, 5, 12)`, sombra real caindo sobre as linhas da folha, e uma marca pálida `CRM` alfa .12 onde estava desenhada. *Serve:* a virada; a invenção finalmente funcionando; CTA (o plano virou produto).
- **Cianotipia e água.** Gotas florescem e amolecem as linhas. *Serve:* o problema; o que dá errado sem o método; perda.
- **O carimbo como história.** O campo de status é o veredito; as linhas de revisão são a história. *Serve:* prova (APROVADO); CTA ("REV. 1 → REV. 5: inscrições abertas"); rejeição que vira virada.
- **Mecanismo que atua.** O ponteiro passa do ponto, a engrenagem trava e destrava. *Serve:* prova; resultado; o momento em que "encaixa".

## 11. Armadilhas
- Figura principal perto da borda da folha → com `world=` de pan, mantenha o desenho a ≥ 160 px da borda do canvas (que já tem 80 px de sobra).
- Vista explodida para cima bate no cabeçalho e na zona de topo → exploda para os lados e achate as peças longas durante a explosão.
- Objeto escurecido pela própria sombra → desenhe a sombra, depois limpe (`fill` com a folha) só na área dele.
- Sombreado por lóbulo numa forma gordinha lê como cacho de uva → um gradiente na união toda; união preenchida como um só path (`nonzero`).
- Recompensa pequena vende mal a virada → a coisa real com ⅓ da altura do quadro, centrada acima da cabeça, traçada traço a traço, nenhum texto em cima.
- Espessura sem compensar o zoom → salsicha no close, linha sumida no aberto: `lineWidth·S^-0.35`.
- Linha cruzando o rosto ou cota sobre o queixo → desenho ao lado ou acima da cabeça em `back`; balão e cota do peito em `front` com y ≥ 1200 (zona segura: topo 200, base 380, laterais 70).
- Folha azul em toda cena → dois fundos escuros seguidos reprovam: alterne com o papel vegetal `CRM` ou com um `bg='cream'` em que só a peça é desenhada.
