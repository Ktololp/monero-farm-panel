<div align="center">

# ⛏ Monero Farm Panel

**Self-hosted веб-панель для централизованного мониторинга и управления Monero / XMRig / RandomX фермой через SSH.**

![Version](https://img.shields.io/badge/version-1.2.0-2ea043)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![Platforms](https://img.shields.io/badge/Windows%20%7C%20Linux%20%7C%20ARM64-supported-4c8bf5)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-yellow)

**[Русский](README.md) · [English](README.en.md) · [Документация](docs/) · [Сообщить об ошибке](../../issues/new?template=bug_report.yml) · [Предложить функцию](../../issues/new?template=feature_request.yml)**

</div>

---

Monero Farm Panel — лёгкая центральная панель для домашней или небольшой серверной фермы. На майнеры **не требуется устанавливать отдельный агент**: панель подключается к Linux-серверам по SSH, читает XMRig API и системные метрики, управляет сервисами и открывает интерактивный SSH-терминал прямо в браузере.

> [!IMPORTANT]
> Используйте панель только для серверов, которыми вы владеете или которыми вам разрешено управлять. Не выставляйте панель напрямую в Интернет без VPN или правильно настроенного reverse proxy, HTTPS и сильного мастер-пароля.

## ✨ Возможности

| Область | Что умеет |
|---|---|
| **Ферма** | Общий live-хешрейт, XMR/USD, online/offline, общий график, mini-sparklines, Fleet Health Score, оценка XMR/USD дохода |
| **XMRig** | 10s / 60s / 15m, версия, uptime, accepted/rejected, pool, логи |
| **p2pool** | Статус, лог, Data API аналитика 15m/1h/24h, shares/effort/workers, включение аналитики в один клик с rollback |
| **XMRig Proxy** | Мониторинг Proxy API, workers/miners/shares/upstreams, установка и безопасное переключение XMRig с rollback |
| **monerod** | Статус, height/target height, прогресс синхронизации, peers, difficulty/reward, собственный лог |
| **Система** | Температура, CPU MHz, load average, Huge Pages, 1 GB Pages, MSR, сеть/DNS |
| **Автоматика** | Grace period, auto-recovery, baseline, детектор деградации, cooldown |
| **Управление** | Профили производительности, rolling restart, rolling update XMRig, Auto Fix |
| **SSH** | Пароль, private key или ssh-agent; встроенный xterm.js терминал |
| **Безопасность** | AES-256-GCM для сохранённых секретов, host-key pinning, HTTPS, журнал действий |
| **Платформы панели** | Windows 10/11, Linux x86_64, Raspberry Pi ARM64, Docker |

Интерфейс разделён на отдельные экраны: **Дашборд, Серверы, XMRig Proxy, Операции, Обновления, Топология, Настройки, Журнал и Документация**. На карточке каждого сервера есть быстрый значок терминала **⌨**.

## 🚀 Быстрый старт

### Windows

Требования: Windows 10/11 и Node.js 20+.

```text
1. Распакуйте проект.
2. Запустите SETUP_WINDOWS.cmd.
3. Сохраните показанный PANEL MASTER PASSWORD.
4. Запустите START_WINDOWS.cmd.
5. Откройте https://localhost:3000
```

Подробно: **[docs/WINDOWS.md](docs/WINDOWS.md)**.

### Linux / Raspberry Pi

```bash
cp .env.example .env
./scripts/generate-secrets.sh
npm install
npm run build:web
npm start
```

После запуска откройте `https://IP_ПАНЕЛИ:3000`.

Подробно: **[docs/LINUX.md](docs/LINUX.md)** и **[docs/RASPBERRY_PI.md](docs/RASPBERRY_PI.md)**.

### Docker Compose

```bash
cp .env.example .env
./scripts/generate-secrets.sh
docker compose up -d --build
```

```bash
docker compose logs -f panel
```

Подробно: **[docs/DOCKER.md](docs/DOCKER.md)**.

## ➕ Добавление первого майнера

Минимально нужны:

```text
Название сервера
IP / hostname
SSH port
Linux username
Пароль / private key / SSH-agent
sudo password (если требуется)
```

После SSH-подключения панель умеет автоматически искать XMRig, его `config.json`, systemd unit, API, p2pool, monerod и основные сведения о железе.

XMRig API рекомендуется оставлять на:

```text
127.0.0.1:60050
```

Порт **не нужно открывать в LAN/Internet** — панель обращается к нему локально после входа по SSH.

## 🪙 Кошелёк и пул

В публичной версии **нет чужого кошелька майнинга по умолчанию**. Перед применением глобального mining-конфига откройте:

```text
Настройки → Майнинг → XMR-кошелёк
```

и укажите **свой** Monero-адрес.

Пул по умолчанию — `127.0.0.1:3333`, что удобно для локального p2pool. Его можно заменить любым совместимым пулом.

## 🧠 Базовая норма и деградация

Панель автоматически изучает обычный 60s-хешрейт каждого сервера. Пока данных недостаточно, отображается, например:

```text
Базовая норма: обучение 5/12
```

После обучения появляется ориентир вроде `44.3 kH/s`. Если текущий хешрейт устойчиво отклоняется от собственной нормы сервера сильнее настроенного порога, панель создаёт предупреждение. Это позволяет заметить деградацию даже тогда, когда XMRig формально остаётся online.

## ♻️ Автовосстановление

Auto-recovery включено по умолчанию и учитывает:

- grace period после запуска/перезапуска;
- несколько последовательных неудачных проверок;
- cooldown между автоматическими действиями;
- состояние XMRig API и хешрейта.

Это снижает риск restart-loop на системах, где один unit запускает цепочку `monerod → p2pool → XMRig`.

## 🔐 Безопасность

- SSH-пароли и private keys хранятся зашифрованными AES-256-GCM.
- SSH host key запоминается при первом подключении и затем проверяется.
- XMRig API можно держать только на localhost.
- Встроенный терминал работает через SSH proxy панели, а не открывает SSH-порт в браузер.
- `.env`, база SQLite, сертификаты и runtime-логи исключены из Git через `.gitignore`.
- Для публичного доступа рекомендуется VPN либо reverse proxy с доверенным TLS-сертификатом.

Подробнее: **[docs/SSH.md](docs/SSH.md)** и **[SECURITY.md](SECURITY.md)**.

## 🌐 Исходящие соединения панели

Без телеметрии и аналитики. При включённых соответствующих функциях панель обращается наружу только для практических задач, например:

- получение XMR/USD;
- проверка официальных релизов XMRig / p2pool / Monero;
- проверка DNS/Internet.

## 🧰 Документация

- [Windows](docs/WINDOWS.md)
- [Linux](docs/LINUX.md)
- [Raspberry Pi](docs/RASPBERRY_PI.md)
- [Docker](docs/DOCKER.md)
- [SSH и ключи](docs/SSH.md)
- [p2pool / monerod](docs/P2POOL.md)
- [Справочник функций v1.2](docs/FEATURES.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Решение проблем](docs/TROUBLESHOOTING.md)
- [Как опубликовать проект на GitHub](docs/PUBLISH_GITHUB.md)

## 🤝 Участие в разработке

Баги и идеи приветствуются через GitHub Issues. Перед Pull Request прочитайте **[CONTRIBUTING.md](CONTRIBUTING.md)**.

Для уязвимостей и вопросов безопасности — **[SECURITY.md](SECURITY.md)**.

## ❤️ Поддержать разработку

Если проект оказался полезен и вы хотите поддержать дальнейшую разработку:

```text
XMR: 44ubFsmz6q9MkD5jYgBkDuepKPJeWiYhrJf11w3xN6F7W84goasecMQeRVsr5wf5XvZAE14F4AKeyLAhALnNp1kcF1Nw35i
```

Это **donation-адрес**, а не кошелёк майнинга по умолчанию.

## 📜 Лицензия

Monero Farm Panel распространяется по лицензии **MIT**. См. [LICENSE](LICENSE).

> Monero, XMRig и p2pool — отдельные проекты. Monero Farm Panel не является официальным продуктом или аффилированным проектом их разработчиков.

## 🧩 Архитектура для разработчиков

Начиная с v1.1.0 исходники сгруппированы по подсистемам. Новому разработчику или AI-ассистенту рекомендуется начинать с [AGENTS.md](AGENTS.md), затем открыть [Developer Guide](docs/DEVELOPER_GUIDE.md). Канонический REST-префикс — `/api/v1`. Для Linux/Docker добавлен host-side CLI `mfp` с backup, update, health-check и rollback; см. [UPDATER.md](docs/UPDATER.md).
