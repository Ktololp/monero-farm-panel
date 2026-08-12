<div align="center">

# ⛏ Monero Farm Panel

**Self-hosted web dashboard for centralized monitoring and management of Monero / XMRig / RandomX mining farms over SSH.**

![Version](https://img.shields.io/badge/version-1.2.0-2ea043)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![Platforms](https://img.shields.io/badge/Windows%20%7C%20Linux%20%7C%20ARM64-supported-4c8bf5)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-yellow)

**[Русский](README.md) · [English](README.en.md) · [Docs](docs/) · [Releases](../../releases)**

</div>

---

Monero Farm Panel is a lightweight central dashboard for home and small server mining farms. **No custom agent is required on miners**: the panel connects to Linux hosts over SSH, reads local APIs and system metrics, manages services, and provides an interactive browser SSH terminal.

> [!IMPORTANT]
> Use this software only on systems you own or are authorized to administer. Do not expose the panel directly to the public Internet without a VPN or a properly secured reverse proxy, HTTPS, and a strong master password.

## 🆕 What is new in v1.2.0

### ⇄ First-class XMRig Proxy support

- dedicated **XMRig Proxy** page;
- localhost Proxy API auto-detection;
- workers, miners, accepted/rejected/invalid and upstream connections;
- worker hashrate windows;
- one-click installation of the official stable XMRig Proxy release;
- SHA256 verification of the downloaded release asset;
- safe XMRig routing to `127.0.0.1:3334` with config backup and automatic rollback;
- idempotent install/routing actions so already configured systems are not restarted unnecessarily.

Typical route after switching:

```text
XMRig → XMRig Proxy :3334 → p2pool :3333 → Monero network
```

> [!NOTE]
> XMRig Proxy hashrate is estimated from accepted shares and Proxy time windows. Over short periods it can differ from XMRig's actual 60-second hashrate without indicating a performance loss.

### 🟠 P2Pool Analytics

- automatic detection of the P2Pool Data API;
- local hashrate for 15m / 1h / 24h;
- shares found / failed;
- current / average effort;
- miner connections and workers;
- pool hashrate, miners, blocks found and sidechain data;
- one-click persistent enablement with `--data-api` + `--local-api`;
- startup-file validation, backup and rollback if P2Pool does not return correctly.

### ❤️ Fleet Health Score

Each server and the whole farm receive a **0–100** health score based on availability, XMRig state, deviation from the learned baseline, temperature, rejected shares, network status, monerod synchronization and recent errors.

### 💰 Estimated farm income

The dashboard automatically shows estimated:

- XMR/day;
- USD/day;
- USD/30 days.

The estimate uses the current farm 60s hashrate, Monero network difficulty, the last block reward and XMR/USD. It is a statistical estimate, not a guaranteed payout.

### ⓘ Contextual help and Documentation

Important controls now have compact `ⓘ` explanations, and the sidebar includes a dedicated **Documentation** page.

## Highlights

- Farm-wide live hashrate chart, per-server sparklines, Fleet Health Score and estimated XMR/USD income.
- XMRig 10s / 60s / 15m hashrate, version, uptime, shares, pool and logs.
- XMRig Proxy monitoring with workers/miners/shares/upstreams, one-click installation and safe XMRig routing with rollback.
- P2Pool Data API analytics with 15m/1h/24h hashrate, shares, effort and workers; one-click persistent enablement with rollback.
- Monero node synchronization status, peer counts, network difficulty and block reward telemetry.
- CPU temperature, MHz, load average, Huge Pages, 1 GB pages and MSR state.
- Grace period, automatic recovery, personal baseline and degradation detection.
- Performance profiles, rolling restart and rolling XMRig update.
- Auto-discovery and Auto Fix for common miner configuration issues.
- SSH password, private key and ssh-agent authentication.
- Browser terminal using xterm.js + Socket.IO + ssh2.
- SQLite storage, encrypted saved secrets, HTTPS and action audit log.
- Built-in contextual help icons and a Documentation page.
- Windows, Linux x86_64, Raspberry Pi ARM64 and Docker support.

## Quick start

### Windows

Install Node.js 20+, extract the project, then run:

```text
SETUP_WINDOWS.cmd
START_WINDOWS.cmd
```

Open `https://localhost:3000` and keep the generated master password safe.

### Linux / Raspberry Pi

```bash
cp .env.example .env
./scripts/generate-secrets.sh
npm install
npm run build:web
npm start
```

### Docker Compose

```bash
cp .env.example .env
./scripts/generate-secrets.sh
docker compose up -d --build
```

### Official Docker image and `mfp`

Release builds publish multi-arch `linux/amd64` and `linux/arm64` images to GHCR. For appliance/kiosk-style installs, the host-side `mfp` CLI can back up state, update the container, health-check `/healthz` and automatically roll back on failure.

```bash
mfp status
mfp backup
mfp update 1.2.0
```

See [docs/UPDATER.md](docs/UPDATER.md).

## Mining wallet safety

The public release intentionally ships with **no mining wallet configured**. Enter your own address under `Settings → Mining` before applying a configuration, bootstrapping a miner or installing XMRig Proxy. The donation address in the Russian README is never used automatically for mining.

## Security

XMRig and XMRig Proxy HTTP APIs can remain bound to `127.0.0.1`; the panel reaches them through SSH. Saved SSH credentials are encrypted, host keys are pinned, and runtime secrets/state are excluded from Git. Risky one-click operations use preflight checks, backups and rollback where possible. For Internet access, prefer a VPN or a hardened reverse proxy.

See [SECURITY.md](SECURITY.md) for reporting security issues.

## Documentation

- [v1.2 feature guide](docs/FEATURES.md)
- [XMRig Proxy](docs/XMRIG_PROXY.md)
- [p2pool / monerod](docs/P2POOL.md)
- [Windows](docs/WINDOWS.md)
- [Linux](docs/LINUX.md)
- [Raspberry Pi](docs/RASPBERRY_PI.md)
- [Docker](docs/DOCKER.md)
- [Host-side updater](docs/UPDATER.md)
- [SSH](docs/SSH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

> Monero, XMRig and p2pool are independent projects. Monero Farm Panel is not an official or affiliated product of those projects.

## 🧩 Developer architecture

Starting with v1.1.0, source code is grouped by subsystem. New contributors and AI coding assistants should start with [AGENTS.md](AGENTS.md) and [Developer Guide](docs/DEVELOPER_GUIDE.md). The canonical REST prefix is `/api/v1`. Linux/Docker hosts can install the host-side `mfp` CLI for backup, update, health-check and rollback; see [UPDATER.md](docs/UPDATER.md).
