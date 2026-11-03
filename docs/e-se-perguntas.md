# E se? — 20 perguntas (rodada 1)

Geradas pelo agente `e-se` (`.claude/agents/e-se.md`) olhando o Editor 7.0 na visão do usuário.
Cada pergunta traz o que o código faz hoje e onde diverge do que o usuário esperaria. Sem solução ainda: é a lista para decidirmos juntos.

## Voltar atrás

1. **E se, na Revisão, o usuário quiser trocar todas as fontes?**
   Hoje: fonte vive em `brand.json` + `override` do projeto; `brandStep` só grava e commita, não reconstrói `proj/` (`server/pipeline.ts:1961-1981`, só `motionCards`/`applyReview` chamam `buildLive`).
   Na Edição existe `font.family` por camada (`server/edits.ts:15`), nunca para todas.
   Diverge: o player da Revisão continua mostrando a fonte antiga até uma nova rodada de notas; no modo agente, a fonte já está escrita em `scenes.py` e a troca de marca não chega lá; na Edição é camada por camada.

2. **E se o usuário trocar a marca inteira (`brand`) depois de o reel estar composto?**
   Hoje: `brandStep` zera o `override` e nunca rebaixa o `step` (`pipeline.ts:1962,1976`).
   Diverge: o projeto diz "Revisão pronta" com cores de uma marca e composição de outra; nada avisa que precisa refazer a Revisão.

3. **E se o usuário editar o roteiro de novo depois de aprovar e já ter notas de revisão aplicadas?**
   Hoje: `putScript` só grava `script.json` e mantém o `step` em `motion` (`pipeline.ts:1925-1934`); `edit.json` e `review.json` ficam como estão.
   Diverge: os cards e as notas respondidas apontam para momentos que já não existem; o usuário precisa saber que tem de "Aprovar" de novo para refazer os cards, e perde as notas da rodada.

4. **E se o usuário quiser trocar o vídeo-fonte depois da Ingestão (gravou de novo)?**
   Hoje: não há rota para trocar o raw; `ingest` reusa `rawClip(P)` e refaz `master.mp4` (`pipeline.ts:1809-1822`), mas `edit.json`, `cutout.webm`, `nose.json` e `compose/` ficam.
   Diverge: o usuário cria outro projeto do zero e perde marca ajustada, roteiro e notas.

5. **E se o usuário quiser desfazer a última rodada de revisão ("volta como estava")?**
   Hoje: cada rodada é um commit git (`pipeline.ts:2505`), mas não existe rota nem botão que faça `git checkout`/`revert`; `state.json` também está no repo.
   Diverge: o histórico existe e o usuário não tem como usá-lo.

6. **E se o usuário mudar o `format.json` ou o `brand.json` na tela de marcas enquanto um projeto já os copiou?**
   Hoje: o projeto lê a marca a cada passo via `writeBrand(st)` + `deepMerge(override)`, então mudanças na marca vazam para projetos antigos; o formato também é relido (`getFormat(st.formatId)`).
   Diverge: um projeto "concluído" muda de cara ao reabrir a Revisão; o usuário não escolheu se queria seguir a marca viva ou congelar.

## Pular etapas

7. **E se o usuário clicar em Entrega sem ter aberto a Revisão?**
   Hoje: a UI libera a etapa 5 quando `at >= 3` (`ui.html:7269`); `final()` só recusa nota aberta e vídeo longo (`pipeline.ts:2521-2526`).
   Diverge: dá para renderizar o que nunca foi visto; a regra "um reel não revisado não é aprovado" só vale quando existe nota.

8. **E se o usuário aprovar o roteiro sem a Ingestão ter terminado, ou duas vezes seguidas?**
   Hoje: `locked()` recusa com "busy" (`pipeline.ts:190-200`) e a UI mostra o erro cru; `POST /ingest` dispara `script()` em cadeia e engole o erro (`server.ts:66`).
   Diverge: um clique a mais vira um "project is busy" sem dizer o que está rodando nem quanto falta.

9. **E se o usuário quiser ir direto da Ingestão para a Revisão com os cards escritos à mão (sem Opus)?**
   Hoje: `PUT /edit` exige `captions[]` + `cards[]` e renderiza `preview.mp4` (`pipeline.ts:2155-2167`), mas o `step` não avança e a UI não abre a etapa 3 sem `motion`.
   Diverge: o caminho "sem modelo" existe na API e é invisível na UI.

## Tudo ou nada

