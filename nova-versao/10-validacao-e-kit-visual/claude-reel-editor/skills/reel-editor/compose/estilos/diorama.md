# Diorama isométrico (diorama)

> Um lugar inteiro cabe num pedestal redondo: piso xadrez, parede-fundo em meia-lua, móveis em blocos pastel sem textura, uma placa flutuando com o nome e outra com o número. A câmera é ortográfica, de cima e de lado, como maquete de arquiteto. As peças sobem do chão uma a uma e, no corte, voam.
> Referência: o reel do Orbe (@felipemoller, via Skillry), cenários 3D low-poly de mercado, posto e restaurante. Gramática só.

**Serve para:** cenário de uma situação ("no mercado", "na academia", "no escritório"), rotina/dia a dia, comparação de lugares, produto no contexto, antes e depois do mesmo lugar. **Encaixe:** com locutor ★★ (o diorama acima da cabeça é o lugar de que ele fala; a placa de preço é o número) · só motion ★★★ · marcas com paleta pastel ou neutra ★★★; paletas escuras pedem o pedestal escuro e móveis claros.

## 1. Essência (e o que não é)
Uma maquete: tudo é bloco, cilindro e esfera com material fosco e cor chapada, iluminado por luz ambiente forte e uma chave suave com sombra macia. A profundidade vem do isométrico (ortográfica a ~35° de elevação e 45° de giro), não de perspectiva dramática. Cada cena é um pedestal com um lugar; o que muda entre cenas é o lugar, não a câmera. Não é 3D realista (sem textura, sem reflexo), não é low-poly facetado com flat shading duro, não é ícone 3D isolado flutuando (o chão e a parede dão o lugar).

## 2. Com o locutor
- O diorama vai em `back` via `scene3d(..., ortho=11, engine='diorama')`, com o pedestal entre y 300 e 1100 px (acima da cabeça), e o locutor em M ou L na frente, como se estivesse diante da maquete. A placa de nome (`DI.sign`) fica no topo da cena 3D; a placa de número flutua sobre o móvel certo.
- Nada sobre o rosto: o pedestal nunca desce de 1100 px com locutor em L; com XL use `ortho` maior (14) para o diorama caber acima.
- Só motion: pedestal centrado em y≈960, placa de nome acima (y≈560), card de UI abaixo (`front`, 1300–1700 px) como na referência (voz, foto de comprovante, lançamento).

## 3. Materiais em `scene3d()` (1080×1920)
**Motor pronto:** `scene3d(p, build, d, ortho=11, engine='diorama')` põe `DI` no escopo do `build` (código em `engines/diorama.js`, demo em `engines/demos/diorama.py`).
`DI.soft(T,sc,{ambient})` luz pastel · `DI.pedestal(T,sc,{r,tiles,a,b,rim,wall,wallH})` base + ladrilhos + parede · `DI.box/cyl/ball(T,g,x,y,z,...,cor)` primitivas com a base em y · `DI.shelf(T,g,x,z,{ry,rows,cans})` prateleira com latas · `DI.crate(T,g,x,z,{fruit})` caixote de frutas · `DI.counter(T,g,x,z,{ry})` balcão com tela · `DI.table(T,g,x,z)` mesa com cadeiras · `DI.pump(T,g,x,z)` bomba com cobertura · `DI.car(T,g,x,z,{color,ry})` · `DI.plant(T,g,x,z)` · `DI.sign(T,g,texto,x,y,z,{bg,fg,w,h})` placa flutuante · `DI.isoCam(cam,{dist,yaw,pitch,target})` · `DI.rise(grupo,t,t0,{stagger})` entrada em mola · `DI.explode(grupo,t,t0,{dur,dist})` saída · `DI.bob(mesh,t,amp,speed)` flutuação.
- **Unidades:** 1 unidade ≈ 90 px com `ortho=11`; o pedestal de raio 5,2 tem ≈ 940 px de largura. Móveis de 0,5 a 2,6 unidades.
- **Materiais:** `MeshStandardMaterial` com `roughness .9`, `metalness 0`; nada de `clay` brilhante aqui (é o estilo do `obj3d`).
- **Luz:** ambiente 1,1–1,3 + a chave do `scene3d` (sombra PCF suave). Fundo da cena transparente sobre o `bgfill` claro (`cream`), com a sombra do pedestal vinda do próprio disco.
- **Placa:** sprite com textura de canvas (fonte da marca, 72 px), fundo na cor de acento, cantos de 18 px; `DI.bob` de ±0,1 unidade a 2 rad/s.
- **Ladrilhos:** 13×13 blocos finos em xadrez de duas cores claras; fora do raio não há ladrilho (recorte circular).
- Até 2 `scene3d` por cena; um diorama por cena é o normal.

