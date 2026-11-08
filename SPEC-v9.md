# Spec v9 · Formato · Estilo · Skill · Ritmo

Branch `v9`, a partir da `main` (`c65eb34`, que já contém a v8). Decisões tomadas com o Daniel em 2026-11-05/06.

## 0. Problema

Hoje quatro fontes dão ordem sobre a mesma coisa (ritmo, câmera, posição do locutor) e o modelo recebe todas no mesmo `brief.md`, sem regra de quem vence:

- `compose/GUIDE.md` (regra 8) e `GUIDE-motion.md` (regra 5) travam "~1,5 s por estímulo" para todo reel.
- `workspace/formats/*/format.json` → `promptGuide` repete o ritmo e ainda descreve visual ("canvas escuro com brilho", "só texto").
- `workspace/styles/*/style.json` (clones) trazem posição do locutor, ritmo medido e paleta, que o bloco "Formato escolhido" também reivindica.
- `pipeline.ts:2712-2714`: os blocos "Formato escolhido", "Estilo escolhido" e "Estilos disponíveis" têm a condição invertida (`!noSpeaker`): no Só Motion o estilo e o formato escolhidos **nunca chegam ao modelo** (confirmado no brief de `2026-11-05-rd-02-black-03`).

## 1. Modelo: um dono por pergunta

| Pergunta | Dono | Quem escolhe |
|---|---|---|
| Como o render funciona (camadas, rosto, zona segura, determinismo) | **Kit** (`kit.py` + GUIDE.md enxuto) | ninguém: fixo |
| Quais planos do locutor existem e quando entram | **Formato** | usuário, obrigatório (padrão: Recorte tela cheia) |
| A cada quantos segundos algo muda | **Ritmo** | usuário, toggle (padrão: dinâmico = o de hoje) |
| O que preenche o plano: ilustração, tipografia, motion, textura, som | **Estilo** | usuário, opcional (vazio = o diretor escolhe) |
| Um vídeo específico replicado à risca | **Skill** | usuário, opcional; **tranca** formato, estilo e ritmo |
| Hex das cores e fontes | **Marca** (+ site de referência) | por marca |

Precedência:

1. **Skill escolhida**: `format`, `look` e `rhythm` vêm dela. Os seletores Formato, Estilo e Ritmo ficam desabilitados e mostram o que a skill traz. Cores: site de referência (se houver) > hex travados da skill > marca.
2. **Sem skill**: Formato + Estilo + Ritmo, independentes. Cores: site > marca. O estilo só diz os *papéis* das cores (um acento, claro/escuro alternando), nunca hex.
3. O estilo pode *sugerir* um ritmo (`paceHint`): vira o valor inicial do toggle, o usuário muda à vontade.

## 2. Dados

### 2.1 Formato: `workspace/formats/<id>/format.json`

Um formato é **uma paleta de planos do locutor + uma agenda**. Nada de ritmo, nada de visual.

```json
{
  "id": "business-reels",
  "name": "Business Reels",
  "order": 1,
  "aspectRatio": "9:16", "width": 1080, "height": 1920,
  "speaker": true,
  "planos": ["cut", "panel-top", "none"],
  "janelas": null,
  "regras": "Locutor recortado (`cut`) em tela cheia só nos momentos marcantes que pedem mais espaço em tela para o motion. Tela dividida (locutor em cima, apoio embaixo) quando ele explica método, lista ou passo a passo. Nunca o mesmo plano duas vezes seguidas.",
  "panel": { "side": "top", "top": 0.5 },
  "refVideo": false,
  "safeZones": { "top": 200, "bottom": 380, "left": 70, "right": 70 }
}
```

- `planos`: subconjunto de `cut` (recortado, câmera M/L/XL/XXL), `panel` (vídeo cru no painel de baixo, animação em cima), `panel-top` (cru em cima, animação embaixo), `raw` (vídeo cru em tela cheia, gráficos na frente), `none` (só animação), `react` (vídeo de referência numa metade, locutor cru na outra). É o `cam` de cada `scene()` do kit; o lint reprova plano fora da lista.
- `janelas`: `null` = agenda livre (só `regras`); ou `{ "cut": [[0,5],[15,20],["tail",5]] }` = o Speech Screen de hoje (`cutWindows`).
- `regras`: texto curto só com o **quando** (gancho, CTA, método). Sem números de ritmo, sem descrição de visual.
- Somem: `cutout`, `camera`, `editingStyle`, `captionsStyle`, `layout`, `visualAssets.backgroundStyle`, `styleNumber`, `composer`, `promptGuide`, `comments`, `cutWindows` (vira `janelas`). `hidden` fica.

Formatos que sobrevivem (6):

