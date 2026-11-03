# Instalação — Editor 7.0

Do zero ao editor aberto no navegador em ~10 minutos. Testado em macOS (Apple Silicon). Windows e Linux rodam o mesmo código (nunca foram testados de ponta a ponta); o recorte de pessoa com Apple Vision só existe no macOS, nos outros sistemas ele precisa do RVM.

## 1. O que você precisa

| Item | Versão | macOS | Windows |
|---|---|---|---|
| Node.js | 23.6 ou mais novo | `brew install node` | `winget install OpenJS.NodeJS` |
| Python | 3.12 ou mais novo | `brew install python` | https://python.org, marque "Add python.exe to PATH" |
| ffmpeg | 7 ou mais novo | `brew install ffmpeg` | `winget install Gyan.FFmpeg` |
| Git | qualquer | já vem com o Xcode CLT | `winget install Git.Git` (cada projeto é um repositório git) |
| yt-dlp | qualquer | `brew install yt-dlp` | `winget install yt-dlp.yt-dlp` (para baixar referências por link) |
| Google Chrome | qualquer | https://google.com/chrome (usado no export para After Effects) | idem |
| Claude Code (CLI) | logado em um plano pago | https://claude.com/claude-code, depois `claude` e faça login | idem (no Windows prefira o instalador nativo: o `claude` via npm é um `.cmd`, que o servidor não consegue abrir; se for o caso, aponte `CLAUDE_BIN` para o `.exe`) |
| Skills do HyperFrames | — | `npx skills add heygen-com/hyperframes` | idem |
| 10 GB livres | 35 GB+ para exports 4K | — | — |

Opcionais:

- **After Effects**: só para o botão "Exportar After Effects". O editor cria o `.jsx` mesmo sem ele e manda o After rodá-lo (`osascript` no macOS, `AfterFX.exe -r` no Windows).
- **DeepFilterNet** (remoção de ruído melhor que o filtro do ffmpeg): `uv tool install deepfilternet --with torch --with torchaudio`.
- **Swift / Xcode Command Line Tools** (`xcode-select --install`), só macOS: rastreamento do rosto e recorte da pessoa. No Windows e Linux o recorte precisa do RVM (`~/.cache/rvm-venv` e `~/.cache/rvm-model`); sem ele o reel sai sem recorte.

## 2. Instalar

```bash
git clone <URL-DO-REPOSITORIO> "Editor 7.0"
cd "Editor 7.0"
cd server && npm install && cd ..
python3 claude-reel-editor/skills/reel-editor/scripts/setup_engine.py
python3 claude-reel-editor/skills/reel-editor/scripts/doctor.py
```

- `npm install` instala o `puppeteer-core` (usado no export para After Effects).
- `setup_engine.py` baixa o GSAP e o player do HyperFrames (com checagem de checksum) e sintetiza os efeitos sonoros. Pode rodar de novo à vontade.
- `doctor.py` confere tudo e termina com **READY**, **READY WITH LIMITS** (funciona, falta algo opcional) ou **MISSING** (corrija os ❌ e rode de novo).

A primeira transcrição baixa o modelo Whisper `small` via `npx hyperframes`, então a primeira ingestão demora mais.

## 3. Configurar (opcional)

Crie `.env` na raiz se precisar mudar o padrão:

```bash
PORT=4400                 # porta do servidor
WORKSPACE=workspace       # onde ficam brands, formats e projects
REEL_LANG=pt              # idioma do Whisper
CLAUDE_BIN=/caminho/claude   # só se o `claude` não estiver no PATH
YT_DLP=yt-dlp
CLAUDE_TIMEOUT_MS=1200000 # limite por chamada de modelo (20 min)
CHROME_PATH=/caminho/chrome  # só se o Chrome não estiver em /Applications ou em Program Files
PYTHON=python3            # nome ou caminho do Python 3.12+ (padrão: python3; python no Windows)
```

## 4. Abrir

```bash
./start.sh
```

No Windows: `start.cmd` (duplo clique ou no terminal). Acesse **http://127.0.0.1:4400**. O `start.sh` / `start.cmd` libera a porta 4400 se algo antigo estiver nela.

> O servidor escuta só em `127.0.0.1` e não tem login. Não exponha na rede.

## 5. Conferir que está tudo certo

```bash
cd server && npm run check && npm test
```

## Problemas comuns

| Sintoma | Causa e correção |
|---|---|
| `doctor.py` diz que o Python é 3.9 | O `/usr/bin/python3` do macOS é antigo. `brew install python` e confira `python3 -V`. |
| `Chrome não encontrado` no export AE | Instale o Chrome ou defina `CHROME_PATH`. |
| `puppeteer-core não encontrado` | Rode `npm install` dentro de `server/`. |
| Chamadas de modelo falham | Rode `claude` no terminal e confirme que está logado; ou defina `CLAUDE_BIN`. |
| Porta ocupada | `PORT=4401 ./start.sh` ou deixe o `start.sh` / `start.cmd` liberar a 4400. |
| Windows: `python3` abre a Microsoft Store | O servidor usa `python`; se o seu está com outro nome, defina `PYTHON=caminho\python.exe` no `.env`. |
| Fonte da marca não aparece | O arquivo da fonte não está em `workspace/brands/<marca>/fonts/`. |

Próximo passo: [GUIA.md](GUIA.md).
