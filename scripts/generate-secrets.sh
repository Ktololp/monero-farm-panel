#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env уже существует; файл не будет перезаписан." >&2
  exit 1
fi

ADMIN_PASSWORD="$(openssl rand -hex 12)"
ENC_KEY="$(openssl rand -base64 32 | tr -d '\n')"
SESSION_SECRET="$(openssl rand -hex 32)"
AGENT="${SSH_AUTH_SOCK:-/tmp/no-ssh-agent.sock}"

cat > .env <<ENV
PANEL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
PANEL_ENCRYPTION_KEY=${ENC_KEY}
PANEL_SESSION_SECRET=${SESSION_SECRET}
PORT=3000
DATA_DIR=data
CERT_DIR=certs
HTTPS_ENABLED=true
COOKIE_SECURE=true
TRUST_PROXY=0
POLL_INTERVAL_MS=15000
HISTORY_INTERVAL_MS=60000
HISTORY_RETENTION_DAYS=30
SSH_AUTH_SOCK=/run/ssh-agent.sock
HOST_SSH_AUTH_SOCK=${AGENT}
PANEL_UID=$(id -u)
PANEL_GID=$(id -g)
TLS_PFX_PATH=
TLS_PFX_PASSPHRASE=
# PANEL_SSH_PUBLIC_KEY=ssh-ed25519 AAAA... panel@host
ENV
chmod 600 .env
mkdir -p data certs

printf '\n.env создан.\nМастер-пароль: %s\nSSH-agent socket хоста: %s\n\nСохраните пароль и PANEL_ENCRYPTION_KEY в безопасном месте.\n' "$ADMIN_PASSWORD" "$AGENT"
