# Spec · Embrulhos (aba própria)

Decisões tomadas com o Daniel em 2026-11-10, a partir da gravação do "Lateralizador" (`WhatsApp Video 2026-11-09 at 19.31.17.mp4`). Branch `v9`.

## 0. Problema

Hoje os embrulhos são a seção 3 da Entrega de um projeto: a IA escolhe até 3 das 9 molduras, escreve a copy e renderiza direto (`generateHooks` em `pipeline.ts`). O usuário não escolhe o formato, não edita o texto, não vê prévia, e só consegue embrulhar um reel que passou pelo pipeline inteiro.

A aba Embrulhos é um fluxo à parte, como o Motion Think: a pessoa sobe **qualquer vídeo pronto** e sai com ele embrulhado nos formatos que escolheu, com todo campo editável e prévia antes de exportar.

## 1. Decisões

| Pergunta | Decisão |
|---|---|
| Onde fica | Aba própria `#/embrulhos`, depois de Motion Think. Sai da Entrega (seção 3 e `POST /projects/:id/embrulhos` apagados). |
| Unidade de trabalho | Uma **sessão** = um vídeo enviado. Não é projeto, não tem git, não tem marca de projeto. |
| Fonte | Upload (o `/upload` que já existe). Um botão "Embrulhar" na Entrega do projeto cria a sessão a partir do `final.mp4`, para não perder o caminho atual. |
| Etapas | 1 Vídeo → 2 Marca → 3 Formatos → 4 Edição → 5 Exportação (as mesmas da gravação). |
| Modelos | Partimos dos **9 que já existem** em `server/embrulhos/modelos/`. Os que faltam (seção 6) entram depois, um por vez, sem mudar código. |
| Quem escolhe o formato | O usuário. A IA só recomenda (selo) e preenche os campos dos escolhidos. |
| Personalização | Todo campo de texto do manifesto é editável (inclusive os `fixo`), com contador contra o `max`. Controles extras por modelo vêm do manifesto (seção 2.3). |
| Prévia | Os primeiros 15 s, pelo mesmo render da exportação (`renderCamadas` + `compor` com `duracao: 15`). Não há player ao vivo. |
| Identidade | Foto, nome e @ ficam por sessão, com "Salvar como padrão" gravando em `workspace/embrulhos/perfil.json`. Não usa `workspace/brands/`. |
| Modelo de IA | Continua o passo `embrulhos` (Sonnet, esforço médio) de `models.ts`. Sem linha nova na tabela. |
| Proporção | Só 9:16 (o manifesto só tem `9x16`). |

## 2. Dados

### 2.1 Sessão: `workspace/embrulhos/<id>/`

```
state.json     id, name, createdAt, status, vídeo (duração, largura, altura), perfil, leitura, formatos{}
src.mp4        o vídeo enviado (cópia)
words.json     transcrição (transcribe.py), base da copy e da conferência
rosto.json     caixa do rosto por instante (seção 4)
avatar.png     foto de perfil já recortada
img/<modelo>.* imagem enviada no lugar do frame do vídeo
previa/<modelo>.mp4    15 s
saida/<modelo> - <nome do vídeo>.mp4    exportado
log.txt
```

`state.json`:

```json
{
  "perfil": { "nome": "", "arroba": "", "mostrarLogo": true, "mostrarArroba": true },
  "leitura": { "oferta": "", "publico": "", "promessa": "", "cta": "" },
  "formatos": {
    "meme-pov": {
      "selecionado": true, "incluir": true, "aprovado": false,
      "encaixe": { "ok": true, "motivo": "" },
      "campos": { "frase": "…", "chamada": "…" },
      "ajustes": { "quadro_t": 71.0, "imagem": null, "foco_y": 0.5 },
      "itens": [],
      "previaEm": 0, "exportadoEm": 0, "editadoEm": 0
    }
  },
  "version": 3
}
```

`version` funciona como no `review.json`: o `PUT` manda a versão lida e uma versão velha é recusada (duas abas).
`previaEm < editadoEm` = prévia desatualizada; `exportadoEm < editadoEm` = exportação desatualizada. A UI mostra os dois.

### 2.2 Perfil padrão: `workspace/embrulhos/perfil.json` + `perfil.png`

Copiado para a sessão nova. "Salvar como padrão" escreve de volta.