| id | planos | janelas | kit hoje |
|---|---|---|---|
| `recorte` (novo padrão, nasce do business-reels + motion-completo) | cut, none | livre | ✅ |
| `business-reels` | cut, panel-top, none | livre | ❌ panel-top |
| `speech-screen` | cut, panel, none | fixas | ✅ |
| `split-bottom` (novo: Speech Screen sem janelas) | panel, none | livre | ✅ |
| `split-top` (novo) | panel-top, none | livre | ❌ |
| `reacao` (novo) | react, cut | livre | ❌ react |
| `so-motion` | none | — | ✅ |

Os demais ficam `hidden: true` (já estão) ou migram: `fitted-captions` e `image-cluster` viram **estilos** (são linguagem visual); `ranking-format` fica oculto (o kit não tem `tier`); `motion-completo` e `personal-reels` somem (densidade = ritmo dinâmico; b-roll pessoal = asset).

### 2.2 Estilo: `workspace/styles/<id>/style.json`

Só linguagem visual. Duas origens, mesmo esquema:

```json
{
  "id": "diorama",
  "name": "Diorama isométrico",
  "description": "...",
  "pack": "diorama.md",
  "engine": "diorama",
  "guide": "...",
  "motif": "...",
  "palette": [{ "hex": "#E4E3DF", "role": "papel claro de fundo" }],
  "motionRecipes": [], "sfxRules": [], "sfxForbidden": [],
  "giantCase": "lower", "speakerShadow": true,
  "paceHint": "lento"
}
```

- `pack`/`engine` (opcionais): apontam para `compose/estilos/<pack>.md` e `compose/engines/<engine>.js`. Os 12 packs (`art-deco`, `blueprint`, `briefing-board`, `cinetic`, `diorama`, `launch`, `silkscreen-poster`, `sketchnote`, `swiss-motion`, `ukiyoe`, `visual-investigation`, `woodcut`) foram apagados na 00.22 (`22dd810`) e voltam com `git checkout 22dd810^ -- claude-reel-editor/skills/reel-editor/compose/estilos`; os motores (`engines/*.js`) ainda estão no disco. `composeScaffold` copia o pack para `compose/ESTILO.md` e injeta o motor. Os 12 packs viram 12 estilos com um `style.json` gerado (script de migração).
- Clones: um estilo também pode nascer de um vídeo ("clonar só o visual"), que é o `look` do `cloneSkill` gravado sozinho.
- Somem do estilo: `camera.framing`, `camera.transitions`, `beats`, `pace`, `sfxPerMinute`, `clonedFrom` (tudo isso é skill). `palette.hex` fica como "aproximado"; o brief já diz que a marca substitui.
- `fitted-captions` fica estilo (é escrito à mão). `build`, `black-rd`, `didatico`, `textos-dinamicos-flat` migram para **skills** (são clones de um vídeo).

### 2.3 Skill: `workspace/skills/<id>/skill.json` (novo)

Um vídeo clonado, em três blocos com o mesmo esquema das gavetas, para a exclusividade ser regra de tela e não de dado:

```json
{
  "id": "build-02",
  "name": "Build 02",
  "description": "...",
  "format": { "speaker": true, "planos": ["cut", "none"], "janelas": null, "regras": "...", "panel": null },
  "look":   { "guide": "...", "motif": "...", "palette": [...], "motionRecipes": [...], "sfxRules": [...], "giantCase": "lower", "speakerShadow": true },
  "rhythm": { "pace": 1.3, "beats": [...], "sfxPerMinute": 22 },
  "colorsLocked": true,
  "clonedFrom": { "urls": [], "measured": [...] }
}
```

- `refs/` (quadros) e `skill.md` (regras do usuário, que vencem) ficam ao lado, como hoje.
- `cloneSkill` = o `cloneStyle` de hoje com o schema reorganizado nos três blocos (o prompt já pede framing, transições, beats e paleta; muda a forma, não o conteúdo). `refineSkill` = `refineStyle`.
- `colorsLocked`: a skill trava os hex; a marca não substitui (o site de referência ainda vence).

### 2.4 Ritmo

`state.pace` ∈ `lento | normal | dinamico` (padrão `dinamico`). Tabela única em `pipeline.ts`, gravada em `compose.json` como números:

| toggle | `every` (algo novo a cada) | `scene` (min, max) | `framing` (troca de plano a cada) | `hold` (aviso de locutor parado) |
|---|---|---|---|---|
| lento | 3,5 s | 3 – 5 s | 5 – 7 s | 8 s |
| normal | 2,2 s | 2 – 3,5 s | 3 – 5 s | 6 s |
| dinamico | 1,5 s | 1,2 – 3 s | 2 – 4 s | 4 s (o de hoje) |

Com skill: `pace` vem de `skill.rhythm` e o toggle mostra o valor medido, desabilitado.

### 2.5 `compose.json` (o que o kit lê)

