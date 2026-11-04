# Plano: separar Formatos (edição) de Estilos (motion clonado)

Objetivo: `Formatos` passa a orientar só a edição (onde fica o locutor, câmera, imagens, zonas seguras, ritmo).
`Estilos` é uma aba nova que clona estilos de motion design a partir de referências e os aplica a um projeto,
escolhido na criação ou deixado para o diretor decidir.

## 1. Modelo de dados

**`workspace/styles/<id>/`** (novo, mesmo padrão de `workspace/formats/<id>/`)

- `style.json`: `id`, `name`, `description`, `guide` (o texto de motion que hoje vive em `promptGuide`),
  `beats`, `palette`, `camera`, `motif` (ver 2.1), `motionRecipes`, `styleCatalog`, `sfxRules`, `sfxForbidden`,
  `sfxGainDb`, `sfxPerMinute`, `clonedFrom`.
- `refs/` (quadros das referências) e `skill.md` (regras do usuário), movidos do formato.

**`workspace/formats/<id>/format.json`** perde `motionRecipes`, `styleCatalog`, `sfxRules`, `sfxForbidden`,
`sfxGainDb`, `sfxPerMinute`, `clonedFrom`, `refs/`, `skill.md`. Mantém dimensões, `layout`, `camera`, `cutout`,
`visualAssets`, `editingStyle`, `captionsStyle`, `composer`, `comments` e um `promptGuide` só de edição.

**`state.json` do projeto** ganha `styleId?: string` (motion clonado). O campo `style` já existente continua
sendo o pacote de ilustração (`compose/estilos/*.md`); são coisas diferentes e os dois podem coexistir.

## 2. Servidor

`server/pipeline.ts`

- `styleDir`, `listMotionStyles`, `getStyle`, `createStyle`, `updateStyle`, `deleteStyle`: cópia das funções
  de formato, trocando a pasta. `deepMerge` no update igual ao `updateFormat`.
- `cloneFormat` → `cloneStyle`: mesma análise (Opus + ritmo por ffmpeg), mas escreve `style.json`, `refs/` e
  `skill.md` em `workspace/styles/<id>/`. Não cria mais formato. O ritmo medido fica em `clonedFrom.measured`
  e vira uma linha de texto no prompt ("ritmo medido na referência: X s por tela"); o `editingStyle` do formato
  continua mandando. `refineFormat` → `refineStyle` (compara quadros da referência com o render, reescreve `guide`).
- `formatGuide(st)`: remove as linhas de sfx, motionRecipes, skill e styleCatalog.
- `styleGuide(st)` (nova, ~15 linhas): monta "# Style brief" com `guide`, receitas, sfx, catálogo e skill do
  `st.styleId`; devolve `''` sem estilo. Concatenada logo após `formatGuide(st)` nos dois pontos que a usam
  (motion e cards, hoje linhas ~1973 e ~2184).
- `brief.md` do compositor (hoje linha ~3064): a seção "Estilo do formato escolhido" passa a ler do estilo,
  incluindo `refs/` do estilo. Sem `styleId`, a seção lista os estilos disponíveis (id, nome, descrição) e manda
  o diretor escolher um e justificar, como já faz com os pacotes de ilustração.
- `createProject`: aceita `styleId` e valida com `getStyle`.
- Troca de estilo em projeto existente: `PUT /projects/:id/style` (uma função de 5 linhas, como `setComposerMode`),
  só muda o estado; o próximo `motion`/`compose` usa o novo.

### 2.1 Clone de estilo: o que muda no prompt e na amostragem

O `cloneStyle` mantém o que já funciona (ritmo por cortes e batidas de som medidos com ffmpeg, quadro no instante
de cada batida, JSON com schema forçado) e ganha o que faltava em relação a uma decupagem profissional:

- **Decupagem beat a beat antes da receita.** O schema ganha, nesta ordem, `beats` (até 12 por vídeo:
  `{from, to, composition, elements, typography, motion, transitionOut, sfx}`), `palette` (`[{hex, role}]`,
  hex aproximado; no projeto a marca manda, o hex só fixa a relação fundo/acento/gradiente), `camera` (abaixo),
  `motif` (o elemento que volta sempre) e só então `promptGuide` e `motionRecipes`. A ordem no schema faz o
  modelo analisar antes de resumir, na mesma chamada. `beats`, `palette` e `camera` ficam em `style.json`.
- **Câmera e profundidade**, no vocabulário que o `kit.py` já entende (GUIDE.md "Câmera de mundo"), para o
  compositor aplicar sem traduzir:
  - `camera.world`: lista de movimentos vistos, cada um `{kind: push|pull|pan|crane|tilt|orbit|roll, when, amount}`
    (`amount` dentro dos limites do kit: x/y até ±120 px, scale 0,9 a 1,35, rx/ry até ±8°, rz até ±6°).
  - `camera.framing`: modos de enquadramento do locutor usados (`M`, `L`, `XL`, `XXL`) e como se troca
    (`hold`, `snap`, `push`, `shake`) e a cada quantos segundos.
  - `camera.transitions`: quais `tr` aparecem (`push`, `fade`, `slide`, `wipe`, `cut`) e com que frequência o `cut`.
  - `camera.depth`: se há parallax entre camadas (plate, fundo, locutor, frente) e em que proporção, se há
    desfoque de profundidade (o que fica nítido e o que fica fora de foco), e onde fica o ponto focal
    (rosto, texto, objeto) em cada tipo de cena.
  - `camera.signature`: o plano-assinatura da referência (o movimento mais marcante), que vira `signature=True`.
  A `camera` do `format.json` (face-center, headroom) continua sendo a do rastreio de rosto na ingestão; a do
  estilo é a câmera de mundo da composição. Sem câmera na referência (vídeo estático), `world` sai vazio e o
  guia diz isso, para o diretor não inventar movimento que o estilo não tem.
