#!/usr/bin/env bash
set -euo pipefail

# Entrypoint: prepare runtime, wait for DB, run migrations, then exec the CMD as non-root.
LOG_DIR=${LOG_FILE_DIR:-/var/log/fulleduca/auth}
APP_USER=${APP_USER:-appuser}
DB_HOST=${DB_HOST:-${MYSQL_HOST:-localhost}}
DB_PORT=${DB_PORT:-${MYSQL_PORT:-3306}}
UPLOADS_DIR=${UPLOADS_DIR:-/app/uploads}

mkdir -p "$LOG_DIR"
chown -R ${APP_USER}: ${LOG_DIR} || true
chmod 0755 $(dirname "$LOG_DIR") || true
touch "$LOG_DIR/app.log" || true
chmod 0664 "$LOG_DIR/app.log" || true

mkdir -p "$UPLOADS_DIR/alunos" "$UPLOADS_DIR/professores"
chown -R ${APP_USER}: "$UPLOADS_DIR" || true
chmod -R u+rwX,g+rwX "$UPLOADS_DIR" || true

echo "EntryPoint: waiting for DB ${DB_HOST}:${DB_PORT} (retries=${ENTRYPOINT_DB_RETRIES:-30})"
python - <<PY
import socket, time, os
host = os.environ.get('DB_HOST', os.environ.get('MYSQL_HOST', '${DB_HOST}'))
port_raw = os.environ.get('DB_PORT', os.environ.get('MYSQL_PORT', '${DB_PORT}'))
if str(port_raw).startswith('arn:aws:secretsmanager:'):
  raise ValueError(f"Valor inválido para DB_PORT: '{port_raw}'. Parece ser um ARN, não um número de porta extraído corretamente do secret.")
port = int(port_raw)
retries = int(os.environ.get('ENTRYPOINT_DB_RETRIES', '30'))
delay = float(os.environ.get('ENTRYPOINT_DB_DELAY', '2.0'))
for i in range(retries):
  try:
    s = socket.create_connection((host, port), timeout=2)
    s.close()
    print(f"DB reachable {host}:{port}")
    break
  except Exception:
    print(f"DB not ready ({host}:{port}), attempt {i+1}/{retries}")
    time.sleep(delay)
else:
  print(f"WARNING: Could not reach DB at {host}:{port} after {retries} attempts")
PY

echo "EntryPoint: running alembic migrations if present"
if [ -f ./alembic.ini ]; then
  alembic -c ./alembic.ini upgrade heads || true
elif [ -f ./backend/alembic.ini ]; then
  alembic -c ./backend/alembic.ini upgrade heads || true
fi

echo "EntryPoint: executing CMD as user ${APP_USER}"
# Força Uvicorn a rodar sempre em 0.0.0.0:80
if command -v runuser >/dev/null 2>&1; then
  exec runuser -u "$APP_USER" -- uvicorn backend.main:app --host 0.0.0.0 --port 80 --forwarded-allow-ips='*'
else
  exec uvicorn backend.main:app --host 0.0.0.0 --port 80 --forwarded-allow-ips='*'
fi
