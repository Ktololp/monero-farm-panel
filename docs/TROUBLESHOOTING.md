# Решение проблем

## `SSH доступен, но API XMRig недоступен`

Проверьте на майнере:

```bash
curl http://127.0.0.1:60050/2/summary
ss -lntp | grep 60050
```

В XMRig `config.json`:

```json
"http": {
  "enabled": true,
  "host": "127.0.0.1",
  "port": 60050,
  "access-token": null,
  "restricted": true
}
```

После перезапуска сложного `mining.service` учитывайте grace period: XMRig может запуститься позже monerod и p2pool.

## Windows: `Failed to fetch`, а START_WINDOWS закрылся

Проверьте:

```text
data\panel-crash.log
```

И запустите `START_WINDOWS.cmd` ещё раз, чтобы увидеть exit code.

## Неверные p2pool / monerod logs

Укажите реальные пути в расширенных настройках сервера. Частые варианты:

```text
~/p2pool.log
~/.bitmonero/bitmonero.log
```

## SSH-agent не работает на Windows

```powershell
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
ssh-add -l
```

## Самоподписанный HTTPS

Предупреждение браузера при локальной установке ожидаемо. Для постоянного сетевого доступа используйте доверенный сертификат через reverse proxy или собственный PKI.