Acrescenta `planos`, `pace` (os quatro números) e `panel.side`. `cutWindows` continua sendo o `janelas.cut` resolvido para segundos. `giantCase`/`speakerShadow` passam a vir do estilo **ou** da skill. `safeZone` já existe.

## 3. Guias e prompts

- **`GUIDE.md`** fica só com o contrato do kit: Fluxo, Camadas, Planos (um bloco por `cam`: cut, panel, panel-top, raw, none, react), Recorte e rosto, Regras de layout **sem a 8 e sem a alternância de enquadramento da 12**, Site, Imagens e objetos, Estilos prontos do kit, Componentes, Fluidez (sem número de ritmo), Regras de código, Checagem. Ganha duas linhas: "Ritmo: siga `pace` do compose.json" e "Planos: só os de `planos` do compose.json". Os blocos que dependem do locutor ficam marcados "(com locutor)".
- **`GUIDE-motion.md` é apagado.** Só Motion = `speaker: false`; o kit já sabe.
- **`DIRETOR.md`** §4 troca "1 s parado / 3 s sem mudança / 1,5 s" por "os limiares de `pace`"; §6.0 passa a dizer Skill → Estilo → Formato na ordem de leitura.
- **`brief.md`** (`composeScaffold`) ganha seções fixas, nesta ordem: `## Skill` (os três blocos + refs; quando existe, as três seguintes não entram) · `## Formato` (planos, agenda, regras) · `## Ritmo` (uma linha com os quatro números) · `## Estilo` (guide, motif, pack, refs) ou `## Estilos disponíveis` (lista, quando vazio). Some o "topo 200, base 380, laterais 70" fixo no texto: vem de `safeZone`. Corrige a condição `!noSpeaker`.
- **`formatGuide()` / `styleGuide()`** (prompts do roteiro, `pipeline.ts:1193` e `:1345`) leem das mesmas fontes, pela mesma precedência, através de um resolvedor único (§5).
- `pace.py`: `BAR` deixa de ser constante e lê `pace` do `compose.json`.

## 4. Kit (`compose/kit.py`)

1. `CFG['planos']`, `CFG['pace']`, `CFG['panel']['side']`.
2. `lint_static`: `cam` fora de `planos` → **erro**; mesmo plano em cenas vizinhas → aviso (generaliza o aviso de enquadramento igual); `hold` > `pace.hold` → aviso (hoje 4 s fixo).
3. Planos novos (fase 6): `panel-top` (`#tcam` no topo; a máscara do `layout_check.mjs` e o `motion_mask.json` invertem); `raw` (`#pcam` visível em tela cheia, z 3; `front` permitido na altura do peito); `react` (segundo vídeo `assets/ref.mp4` na metade oposta ao painel; novo asset no scaffold).
4. `server/layout_check.mjs`: `panel.side`.
5. `server/test/fixtures/ae/index.html`: cada wrapper novo entra na fixture (regra do CLAUDE.md para o export AE).

## 5. Servidor (`server/pipeline.ts`, `server/server.ts`)

- `State`: `formatId`, `styleId`, `skillId?`, `pace`.
- Resolvedor puro `resolveChoices(st): { format, look, rhythm, sources }` em `server/lib.ts` (testável): aplica a precedência do §1 e devolve de onde veio cada bloco. `composeScaffold`, `formatGuide` e `styleGuide` só consomem o resultado.
- `getFormat`/`listFormats`: esquema novo; `hidden` mantido. Validação do esquema (`planos` ⊂ vocabulário do kit) em `validate.ts`.
- Estilos: `listMotionStyles`/`getStyle`/`updateStyle` continuam; `createStyle` aceita `pack`/`engine`.
- Skills: `listSkills`, `getSkill`, `cloneSkill` (renomeia `cloneStyle`), `refineSkill`, `deleteSkill`, `skillRefFile`; rotas `/skills...` espelhando `/styles...`.
- `PUT /projects/:id/choices` `{ formatId?, styleId?, skillId?, pace? }` substitui `setStyle` (`:1654`); valida e limpa `approvedAt`.
- Shim de leitura em `getProject`: `state.styleId` apontando para um estilo migrado a skill vira `skillId`.

## 6. UI (`server/ui.html`)

- Diálogo de criação (`:6310-6321`): quatro controles: Formato (select), Estilo (select, "automático"), Skill (select, "nenhuma"), Ritmo (3 botões). Skill escolhida → os outros três desabilitam e mostram o que ela traz.
- Cabeçalho da Revisão (`:7287-7304`): os mesmos quatro, editáveis (hoje só o estilo).
- Abas: **Formatos** (edita `planos`, `janelas`, `regras`), **Estilos** (packs e clones só-visual), **Skills** (o fluxo "clonar de vídeo" + refinar sai de Estilos e vem para cá).
- Some a etiqueta "✂ Cut-out" (vinha de `cutout`, campo morto).

