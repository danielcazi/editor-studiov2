# RD Brand

Escrito a partir dos reels aprovados "003 Black Rd" (oferta) e "008 Conteúdo RD" (didático), não de um template.

## Direção de arte
Um apresentador recortado, colado na base do quadro, e uma ideia grande por cena acima da cabeça dele. O visual é de pôster de lançamento: fundos chapados que trocam de cor no beat da fala, tipografia gigante, objetos e cards com volume. Não é "capa de revista": nada de índice numerado, fio fino separando linhas, faixa diagonal ou bloco de cor com sombra dura.

A RD tem dois registros. **Oferta** (Black Friday, matrícula, bônus): preto com raios, creme, laranja. **Conteúdo** (explicação, didática): prancha de papel cinza em colagem, quase sem locutor. Um reel fica num registro só.

## Cores (registro Oferta)
- Preto #0E0E0E: fundo principal, com 24 a 28 raios radiais cinza #3A3A3A saindo de trás da cabeça ou do topo. Os raios giram devagar (8° em 3,5 s) e pulsam.
- Creme #FFF9E6: segundo fundo, liso, para alternar por corte seco. Também é a cor da palavra gigante sobre o preto.
- Vermelho #D9001B: só palavra gigante sobre creme.
- Laranja #F47B20 (gradiente #FF8A3D → #E8641A): o único acento quente. Números de oferta, pílulas, botão de CTA, logo. Nunca em fundo.
- Grafite #1E1E1E → #2A2A2A: fundo dos cards de oferta, borda 2 px #3A3A3A.
- Azul-cobalto #1F2BD8 desfocado: sala de exceção, uma vez por reel no máximo.
- Nunca: vinho, dourado, gradiente arco-íris, neon, glassmorphism, card branco centralizado.

## Cores (registro Conteúdo)
- Papel #E4E3DF com grade de pontos #B9B8B3 e vinheta nos cantos; o papel nunca se move.
- Tinta #161616 (títulos condensados, linhas-guia) e #2B2B2B (legenda).
- Amarelo #F2D21B para etiquetas de máquina de escrever, marca-texto e selo circular.
- Vermelho #D7262B para risco de negação, palavra em itálico e glow.

## Tipografia
- Grotesca bold (Aspekta Bold), caixa alta nas palavras gigantes, tracking levemente negativo.
- Palavra-herói ocupa 85 a 90% da largura (cerca de 900 px em 1080), altura de cap 150 a 190 px, no terço superior (y 180 a 420 em 1920). Uma ou duas palavras, nunca uma frase.
- Segunda linha em minúscula bold dentro de pílula laranja (310 × 85, raio total, texto preto).
- Rótulos pequenos: caixa alta, tracking +20%, 26 a 30 px, cinza-quente #9A9388.
- Números de oferta: 160 a 200 px em gradiente laranja, com "%" e "OFF" bem menores (60 px) na mesma linha de base.
- No registro Conteúdo: títulos em condensada Heavy caixa alta (70 a 130 px, linhas de tamanhos diferentes); etiquetas em mono de máquina de escrever 28 a 30 px sobre amarelo.

## Peças e gráficos
- Card de oferta: 940 × 440, raio 36, grafite, inclinado -3°, rótulo pequeno em cima e número laranja gigante embaixo. Atrás, 3 a 5 cards iguais desfocados a 25%, em leque. A sala escurece a 15% de brilho enquanto o card está na tela.
- Cartão de ilustração: 420 × 540, raio 28, off-white #F3EEE9, sombra suave, com ilustração flat ou objeto 3D, entra acima da cabeça.
- Pílula de aviso: 700 × 68, laranja, texto preto caixa alta, ponto preto à esquerda.
- Botão de CTA: 820 × 90, raio 45, gradiente laranja, texto preto bold, ícone circular preto com seta ↗ à direita, glow laranja de 40 px. Só no fechamento, com o locutor em XL/XXL.
- Selo de marca em adesivo (laranja-creme com textura de papel, letras ultra-black itálicas): abertura e fechamento, nunca no meio.
- Objetos 3D e mockups do produto como cards flutuantes com sombra, cursor clicando, cards de chat e notificação, contadores e barras: tudo com volume e material, nunca ícone de linha fina sobre sólido chapado.
- Registro Conteúdo: gravuras P&B de domínio público em polaroid com fita crepe, conectores em L com alvo nas pontas, etiquetas amarelas digitadas, uma peça entrando por vez.

## Layout
- O recorte do apresentador ocupa a metade inferior; cabeça em y 1050 a 1300 em M, mais alta em L. Todo texto e gráfico fica na metade superior (y 150 a 950), nunca sobre o rosto.
- Exceção: no CTA em XL, pílula e botão ficam sobre o peito (y 1280 e 1420).
- Um elemento principal por cena, no máximo dois. Metade do tempo é só o apresentador sobre os raios.

## Movimento
- Palavra gigante entra com scale 1,25 → 1 e blur 12 → 0 em 0,35 s (power3.out); sai por corte seco ou scale 0,9 + fade em 0,15 s.
- Card cai de cima (y -220 → 0) com rotação 6° → -3° e overshoot back.out(1.6) em 0,5 s; o fundo escurece antes de o card entrar.
- Pílula: scale 0,7 → 1 com back.out(2) em 0,4 s, 0,2 s depois da palavra.
- Número de oferta conta de 0 até o valor em 0,6 s.
- Troca de sala (preto, creme, azul) sempre por corte seco no beat, nunca push, slide ou wipe. Um corte a cada 3 a 4 s. Micro punch-in 1,0 → 1,05 nos beats de palavra gigante.
- Enquanto fica na tela, tudo continua vivo: raios giram, card flutua, número respira. Nada parado.
- Registro Conteúdo: zero cortes secos; as peças saem em fade curto e o próximo arranjo nasce no mesmo papel, com push lento até 1,1 nos holds.

## Som
- Selo e logo: impact-bass. Corte entre salas: whoosh-short. Palavra gigante: pop; a de fechamento: impact-bass-2. Card cai: land. Número termina a contagem: ping. Pílula: click-soft. Punch-in: snap. Botão: click.
- Proibido: typing, riser, key-press, error. Ganho geral dos SFX em -8 dB.

## Regras
- O rosto do apresentador nunca fica coberto por nada opaco.
- Uma ideia por quadro; se precisa ler, fica até a fala terminar.
- Grão leve (2 a 3%) e vinheta de 15% sobre tudo.
