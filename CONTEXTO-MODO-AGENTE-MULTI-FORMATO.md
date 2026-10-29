# Dossiê de Contexto e Auditoria Técnica: Modo Agente e Multi-Formato (Editor 7.0)

> **Finalidade deste documento:** Fornecer um panorama arquitetural exato, histórico de problemas, arquivos afetados, códigos alterados e pontos de atenção para que **outro agente autônomo** possa auditar a solução, identificar eventuais erros, inconsistências, casos de borda (edge cases) e propor melhorias.

---

## 1. Visão Geral da Aplicação

O **Editor 7.0** é um sistema local de automação e edição de vídeo de alta precisão voltado para criadores e marcas.
* **Stack Principal:** Node.js (v23.6+ ESM/TypeScript direto sem build step), Shell Scripting, Python 3 (FFmpeg, Whisper, OpenCV), GSAP e **HyperFrames** (motor determinístico de composição em canvas/HTML5).
* **Fluxo da Esteira:**
  1. `ingest` (extração de áudio, transcrição por palavras e detecção de silêncios)
  2. `script` (análise de momentos, ganchos e palavras-chave)
  3. `brand` (aplicação de fontes, cores, guias de estilo e logos da marca)
  4. `motion` / `preview` (geração da composição visual do vídeo)
  5. `review` (player com inserção de anotações e ajustes)
  6. `final` (renderização final com normalização LUFS -14 e QA automatizado de cortes e enquadramento)

---

## 2. Histórico e Identificação do Problema

### 2.1. O Conflito Arquitetural: `Composer: card` vs `Composer: agent`

Historicamente, o Editor 7.0 possuía dois motores distintos para montar o vídeo:

| Característica | Modo Cards (`Composer: card`) | Modo Agente (`Composer: agent`) |
| :--- | :--- | :--- |
| **Estrutura** | Baseado em `edit.json` e cards pré-formatados rígidos (`card_types`). | Baseado em `compose/scenes.py` gerando um `compose/index.html` via HyperFrames. |
| **Direção de Arte** | Rígida, aplica templates padronizados. | Livre, orientada pelo `GUIDE.md` (Motion Guide) e referências de sites/marcas. |
| **Camadas e Máscara** | Suporte limitado a composições modulares. | Locutor recortado (`cut.webm`) sobreposto ao vídeo desfocado (`plate.mp4`) com tipografia gigante atrás da cabeça (`back`) e elementos na frente (`front`). |
| **Disponibilidade** | Padrão para praticamente todos os formatos. | **Exclusivo** para o formato `motion-completo` ou formatos cutout com site de referência. |

### 2.2. A Necessidade Expressa pelo Usuário

1. **Liberdade Criativa Sob Demanda:** O usuário não queria que outros formatos (como `business-reels`, `split-reel`, `personal-reels`, `explainer-panel`) ficassem reféns da rigidez dos cards. Ele queria a possibilidade de acionar um **botão/toggle chamado "Modo Agente"** no momento da criação ou durante o projeto para que o Claude tivesse total liberdade criativa com o HyperFrames, respeitando a intenção do formato escolhido.
2. **O Gargalo do Formato 9:16:** O compositor de agente foi concebido originalmente com parâmetros fixos em **9:16 vertical** (`1080×1920`). Como o Editor 7.0 suporta múltiplos formatos (como `16:9` widescreen, `4:5` feed retrato, `1:1` quadrado), o modo agente quebrava se fosse utilizado fora do 9:16.

### 2.3. Gargalos Técnicos Identificados Antes da Correção

1. **`server/pipeline.ts`:**
   * Na função `usesAgent(st)`: Não existia verificação de preferência explícita do usuário (`composerMode`), dependendo unicamente de `format.composer === 'agent'` no `format.json`.
   * Na função `composeScaffold()`: As dimensões em `compose.json` eram cravadas como `{ W: 1080, H: 1920 }`, ignorando `width` e `height` do formato selecionado.
   * Na função `compose()`: O briefing (`brief.md`) e o prompt do sistema instruíam o Claude: *"You are an elite motion designer composing a 9:16 reel..."*, impedindo o modelo de planejar grids widescreen ou quadrados.
   * Na função `final()`: Havia uma sobrescrita forçada: `if (composed) { st.formats = ['9:16']; }`, descartando os formatos do projeto na hora de exportar.
