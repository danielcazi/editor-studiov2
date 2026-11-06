# Gravura em madeira (woodcut)

> Uma chapa de madeira preta que se talha diante da câmera: a luz só existe onde a faca passou. Cada cena é uma chapa impressa em papel; nada entra por fade, entra por talho. Uma única cor, e só para a coisa que queima.
> Adaptado de `lemo-opuscar/styles/woodcut/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (romances sem palavras de Masereel e Ward, goiva de Kollwitz, luz por espaçamento de linha em Doré): nunca copie uma chapa, figura, moldura ou título.

**Serve para:** virada dramática, sacrifício/esforço, uma só coisa que importa, série de "chapas" (lista grave). **Encaixe:** com locutor ★ (tinta preta e pessoa fotográfica brigam: só como placa de fundo em cenas curtas de virada) · só motion ★★★ (reel inteiro em gravura, cada cena uma chapa) · marcas com paleta preto/creme ★★★.

## 1. Essência (e o que não é)
Três regras da impressão em relevo: **preto é a madeira, branco é o que a faca tirou** (área clara = muitos talhos largos quase se juntando; área escura = madeira intacta); **a imagem aparece sendo talhada** (goivas grossas primeiro, linhas finas depois, cada talho com o seu tempo); **o bloco é espelho** (letras ao contrário até o papel ser puxado, e essa virada é a transição do estilo). O motor reduzido para o nosso editor: silhueta preta + halo branco de faca + 3–6 talhos na borda iluminada + raios radiais de goiva U; cada talho é um polígono fino de 30–160 px com entrada reta e saída afinada. Sem height field, sem filtro WebGL, sem threshold de foto. Não é serigrafia (sem área de cor chapada), não é gravura em metal (sem linha que incha sobre branco), não é foto com limiar (os talhos seguem a forma).

## 2. Com o locutor
- A chapa é **placa de fundo** em `back`: moldura de papel `CRM` com a chapa `BLK` entre x 110–970 e y 230–1000, acima da cabeça; o locutor em M ou L fica diante dela como diante de uma gravura na parede. Use em 2–4 cenas de virada de 1,2–1,8 s, nunca o reel inteiro.
- O locutor **continua fotográfico**: nunca "grave" o recorte (threshold no `#ccam` lê como foto quebrada). A única tinta colorida do reel (`RED` ou `AMB`) é o acento da chapa, e ela só existe sobre branco talhado.
- O rótulo da chapa (uma ou duas palavras, o destaque da cena) vai em `front` no peito ou na margem acima da chapa, nunca no queixo. Só motion: a chapa ocupa x 70–1010 e y 200–1380; a margem inferior de papel vai de 1380 a 1920, e o rótulo tipográfico fica entre 1380 e 1520 (acima da zona segura da base).

## 3. Materiais em `canvas()` (1080×1920)
- **Papel:** `fillStyle=CRM` na tela toda; vergaturas = uma linha horizontal a cada 6 px em `BLK` a .035; correntes = uma vertical a cada 120 px a .05; grão do kit por cima (`grain(ctx,w,h,4000,.06,seed)`).
- **Chapa:** `fillStyle=BLK` num polígono cuja borda é deslocada por `vnoise` ±6 px a cada 24 px (borda rasgada de tinta, nunca retângulo limpo); 300 salpicos `CRM` de r 1–2 px a .5 onde a tinta não pegou (`mulberry(seed)` fixo).
- **Um talho = um polígono fino:** de `p0` a `p1` (30–160 px), largura de entrada `w0`, saída em ponta: `[p0+n·w0/2, p0−n·w0/2, p1]` com as duas arestas longas deslocadas por `vnoise` ±1,5 px em 5 segmentos; `fill` em `CRM`. Revelação: cada talho tem `t0` e duração próprios (0,08–0,35 s) e cresce `L*eo(seg(t,t0,t0+dur))` a partir da entrada.
- **Classes de faca** (px em 1080×1920): faca `k` 1,5–2,5 (contorno, halo que separa figura preta de fundo preto) · goiva V `v` 3–10 (hachura, cabelo, luz fina) · goiva U `u` 12–26 (raios, céu, o desbaste) · estocada `stab` r 4–9 (faíscas, neve, lascas).
- **Figura ou objeto:** silhueta `Path2D` em `BLK`; halo = a borda amostrada a cada 40–90 px, cada amostra um talho `k` com jitter de ±8°; depois **3–6 talhos `v` só na borda iluminada** (luz do alto-esquerda: onde `normal·luz > .6`), de 40–120 px, perpendiculares ao contorno num objeto redondo (arcos que o envolvem), seguindo a queda numa encosta; pele talhada branca, feições deixadas pretas.
- **Raios:** 24–48 talhos `u` de 200–700 px saindo de `(cx,cy)` com ângulo em `mulberry(seed)`; revelação `radial`: `t0 = r0·.3 s`. **Estocadas:** 60–200 pontos r 4–9 sobre massa preta.
- **Chapa de cor:** depois dos talhos, `globalCompositeOperation='multiply'`, `fillStyle=RED`, alfa .85, forma deslocada `translate(3,-2)` fixo: sobre `CRM` vira cor, sobre `BLK` some (é a física da tinta, não um bug).
- **Twos:** `const q=Math.floor(t*12)/12` para figuras; raios, fogo e luz em `t` (ones); só fogo e líquido re-talham a cada 2 quadros (`seed+Math.floor(t*15)`).

