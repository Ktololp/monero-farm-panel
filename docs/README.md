# 📚 Документация Monero Farm Panel

Добро пожаловать в документацию **Monero Farm Panel v1.2.0**.

Если вы только установили панель, начните с документа по своей платформе. Если панель уже работает — переходите к справочнику функций и компонентам майнинга.

## 🚀 Установка и запуск

- [Windows](WINDOWS.md)
- [Linux](LINUX.md)
- [Raspberry Pi](RASPBERRY_PI.md)
- [Docker / Docker Compose](DOCKER.md)
- [Host-side updater `mfp`](UPDATER.md)

## ⛏ Майнинг и компоненты

- [Справочник функций v1.2](FEATURES.md)
- [XMRig Proxy](XMRIG_PROXY.md)
- [p2pool / monerod](P2POOL.md)
- [SSH и ключи](SSH.md)

## 🆕 Основные функции v1.2.0

| Функция | Что даёт |
|---|---|
| **⇄ XMRig Proxy** | Мониторинг workers/miners/shares/upstreams, установка из панели и безопасное переключение XMRig с rollback |
| **🟠 P2Pool Analytics** | 15m/1h/24h hashrate, shares, effort, workers, pool/sidechain данные и one-click enable |
| **❤️ Fleet Health Score** | Единая оценка здоровья сервера и всей фермы от 0 до 100 |
| **💰 Предполагаемый доход** | Автоматическая оценка XMR/day и USD/day/30d по текущей сети Monero |
| **ⓘ Контекстная помощь** | Короткие объяснения прямо рядом со сложными функциями |

## 🛡 Безопасность и диагностика

- [Решение проблем](TROUBLESHOOTING.md)
- [Security policy](../SECURITY.md)

## 🧩 Для разработчиков и AI-ассистентов

- [Архитектура](ARCHITECTURE.md)
- [Developer Guide](DEVELOPER_GUIDE.md)
- [OpenAPI](openapi.yaml)
- [AGENTS.md](../AGENTS.md)

Главный принцип проекта: **простая для человека архитектура, безопасные one-click операции и минимальная необходимость работать через консоль на майнерах**.
