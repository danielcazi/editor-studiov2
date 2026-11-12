# Spec · Motion Think (aba de treino do gosto)

Decisões tomadas com o Daniel em 2026-11-07, a partir da comparação dos dois reels do corte 05 (Opus direto × Editor 7.0). Branch `v9`.

## 0. Problema

Os reels variam demais com o mesmo input porque o compositor escolhe livremente entre 66 helpers, 7 gramáticas de câmera e 3 planos, e o gosto do Daniel só chega como prosa (GUIDE, DIRETOR, skill clonada). Prosa não transfere gosto: a skill texto-derretido pedia a palavra a 85% da largura e saiu a 35%. O que transfere é um **movimento pronto, com geometria fixa e uma foto aprovada ao lado**. O Opus direto acertou com 13 verbos e 2 layouts; o Editor errou com liberdade total.

Motion Think é a aba onde o Daniel ensina o editor um movimento por vez: manda um trecho de vídeo que gosta, o modelo separa em movimentos e frames, o Daniel aponta o que gosta e o que não gosta, o modelo monta o movimento como helper e renderiza uma demo, o Daniel valida. Aprovado entra no **banco**: um helper testado, com foto, que o compositor passa a preferir.

## 1. Decisões

| Pergunta | Decisão |
|---|---|
| Unidade de trabalho | O **trecho** enviado, recortado por um seletor de minutagem (início e fim) na própria aba. Dentro dele, a análise separa **movimentos** (1 a 10 s, uma coisa acontecendo). O movimento é o que vira helper. |
| Fonte | Upload ou URL (yt-dlp, como a Cortes), depois o seletor de in/out. |
| Tags | Momento da fala: `gancho`, `contexto`, `problema`, `definicao`, `exemplo`, `historia`, `prova`, `numero`, `lista`, `comparacao`, `passo-a-passo`, `virada`, `resumo`, `cta`. Categoria: `tipografia`, `infografico`, `grafico`, `ilustracao`, `icone`, `foto`, `foto-antiga`, `colagem`, `exemplo`, `broll`, `3d`, `transicao`, `camera`. Um movimento tem 1 momento e 1 categoria (pode ganhar mais tags livres). |
| Demo | **Com locutor**. O Daniel manda também exemplos com locutor; até lá a demo usa um locutor de acervo (`workspace/library/locutor/`: `cut.webm`, `talk.mp4`, `voice.m4a`, `faceX`), copiado de um projeto aprovado. |
| O que o aprovado vira | **Helper** em `compose/estilos/banco/`. Estilos (agrupar helpers num pacote) ficam para depois. |
| Obrigatório? | Não. O banco é **opcional, mas preferido**: o brief lista o banco com foto por momento, o GUIDE manda usar o helper do banco quando existe um para o momento, e o `render()` avisa quando a cena tem momento coberto pelo banco e usou outra coisa. |
| Rodadas | Até **3** rodadas de síntese por movimento. Na terceira reprovada, o movimento fica `parado` com as notas, para retomar depois. |
| Nome e posição | **Motion Think**, aba depois de Cortes (`#/motion-think`). |
| Direitos | Trechos de terceiros ficam só em `workspace/motion-think/` (local). Nunca entram num render de cliente: o banco guarda o helper, o frame aprovado da **demo** e, como referência interna, o frame do original. |

## 2. Dados

### 2.1 Sessão de treino: `workspace/motion-think/<id>/`

```
state.json        id, name, source (file|url), src.mp4 (cópia), in, out, status, createdAt
trecho.mp4        o recorte in→out (ffmpeg -ss/-to, 30 fps, 1080 de largura máx.)
analysis.json     movimentos (abaixo)
frames/<m>/       frames do movimento m: 8 fps, jpg; sheet.jpg (folha de contato)
notes.json        apontamentos do Daniel (abaixo), com version como review.json
rounds/<m>/<r>/   síntese r do movimento m: helper.py, scenes.py, compose/ (demo), demo.mp4, sheet.jpg, proposta.md, veredito.json
log.txt
```

