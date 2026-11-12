# 04 · O que ninguém controla hoje

Levantado em 2026-11-12. Cada item diz o buraco, onde ele aparece e o que já existe (ou está previsto) para fechar.

## 1. A escolha estética em si é livre

Entre 66 helpers do kit, 7 gramáticas de câmera, 6 planos e GSAP à mão, o compositor decide sozinho dentro do que não é erro. Os lints medem o mensurável (posição, tempo, contraste, limites de câmera); nenhum mede **qual** movimento, **qual** proporção da palavra, **qual** ease. Foi o que o corte 05 mostrou (Opus direto com 13 verbos e 2 layouts acertou; o Editor com liberdade total errou).

**O que fecha:** o banco de movimentos (Motion Think) entra como função com geometria fixa; `lint_banco` avisa a cena de momento coberto que não o usou. Ainda é aviso. A §6 da SPEC-motion-think prevê os números das aprovações virando limites do lint; depende de ~10 helpers aprovados.

## 2. Gosto chega como prosa, interpretado três vezes

Roteiro, diretor e compositor são três chamadas de Opus que leem o mesmo DIRETOR.md e decidem motion em sequência. Nada confere o `visual_action` do roteiro contra a shot list do treatment, nem o treatment contra o `scenes.py`. A skill texto-derretido pedia a palavra a 85% da largura e saiu a 35%: a regra estava escrita, ninguém mediu.

**O que existe:** a instrução "se mudar algo, atualize o treatment antes" (DIRETOR §6), sem verificação. **O que fecha:** medir no `scenes.json`/`index.html` o que o treatment prometeu (câmera por cena, assinatura, respiração) é um lint possível; não existe.

## 3. Estilos e skills não são verificados

`style.json` e `skill.json` saem do `cloneStyle` como texto (beats, `motionRecipes` em GSAP solto, regras de som). O compositor "segue" o estilo; nada confere se seguiu. Só `refineStyle` compara um render pronto contra os quadros de origem, à mão, depois.

**O que fecha:** o mesmo caminho do banco: uma receita do estilo que vale a pena vira helper testado (o GUIDE já diz "um movimento novo que valeu a pena vira helper do kit depois"), e aí é código, não frase.

## 4. Autoavaliação pelo mesmo modelo

As 2 rodadas de revisão por folha de contato são feitas pelo compositor sobre o próprio trabalho, com nota 1–10 em critérios subjetivos. Não há segunda opinião automática.

## 5. Câmera sem cota desde a v8

`lint_world` não reclama mais de quantidade ou variedade de movimentos de câmera, nem de falta de plano-assinatura ("o diretor decide"). Um reel de câmera parada passa no lint; só o DIRETOR §8 pede para olhar.

## 6. Rotação do banco

Com 30 helpers aprovados o compositor pode repetir os mesmos 5. O brief já lista os usados nos últimos 3 reels da marca e pede variação (`recentBancoHelpers`, pipeline.ts:2845); é pedido, não lint.

## 7. Limite conhecido do recorte

rd-09: gesto de soco cruzando o queixo aos 61,2 s. A checagem só mede texto e cartão sobre o rosto, não o próprio locutor. Não resolvido (GUIDE, "Limite conhecido").

## 8. O que o pace.py mede e o que não mede

Mede mudança de pixels no vídeo final: pega reel parado, não pega reel que muda sem sentido. Um estímulo por batida é regra do DIRETOR, não do medidor; "na batida" só vira número quando `--words` é passado, e é informativo.

## Ordem sugerida para fechar

1. Piloto do Motion Think (5 helpers) e o corte 05 recomposto só com o banco: prova se gosto como código resolve o item 1.
2. Com os números das aprovações, os lints da §6: largura mínima da palavra gigante, entrada/saída por categoria, elementos por cena. Item 1 passa de aviso a erro onde o Daniel quiser.
3. Lint "treatment × scenes": câmera prometida por cena, assinatura e respiração presentes. Fecha o item 2 sem mexer nos prompts.
4. Receitas de estilo que se repetem viram helpers do banco; `motionRecipes` deixa de ser prosa. Fecha o item 3.
