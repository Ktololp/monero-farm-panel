# 🟠 P2Pool и monerod

Панель рассчитана как на отдельные systemd units, так и на существующие схемы, где несколько компонентов запускаются общим скриптом вроде `start_mining.sh`.

## P2Pool: базовый мониторинг

Даже без Data API панель умеет определять состояние процесса/сервиса P2Pool и читать его лог.

Типичный пользовательский лог:

```text
/home/<user>/p2pool.log
```

Для существующей схемы:

```bash
nohup ./p2pool ... > ~/p2pool.log 2>&1 &
```

этот файл предпочтительнее общего `journalctl -u mining`.

## 🆕 P2Pool Analytics v1.2

Расширенная аналитика использует официальный P2Pool Data API.

Рабочий P2Pool должен быть запущен с:

```text
--data-api /path/to/api --local-api
```

`--stratum-api` также распознаётся как alias для `--local-api`.

Панель определяет Data API по аргументам работающего процесса и показывает:

- local hashrate 15m / 1h / 24h;
- shares found / failed;
- current / average effort;
- miner connections;
- workers;
- pool hashrate;
- pool miners;
- total blocks found;
- sidechain.

## Включение аналитики в один клик

Если P2Pool работает, но Data API не включён, откройте:

```text
Сервер → Компоненты → P2Pool аналитика
```

и нажмите:

```text
🟠 Включить P2Pool аналитику
```

Панель пытается сделать изменение постоянным, а не только запустить временный процесс.

Для startup script она:

1. определяет systemd unit, которому принадлежит текущий P2Pool;
2. находит `.sh`-скрипт из `ExecStart`;
3. создаёт backup вида `start_mining.sh.bak-mfp-p2pool-api-...`;
4. ищет именно реальную команду запуска `p2pool`, игнорируя `pgrep`, `grep`, `echo` и служебные проверки;
5. добавляет `--data-api` и `--local-api`;
6. проверяет скрипт через `bash -n`;
7. перезапускает unit;
8. ждёт появления нового P2Pool процесса с нужными flags;
9. если проверка не проходит — возвращает backup и перезапускает unit обратно.

Если P2Pool запущен напрямую из systemd без startup script, панель может использовать systemd drop-in.

> [!IMPORTANT]
> Перезапуск общего `mining.service` может временно остановить также monerod и XMRig. Если startup script содержит задержки и запускает компоненты последовательно, нормальное восстановление может занять десятки секунд или несколько минут.

## Проверка вручную

После успешного включения аналитики команда процесса должна содержать оба параметра:

```bash
ps -eo pid,args | grep '[p]2pool'
```

Пример:

```text
./p2pool --data-api /home/user/.local/share/monero-farm-panel/p2pool-api --local-api --host 127.0.0.1 ...
```

## monerod

Типичный лог Monero:

```text
/home/<user>/.bitmonero/bitmonero.log
```

Если компоненты имеют отдельные systemd units, панель может использовать journal как fallback.

### RPC

Обычный локальный RPC monerod:

```text
127.0.0.1:18081
```

Из monerod панель получает не только height/target height и peers, но также network difficulty и данные о награде блока, которые используются для оценки дохода фермы.

RPC и XMRig/XMRig Proxy HTTP API не требуется открывать наружу — запросы выполняются на самом сервере через SSH.

## Связанные документы

- [Справочник функций v1.2](FEATURES.md)
- [XMRig Proxy](XMRIG_PROXY.md)
- [Решение проблем](TROUBLESHOOTING.md)