## 4. Cor (paleta do compose.json)
Pedestal e parede em dois tons claros de `CRM` e de uma cor lavada da marca (`AMB` a 20 % sobre branco); móveis em pastéis derivados (`AMB`, `RED` e `RED2` misturados com 40–60 % de branco), tela/balcão escuro em `BLK`; a **placa é a única cor cheia** (`RED` ou `AMB`), e o número vai nela. Marca escura: pedestal `BLK` com ladrilhos em dois cinzas, móveis em `CRM` e pastéis, placa `AMB`.

## 5. Tipografia
Fonte da marca só nas placas (`DI.sign`) e no texto DOM acima do diorama: rótulo pequeno em caixa-alta espaçada (eyebrow) + título em 2 linhas, a segunda em cinza claro (como a referência). Nada de texto 3D extrudado.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- **Entrada:** `DI.rise` sobe cada peça do chão com mola (`bk`), 0,06–0,09 s entre peças, o pedestal já está lá.
- **Vida:** placa flutuando (`DI.bob`); uma peça móvel pequena (carro andando 0,3 unidade, porta abrindo) por cena; a câmera de mundo faz o resto.
- **Saída:** `DI.explode` em 0,5–0,7 s: cada peça voa para fora do centro girando; a próxima cena entra com `tr='cut'` ou o pedestal do próximo lugar já subindo.
- Nunca girar o diorama inteiro mais de 15° numa cena de 2 s: o isométrico perde a leitura.

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Push lento na maquete | `dict(scale=1.05)` | apresentar o lugar |
| Orbit discreto | `dict(ry=3)` (parallax entre pedestal e placa) | ver o lugar "de outro lado" |
| Crane do diorama para o card de UI | `dict(y=-70)` | do lugar para o número |
| Pull para o pedestal inteiro | `dict(scale=.95)` | resumo, série de lugares |

## 8. Transições feitas no meio
- **Explosão → nova maquete:** as peças voam (`DI.explode`) e o pedestal seguinte já sobe no mesmo lugar.
- **Placa que viaja:** a placa de preço cresce até virar o card de UI da próxima cena (`front`).
- **Pedestal que gira:** o disco vira 90° (`yaw` da `isoCam` animado em 0,6 s) e do outro lado está o lugar seguinte.

## 9. Som (assets/sfx)
`pop` em cada peça que sobe (3 a 5, não todas), `chime` na placa de número, `click-soft` no móvel que anima, `whoosh-cinematic` na explosão, `impact-bass-2` no pedestal pousando. Silêncio antes do número.

## 10. Moves nativos (menu)
- **Um lugar por cena.** Mercado, posto, restaurante: a mesma maquete muda de conteúdo. *Serve:* rotina; "em qualquer lugar"; série.
- **A placa com o número.** O dado flutua sobre o móvel certo. *Serve:* preço; quantidade; o que custou.
- **Entrada em mola, peça a peça.** O lugar se constrói na ordem da fala. *Serve:* passos; montagem; gancho.
- **Explosão no corte.** *Serve:* virada; "esquece isso"; mudança de lugar (plano-assinatura).
- **A peça viva.** Um carro que entra, uma porta que abre, uma pessoa (bloco) que anda até o balcão. *Serve:* ação; "você chega e…".
- **Antes/depois no mesmo pedestal.** Mesmo lugar, móveis trocados. *Serve:* bagunça → ordem; sem → com o produto.

## 11. Armadilhas
- `ortho` pequeno corta o pedestal nas laterais: 11 para raio 5,2 em 9:16.
- Pedestal descendo sobre o rosto do locutor: segure acima de 1100 px (target y mais baixo ou `ortho` maior).
- Perspectiva (`ortho=0`) com `fov` grande vira jogo de celular; mantenha ortográfica.
- Materiais brilhantes (`clay`) brigam com o pastel: `DI.mat` fosco.
- `DI.rise` e `DI.explode` no mesmo instante disputam a posição: use `if (t < tCorte) rise else explode`.
- Mais de 2 canvases WebGL por cena pesam no render.
