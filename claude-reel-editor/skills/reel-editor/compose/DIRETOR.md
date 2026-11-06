# Diretor (como dirigir um reel, antes de qualquer regra de layout)

Você é o diretor, não uma demo técnica. Um reel é julgado nesta ordem: **gancho, ritmo, câmera, encenação**. Quadro bonito é só o ponto de partida. Este guia vale para quem escreve o roteiro (momentos) e para quem compõe (treatment.md e scenes.py). O GUIDE.md diz como executar; este diz o que decidir.

## 1. Benchmark antes de escrever
Antes de qualquer cena, escolha uma ou duas referências (filme de produto, abertura, anúncio, reel de criador) que fixam o nível **deste estilo e deste assunto**. Anote:
- **O que aprender:** composição, ritmo, gramática de câmera, lógica de cor, como o texto entra e sai.
- **O que não levar:** personagens, desenhos, logos, fontes, planos específicos.
O benchmark sobe a qualidade mais do que qualquer regra abaixo. O primeiro visual que vem à cabeça para um estilo costuma ser o clichê dele.

## 2. Estrutura
- **Um assunto, um objetivo, uma virada.** O reel promete algo nos 3 primeiros segundos, muda de estado no meio e termina diferente de como começou.
- **Três estruturas candidatas** em uma linha cada (jornada única, antes/depois, contagem regressiva, lista que vira, uma pergunta respondida), e a escolhida com o motivo.
- **Um movimento nativo:** o momento que só este meio faz (a palavra que vira o objeto da próxima cena, o card que a câmera atravessa, a tela que inunda e revela). Fica no pico emocional, nunca na abertura.
- **Corte o excesso.** Uma ideia lida em miniatura vale mais que três que ninguém entende. Se um beat precisa de explicação, remova.

## 3. Câmera: todo plano tem um motivo
- A câmera de mundo (`scene(..., world=)`) move as quatro camadas juntas, com parallax: `push` (aproxima), `pull` (afasta), `pan` (lateral), `crane` (vertical), `tilt` (rotação X), `orbit` (rotação Y), `roll`. Varie: um reel de câmera parada ou de só push-in falhou; quantos movimentos e quais, a fala decide.
- **Um plano-assinatura** (`signature=True`) que a pessoa lembra: um oner atravessando dois ou três beats sem corte, uma revelação de escala, uma transição feita do próprio meio.
- **Transição desenhada no meio**, não fade padrão: passagens entre cenas em que algo da cena anterior vira a próxima (a cor inunda, o card cresce até preencher, a palavra sobe por máscara e vira título). O `tr=` de `scene()` é o fallback, não o padrão.
- Enquadramento do locutor muda no ritmo de `pace.framing` do compose.json (M, L, XL, XXL), e a mudança de enquadramento combina com o movimento de mundo, nunca contra ele.
- Nos momentos-chave o destaque ocupa pelo menos um terço da altura do quadro, com silhueta legível.

## 4. Ritmo
- **Varie o andamento:** alterne rápido e lento, inclua uma aceleração ou desaceleração clara e dê **uma respiração** (um plano longo ou uma pausa segurada) antes da virada ou da CTA. Reel na mesma velocidade do início ao fim falhou.
- Um estímulo por batida da fala, mas não corte em toda batida: deixe tempo de ver.
- Texto que entrou fica o tempo de ler: letras ÷ 15 + 1,5 s. Rápido se faz com menos palavras por tela, não cortando antes de ler.
- Gancho forte nos 3 primeiros segundos; nada parado por mais de 1 s; nada sem mudança visual por mais de 2 × `pace.every` (compose.json).

## 5. Encenação e som
- **Antecipação, ação, acomodação** em todo movimento que importa: o card não desliza, ele chega. Entrada com ease-out, saída com ease-in, algo sempre andando devagar enquanto o texto fica.
- **Toda ação visível tem som** (assets/sfx): pouso, corte, clique, inundação, whoosh. Nunca o mesmo som em duas cenas vizinhas.
- **Dois silêncios de verdade** (sem SFX, só a voz) antes da virada ou do pico: o primeiro som depois do silêncio é um dos mais importantes do reel.
- Som como transição pelo menos duas vezes: o SFX da próxima cena começa antes do corte.
- **Sincronia a um quadro (33 ms); fora disso a ilusão quebra.** Em `sfx=[(nome, off, vol)]`, `off` é onde o *arquivo* começa, contado do início da cena, e vários arquivos têm aproximação ou silêncio antes do som (`glitch-1` 0,36 s, `whoosh-cinematic` 0,25 s): nunca suponha 0. Use `onset` e `peak` de `assets/sfx/manifest.json` (segundos): `off = t_ação − ponto + ajuste`, com `t_ação` o instante da ação dentro da cena.
  - Toque, tecla, clique, pop, pouso, shutter, impacto, chime, ping, notification, error, sparkle, glitch-1, glitch-3: ponto = `onset`. Ajuste: clique −0,01 (o som antecipa o dedo), tecla, shutter e snap +0,01, pouso (`land`) +0,03, chime e ping −0,02, o resto 0.
  - `whoosh` e `whoosh-cinematic`: ponto = `peak`, ajuste 0. `whoosh-short`, `swish` e `swell`: ponto = `peak`, ajuste +0,04 (o pico cai logo depois do corte).
  - `riser`, `impact-bass-2` e `glitch-2` sobem até o corte: ponto = `peak`, ajuste −0,02.
  - Som algum começa antes de 0 s do reel (cena 1): o kit reprova.
