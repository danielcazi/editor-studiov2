# 02 · Os princípios que regem o resultado

Estão em cinco lugares. Os três primeiros são texto que o modelo lê (prosa); os dois últimos são dados escolhidos pelo usuário. Esta dispersão é a razão de o gosto chegar como frase e não como geometria.

## A. DIRETOR.md · o que decidir (compose/DIRETOR.md)

Vale para o roteiro (§2–4 e §7) e para o compositor (§6).

| § | Princípio | Como aparece |
|---|---|---|
| 1 | **Benchmark antes de escrever**: aprender (composição, ritmo, câmera, cor, texto) / não levar (personagens, logos, fontes, planos) | primeira seção do treatment |
| 2 | **Um assunto, um objetivo, uma virada**; três estruturas candidatas; **um movimento nativo** no pico emocional, nunca na abertura; cortar o excesso | estrutura do treatment |
| 3 | **Todo plano tem um motivo**: câmera de mundo em 7 gramáticas, variadas; **um plano-assinatura**; **transição desenhada no meio** (o `tr=` é fallback); enquadramento combina com o mundo; destaque com ≥ 1/3 da altura nos momentos-chave | `world=`, `signature=True`, shot list |
| 4 | **Ritmo**: alternar rápido e lento, uma aceleração clara, **uma respiração** antes da virada ou CTA; um estímulo por batida, não um corte por batida; texto fica letras ÷ 15 + 1,5 s; gancho em 3 s; nada parado > 1 s; nada sem mudança > 2 × `pace.every` | roteiro e treatment |
| 5 | **Encenação e som**: antecipação, ação, acomodação; entrada ease-out, saída ease-in, algo sempre andando; toda ação tem som, nunca o mesmo em vizinhas; **dois silêncios**; som como transição 2×; **sincronia a 33 ms** com `onset`/`peak` do manifest e ajustes por família; espaçamento mínimo por família | `sfx=[(nome, off, vol)]`, lint_sfx |
| 6 | O treatment: estilo em ordem de leitura, peças, benchmark, estruturas, arco, **shot list com "na batida" e "vivo"**, mapa de som, o que difere do clichê | treatment.md |
| 7 | Roteiro: câmera + motivo por momento, um PLANO-ASSINATURA, arco inteiro antes do primeiro momento, vizinhos nunca repetem fundo, destaque ou câmera | script.json |
| 8 | Antes de entregar: quatro gramáticas? assinatura? respiração? uma rodada de correção; **não é a demo de novo** (diferente do último reel da marca) | revisão do compositor |

## B. GUIDE.md · como executar (compose/GUIDE.md)

| Tema | Regra |
|---|---|
| Helpers primeiro | montar cada cena com o kit; HTML/GSAP à mão só para movimento que nenhum helper faz |
| Banco de movimentos | quando o banco cobre o momento, use-o; `momento=` em `scene()`; negativo não se reproduz |
| Camadas | 1 `#pcam` backup · 2 `back` (fundo + texto gigante) · 3 `#ccam` locutor · 4 `front`. Tipografia gigante **sempre** em `back`; nunca `-webkit-text-stroke` |
| Fundo | nunca o locutor desfocado (`plate` é erro); sólido, gradiente da marca, imagem ou ilustração |
| Enquadramentos | M 0,95 · L 1,2 · XL 1,5 · XXL 1,8; modos hold/snap/push/shake; trocar no ritmo de `pace.framing`; nunca "locutor pequeno no canto" |
| Planos do formato | `cut`, `panel`, `panel-top`, `raw`, `react`, `none`; `raw`/`react` só com `bg='clear'`; CTA sempre XXL recortado |
| Recorte | RVM, largura inteira 1920×1080, rosto em `faceX`, zoom parte de (faceX, base) |
| Layout (do cliente) | braços nunca cortados; **um destaque por cena**; texto não sobrepõe texto; texto atrás o mais alto possível (topo 10,4%); nada sobre o rosto; CTA acima de 380 px; zonas seguras 200/380/70; pace do compose.json; texto cabe inteiro; contraste ≥ 4,5:1; imagem só se mostra o que a fala diz; fundos alternam, nunca dois escuros seguidos |
| Peças | ordem: biblioteca do reel e compartilhada e site → objetos 3D (`obj3d`, `scene3d`) → desenho em código; cada peça demonstra a frase; proibido emoji, texto de exemplo, ícone de linha fina chapado |
| Fluidez e acabamento | entrada .4–.7 s ease-out, saída .25–.4 s ease-in; movimento sustentado > 1 s em toda cena; `tr` alternado, `cut` ≤ 1 a cada 4 cenas; `move` 1,05 padrão; câmera de mundo com limites e `signature`; grão e vinheta automáticos; corpo nas imagens (sombra, rotação, duotone) |
| Código | GSAP determinístico (`fromTo`, sem `random`, sem `repeat:-1`); uma timeline por composição; cenas encostadas 0→DUR |