10. **E se, na Edição, o usuário quiser remover todos os keyframes do vídeo (câmera do locutor)?**
    Hoje: `layers.json` guarda `LayerEdit` por camada e `kfSplit` marca que o locutor já foi cortado nos moves da IA (`server/edits.ts:9-32`); não há operação "limpar tudo", só edição por camada, e `kfSplit` não volta a `false`.
    Diverge: o usuário apaga camada por camada e, mesmo assim, o corte do locutor que a IA fez fica.

11. **E se o usuário quiser apagar todos os cards e recomeçar o motion do zero mantendo o roteiro?**
    Hoje: `batchEdit` aceita `card_delete` um a um (`pipeline.ts:2176-2186`); refazer é chamar `POST /motion` de novo, que sobrescreve `edit.json` sem perguntar (`pipeline.ts:2124-2126`).
    Diverge: "regenerar" e "apagar tudo" são a mesma ação destrutiva, sem confirmação e sem guardar a versão anterior fora do git.

12. **E se o usuário quiser trocar uma cor em todos os cards de uma vez (a paleta mudou)?**
    Hoje: cores de card custom estão no `props` de cada card; a validação checa contra `paletteOf(brand)` (`pipeline.ts:2160-2162`), então mudar a marca invalida todos os cards no próximo `PUT /edit`.
    Diverge: a troca de paleta transforma o próximo save em erro "card 0: cor fora da paleta; card 1: ..." em vez de migrar.

13. **E se o usuário quiser aplicar só algumas notas da revisão e deixar outras para depois?**
    Hoje: `applyReview` manda todas as abertas numa chamada (`pipeline.ts:2441-2447`) e `final()` recusa enquanto houver uma aberta.
    Diverge: a nota "lembrar de olhar depois" bloqueia a entrega; não há "ignorar/arquivar nota".

## Dois caminhos de render

14. **E se o usuário alternar MODO AGENTE ↔ MODO CARDS no meio do projeto?**
    Hoje: `setComposerMode` só troca a flag (`pipeline.ts:1622-1627`); `putEdit`/`batchEdit`/`askCard` recusam com `agentOnly` se `composedByAgent` (`pipeline.ts:2148`), e `compose/` fica no disco.
    Diverge: o botão no topo sugere que é reversível; na prática o reel composto vira "não editável" e o reel de cards vira "sem composição" até rodar a Revisão de novo.

15. **E se, no modo agente, o usuário escrever uma nota do tipo "muda a fonte do título da cena 3" e o agente não rodar `scenes.py`?**
    Hoje: `compose()` falha com "não gerou um index.html novo" (`pipeline.ts:3019`), mas `reply()` já marcou todas as notas como `done` antes (`pipeline.ts:2444`).
    Diverge: as notas aparecem respondidas e a composição não mudou.

16. **E se o usuário quiser as duas coisas: cards no 9:16 e composição agente no 1:1?**
    Hoje: `final()` decide por `composedByAgent(st)` para todos os formatos (`pipeline.ts:2528-2544`).
    Diverge: um projeto é inteiro cards ou inteiro agente; o usuário duplica o projeto para ter o outro caminho.

## Meio do caminho

17. **E se o servidor cair (ou o usuário fechar o terminal) no meio de um `compose` de 20 minutos?**
    Hoje: o lock morre com o pid (`pipeline.ts:186-189`); `compose` só salva `step` no fim, mas há um fallback que aceita o `index.html` parcial (`pipeline.ts:3005-3012`).
    Diverge: ao reabrir, o usuário vê "Roteiro" como etapa atual e uma composição meio pronta na Revisão, sem saber que foi interrompida.

18. **E se a página for recarregada enquanto um passo roda?**
    Hoje: `EventSource` reabre sozinho (`ui.html:7198`), mas os eventos `log` emitidos antes do reload só existem em `getProjectLogs` (`pipeline.ts:84`).
    Diverge: a barra de progresso volta ao estado "rodando" sem a contagem de onde está (tratamento, ilustração ou composição).

19. **E se o usuário enviar a mesma nota em dois projetos abertos em duas abas (ou dois servidores no mesmo workspace)?**
    Hoje: o lock é por projeto e por arquivo (`pipeline.ts:182-184`); `putReviewNotes` não usa lock de propósito (`pipeline.ts:2331`).
    Diverge: duas abas salvando notas sobrescrevem uma à outra em `review.json`; a última grava, a primeira some sem aviso.

## Sem saída

20. **E se o usuário quiser apagar um projeto, ou renomeá-lo?**
    Hoje: não existe `DELETE /projects/:id` (só `/cortes/:id`, `server.ts:22`); `completeProject` só marca `completed`.
    Diverge: a lista cresce para sempre e "concluído" é o único jeito de tirar da frente; apagar é ir no Finder.

---

# Soluções propostas (itens 1, 3, 7, 9, 10, 11, 15, 17, 18, 19, 20)

