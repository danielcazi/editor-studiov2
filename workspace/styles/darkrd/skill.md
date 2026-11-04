---
name: darkrd
description: DarkRD — estúdio de cortes virais das aulas do Reservatório de Dopamina (Eslen Delanogare) em Reels 1080×1920 com o áudio original da aula e motion de colagem editorial de neurociência (gravuras P&B no papel pontilhado, fita crepe, brilho vermelho no cérebro, grifo amarelo, títulos Anton, câmera contínua) com toda a fala virando tipografia. Guia com aprovações: garimpo de cortes nos .vtt → montagem da fala → imagens de domínio público → cenas Remotion → stills ✅ → prévia de áudio com 3 músicas ✅ → render → revisão própria → MP4 (versão com rosto e sem rosto). Use em /darkrd, "DarkRD", "próximo corte do RD", "corte da aula X", "Projeto - Dark - RD", ou ao pedir cortes/Reels das aulas do Reservatório de Dopamina nesse estilo.
metadata:
  version: "1.0"
---

# DarkRD · cortes do Reservatório de Dopamina

Você transforma um trecho de 45 s a 1 min 30 de uma aula do RD num Reel de colagem editorial. O som é a fala original do Eslen, com música e SFX discretos do banco do usuário. **Não existe narração nova.**

**Você guia a pessoa.** Diga em que etapa está, mostre o que produziu e **pare nos checkpoints ✅**. Não renderize o MP4 antes da trilha estar aprovada. **Nunca entregue sem a revisão própria** (etapa 8).

Antes de começar, leia **`<raiz>/00 - BASE/00 - Ref inicial do projeto.md`**. Lá estão o histórico, as decisões do usuário e os bugs já resolvidos.

## Onde as coisas ficam
| O quê | Onde |
|---|---|
| Configuração (pastas de aulas, motor, músicas, packs; níveis de áudio; render) | `<raiz>/00 - BASE/darkrd.config.json` |
| Aulas (MP4 + legenda `.vtt`) | `config.pastas.aulas` |
| Refs visuais | `<skill>/references/refs/*.webp` (cópias em `<raiz>/00 - BASE/refs/frames-edicao/`) |
| Lista de cortes ranqueada | `<raiz>/06 - Estrategia/cortes-virais.md` |
| Cada vídeo | `<raiz>/99 - videos/AAAA-MM-DD-<slug>/` (estado em `estado.json`) |
| Exemplo completo e aprovado | `<raiz>/99 - videos/2026-10-26-qual-e-seu-suco/` |
| Scripts | `<skill>/scripts/`, copiados para cada vídeo em `scripts/` pelo `novo-video.mjs` |

`<raiz>` = pasta que contém `00 - BASE/darkrd.config.json`. Rode os scripts **de dentro da pasta do vídeo**.

## Retomar
Se pedirem para continuar o corte X, leia `99 - videos/*X*/estado.json` (`etapa`) e siga dali.

---

## Etapas

### 0 · Setup (uma vez)
Confira se existe `00 - BASE/darkrd.config.json`; se não, crie pelo modelo em [references/00-setup.md](references/00-setup.md). Dependências:
- `ffmpeg`
- `openai-whisper`, com o modelo `medium` em `~/.cache/whisper`
- `python3` com Pillow e NumPy
- o motor Remotion 4.0.300 em `config.pastas.motor`

### 1 · Garimpo de cortes → [references/01-cortes.md](references/01-cortes.md)
`python3 <skill>/scripts/condensar-vtt.py "<aulas>" <scratch>/txt`, depois leia as aulas **inteiras**. Atualize `06 - Estrategia/cortes-virais.md`: tempo, duração, gancho, por que viraliza e nota de 1 a 5. A pessoa escolhe o corte; se a lista já existe, ofereça os próximos de nota alta ainda não feitos.
Crie o vídeo: `node <skill>/scripts/novo-video.mjs <slug>`.

### 2 · Fala (áudio original) → [references/02-fala.md](references/02-fala.md)
1. Rode `python3 -I <skill>/scripts/whisper-palavras.py "<aula.mp4>" <faixas>` para ter o tempo de cada palavra.
2. Monte o `edl.json` (modelo: `edl.exemplo.json`). Em cada frase vão:
   - os trechos da aula;
   - o texto marcado;
   - `pausa` depois da frase: 0,7 a 1,2 s **onde a cena troca** e ~0,35 s dentro da cena;
   - `rosto: true` no gancho.