### 2.3 Manifesto (`server/embrulhos/modelos/<id>/manifest.json`), campos novos

Os atuais não mudam. Somam-se, todos opcionais:

```json
{
  "perfil": { "usaIdentidade": true },
  "ajustes": [
    { "id": "foco_y", "tipo": "slider", "rotulo": "Enquadramento vertical do vídeo", "min": 0, "max": 1, "padrao": 0.5 },
    { "id": "quadro_t", "tipo": "quadro", "rotulo": "Imagem parada", "aceitaImagem": true }
  ],
  "zonasTexto": [ { "x": 0.1, "y": 0.12, "w": 0.8, "h": 0.2 } ]
}
```

- `ajustes` é a lista de controles que o cartão de edição desenha. Três tipos: `slider`, `quadro` (frame do vídeo por slider de tempo, ou imagem enviada) e `numero` (ex.: espectadores da Live). Um modelo sem `ajustes` só tem os campos de texto.
- `zonasTexto` são as áreas do quadro que a moldura cobre **por cima do vídeo** (só modelos `sobreposicao`), em fração do quadro. É o que o encaixe compara com o rosto.
- `carregarEmbrulho` valida os campos novos (tipo conhecido, zonas entre 0 e 1).

## 3. API

A sessão fica em `server/embrulhar.ts` (os modelos, a conferência e o render seguem em `server/embrulhos.ts`; o arquivo novo existe porque `pipeline.ts` importa `embrulhos.ts` e a sessão importa `pipeline.ts`). Rotas na tabela de `server.ts`, no molde das do Motion Think.

| Rota | Faz |
|---|---|
| `GET /embrulhos` · `POST /embrulhos` · `GET/DELETE /embrulhos/:id` | Lista, cria (de upload ou `{ projeto }`), lê, apaga a sessão. |
| `GET /embrulhos/modelos` | Catálogo: id, nome, miniatura, campos, ajustes, `usaIdentidade`. |
| `POST /embrulhos/:id/analisar` | Transcreve, rastreia o rosto, calcula o encaixe de cada modelo. Sem IA. |
| `PUT /embrulhos/:id/perfil` | Nome, @, chaves, avatar (recorte feito na UI, chega como PNG pelo `/upload`). `padrao: true` grava o perfil padrão. |
| `POST /embrulhos/:id/gerar` `{ modelos }` | Uma chamada de IA: devolve a `leitura` e os `campos` de cada modelo escolhido; `conferirCampos` + uma rodada de correção, como hoje. Depois renderiza as prévias. |
| `PUT /embrulhos/:id/formatos/:modelo` | Salva `campos`, `ajustes`, `incluir`, `aprovado`. Roda `conferirCampos` e devolve os `itens`. Não renderiza. |
| `POST /embrulhos/:id/formatos/:modelo/previa` | "Atualizar prévia": renderiza os 15 s desse modelo. |
| `POST /embrulhos/:id/exportar` | Renderiza inteiro todo modelo com `incluir` e sem erro na conferência. Um por vez. |
| `GET /embrulhos/:id/events` | SSE de progresso (cópia do `mtEvents`). |
| `GET /embrulhos/:id/file/*` | Prévias, saídas, miniaturas de frame. |

Uma trava por sessão (um passo por vez), como o `locked` dos projetos.

## 4. Encaixe (selo "Encaixa" / "Adaptar")

Função pura `encaixe(modelo, rosto, video)` em `embrulhos.ts`, coberta por teste:

1. Modelo `moldura` (o vídeo vai num slot, nada por cima): calcula o corte que o `compor` fará no vídeo para preencher o slot. Se o rosto sai do corte em mais de 20% dos instantes → **Adaptar**, "O rosto fica cortado em parte do vídeo."
2. Modelo `sobreposicao`: se alguma `zonasTexto` cruza a caixa do rosto em mais de 20% dos instantes → **Adaptar**, "O rosto fica coberto em parte do vídeo."
3. Sem rosto detectado → **Encaixa** (nada a cobrir).

`rosto.json` vem do rastreador Vision que já gera o `nose.json` dos projetos, amostrado a 2 fps. **Em aberto**: o `nose.json` guarda o ponto do nariz, não a caixa; a primeira versão estima a caixa a partir do ponto (largura fixa em fração da altura do quadro) e marca o atalho no código.

