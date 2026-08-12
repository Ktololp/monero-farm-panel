# ♻ Host-side updater (`mfp`)

`mfp` специально устанавливается **на Linux-хосте вне application container**. Если новый image не запускается, для rollback не требуется работающая новая версия панели.

## Установка на существующий Docker host

Из каталога репозитория:

```bash
chmod +x scripts/install-mfp.sh scripts/mfp
./scripts/install-mfp.sh
mfp status
```

Installer создаёт `/etc/monero-farm-panel/mfp.conf` с текущим repository/data path и устанавливает `/usr/local/bin/mfp`.

Он не переносит и не удаляет:

```text
.env
data/
certs/
```

## Основные команды

```bash
mfp status
mfp backup
mfp update
mfp update 1.2.0
mfp rollback
mfp restore FILE
mfp logs
mfp restart
mfp kiosk on
mfp kiosk off
```

`mfp update` использует последний стабильный GitHub Release. **Beta channel нет.**

## Как проходит обновление

Обновление построено так, чтобы сократить downtime и сохранить возможность rollback:

```text
pull нового image, пока старая панель online
                ↓
backup persistent state
                ↓
остановка старого container
                ↓
запуск нового image
                ↓
/healthz check
        ↙ success        ↘ failure
     оставить             вернуть старый
     новую версию         image/data
```

Backups сохраняются в каталоге `backups/` внутри настроенного MFP directory.

## Обновление до v1.2.0

```bash
mfp backup
mfp update 1.2.0
```

После обновления:

```bash
mfp status
```

Ожидается примерно:

```text
Version:   1.2.0
Image:     ghcr.io/ktololp/monero-farm-panel:1.2.0
Container: running
Health:    OK
```

## `manifest unknown` сразу после выхода релиза

GitHub Release и Docker publish выполняются отдельными jobs. ZIP/Release может появиться раньше, чем multi-arch image закончит сборку и загрузку в GHCR.

Если команда:

```bash
mfp update 1.2.0
```

останавливается на pull с ошибкой:

```text
manifest unknown
```

это **не означает повреждение текущей панели**. `mfp` сначала пытается скачать новый image и на этом этапе ещё не заменяет работающий container.

Проверьте GitHub Actions → Release → **Publish multi-arch Docker image**. После завершения job повторите:

```bash
mfp update 1.2.0
```

## Почему updater находится на host

Если updater был бы частью самого container, сломанный новый image мог бы лишить пользователя инструмента rollback. Host-side `mfp` остаётся доступным независимо от состояния приложения.

## Kiosk / appliance hosts

На постоянно работающем локальном дисплее удобно включить kiosk mode через:

```bash
mfp kiosk on
```

Состояние панели при этом продолжает храниться в persistent `data/`, а обновления выполняются тем же безопасным способом.
