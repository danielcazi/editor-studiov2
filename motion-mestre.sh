#!/bin/sh
# Monta a pasta local "MOTION MESTRE/" (ignorada pelo git): o levantamento de docs/motion-mestre/ e a cópia literal dos arquivos que criam e
# controlam o motion design. Rode da raiz do repositório: ./motion-mestre.sh  (apaga e refaz a pasta a cada vez)
set -e
cd "$(dirname "$0")"
D="MOTION MESTRE"; K=claude-reel-editor/skills/reel-editor
rm -rf "$D"; mkdir -p "$D/fontes/compose/estilos/banco" "$D/fontes/compose/engines" "$D/fontes/server/test" "$D/fontes/scripts" "$D/fontes/workspace"
cp docs/motion-mestre/0*.md docs/motion-mestre/README.md "$D/"; cp docs/motion-mestre/FONTES.md "$D/fontes/README.md"
F="$D/fontes"
cp $K/compose/DIRETOR.md $K/compose/GUIDE.md $K/compose/kit.py "$F/compose/"
cp $K/compose/estilos/*.md "$F/compose/estilos/"; cp $K/compose/estilos/banco/README.md "$F/compose/estilos/banco/"
cp $K/compose/engines/*.js "$F/compose/engines/"; cp $K/compose/sfx/manifest.json "$F/compose/sfx-manifest.json"
cp server/pipeline.ts server/models.ts server/lib.ts server/motionthink.ts server/banco.ts server/layout_check.mjs server/validate.ts "$F/server/"
cp server/test/banco.test.ts server/test/motionthink.test.ts server/test/banco_check.py server/test/test_kit_lint.py "$F/server/test/"
cp $K/scripts/pace.py $K/scripts/qa.py "$F/scripts/"
cp -r workspace/formats workspace/styles workspace/skills "$F/workspace/"; rm -rf "$F"/workspace/*/*/refs "$F"/workspace/*/*/frames
cp SPEC-motion-think.md SPEC-v9.md "$F/"
echo "MOTION MESTRE/ montada: $(find "$D" -type f | wc -l | tr -d ' ') arquivos"