- **Amostragem.** Teto de quadros por vídeo sobe de 8 para 12; entra um quadro em `dur - 0.3` (o último quadro
  segurado, end card ou CTA); além dos quadros em 540 px, dois em 1080 px (abertura e o beat mais denso) para
  peso de fonte e ícones pequenos; para ver movimento de câmera, cada beat ganha um par de quadros a 0,4 s de
  distância em vez de um só, e o prompt pede para comparar o par.
- **Consumo.** `styleGuide(st)` e o `brief.md` mostram `camera` por extenso e um resumo dos `beats`
  (um por linha, até 12 no total mesmo com vários vídeos); `refineStyle` compara o render com os `beats`
  e a `camera`, não só com o `promptGuide`.
- **Fica de fora** do prompt mestre: compressão de duração, fonte travada (a marca vence) e música/locução
  (não geramos trilha).

`server/server.ts`

- Rotas `/styles` (GET lista, GET :id, POST, PUT, DELETE, POST `/styles/clone`, POST `/styles/:id/refine`).
- A rota atual `GET /styles` (pacotes de ilustração) vira `GET /illustration-styles`; a UI chama em um único
  lugar (`projects()`), uma linha.

`claude-reel-editor/skills/reel-editor/compose/DIRETOR.md`: um item novo ao lado do item 0 (estilo de
ilustração): se o briefing traz um estilo de motion, segui-lo; senão escolher entre os listados e justificar.

## 3. UI (`server/ui.html`)

- Aba **Estilos** entre Formatos e Cortes: grade de cards (nome, descrição, quadro de `refs/` como capa,
  origem do clone), botões "Clonar estilo" e "Importar (.json)". O modal de clonar é o `fmtCloneBtn` atual
  apontado para `/styles/clone`; o detalhe do card reaproveita as seções de sfx/receitas que hoje estão no
  detalhe do formato (`clonedFrom`).
- Aba Formatos: some o botão "Clonar animação" e as seções de sfx/receitas/clone do detalhe. Texto de apoio
  passa a falar de locutor, câmera, imagens e zonas seguras.
- Criação de projeto: seletor "Estilo de motion" com opção "Deixar o diretor decidir" (padrão), ao lado do
  seletor de formato. Projeto aberto: o mesmo seletor na Revisão chama `PUT /projects/:id/style`.

## 4. Migração dos dados existentes

Script único em `tools/split_styles.mjs` (roda uma vez, idempotente):

- `darkrd-clone`: cria `workspace/styles/darkrd/` com os campos de motion, `refs/` e `skill.md`; o formato
  fica com os campos de edição (parágrafos LAYOUT e RITMO). `motion-completo` fica só como formato: lido de
  perto, o `promptGuide` dele é edição (densidade, o que combinar, locutor recortado), não um estilo clonado.
- `fitted-captions` (tem `styleCatalog`): o catálogo vira um estilo `fitted-captions`.
- Projetos existentes com `formatId` de um formato que perdeu motion ganham `styleId` com o estilo de mesmo
  nome, para renderizar igual a antes.
- Os outros 11 formatos só perdem campos vazios; o `promptGuide` de cada um precisa de revisão manual para
  tirar frases de motion (uma passada de leitura, 14 textos).

## 5. Testes

- `server/test/styles.test.ts`: `styleGuide` devolve `''` sem estilo e inclui receitas, sfx, câmera e beats com
  estilo; `camera.world` fora dos limites do kit é trazido para dentro deles (`clampCamera`), não rejeitado, para o
  estilo continuar utilizável; `createProject` e `setStyle` recusam `styleId` inexistente via `getStyle`.
- `npm run check` e `npm test` verdes; abrir um projeto antigo e confirmar que `motion` roda com o estilo migrado.

## 6. O que não muda

- Etapas Vídeo → Ingestão → Roteiro → Revisão → Entrega, nomes internos e `locked()`.
- Decisão do caminho de render (cards vs. agente): continua no formato (`composer`, `cutout` + site).
- `validate.ts`, `build_reel.py`, `kit.py`, export AE, embrulhos, Cortes.
- Referência por projeto (`referenceUrl` → `reference.json`) continua como terceiro ajuste, por projeto.
- Pacotes de ilustração (`compose/estilos/*.md`, campo `style`).

## 7. Decisões tomadas (mude se discordar)

- Estilo de motion e pacote de ilustração ficam separados; a aba Estilos mostra só motion clonado.
- Ritmo medido no clone vira texto no prompt, não sobrepõe o `editingStyle` do formato.
- Um estilo por projeto, opcional; sem estilo o diretor escolhe a partir da lista no brief.

Estimativa: 1 a 2 dias, a maior parte em `ui.html` e na revisão manual dos 14 `promptGuide`.
