# 🐳 Docker / Docker Compose

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

Релизный workflow при публикации тега `v*` собирает официальный multi-arch image для:

```text
linux/amd64
linux/arm64
```

и отправляет его в GHCR.

Для v1.2.0 образ выглядит так:

```text
ghcr.io/ktololp/monero-farm-panel:1.2.0
```

Также публикуются semver alias и `latest`.

> [!NOTE]
> GitHub Release с ZIP может появиться на несколько минут раньше Docker image. Если сразу после релиза `docker pull` отвечает `manifest unknown`, проверьте, завершился ли job **Publish multi-arch Docker image**, и повторите pull/update после его завершения.

## Host-side `mfp` updater

Для appliance/kiosk-установок рекомендуется host-side CLI `mfp`:

```bash
chmod +x scripts/install-mfp.sh scripts/mfp
./scripts/install-mfp.sh
mfp status
```

Обновление на конкретную стабильную версию:

```bash
mfp backup
mfp update 1.2.0
```

`mfp` сначала скачивает новый официальный GHCR image, пока текущая панель остаётся online, затем делает согласованный backup persistent state, запускает новый контейнер, проверяет `/healthz` и автоматически возвращает прежний image/data при неудаче.

Подробнее: [UPDATER.md](UPDATER.md).

## Старые Linux-хосты

Если нативный Node.js 20 не запускается из-за старой glibc, **не требуется вручную обновлять системную libc ради панели**. Используйте Docker image: Node.js и native dependencies находятся внутри контейнера и не зависят от host glibc так же, как нативная установка.
