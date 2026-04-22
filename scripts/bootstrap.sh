#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tempmail-app}"
ENV_FILE="$APP_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[!] Missing $ENV_FILE"
  echo "    Copy .env.example to .env first and edit the values."
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

if [ -z "${MAIL_DOMAIN:-}" ] || [ -z "${WEB_HOST:-}" ] || [ -z "${MAIL_HOST:-}" ]; then
  echo "[!] MAIL_DOMAIN / WEB_HOST / MAIL_HOST must be set in .env"
  exit 1
fi

echo "[*] Using APP_DIR=$APP_DIR"
echo "[*] MAIL_DOMAIN=$MAIL_DOMAIN"
echo "[*] WEB_HOST=$WEB_HOST"
echo "[*] MAIL_HOST=$MAIL_HOST"

echo "[*] Building app container"
cd "$APP_DIR"
docker compose up -d --build

echo "[*] Done. Continue with Nginx / Certbot / Postfix setup from README.md"