## 7. Migração (`workspace/`), por script em `server/scripts/migrate-v9.mjs`

1. Formatos: reescreve os 6 do §2.1; os outros ganham `hidden: true` se não tiverem.
2. Estilos: restaura `compose/estilos/` do git e gera 12 `style.json` a partir dos `.md`; converte `fitted-captions` e `image-cluster` em estilo.
3. Skills: move `build`, `black-rd`, `didatico`, `textos-dinamicos-flat` para `workspace/skills/`, repartindo os campos nos três blocos (framing/transitions → `format`; guide/motif/palette/recipes/sfx → `look`; pace/beats → `rhythm`). `refs/` e `skill.md` vão junto.
4. Projetos: nada é reescrito; o shim do §5 resolve na leitura.

## 8. Ordem de entrega (cada fase fecha sozinha e é testável)

| Fase | Entrega | Como provar |
|---|---|---|
| 1 | Corrige a condição `!noSpeaker` nos três blocos do brief | brief de um projeto Só Motion com estilo escolhido traz `## Formato` e `## Estilo` |
| 2 | Ritmo: toggle, tabela, `pace` no compose.json, kit e `pace.py` lendo; números saem de GUIDE.md, GUIDE-motion.md (apagado) e dos formatos | o mesmo reel (`2026-11-04-ads-insula-build-v8`) em `dinamico` sai igual ao de hoje; em `lento` as cenas duram 3–5 s |
| 3 | Formato = planos + agenda: esquema, validação, lint, UI, migração dos 6 formatos | `test_kit_lint.py`: plano fora da lista é erro; `lib.test.ts`: resolvedor |
| 4 | Estilo = packs: restaura `compose/estilos/` de `22dd810^`, 12 estilos gerados, `pack`/`engine` no scaffold, seção `## Estilo` no brief | um reel com `diorama` traz `ESTILO.md` e o motor no `compose/` |
| 5 | Skill: pasta, `cloneSkill` com três blocos, precedência, trava na UI, migração dos 4 clones | reclonar o Build 02 e comparar o `match` do `refineSkill` com o do estilo antigo |
| 6 | Kit: `panel-top`, `raw`, `react`; formatos `split-top`, `reacao`; fixture do AE | snapshot de cada plano novo; `ae_export.test.ts` com texto nativo |
| 7 | Limpeza: formatos ocultos, `GUIDE-motion.md`, `setStyle`, campos mortos do `format.json` | `npm test` verde; `grep` sem referências mortas |

Cada fase: `cd server && npm run check && npm test`, mais o reel de referência renderizado antes e depois quando a fase toca o brief ou o kit (fases 2, 4, 5, 6).

## 9. Testes novos

- `server/test/lib.test.ts`: `resolveChoices` (skill tranca; sem skill, defaults; `paceHint` vira valor inicial; cores por precedência).
- `server/test/validate.test.ts`: esquema de `format.json` (`planos` só do vocabulário; `janelas` dentro da duração).
- `server/test/test_kit_lint.py`: plano fora de `planos` → erro; `hold` escala com `pace`; mesmo plano vizinho → aviso.
- `server/test/migrate.test.ts`: migra um `style.json` de clone para os três blocos sem perder campo.
- `server/test/ae_export.test.ts`: fixture com `panel-top` e `raw` (fase 6).

## 10. Riscos

- **Fase 2 muda todo projeto novo.** O `dinamico` tem de reproduzir o resultado aprovado; comparar o reel de referência antes/depois é obrigatório, não opcional.
- **Clone em três blocos pode piorar a fidelidade.** Guardar o `style.json` antigo em `refs/` da skill migrada e comparar o `match` do refine.
- **`panel-top` mexe no `layout_check`, no `motion_mask` e no export AE** de uma vez. Fase 6 fica por último por isso.
- **Dois servidores no mesmo workspace** (`start.sh` e preview) leem formatos e skills do disco: a migração roda com o servidor parado.

## 11. Fora do escopo

Editor de skill (abrir e trocar uma peça), `ranking-format` (`tier` no kit), geração de imagens, mudar o `MODEL_BY_STEP`. O caminho de cards já saiu na 00.22; nada a apagar aqui.

## 12. Em aberto

Resolvidas pelo Daniel em 2026-11-06:

- "Locutor em tela cheia" do Business Reels: **recortado (`cut`)**, e só nos momentos marcantes que precisam de mais espaço em tela para o motion (não em todo gancho/CTA). `regras` do §2.1 já reflete isso.
- Com skill e site de referência ao mesmo tempo: **o site vence** nas cores (site > hex da skill > marca, como no §1).

Ainda aberto:

- Os quatro números da tabela de ritmo (§2.4) são chute inicial; **decidir na fase 2**, calibrando no reel de referência.