3. Rode `node scripts/montar.mjs`. O script trava se as palavras faladas não baterem com o texto.
4. Retranscreva o `public/fala.wav` com o Whisper e confira as emendas, sem corte de palavra e sem emenda bruta. Pausa natural do Eslen não se corta.

### 3 · Imagens → [references/03-imagens.md](references/03-imagens.md)
1. Busque gravuras de **domínio público** no Wikimedia Commons (`python3 -I <skill>/scripts/commons.py search x "<termo>"`).
2. Baixe pra `public/img/_orig/` e registre origem e licença em `public/img/FONTES.md`.
3. Defina os cortes em `_orig/recortes.json` e rode `python3 scripts/recortar.py`.

### 4 · Cenas → [references/04-motion.md](references/04-motion.md)
Escreva `src/video.tsx`: cenas como `Lugar` no mundo, `PARADAS` com `passa(i)` e elementos amarrados às palavras com `em(i, 'palavra')`. Use as peças de `src/pecas.tsx`. O `video.tsx` do template é o piloto completo, serve de exemplo. Checagem: `npx tsc -p .`.

### 5 · Stills ✅ (checkpoint 1)
1. Rode `node scripts/stills.mjs VideoRosto:<s>,VideoSemRosto:<s>,... --guia` e confira que nada invade o vermelho (zona do Instagram).
2. Gere a versão sem guia e monte a folha: `python3 scripts/folha.py renders/stills renders/<slug>-stills.jpg`.
3. Mande ao usuário a folha e 2 ou 3 stills em tamanho cheio. **Pare até aprovar.**

### 6 · Prévia de áudio ✅ (checkpoint 2) → [references/05-som.md](references/05-som.md)
1. Escreva `audio/deixas.json` com os SFX amarrados à fala e às passagens.
2. Gere **3 opções de música** da pasta *Insta - RD*: `python3 scripts/mixar.py previa "<faixa>@<início>" "<n> - <nome>"`. Use `<início>` pra pular introdução silenciosa.
3. Mande os 3 MP3. **Pare até a pessoa escolher.**

### 7 · Revisão antes do render → [references/06-revisao-render.md](references/06-revisao-render.md)
Rode `node scripts/revisar.mjs VideoRosto 0.5` e leia **todas** as folhas em `out/revisao/`. Corrija antes de gastar render.

### 8 · Render + revisão do MP4 + entrega
1. `npx remotion render VideoRosto out/rosto-mudo.mp4 --codec=h264 --crf=18 --muted --concurrency=10`, rodado em segundo plano. Faça o mesmo com `VideoSemRosto` → `out/semrosto-mudo.mp4`.
2. Extraia 2 quadros por segundo do MP4 (`ffmpeg -vf fps=2,scale=216:-1`), monte as folhas e revise de novo. Achou bug, corrija e renderize de novo.
3. `python3 scripts/mixar.py rosto "<faixa aprovada>@<início>"` e `... semrosto ...`. O script gera `renders/<slug>-<versão>.mp4` e uma cópia `-celular.mp4` (720p, ~11 MB, pra mandar no chat).
4. Mande as duas versões, cheia e celular, e diga o que foi revisado. Atualize `estado.json`.

---

## Regras de acabamento (vindas do feedback do usuário, não negocie)
- **Zona segura do Reels:** topo 230, base 440, esquerda 80 e direita 150 px. O mundo é desenhado a `ESCALA 0.78`, centrado em `CENTRO_SEGURO`. Nada importante fora disso.
- **Legenda é motion:** toda a fala aparece, palavra por palavra no tempo dela, com pesos, grifo e vermelho. Nada de karaokê simples.
- **Acentos inteiros:** títulos Anton usam a máscara com folga e partem de 160%. Nenhum acento pode aparecer antes da palavra nem ficar cortado.
- **Ritmo:** a câmera só troca de cena **no respiro da fala**. A conclusão fica na tela antes de andar, e animação não corre na frente da fala. Sem passagens bruscas: use `passa()`, que dura o respiro todo.
- **Uma ideia por enquadramento.** Não leve a câmera pra um lugar e volte (foi confuso no piloto).
- **SFX discretos:** compõem e não aparecem; ganho geral **−15 dB** (total, definido no corte 4; no piloto era −6). **Sem datilografia e sem riser.** Música 17 dB abaixo da voz, final em −14 LUFS.
- **Duas versões:** A com o rosto do Eslen no gancho (metade de cima) e o motion embaixo; B só motion.
- **Imagens com licença registrada.** CC BY pede crédito na legenda do post.
- **Render rápido:** nada de filtro pesado por quadro. O grão é de textura pronta e o papel tem o tamanho da tela; use `--concurrency=10`.


