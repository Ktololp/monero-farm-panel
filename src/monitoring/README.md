# Monitoring subsystem

The monitoring subsystem owns live farm telemetry and health evaluation. The public entry point is `index.js`; other subsystems should normally import from that facade.

- `state.js` — in-memory live state and Socket.IO emission hook.
- `telemetry.js` — remote telemetry collection, XMRig summary parsing, CPU temperature parsing, network cache.
- `baseline.js` — per-server learned hashrate baseline.
- `persistence.js` — periodic metrics persistence.
- `alerts.js` — monitoring-derived alert evaluation.
- `recovery.js` — automatic XMRig recovery state and restart policy.
- `poller.js` — polling orchestration, scheduling, per-server polling and history cleanup.
- `history.js` — historical aggregation queries used by API routes.
- `index.js` — stable public facade.

Data flow: scheduler -> poller -> telemetry -> normalized live state -> persistence/alerts/recovery -> Socket.IO.

Monitoring does not expose the XMRig API publicly. Miner and daemon access remains remote through SSH and localhost services on the mining host.
