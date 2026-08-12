# Monero Farm Panel — AI/developer map

Read this file first when changing the project.

## Stack
- Backend: Node.js 20+, Express, Socket.IO
- Frontend: vanilla JavaScript, Chart.js, xterm.js
- Persistence: SQLite via better-sqlite3
- Remote management: SSH only; miners do not require an agent
- Packaging: Windows native + Docker/Linux/ARM64

## Where to look
- App lifecycle: `src/app/`
- REST API: `src/api/` (canonical prefix `/api/v1`)
- Configuration: `src/config/`
- Database: `src/database/`
- SSH transport: `src/ssh/`
- Discovery: `src/discovery/`
- Monitoring/baseline/recovery/history: `src/monitoring/`
- Explicit state changes: `src/operations/`
- Miner-facing entry points: `src/miners/`
- Upstream miner releases: `src/updates/`
- Alerts: `src/alerts/`
- Realtime/terminal: `src/realtime/`
- Frontend: `web/app/`, charts in `web/components/charts/`, styles in `web/styles/`
- Host updater: `scripts/mfp`

## Non-negotiable rules
1. Never execute mining-management commands locally when they are intended for a miner; route them through SSH.
2. Keep XMRig API localhost-only by default.
3. Never ship a default mining wallet. Donation address is documentation only.
4. Do not log plaintext passwords, private keys, sudo passwords, API tokens or encryption keys.
5. Existing SQLite databases must upgrade in place.
6. Preserve recovery grace period + consecutive failures + cooldown; avoid restart loops.
7. Prefer readable files and explicit responsibilities over minimizing file count. Rough guideline: split files that become hard to scan (~300–400 lines).
8. The stable branch is `main`; no beta branch/channel is required.
9. Windows is the first manual test target; Chuwi/Docker is the second; tag a release only after both pass.
10. Keep v1 compatibility aliases when a small compatibility layer avoids breaking existing installations.

## Data flow
`scheduler → SSH / XMRig / system probes → live state → SQLite → Socket.IO/REST → browser`

State-changing flow:
`browser → /api/v1 → operation/job → SSH → miner → audit log → live re-check`

Before a PR/release run: `npm run check && npm test && npm run build:web`.