# 00 · Setup

`<raiz>/00 - BASE/darkrd.config.json`:

```json
{
 "projeto": "Dark - RD · cortes do Reservatório de Dopamina",
 "pastas": {
  "aulas": "00 - BASE/REFS CONTEUDO",
  "motor": "<caminho>/_motor/node_modules",
  "musicas": "<pasta das músicas>",
  "packs": "<pasta dos packs de SFX>"
 },
 "audio": {"musicaAbaixoDaVozDb": 17, "sfxGeralDb": -15, "lufs": -14},
 "render": {"concurrency": 10, "crf": 18}
}
```

- **motor:** é o `node_modules` do Remotion 4.0.300, o mesmo do Projeto Dark - AI. Ele precisa de `@remotion/bundler`, `@remotion/cli`, `@remotion/renderer`, `@remotion/google-fonts`, `react` 18.3.1 e `typescript`. Se não existir, crie uma pasta `_motor` com o `package.json` do template e rode `npm i`.
- **packs:** o `mixar.py` espera estas subpastas:
  - `009 - Pack Lion/SOUND-DESIGN_LION_BASE-PATTERN/`
  - `Whoosh SFX/`
  - `Packzin/SFX/Sfx @marketingdemons/`
- **Whisper:** `pip install openai-whisper`. O modelo `medium` baixa na 1ª vez para `~/.cache/whisper/`.
- **Pastas do projeto:** `00 - BASE/` (aulas, refs, config), `06 - Estrategia/` (lista de cortes) e `99 - videos/`.


# 01 · Garimpo de cortes

1. Rode `python3 <skill>/scripts/condensar-vtt.py "<raiz>/00 - BASE/REFS CONTEUDO" <scratch>/txt`. Sai um `aNNN.txt` por aula, em blocos de ~20 s com `[m:ss]`.
2. Leia **todas** as aulas, sem amostrar.
3. Anote os candidatos a corte.

## O que faz um corte do RD viralizar
- **Gancho nos 3 primeiros segundos:** pergunta, afirmação contraintuitiva ou "você" no centro. Ex.: "Se você estuda e não sabe o benefício, você é o macaquinho que não sabe o que tem na mamadeira".
- **Mito quebrado:** "dopamina não é prazer", "melatonina não adianta", "você não é noturno, é relaxado".
- **Experimento visual:** macaco e luz, rato a 10 cm da ração, pessoas na caverna sem relógio, grupos de 4, 6 e 8 h de sono. É fácil de desenhar e segura a retenção.
- **Frase-print / metáfora:** "seu sistema dopaminérgico é um buraco com fome", "seu sono é uma criança mimada", "a maioria dos seus amigos não está preparada pro seu sucesso".
- **Fecho que puxa comentário:** "Qual é o seu suco?".
- **Duração de 45 s a 1 min 30.** Pode ser montagem de 2 a 4 pontos da mesma aula: gancho tirado do fim, tese, desenvolvimento e fecho.

## Lista
Fica em `06 - Estrategia/cortes-virais.md`, numa tabela com `# | Aula | Tempo | Dur. | Gancho / ideia | Por que viraliza | Nota`. Abaixo dela vai a ordem de montagem do corte escolhido. Marque os já produzidos.

## Ao escolher
Confira se o rosto aparece no trecho do gancho: em telas compartilhadas ele fica pequeno. Extraia 4 quadros com `ffmpeg -ss <t> -frames:v 1`. Se não aparecer, escolha outro gancho pra versão A.


# 02 · Fala (áudio original)

## Transcrição com tempo por palavra
`python3 -I <skill>/scripts/whisper-palavras.py "<aula.mp4>" 340-520,1090-1250`
- Abra cada faixa uns 5 s antes e depois. A saída vai pra `audio/whisper.json`, com os tempos da aula original.
- O Whisper `medium` erra grafia ("jornal da neuroscience"). Não tem problema: o texto da tela vem do `edl.json`. O que importa é a **contagem de palavras** bater.

