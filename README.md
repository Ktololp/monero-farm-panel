<div align="center">

# ⛏ Monero Farm Panel

**Self-hosted панель для централизованного мониторинга и управления Monero / XMRig / RandomX фермой через SSH.**

[![Release](https://img.shields.io/github/v/release/Ktololp/monero-farm-panel?display_name=tag&sort=semver&color=2ea043)](../../releases)
[![CI](https://github.com/Ktololp/monero-farm-panel/actions/workflows/ci.yml/badge.svg?branch=main)](../../actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-339933?logo=nodedotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-yellow)
[![GitHub stars](https://img.shields.io/github/stars/Ktololp/monero-farm-panel?style=flat&color=58a6ff)](../../stargazers)

**[Русский](README.md) · [English](README.en.md) · [Документация](docs/) · [Релизы](../../releases) · [Сообщить об ошибке](../../issues/new?template=bug_report.yml) · [Предложить функцию](../../issues/new?template=feature_request.yml)**

</div>

<p align="center">
  <img src="docs/assets/hero.webp" alt="Monero Farm Panel — project overview" width="100%">
</p>

> [!NOTE]
> Иллюстрации в README — презентационные визуалы на основе интерфейса v1.2.0. Они показывают назначение и направление дизайна; конкретные значения хешрейта, температуры и дохода приведены для примера.

## Зачем Monero Farm Panel

Monero Farm Panel — лёгкая центральная панель для домашней или небольшой серверной фермы. **Отдельный агент на майнеры устанавливать не требуется**: панель подключается к Linux-хостам по SSH, читает локальные API и системные метрики, управляет сервисами и открывает SSH-терминал прямо в браузере.

| | Что даёт |
|---|---|
| 🛰️ **Agentless** | Один web-интерфейс для нескольких Linux-майнеров без собственного агента на каждом сервере |
| ⚡ **Безопасные операции** | Preflight, backup и rollback для рискованных one-click действий |
| 📊 **Глубокая видимость** | XMRig, XMRig Proxy, P2Pool, monerod, baseline, Fleet Health, история и оценка дохода |
| 🧰 **Практичный self-hosted стек** | Windows, Linux, Docker, amd64/arm64, SSH password/key/agent, встроенный терминал |

> [!IMPORTANT]
> Используйте панель только для серверов, которыми вы владеете или которыми вам разрешено управлять. Не выставляйте панель напрямую в Интернет без VPN или правильно настроенного reverse proxy, HTTPS и сильного мастер-пароля.

## 🖥️ Интерфейс

<p align="center">
  <img src="docs/assets/dashboard.webp" alt="Monero Farm Panel dashboard overview" width="100%">
</p>

Dashboard сводит в один экран состояние фермы: online/offline, общий хешрейт, Fleet Health Score, температуру, XMR/USD, ориентировочный доход, алерты и историю. Для каждого сервера доступны отдельные вкладки **Обзор / Производительность / Компоненты / Система / Логи / Управление**.

## 🆕 v1.2.0

### ⇄ XMRig Proxy как полноценный компонент

- отдельный экран **XMRig Proxy**;
- автоопределение localhost HTTP API;
- workers, miners, accepted/rejected/invalid, upstream connections;
- one-click установка официального stable XMRig Proxy с SHA256-проверкой;
- безопасное переключение XMRig на Proxy с backup и автоматическим rollback;
- повторная установка/маршрутизация идемпотентна и не делает лишний restart.

Типичный маршрут:

```text
XMRig → 127.0.0.1:3334 → XMRig Proxy → 127.0.0.1:3333 → P2Pool → Monero
```

> [!NOTE]
> Hashrate XMRig Proxy оценивается по accepted shares и временным окнам Proxy. На коротком интервале он может отличаться от 60s-hashrate XMRig без реальной потери производительности.

### 🟠 P2Pool Analytics

- Data API: 15m / 1h / 24h local hashrate;
- shares found/failed, current/average effort, workers/connections;
- pool hashrate, miners, blocks и sidechain;
- кнопка **«Включить P2Pool аналитику»** добавляет `--data-api` + `--local-api`;
- startup-файл валидируется, сохраняется backup, при неудачном restart выполняется rollback.

### ❤️ Fleet Health + 💰 Farm Insights

- Fleet Health Score **0–100** для сервера и всей фермы;
- автоматическая personal baseline норма хешрейта;
- детектор деградации;
- оценка **XMR/сутки, USD/сутки и USD/30 дней** по текущему hashrate, difficulty, block reward и XMR/USD;
- компактные `ⓘ`-подсказки и встроенный раздел **Документация**.

## ✨ Возможности

| Область | Возможности |
|---|---|
| **Ферма** | Live hashrate, 24h history, sparklines, XMR/USD, Fleet Health, estimated income, alerts |
| **XMRig** | 10s / 60s / 15m, version, uptime, shares, pool, logs, config operations |
| **XMRig Proxy** | Install, Proxy API, workers/miners/shares/upstreams, safe XMRig routing |
| **P2Pool** | Process/log status + Data API analytics + one-click persistent enablement |
| **monerod** | Sync, height/target, peers, difficulty, block reward, logs |
| **Система** | Temperature, CPU MHz/load, Huge Pages, 1 GB Pages, MSR, DNS/Internet |
| **Автоматика** | Grace period, auto-recovery, baseline, degradation detector, cooldown |
| **Управление** | Performance profiles, rolling restart/update, Auto Fix |
| **SSH** | Password, private key, ssh-agent, browser xterm.js terminal |
| **Безопасность** | AES-256-GCM secrets, host-key pinning, HTTPS, audit log, backup/rollback |

## 🚀 Быстрый старт

<details>
<summary><b>Windows 10/11</b></summary>

Требуется Node.js 22.19.0+.

```text
1. Распакуйте release archive.
2. Запустите SETUP_WINDOWS.cmd.
3. Сохраните показанный PANEL MASTER PASSWORD.
4. Запустите START_WINDOWS.cmd.
5. Откройте https://localhost:3000
```

Подробнее: [docs/WINDOWS.md](docs/WINDOWS.md).

</details>

<details>
<summary><b>Linux / Raspberry Pi ARM64</b></summary>

```bash
cp .env.example .env
./scripts/generate-secrets.sh
npm install
npm run build:web
npm start
```

Подробнее: [Linux](docs/LINUX.md) · [Raspberry Pi](docs/RASPBERRY_PI.md).

</details>

<details>
<summary><b>Docker Compose</b></summary>

```bash
cp .env.example .env
./scripts/generate-secrets.sh
docker compose up -d --build
docker compose logs -f panel
```

Подробнее: [docs/DOCKER.md](docs/DOCKER.md).

</details>

### Официальный Docker image и `mfp`

Release workflow публикует multi-arch GHCR image для `linux/amd64` и `linux/arm64`. Host-side CLI `mfp` предназначен для appliance/kiosk-установок: он делает backup, обновляет container, проверяет `/healthz` и автоматически возвращает предыдущий image/data при неудаче.

```bash
mfp status
mfp backup
mfp update 1.2.0
```

Подробнее: [docs/UPDATER.md](docs/UPDATER.md).

## ➕ Добавление сервера

Минимально нужны:

```text
Название / иконка
IP или hostname
SSH port
Linux username
Пароль / private key / SSH-agent
sudo password, если требуется
```

После SSH-подключения панель может автоматически искать XMRig, `config.json`, systemd unit, API, P2Pool, monerod, XMRig Proxy и сведения о системе.

Рекомендуемые localhost API:

```text
XMRig API:       127.0.0.1:60050
XMRig Proxy API: 127.0.0.1:60051
```

Эти HTTP API **не требуется открывать в LAN/Internet** — панель обращается к ним на самом сервере через SSH.

## 🪙 Wallet и pool

Публичная версия **не содержит mining wallet по умолчанию**. Перед применением mining-конфига или установкой XMRig Proxy укажите собственный адрес:

```text
Настройки → Майнинг → XMR-кошелёк
```

Pool по умолчанию `127.0.0.1:3333` удобен для локального P2Pool, но может быть заменён.

## 🔐 Безопасность

- сохранённые SSH credentials/private keys шифруются AES-256-GCM;
- SSH host key pinning защищает от незаметной подмены хоста;
- XMRig и XMRig Proxy API можно оставлять на localhost;
- browser terminal работает через SSH backend панели;
- `.env`, SQLite data, certificates и runtime logs исключены из Git;
- опасные автоматические операции используют preflight, backup и rollback там, где это возможно;
- для внешнего доступа рекомендуется VPN или hardened reverse proxy.

Подробнее: [SECURITY.md](SECURITY.md) · [docs/SSH.md](docs/SSH.md).

## 📚 Документация

| Начать | Майнинг | Эксплуатация | Разработка |
|---|---|---|---|
| [Windows](docs/WINDOWS.md) | [XMRig Proxy](docs/XMRIG_PROXY.md) | [Updater `mfp`](docs/UPDATER.md) | [Architecture](docs/ARCHITECTURE.md) |
| [Linux](docs/LINUX.md) | [P2Pool / monerod](docs/P2POOL.md) | [Troubleshooting](docs/TROUBLESHOOTING.md) | [Developer Guide](docs/DEVELOPER_GUIDE.md) |
| [Docker](docs/DOCKER.md) | [v1.2 Features](docs/FEATURES.md) | [SSH](docs/SSH.md) | [AGENTS.md](AGENTS.md) |

Полный индекс: **[docs/README.md](docs/README.md)**.

## 🗺️ Roadmap

Следующий крупный UX-шаг:

- 🇷🇺 / 🇬🇧 **переключение языка интерфейса Russian / English**;
- постепенное сближение runtime UI с новым визуальным направлением без потери компактности и скорости;
- дальнейшее улучшение onboarding и dummy-proof операций.

Визуальное направление зафиксировано в [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md).

## 🤝 Участие в проекте

Issues и pull requests приветствуются. Перед PR: [CONTRIBUTING.md](CONTRIBUTING.md). Для уязвимостей: [SECURITY.md](SECURITY.md).

Если проект полезен — ⭐ **Star** помогает другим майнерам найти его.

## ❤️ Поддержать разработку

```text
XMR: 44ubFsmz6q9MkD5jYgBkDuepKPJeWiYhrJf11w3xN6F7W84goasecMQeRVsr5wf5XvZAE14F4AKeyLAhALnNp1kcF1Nw35i
```

Это donation-адрес и **никогда не используется автоматически для майнинга**.

## 📜 Лицензия и независимость

MIT — см. [LICENSE](LICENSE).

> Monero, XMRig и P2Pool — независимые проекты. Monero Farm Panel не является их официальным или аффилированным продуктом.

## 🧩 Для разработчиков и AI-ассистентов

Исходники сгруппированы по подсистемам. Начинайте с [AGENTS.md](AGENTS.md), затем [Developer Guide](docs/DEVELOPER_GUIDE.md). Канонический REST-префикс — `/api/v1`.
