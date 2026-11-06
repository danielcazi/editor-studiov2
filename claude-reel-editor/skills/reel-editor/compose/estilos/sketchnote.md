# Explicação desenhada à mão (sketchnote)

> Um caderno explicando: o parágrafo aparece datilografado, o marca-texto passa sobre as palavras que importam, e ao lado um desenho de linha (sol, nuvem, onda, gota, seta) se desenha traço a traço, como num player de vídeo-aula. Tudo com tremor de mão, nada perfeito.
> Referência: o reel do DistilBook (@itisRazak, via prompt-motion.com), um explicador "hand-illustrated" feito em código. Gramática só; nenhum desenho ou texto copiado.

**Serve para:** explicar um mecanismo (como a dopamina sobe e cai), destacar palavras de uma frase, passo a passo, citação de estudo com grifo, conceito com diagrama. **Encaixe:** com locutor ★★★ (um desenho de linha atrás do ombro lê como quadro de aula; o locutor é o professor) · só motion ★★★ · marcas educacionais ★★★.

## 1. Essência (e o que não é)
Papel branco, tinta escura, três cores de marca-texto. Duas coisas acontecem ao mesmo tempo: **texto que se escreve** (datilografado, com grifos chegando logo depois da palavra) e **desenho que se desenha** (linha contínua com tremor, uma forma por vez, numa ordem que explica). O traço é vivo: largura quase constante, pequenas ondulações, pontas arredondadas. A cor entra como lápis de cor hachurado, nunca como preenchimento chapado. Não é whiteboard animation (sem mão desenhando), não é ícone de linha fina de UI (o traço tem tremor e 4–5 px), não é infográfico vetorial.

## 2. Com o locutor
- O desenho vai em `back`, acima da cabeça (y de 200 a ≈1000 px), como um quadro pendurado atrás do professor; o parágrafo com grifos vai em `back` em corpo 48–58 px, no alto, ou em `front` no peito quando é uma frase só.
- O marca-texto é o destaque único da cena (regra 2 do GUIDE): uma palavra grifada por cena, a cor diz o papel (verde = o que funciona, rosa = o problema, azul = o dado).
- Enquadramento M ou L para deixar o quadro inteiro visível; XL quando o desenho é pequeno e fica ao lado da cabeça. Só motion: o player (`SB.player`) ocupa de 420 a 1420 px e o parágrafo vai acima.

## 3. Materiais em `canvas()` (1080×1920)
**Motor pronto:** `canvas(p, draw, d, engine='sketch')` põe `SB` no escopo (código em `engines/sketch.js`, demo em `engines/demos/sketch.py`).
`SB.paper(ctx,w,h,cor,seed)` papel com grão · `SB.stroke(ctx,t,t0,pontos,cor,{width,speed,wobble,seed})` traço de tinta por comprimento com tremor · `SB.circle(ctx,t,t0,cx,cy,r,cor,{turns})` círculo à mão com sobreposição · `SB.arrow(...)` seta · `SB.highlight(ctx,t,t0,x,y,w,h,cor)` marca-texto que varre · `SB.para(ctx,t,t0,linhas,x,y,{font,lineH,cps,marks:{palavra:cor}})` parágrafo datilografado com grifos · `SB.sun`, `SB.cloud`, `SB.waves`, `SB.drop` ícones de linha que se desenham · `SB.fill(ctx,t,t0,path,cor,{spacing,angle})` lápis de cor hachurado · `SB.caption(ctx,t,t0,texto,cx,y,{mark:{word,color}})` legenda com grifo · `SB.page(ctx,x,y,w,h,{flip})` página de livro virando · `SB.player(ctx,x,y,w,h,{progress})` moldura de player.
- **Traço:** 4–5 px, `lineCap round`, tremor perpendicular de ±1,4 px por `vnoise`, velocidade 1 000–1 400 px/s (uma forma de 600 px leva ~0,5 s). Pontas retas; o começo um pouco mais pesado.
- **Grifo:** `multiply` a .75, bordas onduladas de ±4 px, inclinação de −0,7°, entra em 0,28 s da esquerda, 0,2 s depois da palavra ser digitada.
- **Lápis de cor:** hachura a −37° (`angle −.65`), espaçamento 7–9 px, alfa .5, recortada pela forma; entra por varredura em 0,45 s.
- **Datilografia:** 46–60 caracteres por segundo, sem cursor; linhas de 48–58 px com entrelinha 1,45.
- **Desenho a cada ~10 s** quando o brief pede ilustração; dentro de um player (`SB.player`) quando a fala menciona "vídeo", "aula", "assista".

