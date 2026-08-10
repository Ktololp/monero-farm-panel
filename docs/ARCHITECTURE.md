# Архитектура

```text
Browser
  │ HTTPS / Socket.IO
  ▼
Monero Farm Panel
(Node.js + Express + SQLite)
  │
  ├── SSH exec ─────────────► sensors / systemctl / journal / procfs
  ├── SSH exec ─────────────► curl 127.0.0.1:60050/2/summary (XMRig)
  ├── SSH exec ─────────────► monerod local RPC
  └── SSH PTY + WebSocket ──► xterm.js terminal
```

## Почему без агента

Панель не требует отдельного daemon на каждом майнере. Это уменьшает количество компонентов и упрощает подключение существующих Linux-серверов.

## Хранение

SQLite содержит список серверов, настройки, метрики, alerts, jobs и audit log. Credentials шифруются до записи в БД с использованием ключа из `.env`.

## Polling

Опрос серверов выполняется центральной нодой. История агрегируется с минутным интервалом и очищается по retention policy.
