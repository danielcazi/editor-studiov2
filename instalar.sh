#!/usr/bin/env bash
# Instalador do macOS: depois do git clone, rode  ./instalar.sh  e siga. Pode repetir à vontade: só instala o que falta.
set -u
cd "$(dirname "$0")"
step() { printf '\n[%s/11] %s\n' "$1" "$2"; }
have() { command -v "$1" >/dev/null 2>&1; }
py_ok() { have python3 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 12))'; }
ffmpeg_ok() { have ffmpeg && [ "$(ffmpeg -version | sed -n '1s/^ffmpeg version [nN]*\([0-9][0-9]*\).*/\1/p')" -ge 7 ] 2>/dev/null; }
node_ok() { have node && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>23||a==23&&b>=6?0:1)'; }
chrome_ok() { [ -d "/Applications/Google Chrome.app" ]; }
# fn  descrição  comando de instalação
ensure() { if "$1"; then echo "  ok: $2"; else echo "  instalando $2..."; eval "$3" || echo "  FALHOU: $2 (instale à mão, veja INSTALACAO.md)"; fi; }

step 1 "Homebrew (instalador de pacotes)"
have brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
have brew || { echo "Sem Homebrew não dá para continuar. Instale em https://brew.sh e rode de novo."; exit 1; }

step 2 "Node.js 23.6+";   ensure node_ok "Node.js" "brew install node"
step 3 "Python 3.12+";    ensure py_ok "Python" "brew install python"
step 4 "ffmpeg 7+";       ensure ffmpeg_ok "ffmpeg" "brew install ffmpeg"
step 5 "Git";             ensure "have git" "Git" "xcode-select --install"
step 6 "Google Chrome";   ensure chrome_ok "Chrome" "brew install --cask google-chrome"
step 7 "Claude Code";     ensure "have claude" "Claude Code" "curl -fsSL https://claude.ai/install.sh | bash"
step 8 "yt-dlp";          ensure "have yt-dlp" "yt-dlp" "brew install yt-dlp"

step 9 "Dependências do servidor (npm install)"
(cd server && npm install) || echo "  FALHOU: rode 'cd server && npm install' à mão"

step 10 "Skills do HyperFrames"
if [ -d ~/.claude/skills/hyperframes ] || [ -d ~/.agents/skills/hyperframes ]; then echo "  ok: já instaladas"
else npx -y skills add heygen-com/hyperframes || echo "  FALHOU: rode 'npx skills add heygen-com/hyperframes' à mão"; fi

step 11 "Motor de animação, efeitos sonoros e verificação final"
S=claude-reel-editor/skills/reel-editor/scripts
python3 "$S/setup_engine.py" && python3 "$S/doctor.py"

cat <<'M'

Falta só duas coisas:
  1. Faça login no Claude Code, se ainda não fez:  claude
  2. Abra o editor:  ./start.sh   →  http://127.0.0.1:4400
Opcional (ruído mais limpo): uv tool install deepfilternet --with torch --with torchaudio
M