## edl.json
```json
{
 "fonte": "00 - BASE/REFS CONTEUDO/aula_003_qual_e_seu_suco.mp4",
 "rostoCorte": {"x": 250, "y": 0, "w": 760, "h": 700},
 "frases": [
  {"rosto": true, "trechos": [[1406.20, 1413.30]], "texto": "Se você ... da [[mamadeira.]]", "pausa": 0.8},
  {"trechos": [[345.84, 347.50], [350.20, 351.80]], "texto": "Dopamina não tem a ver com **prazer,** mas tem a ver com [[motivação.]]", "pausa": 0.8}
 ]
}
```
- **Marcação:** `**forte**` (900), `_itálico_` (vermelho), `[[grifo]]` (pincelada amarela) e `10|dez` (mostra "10" na tela, mas conta como uma palavra só).
- **Trechos de uma frase** emendam com 0,06 s. Só corte no meio de frase se a emenda soar natural.
- **Pausa depois da frase:** 0,7 a 1,2 s quando a próxima frase abre outra cena (a câmera anda nesse silêncio), ~0,35 s na mesma cena. Depois de uma conclusão importante, dê 1 s ou mais.
- **Rosto:** marque `rosto: true` na frase do gancho. Ajuste o `rostoCorte` pra caber o Eslen mesmo quando ele se inclina, e pra esconder o nome da webcam no canto.
- A sala da gravação é silêncio digital (−76 dB), então o respiro é silêncio mesmo.

## Montar e conferir
1. Rode `node scripts/montar.mjs`. Saem `public/fala.wav`, `public/rosto.mp4`, `src/data/{frases,words,rosto}.json`.
2. Se der "N palavras faladas × M no texto", ajuste o texto ou os limites do trecho.
3. Retranscreva o `fala.wav` com o Whisper e leia: nenhuma palavra cortada nas emendas, nada que soe brusco.
4. **Erro já cometido:** cortei a pausa natural em "luz, botão, … recompensa", e o usuário percebeu. Respiro dramático dele fica.


# 03 · Imagens (gravuras de domínio público)

**Busca:** `python3 -I <skill>/scripts/commons.py search x "Gray726" "macaque engraving Brehm" ...`
- **Bons termos:** `Sobotta`, `Gray's anatomy`, `Wellcome` + tema, `Brehms Tierleben`, `Köhler Medizinal-Pflanzen`, `patent drawing`, `engraving`, `woodcut`.
- Fuja de PDF e TIFF.

**Baixar:** `python3 -I <skill>/scripts/commons.py 1800 public/img/_orig "File:..." ...`. Mostra a licença; renomeie os `cNN` pra nomes claros (`.png`).

**Licença:** só domínio público ou CC BY. Registre tudo em `public/img/FONTES.md`. CC BY (Wellcome) pede crédito "Wellcome Collection" na legenda do post.

## recortes.json → `python3 scripts/recortar.py`
| Modo | Quando | Como entra no vídeo |
|---|---|---|
| `"papel": true` | gravura em fundo de papel (cabeça em corte, patente de lâmpada) | fundo vira branco puro; peça `Gravura` (multiply, "impressa" no papel) |
| `"papel": true, "cor": true` | ilustração colorida (laranja) | idem, mantendo a cor; é o único toque de cor além do vermelho e amarelo |
| alfa (`limiar`, `abertura`, `semente`) | objeto isolado em fundo liso (cérebro do Sobotta) | PNG transparente; peça `Recorte` com sombra. `abertura` 7 a 9 solta linhas finas de legenda |
| `"cartao": true` | foto ou gravura com fundo cheio (macaco do Brehm, mamadeira) | P&B retangular; peça `Foto` (moldura + fita) |

**Gravuras que já funcionaram:**
- macaco: Brehm, Magot;
- cérebro lateral: Sobotta 1909 nº 626;
- cabeça em corte: Wellcome V0008397;
- lâmpada: patente de Edison, 1880;
- laranja: Köhler 042 (pequena, ~136 px; busque maior se for usar grande).


# 04 · Motion (Remotion)

O template (`src/`) é o piloto aprovado "Qual é o seu suco?". Copie a estrutura e troque as cenas.

## Arquivos
- `kit.ts`: tamanho (1080×1920, 30 fps), paleta, curvas, `SEGURO` (zona do Instagram), `ESCALA 0.78` e `CENTRO_SEGURO`.
- `palco.tsx`: mesa pontilhada que segue a câmera, câmera por `PARADAS` (`{ini, dur, x, y, zoom, giro}`), desfoque por velocidade, balanço de câmera na mão e grão (texturas `public/grao/0..7.png`).
- `pecas.tsx`: as peças (abaixo).
- `fala.ts` + `marcacao.mjs`: transformam `frases.json` + `words.json` em frases com o tempo de cada palavra.
- `video.tsx`: cenas, `PARADAS` e `Rosto`.
- `index.tsx`: composições `VideoRosto` e `VideoSemRosto`, mais o `Guia` (zona segura, só nos stills com `--guia`).