Regra: a menor mudança que resolve de verdade, reaproveitando o que já existe (git por projeto, `buildLive`, `batchEdit`, `layers.json`, `activity.log`). Tamanho é estimativa de linhas.

**Correção antes de tudo (item 15).** Eu li a ordem errada: `reply()` roda *depois* de `await compose()` (`pipeline.ts:2443-2444`), então um `compose` que falha não marca nota nenhuma. O furo real é outro e está no `catch` do `compose` (`pipeline.ts:3005-3012`): quando o compositor é interrompido mas deixou um `index.html` novo, `compose` *não* lança, devolve `summary` começando com `⚠`, e aí `reply()` marca todas as notas como "Aplicada pelo compositor". Mesmo quando o compositor termina, todas viram `done` sem que ninguém confira. A solução abaixo é para isso.

### 1. Trocar todas as fontes na Revisão
- **Cards:** em `brandStep`, depois do `commit`, se `stepRank(st.step) >= stepRank('motion')` e não for agente, chamar `buildLive(id, st)`. O player da Revisão recarrega no evento `built`. ~2 linhas.
- **Agente:** `kit.py` usa uma fonte fixa `assets/fonts/font.otf` (`compose/kit.py:9`), copiada no scaffold. Em `brandStep`, se `composedByAgent`, recopiar a fonte da marca para `compose/assets/fonts/font.otf` e rodar `python3 -B scenes.py` (sem Opus), depois `emit('built')`. ~8 linhas. Confirmado: o scaffold já copia a fonte da marca para lá (`pipeline.ts:2840`).
- **Edição (por camada):** já existe `font.family` em `LayerEdit`. Para "todas": botão na Edição que faz um `PUT /layers` com `font` preenchido em cada camada de texto. Só UI, ~10 linhas.
- Risco: no agente, se o compositor usou outra fonte "na mão" dentro do `scenes.py`, a troca do arquivo não pega. Aceitável: é o mesmo limite que já existe.

### 3. Reeditar o roteiro depois dos cards
- Em `putScript`, comparar os momentos novos com os de `script.json` atual. Se mudou **tempo ou quantidade** (`t_start`, `t_end`, `length`) e `edit.json` existe, rebaixar `st.step = 'script'` e logar "roteiro mudou: aprove de novo para refazer os cards". Se mudou só texto, manter o `step` e logar "os cards continuam com o texto antigo: use uma nota na Revisão ou regenere". ~10 linhas.
- As notas de `review.json` ficam: o motion novo começa uma rodada nova e as antigas são histórico (já têm `round`).
- Risco: rebaixar o step esconde a Revisão até o usuário aprovar de novo. É o comportamento que a pergunta pede.

### 7. Entrega sem Revisão
- Um botão **Aprovar** na Revisão grava `st.approvedAt` (nova rota `POST /review/approve`, ~5 linhas; sem lock, como `putReviewNotes`).
- `final()` recusa sem `approvedAt`, com a mesma mensagem que já usa para notas abertas. ~2 linhas.
- Tudo que muda a composição apaga `approvedAt`: `motionCards`, `compose`, `applyReview`, `putEdit`, `batchEdit`, `putLayers`. Uma linha em cada (ou dentro de `buildLive` + `compose`, que todos chamam). ~6 linhas.
- UI: a etapa 5 continua clicável, mas mostra "não aprovado" e desabilita Renderizar. ~5 linhas.

### 9. Cards à mão, sem Opus
- Em `putEdit`, depois de gravar: `if (stepRank(st.step) < stepRank('motion')) st.step = 'motion'; save(st)` e chamar `buildLive` antes do `preview`. ~3 linhas. Com isso a etapa 3 abre na UI e o player mostra os cards.
- Risco: `preview()` continua rodando um render de minutos. Se a ideia é só revisar, trocar `preview` por `buildLive` e deixar o `preview.mp4` para o botão "Preview" que já existe (`POST /preview`). Decidir junto.

### 10. Remover todos os keyframes do locutor
- Os "keyframes" da Edição são os tweens da timeline principal lidos do player (`ui.html` `kfRead`), só leitura. Hoje nada apaga uma animação da IA.
- Novo campo `still?: boolean` em `LayerEdit` (`edits.ts:9`). Em `syncEdits`, para cada camada com `still`, injetar no `index.html` marcado uma linha que mata os tweens daquele elemento (`__timelines.main.getTweensOf('#id').forEach(t => t.kill())`) logo após o setup. ~12 linhas, mais a linha no `checkLayers`.
- Botão "Tirar todas as animações do locutor" na Edição = `still: true` em cada camada `cutout` + `PUT /layers`. ~6 linhas. O inverso é apagar o campo.
- `kfSplit`: quando todas as camadas `cutout` ficam `still`, limpar `cuts` delas e `kfSplit = false`, para o corte automático não ficar órfão. ~3 linhas.
- Risco: tween morto no meio deixa o elemento onde estava; usar `progress(0)` antes de `kill()`.

