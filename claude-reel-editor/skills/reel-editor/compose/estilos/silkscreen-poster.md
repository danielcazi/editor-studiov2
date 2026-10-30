# Pôster em serigrafia (silkscreen-poster)

> Tintas chapadas e opacas puxadas uma de cada vez pela tela: 4 a 6 tintas, céu em faixas escalonadas no lugar de degradê, frestas de papel onde o registro escorrega. A informação aparece do jeito que o pôster é impresso: uma camada, uma batida.
> Adaptado de `lemo-opuscar/styles/silkscreen-poster/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (pôsteres WPA dos anos 30-40, séries contemporâneas de parques): nunca copie um pôster, nome ou letreiro real.

**Serve para:** oferta, lista de benefícios, roteiro/trilha, antes-e-depois, série de itens (cada tinta uma informação). **Encaixe:** com locutor ★★★ · só motion ★★★ · marcas com paleta chapada e grão (preto, laranja, creme) ★★★.

## 1. Essência (e o que não é)
Um pôster sendo **impresso na câmera**, atrás do locutor. Cada cor é uma tinta opaca puxada por um rodo; a tinta de cima cobre a de baixo por inteiro. Sem meio-tom, sem linha de contorno, sem degradê: céu e névoa são **faixas escalonadas** (cor chapada, listras afinando, próxima cor). O que faz ler como serigrafia e não como vetor chapado: registro escorregado de 2–4 px entre camadas, uma fresta de papel cru onde uma forma foi vazada, borda de tinta com rim claro em cima-esquerda e escuro embaixo-direita, papel creme com fibras e pinholes. Não é risografia (sem fluorescente translúcido nem grão de meio-tom), não é xilogravura (sem talho), não é low-poly.

## 2. Com o locutor
- O locutor recortado é **a única coisa fotográfica**: o pôster se imprime atrás dele (`back`), camada por camada, e ele fica na frente como quem está diante do mural. Nada de tinta sobre o rosto; a faixa de informação (nome, número, CTA) imprime **acima da cabeça** ou no peito via `front`, nunca no queixo.
- O corte do recorte é duro, como uma tinta: combina. Dê ao locutor uma **sombra chapada** de tinta escura deslocada 14 px para baixo-direita (um `div` escuro com a mesma máscara é caro; use uma elipse chapada no chão, `back`, na cor mais escura) para ele "pertencer" ao pôster.
- Enquadramentos: L ou XL com o pôster inteiro atrás; M quando a faixa de informação precisa do peito. Só motion: o pôster ocupa a tela toda, a faixa de informação fica entre 1100 e 1500 px.

## 3. Materiais em `canvas()` (1080×1920)
**Motor pronto:** `canvas(p, draw, d, engine='silkscreen')` põe `SK` no escopo do draw (código em `engines/silkscreen.js`, demo em `engines/demos/silkscreen.py`). Use as funções dele antes de desenhar à mão; as receitas abaixo são o que elas implementam e o que falta nelas.
`SK.paper(ctx,w,h,cor,seed)` papel com fibras · `SK.pull(ctx,t,t0,path,cor,{dx,dy,seed,dur,dir,rule,rim,ghost,sheen,blade})` uma tinta puxada por rodo · `SK.bands(ctx,t,t0,[[y0,y1,cor],…])` céu em faixas escalonadas · `SK.ridge(picos,base)`, `SK.pine(x,y,h)`, `SK.rect`, `SK.circle`, `SK.poly`, `SK.P(f)` formas como Path2D · `SK.infoBand(ctx,t,t0,itens,{y,lineH,font,color,step})` faixa de informação · `SK.reink(ctx,t,t0,drawA,drawB)` rodo diagonal de re-tinta · `SK.loose(t,t0,dur)` fator de registro solto → encaixe · `SK.lift(ctx,t,t0,w,h)` levantar a tela · `SK.pinholes(ctx,w,h,cor,seed,n,maxY)`

- **Papel:** `fillStyle=CRM` na tela toda; fibras = 900 traços de 20–60 px, alfa .05, direção quase horizontal, semente fixa (`mulberry(seed)`); pinholes = 60 pontos de 1–2 px na cor do papel **só sobre tinta** (desenhe depois das tintas).
- **Uma tinta = um `Path2D` chapado**, preenchido com `ctx.fill(path)`; vazados são furos no mesmo path (`evenodd`). Registro: antes de cada tinta, `ctx.translate(dx, dy)` com `dx, dy` em ±2–4 px fixos por camada (não por quadro).
- **Borda de tinta:** depois do fill, `ctx.save(); ctx.clip(path)`; preencha o mesmo path deslocado (−2,−2) com branco a 18 % e deslocado (+3,+3) com preto a 22 %; `restore()`. Só em fills, nunca `stroke`.
- **Sobreposição (overprint):** sob cada tinta, o mesmo path deslocado 2 px com `globalCompositeOperation='multiply'` e alfa .25: deixa a fresta escura onde tinta pega tinta.
- **Faixas escalonadas:** 5 a 7 retângulos horizontais de cor chapada, a transição entre duas faixas feita com 3 listras de altura decrescente (18, 10, 4 px) da cor seguinte; jamais `createLinearGradient`.
- **Revelação por rodo:** `ctx.clip()` num retângulo cuja borda direita avança linearmente (um rodo não tem ease): `x = w * seg(t, t0, t0 + .35)`; a borda é um polígono com cauda irregular de ~30 px (`vnoise`). Um "rodo" de 40 px de altura com lâmina (BLK) e bolha de tinta (a cor que está sendo puxada, com brilho a 40 %) acompanha a borda.
- **Brilho de tinta fresca:** um retângulo branco a 12 % no `clip` da tinta que acabou de entrar, sumindo em 0,8 s (`1 - seg(t, t1, t1 + .8)`).
- Texturas no orçamento: fibras + pinholes + grão do kit. Mais que isso lê como risografia.

## 4. Cor (paleta do compose.json)
Uma paleta por reel, ≤ 6 tintas por papel: `CRM` papel · `AMB` céu claro / luz · `RED2` faixas e meia-distância · `RED` perto · `BLK` mais perto e faixa de informação · **um acento raro** (`AMB` puro no sol, na rota, no número-chave). Valores escalonam do longe (claro) ao perto (escuro); profundidade é valor, nunca blur. O papel é uma cor: a área não impressa é a mais clara do quadro (luz, neve, raio). Texto escolhe a tinta pelo contraste com a tinta de baixo (≥ 4,5:1), nunca por regra fixa.

## 5. Tipografia
A fonte é a da marca (`assets/fonts/font.otf`); o estilo muda o tratamento, não a família: títulos **impressos no céu** com tracking aberto e a mesma borda de tinta; valores grandes na faixa de informação; rótulos pequenos em caixa-alta espaçada. Texto é tinta: entra por rodo, nunca por fade. Palavra gigante do kit (`giant`) vai em `back` como a última tinta impressa, com registro escorregado de 3 px.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **Puxadas lineares**, `seg()` sem ease; acento meia batida depois da tinta principal. Itens da faixa de informação imprimem da esquerda para a direita em subdivisões da batida.
- **Não existe fade.** Saída de cena: a próxima tinta cobre, ou um rodo largo diagonal (0,35 s) re-imprime a mesma geometria em outra paleta.
- **Levantar a tela:** a moldura sobe (achatamento vertical + sombra crescendo) em 0,4 s para revelar a camada pronta.
- **Camadas soltas → registro:** num movimento de câmera, as tintas fazem parallax com frestas de papel e sombra de espessura, e **encaixam no registro num só hit** (`impact-bass-1`) antes do fato principal.

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Truck com o rodo, leve roll | `dict(x=-60, rz=1.5)` linear, `ease='none'` | gancho; céu em degradê partido |
| Top-down travado | sem world, `move=1.0` | ver o pôster se montar; comparação |
| Pull-back rápido ao levantar a tela | `dict(scale=.94)` `d=.4` | camada completa; título |
| Push + tilt para a faixa de informação | `dict(scale=1.12, y=-60, rx=-3)` | fatos; data; preço |
| Crane entre planos soltos (parallax) | `dict(y=80, ry=4)` | rota; subida; rua |
| Dolly lateral por uma fileira de pôsteres | `dict(x=-110)` numa cena longa | série; variações (plano-assinatura típico) |
| Log-zoom para a parede | `dict(scale=.9)` no fim, hold ≥ 3 s | lockup final / CTA |

## 8. Transições feitas no meio
- **Silhueta de primeiro plano** (árvore, poste, mão de rodo) cruza a tela em `front` e troca o pôster atrás; a cobertura total dura 1 quadro, centrada na troca.
- **Rodo diagonal de re-tinta:** mesma geometria, outra paleta, 0,35 s; só a lâmina, a bolha e um pedaço do cabo aparecem.
- **Levantar a tela** e, atrás, já está o próximo papel.
`tr=` do `scene()` é o fallback; `cut` só quando a silhueta cobre.

## 9. Som (assets/sfx)
Uma puxada, um hit: `whoosh-short` no rodo (mais rápido = mais agudo), `click` na tinta que assenta, `impact-bass-1` no registro que encaixa, `pop` em cada item da faixa, `whoosh` na tela levantando, `sparkle` no acento. Dois silêncios: antes dos fatos principais e antes da CTA. O som da próxima puxada começa 0,1 s antes do corte.

## 10. Moves nativos (menu)
- **Uma tinta, uma batida.** Os fatos imprimem por último, quando são lidos. *Serve:* horário, preço, três benefícios.
- **Degradê partido.** Várias tintas numa só puxada enchem a tela de cor. *Serve:* gancho; "a noite inteira"; variações de um produto.
- **Re-tinta de paleta.** Mesmo pôster, outra paleta = tempo passando, variante. *Serve:* antes/depois; verão × inverno; 1 ano × 10 anos.
- **Registro escorregado → encaixe.** As camadas batem no registro com um hit antes do fato-chave. *Serve:* data; preço; abertura das vendas (plano-assinatura).
- **Papel é cor.** A área não impressa é o elemento mais claro. *Serve:* luz; neve; um feixe.
- **Rota como camada impressa.** Linha tracejada de acento carimbada trecho a trecho. *Serve:* trilha; etapas; caminho até a meta.
- **A parede da série.** Todos os pôsteres pendurados juntos no final. *Serve:* 4 trilhas; 5 aulas; família de produtos (lockup da CTA).

## 11. Armadilhas
- `stroke` em paths unidos desenha linhas internas → só fills, com a borda feita por fill deslocado dentro do clip.
- Sombra da tela como retângulo cheio suja o pôster → sombra em anel (`evenodd`).
- Parallax sozinho lê como "as montanhas estão andando" → frestas e espessura enquanto solto, zero no encaixe com som.
- Itens demais com tempo de leitura honesto estouram a cena → imprima lado a lado na mesma puxada, ou deixe os secundários para a parede final.
- Tinta sobre o rosto ou o queixo do locutor → a faixa de informação sobe acima da cabeça (zona segura: topo 200, base 380, laterais 70).
- Texto da faixa fora da zona segura depois de um `world=` de push → desenhe com margem de 60 px ou reduza o push.
