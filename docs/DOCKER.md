# Docker / Docker Compose

## Локальная сборка

```bash
cp .env.example .env
./scripts/generate-secrets.sh
docker compose up -d --build
```

Проверка:

```bash
docker compose ps
docker compose logs -f panel
```

## Linux / WSL2 SSH-agent

```bash
export HOST_SSH_AUTH_SOCK="$SSH_AUTH_SOCK"
docker compose -f docker-compose.yml -f docker-compose.ssh-agent.yml up -d --build
```

Внутри контейнера agent будет доступен через Unix socket.

## Windows

Для тестирования Windows OpenSSH Agent удобнее использовать нативный Node.js запуск. Windows named pipe агента нельзя напрямую считать обычным Unix socket внутри Linux-контейнера Docker Desktop.

## GitHub Container Registry

Workflow `.github/workflows/release.yml` при публикации тега `v*` собирает multi-arch image для `linux/amd64` и `linux/arm64` и отправляет его в GHCR.

После первого релиза имя образа будет иметь вид:

```text
ghcr.io/<owner>/monero-farm-panel:1.0.0
```
