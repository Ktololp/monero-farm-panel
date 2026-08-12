# HTTP API

`router.js` exposes the REST API. Canonical prefix is `/api/v1`; `/api` remains a v1.0 compatibility alias. Keep validation/transport here and move reusable business logic into its subsystem. See `docs/openapi.yaml`.