2. **`claude-reel-editor/skills/reel-editor/compose/kit.py`:**
   * A unidade responsiva `u(n)` usava `n * 10.8px` (onde 10.8px = 1% de 1080px). Em um canvas de 1920px (16:9 widescreen), `u(n)` ficava 44% menor do que o pretendido.
   * Os enquadramentos de câmera fixa `FR = {'M': .95, 'L': 1.2, 'XL': 1.5, 'XXL': 1.8}` foram calibrados apenas para enquadramento vertical.
   * A tag HTML raiz gerada pelo script gerava estaticamente `data-resolution="portrait"`.
3. **`server/layout_check.mjs`:**
   * A checagem de layout no Chrome headless continha zonas seguras rígidas calculadas com constantes fixas: `const ZONA = { top: 200, bottom: 1920 - 380, left: 70, right: 1080 - 70 };`. Qualquer vídeo 16:9 (`1920×1080`) ou 4:5 (`1080×1350`) falhava na checagem de QA.
4. **`server/ui.html`:**
   * O modal de criação de projeto não possuía o botão de seleção do modo agente (o usuário anexou um desenho em print demonstrando o botão ao lado do campo "Formato de Edição").
   * O cabeçalho do projeto aberto (`#pt-badges`) não indicava se o projeto estava em Modo Agente ou Modo Cards, nem permitia alternar.
5. **Formatos Antigos Depreciados:**
   * Foi solicitada a exclusão completa dos formatos obsoletos `depth-ui` e `glass-explainer` e a inclusão das regras de enquadramento `onetake` no `split-reel` e proteção facial nos formatos `feed-portrait-4-5` e `youtube-16-9`.

---

## 3. Arquitetura das Páginas e Módulos Afetados

```mermaid
flowchart TD
    UI["server/ui.html (Modal de Criação + Header #pt-badges)"] -->|POST /projects { composerMode: 'agent'|'card' }| Server["server/server.ts (Rotas HTTP)"]
    UI -->|POST /projects/:id/composer-mode| Server
    Server --> Pipeline["server/pipeline.ts (Orquestrador)"]
    Pipeline -->|usesAgent(st)| Decision{"composerMode === 'agent'?"}
    Decision -->|Sim: Modo Agente| Scaffold["composeScaffold() dinâmico: W, H, safeZone"]
    Decision -->|Não: Modo Cards| LegacyCards["edit.json / cards tradicionais"]
    Scaffold --> ComposeJSON["compose/compose.json (W, H, DUR, safeZone)"]
    ComposeJSON --> Kit["claude-reel-editor/skills/reel-editor/compose/kit.py"]
    Kit --> Scenes["compose/scenes.py (Gerador de index.html)"]
    Scenes --> LayoutCheck["server/layout_check.mjs (Validação Headless Chrome)"]
    Pipeline --> FinalRender["final() (Exportação Multi-formato sem override 9:16)"]
```

---

## 4. Detalhamento Cirúrgico das Modificações Realizadas

### 4.1. `server/pipeline.ts`

1. **Adicionado `composerMode` no tipo de estado:**
   ```typescript
   type State = {
     // ...
     composerMode?: 'agent' | 'card';
   };
   ```
2. **Priorização de `composerMode` em `usesAgent(st)`:**
   ```typescript
   function usesAgent(st: State): boolean {
     if (st.composerMode === 'agent') return true;
     if (st.composerMode === 'card') return false;
     let f: any;
     try { f = getFormat(st.formatId || 'business-reels'); } catch { return false; }
     return f.composer === 'agent' || (!!f.cutout && !!siteRef(st));
   }
   ```
3. **Persistência na criação e controle por API:**
   * `createProject(o)` agora recebe `composerMode?: 'agent' | 'card'` e armazena em `st.composerMode`.
   * Exportada a função `setComposerMode(id: string, mode: 'agent' | 'card')` que altera o estado e regrava `state.json`.
   * `getProject(id)` retorna `composed: usesAgent(st) || composedByAgent(st)`.