`analysis.json` (escrito pelo modelo, etapa `mtAnalyze`):

```json
{
  "movimentos": [
    {
      "m": 1, "a": 0.0, "b": 3.4,
      "nome": "palavra gigante com remate nos cantos",
      "oque": "uma palavra em caixa alta ocupa 85% da largura; três palavras pequenas entram nos cantos uma por batida",
      "elemento": "tipografia", "camera": "parada",
      "entrada": "scaleY de 0.12 a 1, expo.out, 0.5 s", "vida": "nenhuma", "saida": "corte seco",
      "tipo": { "gigante": "condensada 900, 24% da altura", "pequeno": "sans 600, 2.5% da altura" },
      "paleta": ["#020202", "#F3984B", "#F3F2EF"],
      "medidas": { "larguraPalavra": 0.85, "duracao": 3.4, "elementos": 4 },
      "momentoSugerido": "gancho", "categoriaSugerida": "tipografia"
    }
  ]
}
```

A análise é uma chamada Opus com `Read` sobre `frames/` (como o clone de estilo lê `refs/`). Corte dos movimentos: `select='gt(scene,0.3)'` como ponto de partida (pipeline.ts já faz isso no clone), e o modelo pode juntar ou dividir.

`notes.json` (do Daniel, por movimento):

```json
{
  "version": 3,
  "movimentos": {
    "1": {
      "veredito": "gosto",                 
      "momento": "gancho", "categoria": "tipografia", "tags": ["remate", "cantos"],
      "texto": "o que me pega é a palavra grande antes de qualquer coisa; as pequenas são apoio, nunca competem",
      "pins": [{ "t": 1.2, "x": 540, "y": 700, "text": "esse peso aqui, não o do Editor" }],
      "naoLevar": "a fonte, o laranja"
    }
  }
}
```

`veredito`: `gosto` | `nao-gosto` | `neutro`. Só `gosto` vai para síntese. `nao-gosto` entra no banco negativo com o texto.

`rounds/<m>/<r>/veredito.json`: `{ "ok": true|false, "texto": "...", "pins": [...] }`.

### 2.2 Banco: `claude-reel-editor/skills/reel-editor/compose/estilos/banco/`

```
banco.json
<helper>.py            def <helper>(p, ..., at=0.0, d=None, k='..') -> (html, js); geometria fixa, 2 a 4 parâmetros livres
<helper>.jpg           frame aprovado da demo (o que o compositor deve esperar)
<helper>.md            3 linhas: o que é, para qual momento, o que não fazer (do apontamento)
negativo.md            lista do que foi reprovado, com o motivo, frame em negativo/<n>.jpg
```

`banco.json`:

```json
{
  "helpers": [
    { "id": "cluster_gigante", "nome": "palavra gigante com remate nos cantos", "momento": "gancho", "categoria": "tipografia",
      "params": ["giant", "cantos", "color"], "medidas": { "larguraPalavra": 0.85, "duracao": 3.4 },
      "origem": "2026-11-07-ref-tipo-01/m1", "aprovadoEm": "2026-11-08", "rodadas": 2 }
  ],
  "negativo": [ { "id": "n1", "motivo": "novelo rabiscado lê como rascunho", "origem": "2026-11-07-video-rd-05/s21" } ]
}
```

O `kit.py` carrega `estilos/banco/*.py` no `from kit import *` (como já carrega os engines), então `scenes.py` chama o helper pelo nome.

## 3. Fluxo

