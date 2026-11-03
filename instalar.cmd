@echo off
rem Instalador do Windows: depois do git clone, de duplo clique ou rode instalar.cmd. Pode repetir: so instala o que falta.
rem O winget instala os programas mas o PATH so atualiza em um terminal novo: se algo foi instalado, o script pede para rodar de novo.
setlocal
cd /d "%~dp0"
set NEW=0
where winget >nul 2>&1 || (echo winget nao encontrado. Atualize o "Instalador de Aplicativo" na Microsoft Store e rode de novo. & exit /b 1)

echo.
echo [1/10] Node.js 23.6+
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>23||a==23&&b>=6?0:1)" >nul 2>&1 && echo   ok || (winget install -e --id OpenJS.NodeJS --accept-source-agreements --accept-package-agreements & set NEW=1)
echo [2/10] Python 3.12+
python -c "import sys;sys.exit(sys.version_info<(3,12))" >nul 2>&1 && echo   ok || (winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements & set NEW=1)
echo [3/10] ffmpeg 7+
where ffmpeg >nul 2>&1 && echo   ok || (winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements & set NEW=1)
echo [4/10] Git
where git >nul 2>&1 && echo   ok || (winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements & set NEW=1)
echo [5/10] Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (echo   ok) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (echo   ok) else (winget install -e --id Google.Chrome --accept-source-agreements --accept-package-agreements & set NEW=1)
echo [6/10] Claude Code
where claude >nul 2>&1 && echo   ok || (powershell -NoProfile -Command "irm https://claude.ai/install.ps1 | iex" & set NEW=1)
echo [7/10] yt-dlp
where yt-dlp >nul 2>&1 && echo   ok || (winget install -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements & set NEW=1)

if "%NEW%"=="1" (
  echo.
  echo Programas instalados. FECHE este terminal, abra um novo e rode instalar.cmd de novo para continuar.
  pause
  exit /b 0
)

echo [8/10] Dependencias do servidor (npm install)
pushd server & call npm install & popd
echo [9/10] Skills do HyperFrames
if exist "%USERPROFILE%\.claude\skills\hyperframes" (echo   ok) else if exist "%USERPROFILE%\.agents\skills\hyperframes" (echo   ok) else call npx.cmd -y skills add heygen-com/hyperframes
echo [10/10] Motor de animacao, efeitos sonoros e verificacao final
set S=claude-reel-editor\skills\reel-editor\scripts
python "%S%\setup_engine.py" && python "%S%\doctor.py"

echo.
echo Falta so duas coisas:
echo   1. Faca login no Claude Code, se ainda nao fez: claude
echo   2. Abra o editor: start.cmd  -^>  http://127.0.0.1:4400
echo Opcional (ruido mais limpo): uv tool install deepfilternet --with torch --with torchaudio
pause
