# Database subsystem

SQLite persistence for Monero Farm Panel. Other subsystems should normally import only from `src/database/index.js`.

## Files

- `index.js` — public facade; initializes schema/defaults and re-exports the stable database API.
- `connection.js` — opens SQLite and configures WAL, foreign keys and busy timeout.
- `schema.js` — base tables and additive schema upgrades for existing installations.
- `defaults.js` — inserts default settings and performs one-time compatibility cleanup.
- `settings.js` — settings read/write API, including encrypted secret values.
- `admin.js` — admin password hash storage.
- `audit.js` — audit log writes.
- `maintenance.js` — retention cleanup for metrics, actions, alerts and jobs.
- `migrations/` — reserved for future explicit migrations that cannot be expressed as additive column checks.

## Design rules

1. Routes and monitoring code must not open SQLite directly.
2. Keep schema changes backward-compatible whenever possible.
3. Never log decrypted settings/secrets.
4. Existing `data/panel.sqlite3` must survive application updates without manual conversion.