### 11. Apagar todos os cards / regenerar
- "Apagar todos": botão que monta um `batchEdit` com um `card_delete` por índice. Zero mudança no servidor. ~5 linhas de UI.
- "Regenerar": `confirm()` na UI quando `edit.cards.length > 0`, com o texto "os cards atuais ficam no histórico (commit X)". Para o X, `motionCards` já commita; basta a UI mostrar o último `git log` da linha `step 4` que já aparece no log de atividade. ~4 linhas.
- Voltar de verdade (pergunta 5, não escolhida) continua sem rota. Se quiser depois: `POST /projects/:id/restore` com o hash, `git checkout <hash> -- edit.json` + `buildLive`.

### 15. Nota sem composição nova / compositor interrompido
- No ramo agente de `applyReview` (`pipeline.ts:2440-2445`): se `r.summary` começa com `⚠`, não chamar `reply()`; as notas ficam abertas e o `summary` vai para o log. ~2 linhas.
- Quando termina bem, em vez do texto fixo "Aplicada pelo compositor", mandar o último parágrafo do compositor como `reply` de cada nota (ele já é obrigado a terminar com um parágrafo). ~1 linha.
- Opcional, maior: pedir ao compositor, no prompt da nota, uma linha `nota <id>: feito|não feito, motivo` por anotação e fazer o parse para `replies`. ~15 linhas. Vale só se a primeira versão não bastar.

### 17. Servidor cai no meio do `compose`
- O `compose` escreve `compose/.running` ao começar e apaga no `finally`. `getProject` devolve `interrupted: true` quando o arquivo existe e `getBusy(id)` é `null`. ~6 linhas.
- UI: faixa "A composição foi interrompida. Abrir o que ficou na Revisão / Recompor". "Abrir" = `st.step = 'motion'` por uma rota mínima (`POST /review/build` já existe para cards; para agente, uma linha em `getReview`). ~10 linhas.
- Risco: o marcador fica se o servidor cair entre o `rmSync` e o `save`; `getBusy` cobre, e o marcador some no próximo `compose`.

### 18. Recarregar a página com um passo rodando
- Já funciona mais do que eu disse: a UI puxa `GET /logs` ao abrir (`ui.html:7183`) e a pílula "rodando: etapa (tempo)" vem de `getBusy`. O que falta é a subfase (tratamento, ilustrações, composição).
- `acquire()` já grava `{step, startedAt, pid}` no lock. Acrescentar `phase` e um `setPhase(id, texto)` que o `compose` chama nos três `emit('log', '🎬 ...')`. `getBusy` devolve `phase` e a pílula mostra. ~8 linhas.

### 19. Duas abas salvando notas
- `review.json` ganha `version` (inteiro). `putReviewNotes` exige `version` no corpo; se diferente do arquivo, falha com "as anotações mudaram em outra aba: recarregue". Grava `version + 1`. ~5 linhas.
- UI: guarda a `version` do último `GET /review`; no erro, recarrega as notas e avisa. ~6 linhas.
- `applyReview` também incrementa (passa pelo mesmo `writeJSON` em `reply`). Dois servidores no mesmo workspace ficam cobertos pelo mesmo contador.

### 20. Apagar e renomear projeto
- `DELETE /projects/:id`: recusa se `getBusy(id)`; move a pasta para `workspace/trash/<id>-<data>/` em vez de `rmSync` (é o "Finder" do item, mas reversível). ~8 linhas, mais a rota.
- `PUT /projects/:id` com `{ name }`: `st.name = name; save; commit('rename')`. ~4 linhas. O `id` da pasta não muda.
- UI: "Apagar" com `confirm()` na lista e um campo de nome na cabeça do projeto. ~15 linhas.
- Risco: `workspace/trash` cresce; limpar à mão ou apagar com mais de 30 dias ao subir o servidor (~5 linhas, só se incomodar).

## Ordem sugerida
1. 15 e 19 (dado do usuário some sem aviso; ambos ~10 linhas).
2. 1 e 9 (desbloqueiam a Revisão; ~20 linhas).
3. 7 e 3 (regras de etapa; ~30 linhas, mexem na UI).
4. 17, 18, 20, 11 (conforto; ~60 linhas).
5. 10 por último: é o único que mexe no `index.html` gerado e precisa de teste no player.
