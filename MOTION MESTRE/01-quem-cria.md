# 01 · Quem cria o movimento

Quatro camadas, em sequência. Três são chamadas de modelo (Opus), uma é código (o kit). Cada camada decide uma parte do motion e entrega um artefato à seguinte.

## 1. Roteiro · Opus · `script()` (server/pipeline.ts:2048)

**Recebe:** a transcrição limpa, `brand.md`, o guia do formato (`formatGuide`), o DIRETOR.md inteiro, o ritmo (`PACE`).
**Entrega:** `script.json` com `moments[]`. Cada momento tem `t_start`, `t_end`, `texto`, `visual_action` e `accentWords`.
**Decisões de motion que toma:**
- o destaque de cada momento (palavra, número, card, imagem);
- o **movimento de câmera** de cada momento (`câmera: push|pull|pan|crane|tilt|orbit|roll|hold` + motivo em três palavras), ao menos quatro diferentes no reel, nunca o mesmo em momentos vizinhos;
- um momento marcado **PLANO-ASSINATURA** e um marcado **respiração** (pausa segurada antes da virada ou da CTA);
- o andamento: um momento novo a cada 2–3 s, nada acima de 3,5 s sem mudança interna.

É a primeira decisão de motion, tomada antes de qualquer código, em prosa. No fim do roteiro `fetchAssets()` baixa as peças da biblioteca (imagens, ícones, .glb) que o compositor vai usar.

## 2. Diretor · Opus · `compose:treatment` (server/pipeline.ts:2972)

**Recebe:** `brief.md`, DIRETOR.md, GUIDE.md, `assets/transcript.json`, até 10 imagens da biblioteca e dos quadros de referência.
**Entrega:** `treatment.md` (até ~120 linhas), nunca código. Uma chamada, effort `medium` (`composeTreatment` em models.ts).
**Decisões de motion que toma** (DIRETOR.md §6):
- estilo: skill > formato > ritmo > estilo escolhido > estilo que ele escolhe entre os disponíveis;
- benchmark (aprender / não levar);
- três estruturas e a escolhida; logline e arco;
- **shot list** cena a cena: enquadramento do locutor, `world=` com motivo, destaque único, transição, qual peça da biblioteca cada cena usa, o que entra "na batida" (`T('palavra')`) e o que fica "vivo";
- mapa de som (SFX por cena e os dois silêncios);
- o que vai diferir do clichê do estilo.

## 3. Compositor · Opus · `compose` (server/pipeline.ts:2935, até `COMPOSE_MAX_TURNS` = 70 turnos)

**Recebe:** tudo acima mais o `kit.py`, os motores, a biblioteca copiada em `assets/`, o banco em `estilos/banco/`, o system prompt de `composeRun`.
**Entrega:** `scenes.py` (que gera `index.html` + `compositions/*.html`), snapshots revisados, e um parágrafo final. Não renderiza: `final()` (pipeline.ts:2397) renderiza.
**Decisões de motion que toma:** todas as restantes, cena a cena:
- qual helper do kit (ou GSAP à mão) faz cada movimento;
- tempos reais dos tweens, eases, durações;
- `tr=` e `move=` de cada cena, `world=` concreto, `signature=True`;
- qual imagem, objeto 3D ou desenho em código entra e onde;
- até 2 rodadas de revisão própria pelas folhas de contato (nota 1–10 em gancho, legibilidade, movimento, variedade, fidelidade; corrige as 3 piores).

Numa rodada de notas (`POST /review/apply`), o mesmo compositor edita só as cenas das anotações.

## 4. Kit · código · `compose/kit.py` (89 funções)

Não decide, oferece. É o vocabulário em que o compositor escreve:
- `scene(n, a, b, bg, cam, back, front, sfx, cta, tr, move, world, signature, momento)` (kit.py:135): a unidade;
- câmera de mundo (`world_track`, kit.py:174): push/pull/pan/crane/tilt/orbit/roll com parallax entre 4 camadas, limites em `WORLD_LIM`;
- 66 helpers de estilo (a partir de kit.py:530): tipografia estrutural, UI que se transforma, textura, aberturas, 3D (`obj3d`), props de editor, movimento medido;
- `canvas()` (kit.py:1043) e `scene3d()` (kit.py:1079) para desenho em código, com 8 motores em `engines/*.js` (`engine()`, kit.py:1026);
- relógio por palavra `T('palavra')`: toda batida cai numa palavra da fala;
- **banco de movimentos** (`estilos/banco/*.py`, carregado no fim do import): helpers aprovados no Motion Think, com geometria fixa e foto.

O compositor pode ignorar o kit inteiro e escrever HTML/GSAP à mão em `back`/`front`. O GUIDE pede "helpers primeiro" (medido: à mão custou 2,2× o tempo e 3× o código), mas é pedido, não regra.

## Fora do fluxo principal, mas que criam movimento

- **`cloneStyle` / `cloneSkill`** (pipeline.ts, `cloneRef`): Opus lê quadros de reels de referência e escreve `style.json` (beats, paleta, câmera, motivo, `motionRecipes` em GSAP, regras de som). Vira texto que o diretor e o compositor leem.
- **Motion Think** (`server/motionthink.ts`): Opus separa um trecho em movimentos (`mtAnalyze`), e depois escreve um helper testado por movimento aprovado (`mtSynthesize`). É a única camada em que o gosto entra como código, não como prosa.
- **Edição manual** (`server/edits.ts`): o usuário move camadas no `index.html` depois do compositor; não cria movimento novo, ajusta posição e texto.