"Selecionar recomendados" marca os que deram Encaixa.

Fora desta versão: detectar texto queimado no vídeo (a gravação diz "rosto e textos"). O `ocr_frames.swift` existe e pode entrar depois como terceira regra.

## 5. Render

- `renderCamadas` não muda de contrato. O perfil entra pelos mesmos parâmetros de URL: `avatar` (já existe), mais `nome`, `arroba`, `mostrarLogo`, `mostrarArroba` dentro do `c` (campos). O `_shared/embrulho.js` passa a esconder o bloco de identidade quando a chave vem desligada.
- `compor` ganha `focoY` (0 a 1) no corte do vídeo dentro do slot, no lugar do centro fixo. Resolve o `shortcut` anotado na função.
- `quadro_t` continua vindo de `extrairQuadro`; `ajustes.imagem` troca o arquivo passado em `quadroImg`.
- Exportação e prévia são a mesma função; a prévia passa `duracao: 15`.

## 6. UI (`server/ui.html`, aba nova)

Lista de sessões → dentro da sessão, trilho lateral com as 5 etapas (concluída / atual / bloqueada).

1. **Vídeo**: arrastar ou escolher; player; "Trocar vídeo"; linha de status da análise.
2. **Marca**: foto (trocar, ajustar posição e zoom), nome, @, duas chaves, "Salvar como padrão"; à direita, prévia estática da identidade num modelo que usa perfil.
3. **Formatos**: grade com a miniatura de cada modelo, selo e motivo; "Selecionar recomendados", "Selecionar todos"; rodapé com a contagem e "Gerar prévias e editar".
4. **Edição**: caixa "Leitura da IA"; abas Todos / Para revisar / Revisados; um cartão por formato com a prévia, os campos (contador `n/max`, etiqueta "IA" enquanto não editado), os `ajustes` do manifesto, "Atualizar prévia", "Aprovar", "Incluir na entrega", "Ampliar prévia". Rodapé: "x de y revisados" e "Exportar N vídeos".
5. **Exportação**: lista com status por formato, "Baixar", "Editar" (volta ao cartão), "Abrir pasta dos vídeos".

Erro da conferência aparece no campo e bloqueia a exportação daquele formato; aviso só aparece.

## 7. O que sai

- `generateHooks`, a rota `POST /projects/:id/embrulhos`, a seção "3 · EMBRULHOS" da Entrega e os `embrulho-*.mp4` de `PROJECT_FILES`.
- A escolha de modelo e de `angulo` pela IA (`angulos.json` deixa de ser lido; apagar se nada mais usar).
- Projetos antigos mantêm os `embrulho-*.mp4` no disco; a UI só deixa de listar.

## 8. Modelos que faltam (depois da v1)

A gravação tem 16; temos 9. Faltam, pelo catálogo da gravação: **Live**, **Tweet**, **Choquei**, **POV + Depoimento**, **Tela dividida 2** (tarja de pincel) e dois que pedem um **segundo vídeo** (nomes não aparecem). Cada um é uma pasta com `manifest.json` e `9x16/index.html`; Live, Tweet e Choquei são os que usam `usaIdentidade`. Os de segundo vídeo pedem um `slots.video2` e uma segunda entrada no `compor`: ficam por último.

Conferir antes: a correspondência dos 9 atuais com os nomes da gravação foi deduzida pelo id da pasta (`pergunta` = Caixinha, `tarja` = Tela dividida, `headline-legenda` = Leia a legenda…).

## 9. Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1 | Sessão, upload, análise, rotas e SSE; `gerar`, `previa`, `exportar` com os 9 modelos; `focoY` no `compor` | Teste cria sessão com o vídeo de fixture, gera, edita um campo, exporta um mp4 1080×1920 |
| 2 | Aba na UI com as 5 etapas; botão "Embrulhar" na Entrega; remoção do fluxo antigo | O fluxo da gravação roda de ponta a ponta no navegador |
| 3 | Perfil (avatar, nome, @, chaves, padrão) nos modelos que têm identidade | Trocar o nome muda a prévia |
| 4 | `ajustes` e `zonasTexto` nos 9 manifestos; encaixe com selo | `encaixe()` testado com rosto dentro e fora da zona |
| 5 | Modelos novos da seção 8, um por PR | Cada modelo passa no `embrulhos.test.ts` |

