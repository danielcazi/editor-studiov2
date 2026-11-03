# Investigação visual (visual-investigation)

> Uma mesa fria de evidências: print do site, dado da fala, frase citada e contagem, lado a lado em painéis duros, todos lendo o mesmo relógio. O relógio mora dentro da imagem: a leitura grande (hora, `T+`, data, número) é a peça central; o quadro decisivo é congelado, circulado e ampliado; o que se sabe e o que está em aberto ficam em colunas separadas. Vermelho é a única cor, e só aponta.
> Adaptado de `lemo-opuscar/styles/visual-investigation/STYLE.md` (LemoLab, MIT) para reel 9:16 com locutor recortado no Editor 7.0. Referências só de gramática (vídeos de investigação visual de jornais, reconstruções forenses, unidades de checagem): nunca copie um caso, um nome ou uma marca d'água real.

**Serve para:** prova com dado, estudo citado, fact-check de uma crença, cronologia, "antes achávamos X, o registro diz Y". **Encaixe:** com locutor ★★ (o locutor é o perito diante da mesa; a mesa fica atrás e ao lado, nunca sobre ele) · só motion ★★★ · marcas com dado para mostrar ★★★.

## 1. Essência (e o que não é)
**Fontes se encontram num instante.** O ganho de cada cena é duas fontes independentes (o número da fala e o print do site; a frase citada e a contagem) apontando o mesmo lugar ou o mesmo segundo: o corte é o ponto de sincronia. **Um relógio, lido na imagem:** nada de faixa de linha do tempo permanente embaixo (come a base do quadro e fica vazia); o tempo é a leitura grande que pertence ao layout e muda de forma nos cortes (`18:25` → `T+12,4 s` → `dia 30` → `1 em 7`). **Um achado por layout.** **Incerteza desenhada, não pedida em desculpa:** `≈`, *inferido*, caixa tracejada; uma fonte que ainda não cobre o trecho simplesmente não está na tela (acende tarde na sua coluna), nunca uma caixa "sem imagem". **Contenção:** nada de espetáculo, nada de câmera lenta de desastre, pessoas viram pontos contados. Não é dossiê em meio-tom (sem papel, carimbo nem colagem), não é cabine de satélite, não é telejornal (sem bug de canal, sem ticker), não é keynote (sem título centrado, sem virada de página), não é `crt` nem glitch.

## 2. Com o locutor
- O locutor é **a única coisa em cor**: toda evidência é cinza (`filter:grayscale(1) contrast(1.22) brightness(.94)` nas imagens do site), e ele, fotográfico e colorido, é quem depõe diante da mesa. A mesa vai em `back`: painéis com fio de 1 px ao lado dos ombros (x 70–330 e 750–1010) e acima da cabeça (y 200–900); a leitura grande em `back`, topo em 200, atrás da cabeça com ≥ 50 % visível.
- Círculo, lupa e ✓ vão em `front` só quando o painel está acima da cabeça ou no peito; o círculo vermelho **nunca cruza o rosto nem o queixo**. Com o painel ao lado do ombro, o círculo fica dentro do painel.
- Enquadramentos: M para a mesa de dois painéis laterais (o locutor cabe entre eles); L padrão com um painel acima da cabeça; XL no veredito, quando só a leitura grande fica. Só motion: tabuleiro de até cinco fontes usando a altura toda entre 200 e 1540.

## 3. Materiais em `canvas()` (1080×1920)
- **Chão e painel:** `fillStyle=BLK` na tela; painel = `fillRect` em `rgba(236,234,228,.06)` + `strokeStyle='rgba(236,234,228,.18)'`, `lineWidth=1`, coordenadas em `+.5` para o fio ficar nítido. Painel de foto mantém a proporção do arquivo (nunca estica).
- **Imagem do site:** `<img src="assets/img/...">` em HTML sob o canvas, com o grade em CSS; o canvas desenha moldura, flash, círculo e lupa por cima. Nada de inventar foto: só `assets/img/` e o que o usuário enviou.
- **Flash de arquivo:** ao entrar, `fillStyle='rgba(255,255,255,'+(1-seg(t,t0,t0+.13))*.85+')'` sobre o painel (4 quadros), depois o conteúdo em 3 quadros de opacidade.
- **Círculo e seta:** `ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+2*Math.PI*eo(seg(t,t0,t0+.5)))`, `strokeStyle=RED`, `lineWidth=2.5`, r 60–140; aos 60 % sai uma seta reta de 120–180 px a 45° (0,3 s) até o rótulo em `600 28px Aspekta`, `CRM`.
- **Lupa ×2:** `const im=document.getElementById('pNN-ev'); if(im&&im.complete){ctx.save();ctx.beginPath();ctx.arc(lx,ly,110,0,7);ctx.clip();ctx.filter='grayscale(1) contrast(1.22) brightness(.94)';ctx.drawImage(im,sx-55,sy-55,110,110,lx-110,ly-110,220,220);ctx.restore()}` com `sx=(cx-left)*im.naturalWidth/dispW`; nunca mais que 1 px de fonte por px de tela.
- **Destaque de frase:** retângulo `RED` com `globalCompositeOperation='multiply'`, alfa .6, altura da linha + 8 px, largura `seg(t,t0,t0+.4)*lineW` (varre da esquerda).
- **Gráfico com playhead:** linha em `rgba(236,234,228,.7)`, `lineWidth=2`; faixas de evento em `rgba(236,234,228,.08)` com uma palavra; playhead vertical `RED` 2 px em `x=x0+(x1-x0)*seg(t,t0,t1)` (linear, um tick = um segundo real), a leitura grande acompanha acima.
- **Matriz de pontos:** r 6, passo 18, 20 colunas; os que importam viram anéis `RED` vazados (`lineWidth=2`) um a um, 0,04 s de intervalo. **Caixa "em aberto":** `ctx.setLineDash([8,6])`. **Grão:** `grain(ctx,w,h,9000,.22,seed)` só dentro do `clip` dos painéis de foto (`.10` nos cards de transcrição), nunca sobre texto ou fio.

