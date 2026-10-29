#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/server"

PORT=${PORT:-4400}

# Se a porta já estiver em uso, encerra o processo anterior automaticamente
# (só quem ESCUTA a porta: `lsof -i :PORT` sozinho também lista os clientes conectados, como o navegador)
OLD_PID=$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "⚠️  Porta $PORT estava ocupada pelo processo $OLD_PID. Liberando..."
  kill $OLD_PID 2>/dev/null || true
  sleep 1
  kill -9 $OLD_PID 2>/dev/null || true   # só se o SIGTERM não bastou
fi

echo "🚀 Iniciando Editor 7.0 na porta $PORT..."
exec node server.ts
