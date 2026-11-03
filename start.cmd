@echo off
rem Windows twin of start.sh: frees port 4400 (or %PORT%) and starts the server (http://127.0.0.1:4400)
cd /d "%~dp0server"
if "%PORT%"=="" set PORT=4400
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  echo Porta %PORT% estava ocupada pelo processo %%p. Liberando...
  taskkill /f /pid %%p >nul 2>&1
)
echo Iniciando Editor 7.0 na porta %PORT%...
node --env-file-if-exists=..\.env server.ts
