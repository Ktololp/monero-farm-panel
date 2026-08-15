# Changelog

## [1.2.2] - 2026-08-15

### Изменено

- Полностью обновлён визуальный стиль Monero Farm Panel без изменения backend/API и логики управления майнерами.
- Dashboard получил новый бренд-блок, KPI-карточки и SVG-иконки, переработанный график хешрейта, таблицу майнеров и блок активных оповещений.
- Страница сервера унифицирована по всем вкладкам: Overview, Performance, Components, System, Logs и Management.
- Переработаны страницы Servers, Operations, Updates, Topology, XMRig Proxy, Settings, Journal и Documentation.
- Экран входа и адаптивные состояния приведены к общей дизайн-системе для desktop, kiosk и узких окон.
- Для визуальных слоёв добавлены отдельные CSS-модули и regression-тесты, чтобы дальнейшие изменения не ломали соседние страницы.
- Сохранены RU/EN локализация, существующие SSH-действия, rolling restart/update, профили производительности, Proxy/P2Pool и все текущие API-контракты.

### Исправлено

- Исправлен жизненный цикл tooltip: подсказки больше не залипают после ухода мыши, потери фокуса, скролла или смены вкладки.
- Уточнены пропорции KPI, размеры иконок, responsive-layout и плотность таблиц/карточек.
- Возвращена более выразительная золотистая цветовая индикация процентов профилей в Operations.

## 1.1.0

- Reorganized backend/frontend source by subsystem for fast human/AI comprehension.
- Added AGENTS.md, Developer Guide, subsystem READMEs, ADRs and OpenAPI documentation.
- Added canonical /api/v1 with /api compatibility alias.
- Added shared JSDoc contracts/error model and miner-facing component entry points.
- Added host-side mfp CLI: status/update/backup/restore/rollback/logs/restart/kiosk.
- Added automatic update health-check and rollback design for Docker appliance hosts.
- Added release-image Compose file and recursive project syntax checker.
- Bumped PWA cache to v1.1.0 so kiosk browsers replace old UI assets.

Все заметные изменения публичных версий Monero Farm Panel будут записываться здесь.

Формат основан на Keep a Changelog, версия проекта следует Semantic Versioning.

## [1.0.2] - 2026-08-12

### Исправлено

- Добавлен единый движок масштабирования графиков, чтобы небольшие колебания не выглядели как резкий скачок.
- График температуры использует минимальное визуальное окно 20 °C и предсказуемый шаг 5 °C.
- Графики хешрейта используют минимальное окно около 15% от текущей/базовой нормы, сохраняя видимость настоящей деградации.
- Mini-sparkline серверов использует тот же честный масштаб хешрейта.
- Добавлены автоматические тесты правил масштабирования графиков.

## [1.0.1] - 2026-08-10

### Исправлено

- Исправлен завышенный хешрейт на графике «Хешрейт всей фермы»: временные замеры одного сервера больше не суммируются между собой внутри 5-минутного/часового бакета.
- История фермы теперь сначала усредняет хешрейт каждого сервера внутри бакета, а затем складывает серверы. Сохранённые offline/null-замеры учитываются как 0 H/s.
- Добавлены автоматические тесты агрегации истории фермы и их запуск в GitHub Actions CI.

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
