# 03 · Quem controla o resultado

O controle é quase todo **a posteriori**: o compositor é livre, e o que ele faz passa por peneiras. Peneira que dá **erro** para o fluxo; peneira que dá **aviso** fica para a revisão do próprio compositor ou do humano.

## 1. Lint do kit · dentro de `render()` (kit.py:312)

Roda a cada `python3 scenes.py`, antes de qualquer Chrome.

**Erro (para):**
- `lint_static` (kit.py:275): plano fora de `planos` do formato; `bg='plate'`; fundo desconhecido; `panel`/`react` sem painel ou sem vídeo de referência; `raw`/`react` sem `bg='clear'` e vice-versa; CTA sem XXL recortado; transição inválida; recorte fora das `cutWindows`; `broll` com locutor;
- `world_track` (kit.py:174): pose de mundo fora de `WORLD_LIM`, `d` maior que a cena;
- `lint_sfx` (kit.py:249): som antes de 0 s do reel, mesmo arquivo duas vezes a menos de 0,1 s, nome fora do manifest;
- por cena: `-webkit-text-stroke`; `class="giant"` em `front`;
- `assert`: cenas encostadas cobrindo 0→DUR.

**Aviso (fica):**
- locutor parado por mais de `pace.hold` s; mesmo enquadramento ou mesmo plano em cenas vizinhas;
- `lint_variety` (kit.py:263): mais da metade dos tweens com duração ≤ 0,3 s (animação travada);
- `T()` sem palavra na fala;
- `lint_banco` (kit.py:1010): cena com `momento=` coberto pelo banco que não chamou nenhum helper dele;
- helper do banco que não carregou.

O que o lint **não** vê: qual helper foi escolhido, proporção da palavra, ease, se o estilo escolhido foi seguido, se há plano-assinatura (desde a v8 não há cotas de câmera).

## 2. Checagem de layout · Chrome · `server/layout_check.mjs` (chamada no fim de `render()`)

Mede o `index.html` com o runtime do HyperFrames e o alfa do `cut.webm`.

**Erro:** card ou texto da frente sobre o rosto ou o queixo; cabeça cobrindo mais de 50% de uma palavra atrás; texto fora das zonas seguras (200/380/70); texto sobre o painel do Speech Screen.
**Aviso:** corpo ou mão cobrindo mais de 50% da palavra atrás; cabeça fora do `faceX` em mais de 50 px; resto de cenário no topo do recorte; braço cortado pela faixa (fonte 9:16).
Grava `review/recorte.png` (10 quadros do recorte sobre verde) para o compositor olhar.
Se o Chrome não roda, vira aviso e o render segue.

## 3. HyperFrames `check` e snapshots · o próprio compositor

`npx hyperframes check` (erros de execução, mídia, timeline) e `snapshot` (folhas de contato). O GUIDE lista o que reprovar a olho: braço cortado reto, palavra na borda, texto coberto > 50%, dois textos encostados, palavra repetida, CTA embaixo, dois fundos escuros seguidos. O compositor pontua 1–10 (gancho, legibilidade, movimento, variedade, marca) e corrige as 3 piores, no máximo 2 rodadas. É autoavaliação do mesmo modelo que compôs.

## 4. QA do render final · `scripts/qa.py` → `scripts/pace.py` (em `final()`, pipeline.ts:2397)

Mede no **vídeo renderizado** (10 fps, 108×192 cinza): intervalo médio entre eventos visuais, quadros em movimento, trechos parados ≥ `hold` s (com as palavras faladas ali), e quantos eventos caem numa palavra. Usa `motion_mask.json` do kit para não contar o locutor se mexendo. Reprova (exit 3) abaixo da barra. Também: duração máxima da marca e palavras perdidas na transcrição.

## 5. Revisão humana · aba Revisão (`review.json`, `POST /review/apply`)

Notas pinadas a um tempo e um ponto (ou ao vídeo todo); cada rodada manda todas as notas abertas ao compositor, que edita só as cenas cobertas; `final()` recusa com nota aberta ou sem Aprovar. Edição manual (`edits.ts`) move camadas sem passar pelo compositor. É o único controle de **gosto**: tudo acima mede posição, tempo e contraste.

## 6. Motion Think · controle antes do reel (novo)

Inverte a ordem: o humano aprova o movimento **antes** de ele entrar num reel. Veredito por movimento (`gosto` / `nao-gosto` / `neutro`), síntese em até 3 rodadas com veredito por rodada, aprovação gated por `test/banco.test.ts` (o helper gera html/js e renderiza uma cena). O reprovado vira `negativo.md`, que o brief e a síntese leem. O controle resultante no reel ainda é só um aviso (`lint_banco`), não erro: o banco é preferido, não obrigatório.

## Quem manda, em uma linha por decisão

| Decisão | Quem decide | Quem confere |
|---|---|---|
| Momentos, destaque, câmera por momento, assinatura, respiração | roteiro (Opus) | ninguém automático; o diretor pode mudar tudo |
| Estilo (quando não escolhido), estrutura, shot list, mapa de som | diretor (Opus) | ninguém automático; o compositor "segue" o treatment |
| Helper, tween, ease, transição, peça, câmera concreta | compositor (Opus) | lint do kit (parte), layout no Chrome (posição), snapshots (ele mesmo) |
| Planos do locutor | usuário (formato) ou skill | lint do kit (erro) |
| Tipografia, câmera, receitas, sons do estilo | usuário (estilo) ou skill | ninguém: o estilo é prosa que o compositor lê |
| Ritmo | usuário (toggle) ou skill | pace.py no vídeo final; `hold` no lint |
| Cores e fontes | marca ou site | contraste só por regra escrita |
| O que está no banco e o que é negativo | Daniel (Motion Think) | banco.test.ts na entrada; `lint_banco` como aviso no reel |
| Se o reel está bom | Daniel (Revisão) | — |