## Paleta e tipos
| Elemento | Valor |
|---|---|
| Papel | `#E8E7E3` com pontos `#C6C4BE` a cada 34 px |
| Tinta | `#161616` |
| Vermelho | `#E2261B` (brilho no cérebro, itálico, X) |
| Amarelo | `#F3CB1A` (grifo, etiquetas, fundo de título) |
| Fita | rgba bege |

- **Fontes:** Anton (títulos, maiúsculas), Inter Tight 300/800/900 (legenda e destaques) e Special Elite (máquina de escrever).
- **Texto:** franja RGB leve (`FRANJA`).

## Peças (`pecas.tsx`)
**Texto**
- `Legenda frase={F[i]} y tam largura some`: a fala inteira, palavra por palavra. `some` = instante em que sai (troca de frase na mesma cena).
- `Titulo linhas=[{texto, t0, tam, fundo?, risca?}]`: Anton linha a linha, saindo da máscara. `risca` = risco vermelho num instante.
- `Grifo`, `Maquina`, `Etiqueta t0 texto fundo? cor?`: etiqueta amarela datilografada.
- `Contador t0 ate dur prefixo`.

**Imagens**
- `Foto t0 src w h giro fitas="cima-baixo"|"cantos"|"cima" foco`: foto P&B com moldura e fita.
- `Gravura t0 src w revela="baixo"|"esquerda"|"escala"`: multiply, impressa no papel.
- `Recorte t0 src w`: PNG com alfa e sombra.
- `Brilho t0 x y r`: brilho vermelho pulsando (multiply).

**Desenho e objetos**
- `Conector t0 pontos=[[x,y],...] anel? espessura`: linha em cotovelo com bolinhas.
- `Circulo t0 d titulo fundo` + `Dopamina t0`: círculo preto com fórmula.
- `Botao t0 apertos=[...]`, `Fita`, `Em` (posiciona e aceita `blend`).

No `video.tsx` do piloto também existem: `Grafico` (hipótese tracejada × dado real), `Aneis`, `Luz` (brilho amarelo) e `PalavraGrande`.

## Câmera e ritmo
- **`em(i, 'palavra', n)`:** instante em que a palavra é dita. Amarre tudo a isso.
- **`passa(i, alvo)`:** passagem pra cena da frase i. Segura a conclusão por até 0,4 s no respiro, anda durante o silêncio e chega logo depois da 1ª palavra da frase nova. Mínimo 0,8 s.
- **Push-in dentro da cena:** `{ini: F[i].de, dur: 2–3, zoom: 1.03–1.1}`. Lento.
- **Cenas no mundo:** a ~1300 px na horizontal e ~2100 na vertical umas das outras. Numa visão geral com zoom baixo, afaste as vizinhas, senão elas aparecem nas bordas.
- **Uma ideia por enquadramento.** No piloto, ir pra estação do suco e voltar confundiu; botão e suco foram pro mesmo quadro.
- **Animação no tempo da fala:** a curva do gráfico desenha quando ele diz "luz", não antes. Etiquetas entram cedo o bastante pra serem lidas antes da troca.

## Armadilhas já resolvidas (não reintroduza)
- **SVG sem `viewBox`** com width/height 1 escala tudo. O `Conector` usa 4000×4000 com `viewBox` centrado.
- **`mix-blend-mode`** só se mistura dentro do grupo isolado. Por isso o papel fica **dentro** do mundo transformado, e o `blend` vai no wrapper mais externo da peça (`Em blend`).
- **Máscara dos títulos:** folga `.3em` em cima e `.16em` embaixo; a linha parte de 160%. Sem isso, o acento é cortado ou aparece antes da palavra.
- **Peso no render:** nada de `feTurbulence` em tela cheia nem papel gigante. Use grão pronto e papel do tamanho da tela.

## Versão A (rosto)
- **Painel:** `Rosto` mostra `public/rosto.mp4` na metade de cima (`ALTURA_ROSTO 860`, borda rasgada e fita) e sobe junto com a 1ª passagem.
- **Cena 0:** fica embaixo do painel (`deslocaRosto` 294 px). Deixe esse conteúdo compacto, com até ~790 px de mundo de altura.
- **Versão B:** em vez do rosto, mostra um título em cima ("VOCÊ É O MACAQUINHO?").


# 05 · Som

