# Fontes · cópias dos arquivos que criam e controlam o motion

Cópia literal, tirada da `v9` em 2026-11-12, de cada arquivo citado em `../01-quem-cria.md`, `../02-principios.md` e `../03-quem-controla.md`. Os caminhos abaixo são os originais no repositório; **os originais continuam valendo**, estas cópias são para leitura e comparação e não são lidas por nada.

| Aqui | Original | Papel |
|---|---|---|
| `compose/DIRETOR.md` | `claude-reel-editor/skills/reel-editor/compose/DIRETOR.md` | o que decidir (roteiro, diretor, compositor) |
| `compose/GUIDE.md` | `.../compose/GUIDE.md` | como executar |
| `compose/kit.py` | `.../compose/kit.py` | o vocabulário: scene(), câmera de mundo, helpers, lints, banco |
| `compose/estilos/*.md` | `.../compose/estilos/` | os 12 pacotes de ilustração e o índice |
| `compose/engines/*.js` | `.../compose/engines/` | os 8 motores de desenho |
| `compose/sfx-manifest.json` | `.../compose/sfx/manifest.json` | onset/peak de cada som (sincronia a 33 ms) |
| `server/pipeline.ts` | `server/pipeline.ts` | script(), composeScaffold (brief), composeRun (prompts do diretor e do compositor), final() |
| `server/models.ts` | `server/models.ts` | tabela modelo × etapa × effort |
| `server/lib.ts` | `server/lib.ts` | PACE, resolveChoices, textContrast |
| `server/validate.ts` | `server/validate.ts` | validateFormat e afins |
| `server/layout_check.mjs` | `server/layout_check.mjs` | checagem no Chrome: rosto, zona segura, painel, contraste |
| `server/motionthink.ts`, `server/banco.ts` | idem | Motion Think e o banco |
| `server/test/*` | `server/test/` | banco.test.ts, motionthink.test.ts, banco_check.py, test_kit_lint.py |
| `scripts/pace.py`, `scripts/qa.py` | `.../scripts/` | QA do render final |
| `workspace/formats/*/format.json` | `workspace/formats/` | os 8 formatos (planos do locutor) |
| `workspace/styles/*/style.json` | `workspace/styles/` | os 13 estilos (sem os quadros de referência) |
| `workspace/skills/*/skill.json` | `workspace/skills/` | as 4 skills (sem os quadros) |
| `SPEC-motion-think.md`, `SPEC-v9.md` | raiz | as specs |