## 4. Cor (paleta do compose.json)
Papel `#FFFFFF` ou `CRM`; tinta `BLK`; traço de dado em azul (use `RED2` ou `AMB` se a marca não tiver azul); grifos em pastel derivado da marca (`AMB` a .55, `RED` a .35, mais um verde/azul claro): no máximo três cores de grifo no reel, cada uma com um papel fixo. Nunca grifo escuro sobre texto escuro.

## 5. Tipografia
Fonte da marca; o parágrafo em peso regular (400) e corpo 48–58 px, porque a fonte de texto corrido é parte do visual; a legenda em 700 com uma palavra grifada. Texto sempre em `SB.para`/`SB.caption` (datilografado ou subindo 14 px), nunca por fade.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- Um traço de cada vez, na ordem que explica (sol → ondas → gota → nuvem), 0,3–0,5 s por forma, 0,15 s de respiro entre elas.
- O grifo é a batida: cai na palavra quando a fala a diz (use `transcript.json` para o `t0`).
- Movimento sustentado: o progresso do player anda, a seta "respira" (redesenhar com `seed` fixo não treme; só o progresso muda).
- Saída: página vira (`SB.page` com `flip` 0 → 1 em 0,5 s) ou a tinta "seca" (alfa cai em 0,3 s).

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Push lento para o desenho | `dict(scale=1.06)` | o diagrama que explica |
| Pan seguindo a seta | `dict(x=-40)` | sequência, causa → efeito |
| Crane do parágrafo para o desenho | `dict(y=-60)` em cena longa | do texto para a imagem (plano-assinatura) |
| Pull para o caderno inteiro | `dict(scale=.94)` | resumo; fechar o capítulo |

## 8. Transições feitas no meio
- **Virar a página** (`SB.page` flip) revelando o próximo quadro já pronto.
- **Grifo que vira fundo:** a cor do grifo cresce até cobrir a tela e a próxima cena nasce dela.
- **Tinta secando:** o desenho esmaece em 0,3 s enquanto o próximo começa a se desenhar.

## 9. Som (assets/sfx)
`typing` baixo sob a datilografia (um só, não por letra), `click-soft` em cada grifo, `whoosh-short` em cada traço longo, `pop` quando uma forma fecha, `sparkle` na palavra-chave, `whoosh` na página virando. Silêncio quando o desenho termina e a legenda sobe.

## 10. Moves nativos (menu)
- **Palavra grifada na hora da fala.** *Serve:* gancho; a palavra-chave de cada frase.
- **O diagrama que se desenha na ordem da explicação.** *Serve:* mecanismo; ciclo; causa e efeito (plano-assinatura típico).
- **Lápis de cor que preenche o que importa.** *Serve:* número; a parte do todo.
- **Player com progresso:** o reel dentro de uma aula. *Serve:* "assista", "na aula 3".
- **Página que vira entre tópicos.** *Serve:* passos; capítulos.
- **Círculo à mão em torno do dado.** *Serve:* prova; "olha isso".
- **Seta que liga texto e desenho.** *Serve:* "é por isso que".

## 11. Armadilhas
- Grifo sem tremor e sem `multiply` vira retângulo de UI → bordas onduladas e multiply sempre.
- Traço sem `wobble` lê como vetor; `wobble` acima de 2,5 px lê como tremedeira.
- Muitas formas ao mesmo tempo viram rabisco: uma por vez, com respiro.
- Hachura por quadro com milhares de linhas pesa: `SB.fill` já limita pelo `spacing`; não baixe de 6 px.
- Texto do parágrafo fora da zona segura (laterais 70 px): meça a linha mais longa; 58 px cabe ~26 caracteres.
- Nada sobre o rosto: o quadro desenhado fica acima da cabeça; a legenda no peito via `front`.
