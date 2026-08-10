# Changelog

Все заметные изменения публичных версий Monero Farm Panel будут записываться здесь.

Формат основан на Keep a Changelog, версия проекта следует Semantic Versioning.

## [1.0.0] - 2026-08-10

### Первый публичный релиз

- Централизованный мониторинг XMRig через SSH без отдельного агента на майнерах.
- Dashboard с live-хешрейтом фермы, XMR/USD и sparklines.
- Детальные страницы серверов и встроенный SSH-терминал.
- Отдельные состояния XMRig, p2pool и monerod.
- Синхронизация monerod, CPU MHz/load, температуры, Huge Pages и MSR.
- Grace period и автоматическое восстановление майнинга.
- Персональная базовая норма хешрейта и детектор деградации.
- Профили производительности, rolling restart и rolling update XMRig.
- Auto-discovery, Auto Fix, центр обновлений и карта топологии.
- SQLite, HTTPS, шифрование сохранённых SSH-секретов и журнал действий.
- Windows, Linux, Raspberry Pi ARM64 и Docker Compose.
- Русская документация и базовый английский README.

### Public-release hardening

- Версия сброшена на `1.0.0` как первый стабильный публичный релиз.
- Удалён mining-wallet по умолчанию: пользователь должен указать собственный XMR-адрес.
- Добавлен безопасный `.gitignore` для `.env`, SQLite, сертификатов, логов и ключей.
- Добавлены GitHub Actions, issue forms, security policy и contribution guide.