## 4. Cor (paleta do compose.json)
Dois valores carregam tudo: `BLK` tinta · `CRM` papel. **No máximo uma chapa de cor por reel**, `RED` (fogo, metal fundido, ferida, selo) ou `AMB` (lamparina, amanhecer, sinal), nunca as duas; impressa só onde o branco foi talhado, pode se espalhar no pico e encolher para um único brilho depois; nunca decoração. `RED2` fica fora. Madeira crua só em cena que mostra o bloco (`color-mix(in srgb, AMB 40%, CRM)`). Regra 12 do GUIDE (nunca dois fundos escuros seguidos): alterne chapa dominada pelo preto (figura intacta sobre branco talhado) e chapa dominada pelo branco (figura preta sobre fundo talhado); a margem `CRM` é sempre o chão claro. Preto sobre creme passa de 4,5:1 sempre.

## 5. Tipografia
A fonte é a da marca (`Aspekta`); o estilo muda o tratamento, não a família: **títulos são talhados, não digitados**: `fillText` em `CRM` sobre a chapa com linha de guarda `strokeText` `BLK` 3 px, letras aparecendo uma a uma como talhos (0,08 s), **espelhadas** (`ctx.scale(-1,1)`) enquanto o bloco é mostrado e lidas certas quando o papel é puxado. **Rótulo da chapa:** tipografia de prelo na margem inferior, 40–48 px `BLK` a .92 com cópia deslocada 0,6 px a .3 (esmagamento da tinta); sobe em 3 quadros sem deslizar, sai em 0,15 s, segura ≥ 1,8 s. É o destaque da cena (uma ou duas palavras), nunca a fala transcrita. Palavra gigante do kit (`giant`) vai em `back` talhada de um painel preto, `CRM` com a linha de guarda.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **Figuras em twos** (12 fps), câmera, partículas, raios e luz em ones. Hachura vive no espaço local de cada parte (os talhos andam com o membro, não fervem); semente fixa por cena.
- **Antecipação, golpe, acomodação** em toda ação-chave: 3 quadros para trás → golpe de 2 quadros → acomodação com tremor de 4 px decaindo em 0,3 s.
- **Revelação por talho:** cada traço com `t0` e velocidade próprios; chaves `light` (áreas claras primeiro, grosso para fino), `radial` (de um ponto), `down`. É a entrada com ease-out que o GUIDE pede; a saída é **tintar de volta** (os talhos encolhem da ponta para a entrada em 0,25 s `ei`) ou o papel descolando.
- **Corte seco = nova impressão:** 2 quadros de registro errado (`translate(4,-3)` quando `t < 2/30`, depois volta).
- O que nunca se move: a margem de papel dentro da folha. Com `world=`, a folha inteira anda (papel + chapa juntos): desenhe com sobra (`x=-80, y=-80, w=W+160, h=H+160`).

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Travelling com a ponta da faca | `dict(x=-80, y=-30)` `ease='none'` | a primeira marca; uma rota; uma assinatura |
| Pull contínuo enquanto os talhos se espalham | `dict(scale=.9)` de um `snap` em 1.3 | uma linha vira um mundo; escala (plano-assinatura) |
| Chapa travada | sem world, `move=1.0` | decisão; retrato; o depois (tempo de leitura) |
| Macro push lento | `dict(scale=1.25)` a cena inteira | mãos no trabalho; ferramenta; esforço |
| Snap zoom e hold | `dict(scale=1.2, snap=True)` | choque; o detalhe que quebra; o número errado |
| Orbit em moldura dentro da moldura (porta, janela) | `dict(ry=4, x=40)` | distância; espera; o que fica de fora |
| Crane do detalhe ao todo | `dict(y=-100, scale=.95)` | consequência; a luz alcançando rostos |
| Roll leve antes do descolar | `dict(rz=-2)` | a chapa virando para a próxima impressão |

