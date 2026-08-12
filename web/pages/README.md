# Frontend pages

Each page owns its renderer and page-local event handlers. `web/app/main.js` remains the composition root: authentication, Socket.IO, navigation, shared modal helpers and page wiring.

- `dashboard/` — farm summary, alerts and 24h farm chart.
- `servers/` — server cards and sparklines.
- `server/` — per-server tabs: overview, performance, components, system, logs and control.
- `operations/` — fleet rolling actions and performance profiles.
- `updates/` — release status and rolling XMRig updates.
- `topology/` — mining path visualization.
- `settings/` — global settings.
- `audit/` — action journal.

Page modules are factories receiving the application context. This keeps shared state and routing in one place without introducing a framework or duplicating global state.