## 4. Cor (paleta do compose.json)
`BLK` chão · painel = `BLK` + véu `CRM` a 6 % · fios e molduras `CRM` a 18 % · texto `CRM` · texto secundário `CRM` a 55 % · ticks e *incerto* `CRM` a 30 % · **o único acento: `RED`**, só onde aponta (círculo, playhead, linha de sincronia, destaque, ✓ em caixa vermelha sem palavra, coluna "em aberto", risco sobre a frase errada) · cards de transcrição `CRM` com tinta `BLK`. `AMB` e `RED2` ficam fora do reel; se a marca não tem vermelho forte, `AMB` é o único acento, nunca os dois. Regra 12 do GUIDE (nunca dois fundos escuros seguidos): alterne mesa escura (`BLK`) e página de transcrição clara (`CRM` em tela cheia, tinta `BLK`, fios `BLK` a 18 %). Contraste de texto ≥ 4,5:1 em ambas.

## 5. Tipografia
A fonte é a da marca (`assets/fonts/font.otf`, `Aspekta`); o estilo muda o tratamento, não a família: **leituras grandes** 180–260 px, `font-variant-numeric:tabular-nums`, tracking −0,02 em, em `back` acima da cabeça; **achados** 56–72 px, alinhados à esquerda no painel; **tags de fonte** 26 px em caixa-alta, tracking .12 em, chip `RED` de 6×12 px antes, ≤ 12 caracteres (`PRINT · SITE`, `FALA · 0:42`), logo acima do painel; **transcrição** em `MONO` 30 px, digitada a 40 cps (`typeline` ou `canvas`) e rotulada "transcrição". Poucas palavras por quadro: a leitura ou o achado, a frase destacada e uma tag por fonte; sem eyebrow, sem rodapé. Texto fica inteiro: letras ÷ 15 + 1,5 s; veredito e comparação seguram ≥ 2,5 s.

## 6. Movimento (cenas de 1,2–3 s a 30 fps)
- Elementos **cortam para dentro** (≤ 3 quadros de opacidade) com flash branco de 4 quadros, como tirados do arquivo; nada voa, quica ou estoura de escala. Saída: opacidade .25 s `power2.in` com a moldura recolhendo até virar um fio de 1 px.
- Só o que é **desenhado** é progressivo: círculo 0,5 s `eo`, setas 0,3–0,6 s, destaque varrido 0,4 s, transcrição digitada, playhead a velocidade constante.
- Dentro de um painel: push lento `kenburns(sel,d,1,1.06)` em foto, até 1,9× em print de tela ou mapa; a mesa nunca "voa", muda no corte. O `render()` avisa quando mais da metade dos tweens dura ≤ 0,3 s: os tweens longos (círculo, playhead, push) respondem por isso.
- A leitura muda de forma nos cortes de seção (relógio → `T+` → data → fração), não por zoom de faixa. Algo muda a cada segundo; hold só para veredito.

## 7. Câmera de mundo (`world=`)
| Movimento do estilo | `world=` | Serve para |
|---|---|---|
| Mesa travada | sem world, `move=1.0` | veredito; sabido / em aberto |
| Push lento para a evidência | `dict(scale=1.08, y=-40)` `ease='none'` | o detalhe; o dado; a lupa |
| Pan de painel a painel (o olhar cruza a mesa) | `dict(x=-90)` | fonte 1 → fonte 2; grade enchendo |
| Crane da leitura ao painel | `dict(y=60)` | do número à prova |
| Tilt ao abrir a página | `dict(rx=-3, scale=1.05)` | transcrição; citação |
| Orbit curto que vira o painel para o locutor | `dict(ry=4)` | comparação lado a lado |
| Snap e congelar | `dict(scale=1.12, snap=True)` | quadro congelado + flash (plano-assinatura) |
| Pull para a mesa inteira | `dict(scale=.92)`, hold ≥ 3 s | mapa de evidências / CTA |

