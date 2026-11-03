# Estilos de ilustração (índice)

Cada arquivo desta pasta é um pacote de estilo: como desenhar as ilustrações do reel em código (`canvas()` / `scene3d()`), com materiais, cor, movimento, câmera de mundo, transições, som e moves nativos. Adaptados dos STYLE.md do [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (LemoLab, MIT) para reel 9:16 com locutor recortado. O `ILUSTRACAO.md` da marca diz **o que** desenhar (paleta, motivos, o que a marca vende); o estilo diz **como**. Quando os dois conflitam, a paleta e os motivos são da marca, a técnica é do estilo.

Oito pacotes têm **motor em código** (`engines/<nome>.js`, funções testadas com demo em `engines/demos/`): o compositor chama `canvas(..., engine='<nome>')` e usa `SK`/`BB`/`SW`/`AD` em vez de reinventar o pincel. Os outros quatro são só receita, até ganharem motor.

Quem escolhe: o usuário, no formulário de criação (vira `ESTILO.md` na pasta compose/), ou o diretor no treatment quando ninguém escolheu: três candidatos pelo assunto e pela marca, um escolhido com o motivo, o pacote inteiro lido antes do scenes.py.

| Estilo | Uma linha | Com locutor | Só motion | Motor | Serve para |
|---|---|---|---|---|---|
| `silkscreen-poster` | Pôster impresso tinta a tinta, faixas no lugar de degradê, registro escorregado | ★★★ | ★★★ | `engine='silkscreen'` (SK) | oferta, lista de benefícios, trilha, antes/depois, série |
| `briefing-board` | Quadro branco filmado: fotos recortadas pousam com peso, tinta com significado fixo, veredito em vermelho | ★★★ | ★★★ | `engine='briefing'` (BB) | explicar com evidência, comparação com número real, passos, veredito |
| `swiss-motion` | Grade, uma cor-sinal, numeral gigante, tudo encaixa na batida, nada quica | ★★★ | ★★★ | `engine='swiss'` (SW) | número grande, regras, preço, comparação em células |
| `art-deco` | Laca preta, linha dourada que se grava, letreiro de lâmpadas, mostradores | ★★★ | ★★★ | `engine='deco'` (AD) | contagem regressiva, lançamento, prêmio, marco, CTA |
| `sketchnote` | Caderno explicando: parágrafo datilografado com marca-texto e desenho de linha que se desenha | ★★★ | ★★★ | `engine='sketch'` (SB) | mecanismo, palavra-chave, passo a passo, estudo com grifo |
| `launch` | Keynote de produto: névoa clara ou marinho, cards com sombra macia, vidro, site na moldura, checklist, cartão final | ★★★ | ★★★ | `engine='launch'` (LA) | produto, site, curso, benefícios, CTA com o site |
| `diorama` | Lugar inteiro num pedestal isométrico low-poly, placas flutuantes, peças que sobem e explodem | ★★ | ★★★ | `scene3d(ortho=11, engine='diorama')` (DI) | cenário de situação, rotina, lugares, produto no contexto |
| `cinetic` | Caixa de técnicas: digitação, rolo de palavras, contagem, odômetro, gráfico com cabeça, subtração, casca → ação | ★★★ | ★★★ | `engine='cinetic'` (CN) | número, frase que muda, gráfico, corte com classe (combina com os outros) |
| `blueprint` | Linha clara sobre folha azul, desenhada na ordem do desenhista, cotas vivas | ★★ | ★★★ | — | como funciona, mecanismo, processo, método |
| `visual-investigation` | Mesa fria de evidências, fontes em cinza, um vermelho que só aponta | ★★ | ★★★ | — | prova com dado, estudo citado, fact-check, cronologia |
| `woodcut` | Chapa preta onde a luz é talhada, uma só cor para o que importa | ★ | ★★★ | — | virada dramática, esforço, uma só coisa que importa |
| `ukiyoe` | Estampa chapada fora de registro, rolo que desliza sem cortes | ★ | ★★★ | — | jornada, etapas, a mesma coisa em quatro situações |

Fora da biblioteca, com o motivo:
- **cel-anime-80s**: cel pintado + fita VHS brigam com uma pessoa fotográfica, e o motor (rosto construído, CRT) custa mais que um reel inteiro. Só faria sentido num reel só motion de nostalgia.
- **microgame**: é um formato (um meio diferente por jogo, acelerando), não um estilo; exigiria um motor por meio. Fica a lição estrutural no DIRETOR.md: uma batida = um verbo + 2,5–4 s + uma ação + um resultado.
- **recursão em gêneros** (@emollick): cada explicação num gênero diferente (corporativo, terminal, pixel, documentário, noir, infomercial); é um formato de troca de estilo, como o microgame, não um estilo. Fica a lição: um gênero por beat lê em 1 s se o gênero tem três marcas fortes.
- **living-screencast**: só para walkthrough de software (UI real redesenhada + mascote em pixel). Os helpers de UI do kit (`cmdk`, `tabs`, `toast`, `island`) já cobrem o reel de produto; o mascote pixel pode virar pacote quando uma marca com mascote pedir.

Regras para um pacote novo: as mesmas 11 seções do `silkscreen-poster.md`, receitas em px para 1080×1920, paleta só pelas variáveis `RED RED2 AMB BLK CRM`, sons só do `assets/sfx/manifest.json`, e a linha de crédito quando vier de fora.