## Música
- **Origem:** pasta *Insta - RD* (`config.pastas.musicas`).
- **Prévia:** sempre **3 opções** com os mesmos SFX: `python3 scripts/mixar.py previa "<faixa>@<início>" "<n> - <nome>"`.
- **Introdução silenciosa:** meça o RMS a cada 4 s com ffmpeg + numpy e pule o trecho mudo com `@início`. Ex.: Solas `@6`.
- **Nível e fades:** 17 dB abaixo da voz (loudnorm), fade de entrada de 0,4 s, some em 1,6 s logo depois da última fala.
- **Já usadas:** Idea 7 (Slowed + Reverb) foi aprovada no piloto. Outras boas da pasta: Gibran Alcocer – Solas, SLPSTRM – Atlas of Undiscovered Places, Michael FK – Yearning e Aaron Hibell – levitation (esta tem intro longa e baixa).

## SFX (`audio/deixas.json`)
Sons disponíveis em `mixar.py`: `whoosh`, `whoosh2`, `whoosh_leve`, `whoosh_longo`, `papel`, `clique`, `flash`, `ping`, `hit` e `boom`. Todos levam −15 dB a mais (`sfxGeralDb`), o valor total pedido pelo usuário (não somar com outro corte).

| Momento | Som |
|---|---|
| Passagem de câmera | `whoosh` / `whoosh2` alternados, `{"frase": i, "desloc": 0.05}` |
| Zoom-out de visão geral | `whoosh_longo` |
| Foto colada / painel do rosto subindo | `papel` (o do rosto leva `"so": "rosto"`) |
| Lâmpada acende | `flash` + `ping` |
| Apertos repetidos | `clique` com `vezes` |
| Algo "acende" no cérebro / conclusão | `ping` |
| Algo é negado (X) | `hit` |
| Palavra final | `boom` (baixo, sozinho) |

**Proibidos** (o usuário reprovou): datilografia nas etiquetas e riser. **Menos é mais:** o SFX compõe, não aparece. Na dúvida, mais baixo.

## Final
Loudnorm em duas passadas pra −14 LUFS. Confira com `ffmpeg -af ebur128`.


# 06 · Revisão e render

## Antes do render: `node scripts/revisar.mjs VideoRosto 0.5 [de] [ate]`
- Gera um quadro a cada 0,5 s, em folhas 6×5, em `out/revisao/`. Leia **todas** as folhas.
- Pra conferir só um trecho depois de uma correção, passe `de` e `ate`.

**Checklist (o usuário pegou estes no piloto):**
- [ ] Acento cortado ou aparecendo antes da palavra (NÃO É, É MOTIVAÇÃO, QUAL É O SEU).
- [ ] Risco ou pedaço de outro elemento solto sobre o texto.
- [ ] Nada fora da zona segura. Use `stills.mjs ... --guia` nos quadros duvidosos.
- [ ] A conclusão de cada frase fica completa na tela por pelo menos ~0,4 s antes da câmera andar.
- [ ] Nenhuma animação corre na frente da fala; elementos entram quando a palavra é dita.
- [ ] Passagens suaves: nenhuma com menos de 0,8 s, nenhuma ida e volta.
- [ ] Vizinhas de cena aparecendo na borda (sobretudo em zoom-out).
- [ ] Legenda legível no celular (~44 px na tela, no mínimo).

## Render
- **Comando:** `npx remotion render VideoRosto out/rosto-mudo.mp4 --codec=h264 --crf=18 --muted --concurrency=10`, em segundo plano. Depois o mesmo com `VideoSemRosto`.
- **Tempo:** ~7 min por versão de 90 s num M3 Pro.
- **Estimativa enganosa:** o começo da versão A (rosto em `OffthreadVideo`) é lento e faz o Remotion superestimar o tempo restante. Meça os quadros por segundo depois do rosto antes de passar previsão.

## Depois do render
1. `ffmpeg -i out/<v>-mudo.mp4 -vf fps=2,scale=216:-1 <pasta>/<v>-%04d.jpg` e folhas 6×5. Revise a versão A inteira e os primeiros 15 s da B (é a única parte que muda).
2. Achou bug: corrija, revise o trecho e renderize de novo.
3. `python3 scripts/mixar.py rosto "<faixa>@<ini>"` e `semrosto`. Confira duração, resolução e −14 LUFS.
4. **Entrega:** as versões cheias (~250 MB, aparecem só no app do Mac) + as `-celular.mp4` (~11 MB, chegam no celular). Diga o que foi revisado.