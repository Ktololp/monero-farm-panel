# Frontend application core

The browser UI is intentionally framework-free. `main.js` is the composition root and router while reusable infrastructure is split by responsibility.

- `ui.js` — DOM selectors, escaping and display formatting.
- `../services/api.js` — versioned HTTP API client and CSRF handling.
- `../components/charts/registry.js` — Chart.js instance lifecycle.
- `../components/charts/scales.js` — stable visual scaling rules.
- `../components/terminal/index.js` — xterm.js SSH terminal lifecycle.
- `main.js` — login, Socket.IO orchestration, navigation and page composition.

Phase 2b moves page renderers from `main.js` into `web/pages/` without changing the visual design.