1. **Entrada.** `POST /motion-think` com `{name, video | url}`. Reaproveita o upload e o yt-dlp da Cortes (`cortes.ts create`). Resposta: `id`, duração, thumbnails a cada 2 s para o seletor.
2. **Seleção.** `PUT /motion-think/:id/range {in, out}` → gera `trecho.mp4`. Limite 60 s por trecho (mais que isso é outro trecho).
3. **Análise** (`POST /motion-think/:id/analyze`, etapa `mtAnalyze`, Opus, `locked`). Corta movimentos, extrai frames a 8 fps e folha de contato por movimento, escreve `analysis.json`. SSE de progresso como os projetos.
4. **Apontamento.** A UI mostra cada movimento: folha de contato, a prévia em loop (`trecho.mp4` com `#t=a,b`), os campos (veredito, momento, categoria, tags, texto, "não levar") e pins sobre o frame (mesmo widget de pino da Revisão). `PUT /motion-think/:id/notes {movimentos, version}`, versão como o review.json.
5. **Síntese** (`POST /motion-think/:id/synthesize {m}`, etapa `mtSynthesize`, Opus, `locked` por sessão). O modelo recebe `analysis.json` do movimento, as notas, os frames, o `kit.py`, o `banco.json` (para não duplicar) e o `negativo.md`. Escreve `helper.py`, `proposta.md` (o que fixou, o que deixou livre, o que mediu) e um `scenes.py` de demo de 4 a 8 s, com locutor de acervo, numa cena por variação (até 3 variações de parâmetro). Roda `python3 -B scenes.py`, `hyperframes check`, snapshot e render `demo.mp4`. Teto `--max-turns 30`.
6. **Validação.** A UI mostra frames do original e da demo lado a lado, mais `demo.mp4`. `PUT /motion-think/:id/rounds/:m/:r/verdict {ok, texto, pins}`. Reprovado com rodada < 3 → volta ao passo 5 com o veredito somado às notas. Aprovado → passo 7. Terceira reprovação → status `parado`.
7. **Entrada no banco** (`POST /motion-think/:id/approve {m, r}`): copia `helper.py`, o frame escolhido e o `.md` para `estilos/banco/`, acrescenta a linha em `banco.json`, roda `node --test test/banco.test.ts` (o helper gera html e js sem erro e o `render()` de uma cena com ele passa no `check`). Commit no repo do banco? O kit não é repo git: fica no `.arquivos-instalados` como os engines.

Quem usa o banco:

- `composeScaffold` escreve no brief a seção **"Banco de movimentos"**: por momento, os helpers com a foto (caminho do jpg, que o compositor abre com `Read`), a frase do `.md` e os parâmetros. E a lista do `negativo.md`.
- GUIDE.md ganha um parágrafo: "quando o banco tem um helper para o momento da cena, use-o; invente só onde o banco não cobre".
- `kit.py render()`: aviso `cena N: momento 'gancho' tem 3 helpers no banco e a cena não usou nenhum`. O momento da cena vem de `scene(..., momento='gancho')`, opcional; sem ele o aviso não dispara.

## 4. API

| Método | Rota | Faz |
|---|---|---|
| GET | `/motion-think` | lista sessões |
| POST | `/motion-think` | cria (upload ou url) |
| GET | `/motion-think/:id` | estado, análise, notas, rodadas |
| DELETE | `/motion-think/:id` | apaga |
| PUT | `/motion-think/:id/range` | in/out → trecho.mp4 |
| POST | `/motion-think/:id/analyze` | etapa mtAnalyze |
| PUT | `/motion-think/:id/notes` | apontamentos (version) |
| POST | `/motion-think/:id/synthesize` | etapa mtSynthesize para um movimento |
| PUT | `/motion-think/:id/rounds/:m/:r/verdict` | veredito da rodada |
| POST | `/motion-think/:id/approve` | entra no banco |
| GET | `/motion-think/:id/file/*` | frames, trecho, demo |
| GET | `/motion-think/:id/events` | SSE |
| GET | `/banco` | banco.json + fotos |
| DELETE | `/banco/:helper` | tira do banco (o `.py` vai para `banco/_removidos/`) |