4. **Resolução e Aspect Ratio Dinâmicos em `composeScaffold()`:**
   * O scaffold agora lê o `format.json` do projeto antes de inicializar o `compose.json`:
   ```typescript
   const fmt: any = getFormat(st.formatId || 'business-reels');
   const targetW = fmt.width ?? 1080;
   const targetH = fmt.height ?? 1920;
   const targetAspect = fmt.aspectRatio ?? '9:16';
   const safeZones = fmt.visualAssets?.safeZones ?? {
     top: Math.round(targetH * 0.104),
     bottom: Math.round(targetH * 0.198),
     left: Math.round(targetW * 0.065),
     right: Math.round(targetW * 0.065),
   };

   writeJSON(join(C, 'compose.json'), {
     W: targetW,
     H: targetH,
     aspectRatio: targetAspect,
     safeZone: safeZones,
     DUR: Math.round(duration * 100) / 100,
     faceX,
     speaker: !motion,
     colors,
     fonte: { w: width, h: height },
     layoutCheck: join(ROOT, 'server/layout_check.mjs')
   });
   ```
   * `brief.md` recebe: `Formato ${targetAspect} (${targetW}×${targetH}), ...`.
   * O prompt de sistema do Claude em `compose()` recebe: `You are an elite motion designer composing a ${targetAspect} (${targetW}x${targetH}) reel as a HyperFrames project...`.
5. **Remoção da Restrição de 9:16 em `final()`:**
   * Foi removida a linha que forçava `st.formats = ['9:16'];`, preservando a lista de formatos do projeto ou os formatos solicitados pelo usuário.

---

### 4.2. `server/server.ts`

Adicionada a rota REST dedicada para troca dinâmica de modo:
```typescript
['POST', /^\/projects\/([^/]+)\/composer-mode$/, (m, b) => P.setComposerMode(m[1], b?.mode ?? 'agent')],
```

---

### 4.3. `server/ui.html`

1. **Botão no Modal de Criação ("Novo Projeto"):**
   * CSS para `.np-agent-toggle-btn` com visual sofisticado, bordas luminosas em violeta, glow sutil e checkmark quando ativo (`.active`).
   * Inserido o elemento HTML ao lado do label `Formato de Edição`:
   ```html
   <button type="button" class="np-agent-toggle-btn" id="npAgentToggleBtn" title="Alternar modo: Agente Composer ou Cards">
     <span>🤖</span>
     <span>Modo Agente</span>
     <span class="np-agent-check" id="npAgentCheck">✓</span>
   </button>
   ```
2. **Comportamento Reativo no Frontend:**
   * Quando o formato selecionado possui `composer: "agent"` por padrão (como `motion-completo`), o botão inicializa ativado.
   * O usuário pode clicar no botão para ligar ou desligar o modo agente em qualquer formato.
   * O preview do formato exibe badges em tempo real: `🤖 Agente Composer` ou `🃏 Cards Tradicional`.
   * O `btnCreate.onclick` envia `composerMode: isAgentMode ? 'agent' : 'card'` tanto na criação individual quanto em lote.
3. **Badge e Alternância no Cabeçalho do Projeto (`#pt-badges`):**
   * No header do projeto aberto, é renderizado o botão interativo:
     * `🤖 MODO AGENTE` (violeta/roxo) ou `🃏 MODO CARDS` (azul).
   * Clicar no botão solicita confirmação e faz a chamada a `POST /projects/:id/composer-mode`, atualizando a interface imediatamente.

---

### 4.4. `claude-reel-editor/skills/reel-editor/compose/kit.py`

1. **Unidade Relativa `u(n)` Proporcional:**
   ```python
   # Antes (cravado em 1080):
   # u = lambda n: f"{n * 10.8:.0f}px"

   # Agora (proporcional à largura real do canvas):
   u = lambda n: f"{n * (W / 100):.0f}px"
   ```
2. **Escala de Câmera `FR` Condicional:**
   ```python
   # Ajuste para evitar zoom excessivo em formatos widescreen
   FR = {'M': .95, 'L': 1.2, 'XL': 1.5, 'XXL': 1.8} if H >= W else {'M': .65, 'L': .85, 'XL': 1.05, 'XXL': 1.25}
   ```
3. **Atributo de Resolução no HTML:**
   ```python
   data-resolution="{'landscape' if W > H else 'portrait'}"
   ```

---

### 4.5. `server/layout_check.mjs`