**Estado (2026-11-10)**: as cinco fases feitas, sem commit. Fase 4: `scripts/face_boxes.swift` (Vision do macOS) devolve a caixa do maior rosto a cada segundo; `rastrearRosto` grava `rosto.json` na análise, que a tela dispara sozinha ao abrir a sessão; `encaixe()` em `embrulhos.ts` (pura, testada) marca o instante como cortado (menos de 80% do rosto sobra no recorte do slot) ou coberto (mais de 15% dele debaixo de uma `zonasTexto` do manifesto) e pede adaptação acima de 20% dos instantes. A caixa é a real do Vision, não a estimativa pelo nariz prevista na seção 4 (o `nose.json` não existe mais). Fora do macOS, ou se o Swift falhar, não há selo. Texto queimado no vídeo continua fora. O selo usa o enquadramento central; mexer no `foco_x`/`foco_y` na edição não o recalcula. Fase 5: cinco modelos novos, refeitos a partir da gravação: `live` (barra de transmissão; campos `espectadores` e `rodape`, o @ vem do perfil), `tweet` (nome, @ e foto do perfil; campo `texto`), `fofoca-rosa` (o "Fofoca 2": manchete, print à esquerda, vídeo à direita, selo), `pov-depoimento` e `tarja-pincel` (o "Tela dividida 2"). São 14 no total. Manifesto: `perfil.exige` aceita `perfil_nome` e `perfil_arroba` (o formato fica com erro até a etapa Marca ter o dado; o @ pode ser desligado), `perfil.dica` é uma frase a mais para a IA, e um campo de papel `contador` não entra no aviso de "número fora do vídeo". Os dois formatos de segundo vídeo continuam de fora. Correspondência com a gravação: Caixinha = `pergunta`, Fofoca 1 = `fofoca-headline`, Choquei = `fofoca-duplo`, Tela dividida = `tarja`, Leia a legenda = `headline-legenda`, Oferta direta = `oferta`. Fase 3: etapa Marca (`PUT /embrulhos/:id/perfil`): foto recortada na tela (canvas quadrado, arrastar e tamanho), nome, @, as duas chaves e "Salvar como padrão" (`workspace/embrulhos/perfil.json` + `perfil.png`). A foto vai ao modelo pelo parâmetro `avatar` (`semavatar=1` esconde); nome e @ vão como campos `perfil_nome` e `perfil_arroba`, que nenhum dos 9 modelos mostra ainda (só Fofoca duplo e Fofoca headline têm foto; Live, Tweet e Choquei da fase 5 usam os dois). Mudar o perfil marca como desatualizadas as prévias dos modelos com foto. Reajustar uma foto já salva pede escolher a imagem de novo (o original não é guardado). Fase 2: aba `#/embrulhos` (`embrulhosView` em `ui.html`) com Vídeo, Formatos, Edição e Exportação; miniaturas do catálogo são a página do próprio modelo num `<iframe>` (`GET /embrulhos/molde/*`); a Entrega só tem o botão "Embrulhar este vídeo"; `generateHooks` e sua rota foram apagados. Vídeo de entrada 9:16, 1:1 ou 16:9: o que sobra do slot é cortado e `foco_x`/`foco_y` escolhem o lado. `gerar` não reescreve um formato que já está na sessão (só com `refazer`). Ficou de fora: "Abrir pasta" (a tela mostra o caminho) e `angulos.json`, que continua no disco sem uso. Fase 1: `embrulhar.ts`, rotas, SSE, `compor` assíncrono com `focoY`, `test/embrulhar.test.ts`. A análise da fase 1 é só transcrição e quadros candidatos; o rastreio de rosto fica na fase 4. O `PUT` de um formato que a IA não gerou cria o formato (preenchimento à mão). Medido num reel de 47 s: transcrição + uma chamada de IA + 4 prévias em 54 s.

`VERSAO` sobe a cada fase que for para a `main`. `CLAUDE.md` ganha o parágrafo da aba na fase 2.

## 10. Fora do escopo

Botão de ajuda com chat; outras proporções além de 9:16; legenda automática por cima do embrulho; edição do próprio vídeo (cortes, ritmo).
