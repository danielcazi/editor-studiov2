# Técnicas cinéticas (cinetic)

> Não é um visual: é uma caixa de movimentos de filme de produto, independentes de estilo, para usar em qualquer pacote: digitação em caixa de tempo, uma frase que vira outra palavra a palavra, palavras que nascem do desfoque, um número que conta desacelerando, odômetro, gráfico que se desenha com cabeça, respiração do hold, corte por escala, revelação por subtração, casca → conteúdo → ação.
> Referência: a biblioteca de 273 técnicas do Cinetic (@LexnLin, MIT, github.com/Leonxlnx/cinetic) e o filme de lançamento do skill. Portadas para 30 fps e Canvas 2D; os números de origem estão em quadros a 60 fps e foram convertidos em segundos.

**Serve para:** qualquer reel que precise de um número que conta, uma frase que muda, um gráfico, um corte com classe; combina com `launch`, `swiss-motion`, `briefing-board` e `sketchnote`. **Encaixe:** com locutor ★★★ (são movimentos de texto e dado, cabem acima da cabeça ou no peito) · só motion ★★★ · qualquer marca.

## 1. Essência (e o que não é)
Movimento com massa e precisão: tudo entra já andando e desacelera ao pousar, nada quica sem motivo, o hold nunca fica morto, cada corte continua a velocidade do anterior. A regra de ouro do Cinetic: **uma ideia por plano, o acento com um só significado, e um sistema de curvas** (uma entrada, uma saída, uma de snap). Não é uma coleção de efeitos: cada técnica existe para fazer o conteúdo ler melhor. Não use mais de duas técnicas de tipografia na mesma cena.

## 2. Com o locutor
- Texto e número em `back` acima da cabeça ou em `front` no peito; o gráfico em `front` com o locutor em M; a revelação por subtração funciona com o locutor no meio (a bagunça voa para fora dele).
- O hold com `CN.creep` substitui o `move=` quando a cena tem dado parado: escala cresce ~3 %/s e solta no próximo movimento.
- A frase que muda (`CN.wordRoll`) é a melhor resposta para "não é X, é Y" dito pelo locutor.

## 3. Materiais em `canvas()` (1080×1920)
**Motor pronto:** `canvas(p, draw, d, engine='cinetic')` põe `CN` no escopo (código em `engines/cinetic.js`, demo em `engines/demos/cinetic.py`).
`CN.typeOn(ctx,t,t0,texto,x,y,font,cor,{box,caret,align})` digitação em caixa de tempo (45 % nos primeiros quadros, caret pisca a 1 Hz só depois) · `CN.wordRoll(ctx,t,t0,de,para,x,y,font,cor,{stagger})` rolo de palavras (sai para cima com desfoque, entra de baixo; palavra igual fica parada) · `CN.blurRise(ctx,t,t0,texto,x,y,font,{stagger,mist,color})` palavras do desfoque, uma por batida · `CN.countUp(ctx,t,t0,alvo,x,y,font,{dur,from,fmt,suffix})` contagem quad-out de 88 % · `CN.digitReel(ctx,t,t0,valor,x,y,font,{dur,cols})` odômetro · `CN.lineChart(ctx,t,t0,pontos,x,y,w,h,cor,{dur,area,head})` gráfico com cabeça e área · `CN.creep(t,t0,t1,{rate})` fator de escala do hold · `CN.scaleThrough(t,tCorte,{outDur,inDur})` → `{k, phase}` corte por escala · `CN.subtract(ctx,t,t0,heroi,itens,{cx,cy,dur})` bagunça voa, herói já estava lá · `CN.shell(ctx,t,t0,filhos,{stagger})` casca → conteúdo → ação.
- **Curvas:** entrada `eo` (power3), saída `ei`, snap `eio`; mola só no que pousa (`bk` 1,2–1,6).
- **Tempos a 30 fps:** digitação 1,1 s por linha (0,5 s para manchete curta, 1,4 s para gigante); rolo de palavras 0,4 s sai / 0,8 s entra / 0,22–0,35 s entre palavras; palavras do desfoque 0,9 s cada, 0,33–0,6 s de batida, desfoque some aos 40 %; contagem 0,95 s (preços 1,2–1,5 s); gráfico 1,2–3,2 s com pico de velocidade aos 29 % e os últimos 30 % rastejando; subtração 1 s com itens limpando o quadro aos 80 %; casca 0,13 s entre filhos, botão por último.
- **Desfoque só em trânsito:** nunca mais de 0,2 s de desfoque em texto que será lido.
- **Velocidade legível:** texto que se lê anda no máximo 10 px por quadro (300 px/s); bordas até 30 px por quadro com `LA.smear` ou `filter blur`.