## C. brief.md · o que este reel tem (gerado em `composeScaffold`, pipeline.ts:2712)

Não traz cotas desde a v8. O que exige, em texto: fluidez; texto inteiro na zona segura; nada sobre rosto ou queixo; locutor reenquadrado em `faceX` em toda troca, trocando com a fala. O resto é inventário: formato e planos permitidos, ritmo (`every`, `scene`, `framing`, `hold`), estilo ou skill ou lista de estilos para escolher, marca ou site, biblioteca do reel e compartilhada, momentos do roteiro, **banco de movimentos por momento com foto**, palavras-chave, transcript.

## D. Escolhas do usuário · dados (resolvidas por `resolveChoices`, server/lib.ts:99)

Três gavetas: **formato** (planos do locutor), **visual** (estilo), **ritmo** (toggle). Uma **skill** trava as três de uma vez.

| Gaveta | Fonte | Onde | O que fixa |
|---|---|---|---|
| Formato | `workspace/formats/<id>/format.json` (8 hoje) | `planos`, `janelas`, `regras`, `panel`, `safeZones` | quais planos do locutor existem e quando |
| Visual | `workspace/styles/<id>/style.json` (13 hoje) | `beats`, `palette`, `camera` (world, framing, transitions, depth, signature), `motif`, `guide`, `motionRecipes`, `sfxRules`, `giantCase`, `speakerShadow`, `pack` | tipografia, câmera, receitas, sons; se tem pacote, `ESTILO.md` |
| Ritmo | `PACE` (lib.ts:91): lento / normal / dinamico | `every`, `scene[min,max]`, `framing[min,max]`, `hold` | a cada quantos segundos algo muda |
| Skill | `workspace/skills/<id>/skill.json` (4 hoje) | `format`, `look`, `rhythm`, `colorsLocked` | as três gavetas juntas, medidas de um vídeo clonado |

Cores e fontes são sempre da marca (`brand.json`) ou do site de referência; nunca do estilo, salvo skill com `colorsLocked`.

## E. Pacotes de ilustração · como desenhar (compose/estilos/*.md + engines/*.js)

12 pacotes (silkscreen-poster, briefing-board, swiss-motion, art-deco, sketchnote, launch, diorama, cinetic, blueprint, visual-investigation, woodcut, ukiyoe). Cada um: materiais, cor pelas variáveis `RED RED2 AMB BLK CRM`, movimento, câmera de mundo, transições, som, moves nativos, receitas em px para 1080×1920. Oito têm motor testado (`engine='silkscreen'` → `SK`, etc.). Quem escolhe: o usuário no formulário, ou o diretor no treatment entre três candidatos.

## F. O que entra como código, não como prosa (novo em 00.25)

O **banco de movimentos** (`compose/estilos/banco/`): cada helper aprovado no Motion Think tem geometria fixa (constantes medidas no original), 2 a 4 parâmetros livres, uma foto do que se espera e um `.md` de três linhas. É a única fonte de gosto que o compositor recebe como função pronta. A §6 da `SPEC-motion-think.md` prevê que as `medidas` dos helpers aprovados virem limites do lint (largura mínima da palavra gigante, duração de entrada e saída por categoria, elementos por cena, área vazia máxima).
