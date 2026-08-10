# p2pool и monerod

Панель рассчитана как на отдельные systemd units, так и на существующие схемы, где несколько компонентов запускаются общим скриптом.

## Логи p2pool

Панель сначала пытается читать собственный лог p2pool. Типичный пользовательский путь:

```text
/home/<user>/p2pool.log
```

Для существующей схемы с `nohup ./p2pool ... > ~/p2pool.log 2>&1 &` это предпочтительнее `journalctl -u mining`.

## Логи monerod

Типичный лог Monero:

```text
/home/<user>/.bitmonero/bitmonero.log
```

Если компоненты имеют отдельные systemd units, panel может использовать journal как fallback.

## RPC

Обычный локальный RPC monerod:

```text
127.0.0.1:18081
```

RPC и XMRig API не требуется открывать наружу — запросы выполняются на самом сервере через SSH.