## 8. Transições feitas no meio
- **Flash de arquivo:** 4 quadros de branco a 85 % em `front` centrados no corte; o layout seguinte já está montado.
- **Linha de sincronia:** tracejado `RED` varre os painéis da esquerda à direita em 0,3 s e **continua na mesma altura** na cena seguinte.
- **Leitura que fica:** a leitura grande segura a mesma baseline enquanto a mesa inteira corta ao redor dela; só os dígitos mudam de forma (`18:25` → `T+0,0`).
- **Rebobinar:** o playhead volta a 4× com três linhas de varredura `CRM` a 20 % descendo (0,4 s, `glitch-1`), e a próxima escala começa do zero.
`tr='cut'` no ponto de sincronia (no máximo 1 a cada 4 cenas); nas outras, `tr='fade'` escondido pelo flash. Nunca dissolve visível, nunca `slide`.

## 9. Som (assets/sfx)
`click` no painel que corta para dentro · `click-soft` como tique a cada 0,5 s nas seções de minutos (mais alto na espera) · `key-press` e `typing` na transcrição · `whoosh-short` na linha de sincronia · `pop` em cada ✓ (0,12 s de intervalo) · `notification` numa mensagem que pousa no relógio · `error` no risco sobre a frase errada · `impact-bass-2` uma vez, no ponto de sincronia, e depois quase silêncio · `glitch-1` no rebobinar · `chime` no mapa de evidências. `riser` só uma vez, a .3, antes do ponto de sincronia. Dois silêncios de verdade (só voz): antes do ponto de sincronia e antes do veredito. Sem trilha: o tique é a música.

## 10. Moves nativos (menu)
- **Congelar, circular, ampliar.** Flash, círculo em 0,5 s, seta aos 60 %, lupa ×2 do mesmo pixel. *Serve:* prova (o detalhe no print do site; o dado na tabela).
- **Ponto de sincronia.** O número da fala e o número do site acendem no mesmo quadro, ligados por uma linha `RED`. *Serve:* número; "o site diz o mesmo que eu".
- **Grade de três colunas.** Três painéis de 300 px acima da cabeça sob uma leitura grande; cada coluna corta para dentro quando sua fonte começa. *Serve:* passos; cronologia; três provas.
- **A leitura muda de escala.** Relógio → `T+` → data → fração a cada corte de seção. *Serve:* gancho; "em 30 dias"; "1 em 7".
- **Mensagens no relógio.** Cards de transcrição pousam nos seus horários com tracejado `RED` até o pino no eixo do gráfico. *Serve:* depoimentos; cronologia; passos.
- **Então × registro.** Card da crença em `CRM`, depois o card do fato; risco `RED` sobre as palavras erradas. *Serve:* gancho "você acha que X"; fact-check.
- **Sabido / em aberto.** Duas colunas, ✓ em caixa vs. caixa tracejada, cada item inteiro ≥ 2,5 s. *Serve:* virada; CTA (o que está em aberto é o que a oferta resolve).
- **Pontos por pessoa → mapa de evidências.** Matriz de pontos com os anéis `RED`; no fim, todas as setas convergem para uma zona. *Serve:* prova social; número; fechamento e CTA.

## 11. Armadilhas
- Inferência passando por fato → `≈` / *inferido* na tela; o número da fala vale sobre o do site, e nenhum dado se inventa.
- Painel em cor, imagem colorida do site → só o locutor tem cor; evidência é cinza com um grade.
- `RED` como decoração (fundo, borda, título) → vermelho só aponta; mais de um elemento vermelho por quadro é ruído.
- Caixa "sem imagem" ou placeholder cinza → lê como render quebrado; mude o layout ou deixe a fonte acender quando começa.
- Palavras demais (eyebrow, rodapé, tag longa) → leitura, frase destacada e uma tag por fonte, e só.
- Mais de cinco fontes num tabuleiro, ou layout centrado como slide → um achado por layout, alinhado à esquerda.
- Grão sobre texto e fio → grão só dentro do `clip` das fotos.
- Círculo, lupa ou ✓ sobre o rosto ou o queixo → tudo acima da cabeça ou no peito (zona segura: topo 200, base 380, laterais 70); nenhum painel vive abaixo de 1540.
- Leitura grande fora da zona segura depois de um `world=` de push → margem de 60 px ou push menor.