## 8. Transições feitas no meio
- **Descolar o papel:** a folha descola num cilindro em direção à câmera: máscara `x < xe(t)` varrendo da direita à esquerda em 0,5 s (pesado depois rápido: `ei` até 40 %, `eo` no resto); o verso mostra a chapa espelhada (`scale(-1,1)`) em `CRM` a .12; a próxima chapa já está embaixo. Com locutor, só em `back`; só motion, em `front` cobrindo a tela.
- **Nova impressão:** `tr='cut'` + 2 quadros de registro errado (`impact-bass-1`).
- **Bloco espelhado → impressão:** cena do bloco (madeira crua, talhos espelhados) corta para a chapa impressa e a palavra lê certa.
- **Rolo de tinta:** uma faixa de `CRM` a .12 e 160 px de largura varre o preto em 0,3 s antes de o papel assentar.
- **Tintar de volta:** os talhos somem da ponta até a chapa ficar preta e limpa, e a próxima começa a talhar.
`tr='cut'` é o padrão do estilo (no máximo 1 a cada 4 cenas pela regra do GUIDE); nas outras, `tr='wipe'` por baixo lê como folha assentando. Nunca `fade`.

## 9. Som (assets/sfx)
`click-soft` a cada 3–5 talhos (faca na madeira, no máximo 6 por cena) · `pop` baixo (.3) em estocadas e lascas · `whoosh-short` no rolo de tinta e no baren · `whoosh-cinematic` no papel descolando (0,5 s) · `impact-bass-1` na nova impressão · `riser` a .4 enquanto a chapa de cor se espalha, `impact-bass-2` no pico · `chime` quando o título talhado se completa · `sparkle` no brilho único que sobra da cor. Fora do meio: `notification`, `typing`, `glitch-*`, `error`. Silêncio é ferramenta: silêncio total antes do som mais alto; dois silêncios de verdade (só voz) antes da virada e antes da CTA. O som da próxima chapa começa 0,1 s antes do corte.

## 10. Moves nativos (menu)
- **A luz é talhada.** Explosão de raios `u` a partir de um ponto, `radial`. *Serve:* gancho; virada; "quando eu entendi".
- **Talhar é tempo.** Trabalho paciente na tela, talho a talho, grosso para fino. *Serve:* passos; esforço; "um ano de".
- **Bloco espelhado → impressão verdadeira.** A palavra ao contrário lê certa quando o papel é puxado. *Serve:* virada; resultado; nome limpo.
- **Estocadas como textura.** Pontos brancos congelam no ar ou são tintados de volta até o preto ficar limpo. *Serve:* número que cai; prova ("de 100, sobram 3").
- **A chapa de cor se espalha e recua.** *Serve:* oferta; a única coisa que importa; CTA (o brilho que fica).
- **Série de chapas.** Chapas fechadas em si, cortes secos na batida, uma pode ser muda. *Serve:* lista grave; três erros; dias passando.
- **O mesmo bloco retalhado.** A cada cena a chapa é cortada mais fundo e a imagem muda. *Serve:* antes/depois; progressão.
- **Moldura dentro da moldura.** Porta, janela ou arco talhado, a cena acontece do outro lado. *Serve:* o que você está perdendo; distância; espera.

## 11. Armadilhas
- Marca branca sobre área branca é invisível → estocadas precisam de massa preta atrás.
- Hachura em toda superfície vira pelo ou chuva → luz rasante: 3–6 talhos só na borda iluminada.
- Rosto preto com talhos brancos não lê pequeno → pele branca, feições pretas, linha de guarda preta em volta do branco.
- Segmentos curtos com variação de tom viram zigue-zague → talhos longos (14–50× o espaçamento), uma faixa larga de luz, um fio de contraluz, halo mais forte.
- Fumaça ou vapor sobre o sujeito lê como chama → atrás, só os fiapos escapam.
- Talhos demais por quadro (> 400 polígonos) travam o draw a 30 fps → menos talhos, mais largos.
- Semente variando por quadro faz tudo ferver → `mulberry(seed)` fixo; só fogo e líquido re-talham.
- Threshold no recorte do locutor ou halo em volta dele → ele continua fotográfico; a chapa fica atrás.
- Chapa ou rótulo sobre o rosto ou o queixo → chapa acima da cabeça, rótulo no peito ou na margem (zona segura: topo 200, base 380, laterais 70; rótulo acima de 1540).
- Cor sobre tinta preta → a chapa de cor se planeja sobre branco talhado, senão some.
