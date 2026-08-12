# 🧰 Решение проблем

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

## XMRig Proxy найден, но API недоступен

Проверьте service и listener:

```bash
sudo systemctl status xmrig-proxy --no-pager -l
sudo ss -lntp | grep -E ':(3334|60051)\b'
```

Рекомендуется:

```text
Stratum:  0.0.0.0:3334
HTTP API: 127.0.0.1:60051
```

Если процесс работает, но config не читается, проверьте права на `/etc/xmrig-proxy/` и `config.json`: пользователь service должен иметь возможность пройти в каталог и прочитать config.

## XMRig Proxy показывает hashrate не как XMRig

На коротком интервале это ожидаемо. XMRig показывает скорость вычислений, а Proxy оценивает hashrate по принятым shares и своим временным окнам.

Проверьте одновременно:

- XMRig 60s hashrate;
- Proxy accepted/rejected;
- P2Pool 15m/1h hashrate;
- стабильность значения за более длинный интервал.

Если XMRig продолжает принимать shares и P2Pool показывает нормальную долгосрочную скорость, мгновенное отличие Proxy само по себе не означает деградацию.

## P2Pool Analytics не включилась

Сначала убедитесь, что текущая версия P2Pool поддерживает параметры:

```bash
p2pool --help 2>&1 | grep -E -- '--data-api|--local-api|--stratum-api'
```

Проверьте реальную команду работающего процесса:

```bash
ps -eo pid,args | grep '[p]2pool'
```

После успешного one-click enable она должна содержать:

```text
--data-api ... --local-api
```

Если операция не прошла, откройте **Журнал** в панели. Автоматизатор создаёт backup startup-файла и должен вернуть исходную конфигурацию, если P2Pool не поднялся с нужными flags.

Не нажимайте кнопку много раз подряд: сначала разберите ошибку в Journal.

## `mfp update`: `manifest unknown`

Если ошибка появилась сразу после публикации новой версии:

```text
Error response from daemon: manifest unknown
```

проверьте GitHub Actions → Release → **Publish multi-arch Docker image**. GitHub Release может быть создан раньше, чем Docker image будет полностью опубликован в GHCR.

На этапе pull текущий container ещё не заменяется. После завершения Docker job просто повторите:

```bash
mfp update <version>
```

Подробнее: [UPDATER.md](UPDATER.md).

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

## Связанные документы

- [XMRig Proxy](XMRIG_PROXY.md)
- [P2Pool / monerod](P2POOL.md)
- [Docker](DOCKER.md)
- [Updater](UPDATER.md)