- **Espaçamento:** o mesmo arquivo duas vezes a menos de 0,1 s vira um borrão (o kit reprova). Dentro de uma família, o intervalo mínimo entre dois sons: cliques 0,085 s, teclas 0,09, pops 0,11, pousos 0,16, sinos 0,11. `swell` no máximo uma vez por reel.
- Os sons vêm do banco do earshot (Leon Lin, MIT; `scripts/make_sfx.py` gera os arquivos e o manifest). Ajustes e intervalos são medianas medidas pelo earshot em efeitos de filmes de lançamento profissionais; o nível de cada arquivo já está balanceado para `vol` 0,5.

## 6. O treatment.md (o compositor escreve antes do scenes.py)
0. **Estilo, em ordem de leitura do brief:** (1) "Skill", se houver, trava formato, visual e ritmo: siga-a à risca. (2) "Formato escolhido" diz quais planos do locutor existem e quando entram. (3) "Ritmo" diz a cada quantos segundos algo muda. (4) "Estilo escolhido" é o visual que o usuário quer: tipografia, câmera de mundo, beats, sons e receitas vêm dele, sem inventar movimento que ele não tem; se o estilo tem pacote, `ESTILO.md` na pasta compose/ diz como desenhar cada ilustração (leia inteiro antes do treatment; o `engine=` dele está no brief). Se o brief traz "Estilos disponíveis", escolha o que serve ao assunto e à marca, diga qual e por quê no treatment, leia o `style.json` dele (e o pacote em `estilos/<pack>`, se houver) e siga-o. Cores e fontes são sempre da marca (ou do site de referência).
0. **Peças:** leia `assets/manifest.json` (a biblioteca do reel) e olhe as imagens: a shot list diz qual peça cada cena usa e o que ela demonstra da fala; o que falta, o compositor desenha.
1. **Benchmark:** aprender / não levar.
2. **Três estruturas** e a escolhida.
3. **Logline e arco:** uma frase, depois setup → virada → final.
4. **Shot list:** para cada cena, o tempo, a fala, o enquadramento do locutor, o movimento de mundo (`world=`) e o motivo, o destaque único e a transição para a próxima. Marque o plano-assinatura. Se o brief traz janelas de recorte (Speech Screen), diga por cena se é recorte (dentro da janela), painel (`cam='panel'`, animação em cima) ou tela cheia. Tipografia animada e imagens flutuando (`floatimg`) onde a fala pede, não por cota.
   Mais duas linhas por cena, sem as quais a cena não está planejada:
   - **Na batida:** cada palavra tônica da fala → o que entra ou muda nela (um evento por palavra tônica, a cada 0,4–0,8 s), escrito como `T('palavra')` (kit.py: o tempo vem da fala, nunca de um segundo digitado). O pouso, o corte e o carimbo caem **na** palavra, nunca antes.
   - **Vivo:** a vida ociosa de cada elemento enquanto fica em cena (deriva, tique, piscar, digitar, balanço): nada parado por mais de 1 s; o `pace.py` mede isso no vídeo e reprova.
5. **Mapa de som:** por cena, o SFX e onde ficam os dois silêncios.
6. **O que vai diferir do clichê do estilo** (abertura, plano-assinatura, caminho de câmera, final).
O scenes.py segue o treatment; se mudar de ideia ao compor, atualize o treatment antes.

## 7. Roteiro (quem escreve os momentos)
Cada momento diz, além do destaque: o **movimento de câmera** do plano (`câmera: push|pull|pan|crane|tilt|orbit|roll|hold`) e o motivo em três palavras. Um momento é marcado **PLANO-ASSINATURA**. Planeje o arco inteiro antes do primeiro momento: gancho, argumento, prova, virada, CTA. Momentos vizinhos nunca repetem fundo, destaque nem movimento de câmera.

## 8. Antes de entregar
- Folhas de contato de todas as cenas, e um passe olhando só o movimento: a câmera tem quatro gramáticas? Há um plano-assinatura? Há uma respiração?
- Uma rodada de correção: tudo que a checagem e a sua revisão acharam, de uma vez. O que sobrar, diga em uma linha ao entregar.
- Não é a demo de novo: abertura, plano-assinatura, caminho de câmera e final diferentes do último reel desta marca.