`MODEL_BY_STEP`: `mtAnalyze: 'claude-opus-5-5'` (high), `mtSynthesize: 'claude-opus-5-5'` (high). Custo estimado por movimento: análise 1 a 2 min, cada síntese 2 a 4 min com render.

## 5. UI (ui.html, `#/motion-think`)

- Lista de sessões (nome, trecho, n movimentos, n aprovados) e botão Novo trecho.
- Sessão: topo com o vídeo e o seletor de minutagem (duas alças sobre a tira de thumbnails, in/out em segundos, botão Analisar).
- Movimentos como cartões verticais, um por linha: folha de contato à esquerda, prévia em loop, campos à direita. Veredito com três botões grandes. Pins sobre a folha de contato (reaproveitar o widget da Revisão).
- Botão Sintetizar por movimento (só com `gosto`). Durante a síntese, log SSE no cartão.
- Rodada: original × demo lado a lado, `demo.mp4`, botões Aprovar / Reprovar com texto. Contador de rodadas (1/3).
- Aba **Banco** dentro de Motion Think: grade de fotos por momento, com nome, categoria, origem; e a lista do negativo.

## 6. Medição (o que alimenta os lints)

Cada aprovação grava `medidas` no `banco.json`. Com 10 helpers de tipografia aprovados, os números viram limites no kit:

- largura mínima da palavra gigante (mediana das aprovadas, hoje a proposta é 70%);
- duração de entrada e saída por categoria;
- elementos por cena por momento;
- área vazia máxima.

Isso é a parte "senso estético como número" da análise de 2026-11-07. Os lints em si são outra spec (tamanho, ocupação, vocabulário, recorte).

## 7. Fora de escopo

- Agrupar helpers em estilos (depois).
- Clonar um vídeo inteiro (continua na aba Skills).
- Rodar o banco em projetos antigos.
- Áudio: a análise ignora som do trecho.

## 8. Riscos

- **Demo sem projeto.** `composeScaffold` hoje parte de um projeto. A síntese precisa de um scaffold leve (`composeScaffoldDemo(dir, locutorAcervo)`): copia kit, engines, fontes da marca de acervo e o locutor de acervo, escreve um `compose.json` fixo (1080×1920, 8 s, faceX do acervo). Primeira coisa a validar na fase 1.
- **Helper que só funciona com a fonte do original.** O `.md` registra a fonte que o original usava; o helper usa a da marca. Se a marca não tem peso Black, o helper de palavra gigante avisa no `render()` (é o mesmo buraco do corte 05).
- **Modelo copiando o visual em vez do movimento.** O prompt da síntese separa "o que aprender" (movimento, ritmo, proporção) de "o que não levar" (fonte, cor, mascote), no formato do DIRETOR §1, e o Daniel preenche "não levar" no apontamento.
- **Banco crescendo sem rotação.** Com 30 helpers o compositor pode repetir os mesmos 5. O brief lista os helpers já usados nos últimos 3 reels da marca e pede variação (DIRETOR §8).

## 9. Piloto

Material: 5 trechos de tipografia, 1 ou 2 que o Daniel reprovaria, 2 trechos com locutor, e os 4 reels aprovados (só para medir). Meta do piloto: 5 helpers aprovados em até 3 rodadas cada, e o corte 05 recomposto usando só o banco, comparado ao render de 2026-11-07.

## 10. Fases

1. **Servidor sem UI** (1 dia): sessão, range, análise, frames, notas por curl; scaffold de demo com locutor de acervo; síntese de 1 movimento; aprovação escrevendo o banco; `banco.test.ts`.
2. **UI** (1 dia): aba, seletor, cartões, pins, rodadas, aba Banco.
3. **Compositor usando o banco** (meio dia): seção no brief, parágrafo no GUIDE, `momento=` em `scene()`, aviso no `render()`.
4. **Piloto** com os 5 trechos e o corte 05 recomposto.