## 4. Cor (paleta do compose.json)
Tinta `BLK` sobre `CRM` (ou o inverso), **um acento** (`RED`) para o número-herói, a cabeça do gráfico e o botão; `mist` (cinza-luz) para a palavra que ainda não chegou. O acento não aparece em mais de 8 % do quadro; inunda a tela no máximo uma vez por reel.

## 5. Tipografia
Fonte da marca; números em `tabular-nums` com largura fixa (o contador nunca muda a largura do bloco); manchete 700 de 60–72 px, número-herói 800 de 150–220 px, rótulos 500 de 26–34 px. Uma técnica de tipografia por cena; a palavra-herói pode se mover letra a letra, nenhuma outra.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- Entra já andando: a primeira mudança visível no primeiro ou segundo quadro da cena; nunca fade do preto.
- O corte continua a velocidade: `CN.scaleThrough` encolhe acelerando até o corte e o novo objeto nasce a 1,8× freando no mesmo ponto.
- Hold vivo: `CN.creep` (~3 %/s) ou deriva lateral de 0,5 px por quadro em texto; solto no próximo movimento sem degrau.
- Segurar o que foi lido: 1,2 s + 0,2 s por palavra depois da última letra; o número pousado fica 1,2 s sob respiração.

## 7. Câmera de mundo (`world=`)
| Técnica | `world=` | Serve para |
|---|---|---|
| Respiração entre interações | `dict(scale=1.06)` lento, depois `dict(scale=.96)` | painel que a fala percorre |
| Corte por escala (plano-assinatura) | `dict(scale=1.25)` com `d=.4` na saída + `snap` 1 na entrada | mudar de mundo mantendo o assunto |
| Push isolador | `dict(scale=1.15, y=-40)` | o dado que importa |
| Pull que pousa um evento | `dict(scale=.9)` com `d=.6` | o botão aparece; o resumo |

## 8. Transições feitas no meio
- **Corte por escala:** o número encolhe acelerando, corte, o mesmo número grande freando no mesmo centro.
- **Revelação por subtração:** cards voam para fora e o herói já estava atrás.
- **Rolo de palavras como ponte:** a última frase de uma cena vira a primeira da próxima, palavra a palavra, com a cena trocando atrás.
- **Casca que vira a próxima cena:** o card da ação cresce até ser o fundo.

## 9. Som (assets/sfx)
`key-press` só no primeiro caractere da digitação, `click-soft` em cada passo do odômetro (um a cada 2 quadros, não mais), `pop` no pouso do contador, `whoosh-short` no rolo de palavras, `riser` curto antes do corte por escala e `impact-bass-1` no corte, `chime` na cabeça do gráfico pousando. Silêncio no hold do número-herói.

## 10. Moves nativos (menu)
- **Digitar a pergunta.** A pergunta do gancho aparece digitada, caret pisca, resposta vem em corte. *Serve:* gancho; "você já…?".
- **Não é X, é Y.** Rolo de palavras na frase. *Serve:* virada; mito e verdade.
- **Palavras que nascem do desfoque na batida da fala.** *Serve:* citação; promessa calma.
- **Número que desacelera.** Conta de 88 % ao alvo e pousa. *Serve:* prova social; preço; número grande.
- **Odômetro.** *Serve:* ano; contador de alunos; placar.
- **Gráfico com cabeça.** A linha se desenha e o dado final pousa. *Serve:* crescimento; antes e depois no tempo.
- **Subtração.** A bagunça voa, sobra o que importa. *Serve:* "esquece tudo isso"; foco; a oferta única (plano-assinatura).
- **Casca → conteúdo → ação.** O card aparece vazio, enche, e o botão vem por último. *Serve:* CTA; o plano; a inscrição.

## 11. Armadilhas
- Duas técnicas de tipografia na mesma cena viram ruído: uma.
- Contador que muda de largura pula: `tabular-nums` e `cols` fixas.
- Desfoque sobre texto por mais de 0,2 s cansa: só em trânsito.
- Corte por escala sem o mesmo centro lê como jump cut: ±30 px de tolerância.
- Subtração com o herói aparecendo depois: ele tem de estar atrás desde o primeiro quadro.
- Odômetro com `roll` menor que 0,3 s a 30 fps estrobosca.
- Texto acima da velocidade legível: 10 px por quadro.
