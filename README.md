<div align="center">

# ⛏ Monero Farm Panel

**Self-hosted веб-панель для централизованного мониторинга и управления Monero / XMRig / RandomX фермой через SSH.**

![Version](https://img.shields.io/badge/version-1.2.0-2ea043)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![Platforms](https://img.shields.io/badge/Windows%20%7C%20Linux%20%7C%20ARM64-supported-4c8bf5)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-yellow)

**[Русский](README.md) · [English](README.en.md) · [Документация](docs/) · [Релизы](../../releases) · [Сообщить об ошибке](../../issues/new?template=bug_report.yml) · [Предложить функцию](../../issues/new?template=feature_request.yml)**

</div>

---

Monero Farm Panel — лёгкая центральная панель для домашней или небольшой серверной фермы. На майнеры **не требуется устанавливать отдельный агент**: панель подключается к Linux-серверам по SSH, читает локальные API и системные метрики, управляет сервисами и открывает интерактивный SSH-терминал прямо в браузере.

> [!IMPORTANT]
> Используйте панель только для серверов, которыми вы владеете или которыми вам разрешено управлять. Не выставляйте панель напрямую в Интернет без VPN или правильно настроенного reverse proxy, HTTPS и сильного мастер-пароля.

## 🆕 Что нового в v1.2.0

### ⇄ XMRig Proxy как полноценный компонент фермы

- отдельный экран **XMRig Proxy**;
- автоопределение локального Proxy API;
- workers, miners, accepted/rejected/invalid, upstream connections;
- worker hashrate за 1m / 10m / 1h;
- установка официального XMRig Proxy прямо из панели;
- SHA256-проверка скачанного релиза;
- безопасное переключение XMRig на `127.0.0.1:3334` с backup и автоматическим rollback;
- повторное нажатие безопасно: уже настроенный маршрут не перезапускается повторно.

Типичная схема после переключения:

```text
XMRig → XMRig Proxy :3334 → p2pool :3333 → Monero network
```

> [!NOTE]
> Hashrate XMRig Proxy оценивается по принятым shares и временным окнам Proxy. На коротком интервале он может отличаться от фактического 60s-hashrate XMRig — это не обязательно означает потерю производительности.

### 🟠 P2Pool Analytics

- автоматическое определение P2Pool Data API;
- local hashrate 15m / 1h / 24h;
- shares found / failed;
- current / average effort;
- miner connections и workers;
- pool hashrate, miners, найденные блоки и sidechain;
- кнопка **«Включить P2Pool аналитику»** добавляет `--data-api` и `--local-api` в реальную команду запуска;
- startup-файл проверяется перед restart, создаётся backup, при неудаче выполняется rollback.

### ❤️ Fleet Health Score

Каждый сервер и вся ферма получают оценку здоровья **0–100**. В расчёт входят доступность, XMRig, отклонение от базовой нормы, температура, rejected shares, сеть, синхронизация monerod и свежие ошибки.

### 💰 Предполагаемый доход

Dashboard автоматически показывает ориентировочные:

- XMR / сутки;
- USD / сутки;
- USD / 30 дней.

Оценка строится по текущему 60s-hashrate фермы, network difficulty, награде последнего блока и XMR/USD. Это статистическая оценка, а не обещание фактической выплаты.

### ⓘ Контекстная помощь и Документация

У важных функций появились маленькие `ⓘ`-подсказки. В боковом меню есть отдельный раздел **Документация**, поэтому назначение сложных операций можно понять без поиска по исходникам.

## ✨ Возможности

| Область | Что умеет |
|---|---|
| **Ферма** | Общий live-хешрейт, XMR/USD, online/offline, большой график, mini-sparklines, Fleet Health Score, оценка дохода |
| **XMRig** | 10s / 60s / 15m, версия, uptime, accepted/rejected, pool, логи |
| **XMRig Proxy** | Установка, мониторинг Proxy API, workers/miners/shares/upstreams, безопасное переключение XMRig с rollback |
| **p2pool** | Статус, лог, Data API аналитика 15m/1h/24h, shares, effort, workers, one-click enable с rollback |
| **monerod** | Статус, height/target height, синхронизация, peers, network difficulty, block reward, лог |
| **Система** | Температура, CPU MHz, load average, Huge Pages, 1 GB Pages, MSR, сеть/DNS |
| **Автоматика** | Grace period, auto-recovery, personal baseline, детектор деградации, cooldown |
| **Управление** | Профили производительности, rolling restart, rolling update XMRig, Auto Fix |
| **SSH** | Пароль, private key или ssh-agent; встроенный xterm.js терминал |
| **Безопасность** | AES-256-GCM для сохранённых секретов, host-key pinning, HTTPS, журнал действий, backup/rollback опасных операций |
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

### Официальный Docker image и `mfp`

Релизный workflow публикует multi-arch image для `linux/amd64` и `linux/arm64` в GHCR. Для appliance/kiosk-установок рекомендуется host-side CLI `mfp`: он делает backup, обновляет образ, проверяет `/healthz` и умеет автоматически откатываться.

```bash
mfp status
mfp backup
mfp update 1.2.0
```

Подробнее: **[docs/UPDATER.md](docs/UPDATER.md)**.

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

После SSH-подключения панель умеет автоматически искать XMRig, его `config.json`, systemd unit, API, p2pool, monerod, XMRig Proxy и основные сведения о железе.

XMRig API рекомендуется оставлять на:

```text
127.0.0.1:60050
```

Порт **не нужно открывать в LAN/Internet** — панель обращается к нему локально после входа по SSH.

## 🪙 Кошелёк и пул

В публичной версии **нет чужого кошелька майнинга по умолчанию**. Перед применением глобального mining-конфига или установкой XMRig Proxy откройте:

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

После обучения появляется устойчивый ориентир. Если текущий 60s-хешрейт длительно отклоняется от собственной нормы сервера сильнее настроенного порога, панель создаёт предупреждение. Это позволяет заметить деградацию даже тогда, когда XMRig формально остаётся online.

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
- XMRig и XMRig Proxy HTTP API можно держать только на localhost.
- Встроенный терминал работает через SSH proxy панели, а не открывает SSH-порт в браузер.
- `.env`, база SQLite, сертификаты и runtime-логи исключены из Git через `.gitignore`.
- Опасные one-click операции используют preflight, backup и rollback там, где это возможно.
- Для публичного доступа рекомендуется VPN либо reverse proxy с доверенным TLS-сертификатом.

Подробнее: **[docs/SSH.md](docs/SSH.md)** и **[SECURITY.md](SECURITY.md)**.

## 🌐 Исходящие соединения панели

Без рекламной телеметрии и аналитики. При включённых соответствующих функциях панель обращается наружу только для практических задач, например:

- получение XMR/USD;
- проверка официальных релизов XMRig / p2pool / Monero / XMRig Proxy;
- скачивание официального XMRig Proxy при установке из панели;
- проверка DNS/Internet.

## 🧰 Документация

- [Справочник функций v1.2](docs/FEATURES.md)
- [XMRig Proxy](docs/XMRIG_PROXY.md)
- [p2pool / monerod](docs/P2POOL.md)
- [Windows](docs/WINDOWS.md)
- [Linux](docs/LINUX.md)
- [Raspberry Pi](docs/RASPBERRY_PI.md)
- [Docker](docs/DOCKER.md)
- [Host-side updater `mfp`](docs/UPDATER.md)
- [SSH и ключи](docs/SSH.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Решение проблем](docs/TROUBLESHOOTING.md)

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

Начиная с v1.1.0 исходники сгруппированы по подсистемам. Новому разработчику или AI-ассистенту рекомендуется начинать с [AGENTS.md](AGENTS.md), затем открыть [Developer Guide](docs/DEVELOPER_GUIDE.md). Канонический REST-префикс — `/api/v1`. Для Linux/Docker есть host-side CLI `mfp` с backup, update, health-check и rollback; см. [UPDATER.md](docs/UPDATER.md).