Substituição dos valores fixos de zona segura pela leitura de `cfg.safeZone` ou cálculo proporcional com base em `W` e `H`:
```javascript
const ZONA = {
  top: cfg.safeZone?.top ?? Math.round(H * 0.104),
  bottom: H - (cfg.safeZone?.bottom ?? Math.round(H * 0.198)),
  left: cfg.safeZone?.left ?? Math.round(W * 0.065),
  right: W - (cfg.safeZone?.right ?? Math.round(W * 0.065)),
};
```
E ajuste na mensagem de log para `${H - ZONA.bottom}` em vez de `${1920 - ZONA.bottom}`.

---

### 4.6. Formatos Limpos e Atualizados

1. **Remoção Total:**
   * `workspace/formats/depth-ui/` (deletado)
   * `workspace/formats/glass-explainer/` (deletado)
   * Removidas todas as menções em `server/pipeline.ts`, `server/ui.html`, `server/build_reel.py` e `SPEC-formatos-render.md`.
2. **Atualização do `split-reel`:**
   * Atualizado `workspace/formats/split-reel/format.json` com a regra `onetake` (movimentos contínuos de pan, tilt e rotação sem cortes aparentes, locutor posicionado na metade superior).
3. **Proteção Facial em 4:5 e 16:9:**
   * Atualizados `workspace/formats/feed-portrait-4-5/format.json` e `workspace/formats/youtube-16-9/format.json` com regra mandatória para que textos e artes nunca sobreponham o locutor, ficando em posições laterais ou lower-thirds.

---

## 5. Roteiro de Auditoria para o Novo Agente

Ao rodar a verificação em outro agente, solicite que ele audite especificamente os seguintes tópicos críticos:

### Checklist de Verificação

1. **Geometria do Locutor Recortado em Widescreen (`#ccam` em `kit.py`):**
   * *O que inspecionar:* Em `kit.py` linhas 218–220:
     `#ccam { left: {W // 2 - FACE_X}px; top: {H - 1080}px; width: 1920px; height: 1080px; transform-origin: {FACE_X}px 1080px; }`
   * *Pergunta para o auditor:* Quando o vídeo fonte é 1920×1080 e o formato alvo é 16:9 (`W=1920, H=1080`), `top` se torna `0` e `left` se torna `960 - FACE_X`. Está alinhado perfeitamente? E se o formato for `1:1` (`1080×1080`), o `top` fica `0` e o locutor fica centralizado? Há risco de corte no queixo se a escala da câmera `FR` for alterada?
2. **Consistência de Transição entre Modos (Player de Revisão):**
   * *O que inspecionar:* Se um projeto foi iniciado como `card` e o usuário alternar para `agent` após o `script`:
     * O player da aba Revisão toca `index.html` em iframe caso `st.composed` seja true.
     * Há risco de chamar `compose()` sem que os assets (`cut.webm`, `plate.mp4`) tenham sido gerados na ingestão? (Verifique se `ingest` sempre gera `cutout.webm` e `plate.mp4` para formatos cutout).
3. **Renderização de Múltiplos Formatos no `final()`:**
   * *O que inspecionar:* Em `pipeline.ts: final()`, `hyperframes render -o out.mp4` renderiza a composição base do diretório `compose/`.
   * *Pergunta para o auditor:* O arquivo `out.mp4` gerado pelo HyperFrames terá a proporção definida no `compose.json` do projeto (ex.: 16:9). Se o usuário solicitar uma exportação simultânea para `['16:9', '9:16']` no mesmo render final, o script aplica `loudnorm` e copia o vídeo. O `finalName(format)` resultante terá a proporção correta ou precisaria de re-enquadramento via crop/letterbox?
4. **Verificação dos Testes Automatizados:**
   * Execute no terminal do servidor:
     ```bash
     cd server && npm run check && npm test
     ```
   * Verifique se todos os 46 testes passam sem avisos e sem regressão nos scripts Python (`test_transcribe.py` e `test_anim.py`).

---

## 6. Sumário de Comandos de Validação Rápida

```bash
# 1. Checagem de tipagem TypeScript (sem erros)
cd server && npm run check

# 2. Execução da suite de testes completa (46 testes node + 2 testes python)
cd server && npm test

# 3. Teste manual de alternância de modo via curl
curl -X POST http://127.0.0.1:4400/projects/<ID_DO_PROJETO>/composer-mode \
     -H "Content-Type: application/json" \
     -d '{"mode":"agent"}'
```

