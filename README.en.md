<div align="center">

# ⛏ Monero Farm Panel

**Self-hosted web dashboard for centralized monitoring and management of Monero / XMRig / RandomX mining farms over SSH.**

![Version](https://img.shields.io/badge/version-1.1.0-2ea043)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![Platforms](https://img.shields.io/badge/Windows%20%7C%20Linux%20%7C%20ARM64-supported-4c8bf5)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-yellow)

**[Русский](README.md) · [English](README.en.md) · [Docs](docs/)**

</div>

---

Monero Farm Panel is a lightweight central dashboard for home and small server mining farms. **No custom agent is required on miners**: the panel connects to Linux hosts over SSH, reads the local XMRig API and system metrics, manages services, and provides an interactive browser SSH terminal.

> [!IMPORTANT]
> Use this software only on systems you own or are authorized to administer. Do not expose the panel directly to the public Internet without a VPN or a properly secured reverse proxy, HTTPS, and a strong master password.

## Highlights

- Farm-wide live hashrate chart and per-server sparklines.
- XMRig 10s / 60s / 15m hashrate, version, uptime, shares, pool and logs.
- Separate XMRig / p2pool / monerod health indicators.
- Monero node synchronization status and peer counts.
- CPU temperature, MHz, load average, Huge Pages, 1 GB pages and MSR state.
- Grace period, automatic recovery, personal baseline and degradation detection.
- Performance profiles, rolling restart and rolling XMRig update.
- Auto-discovery and Auto Fix for common miner configuration issues.
- SSH password, private key and ssh-agent authentication.
- Browser terminal using xterm.js + Socket.IO + ssh2.
- SQLite storage, encrypted saved secrets, HTTPS and action audit log.
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

## Mining wallet safety

The public release intentionally ships with **no mining wallet configured**. Enter your own address under `Settings → Mining` before applying a configuration or bootstrapping a miner. The donation address in the Russian README is never used automatically for mining.

## Security

XMRig API can remain bound to `127.0.0.1`; the panel reaches it through SSH. Saved SSH credentials are encrypted, host keys are pinned, and runtime secrets/state are excluded from Git. For Internet access, prefer a VPN or a hardened reverse proxy.

See [SECURITY.md](SECURITY.md) for reporting security issues.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

> Monero, XMRig and p2pool are independent projects. Monero Farm Panel is not an official or affiliated product of those projects.

## 🧩 Developer architecture

Starting with v1.1.0, source code is grouped by subsystem. New contributors and AI coding assistants should start with [AGENTS.md](AGENTS.md) and [Developer Guide](docs/DEVELOPER_GUIDE.md). The canonical REST prefix is `/api/v1`. Linux/Docker hosts can install the host-side `mfp` CLI for backup, update, health-check and rollback; see [UPDATER.md](docs/UPDATER.md).
