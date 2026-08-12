# Developer Guide

## Goal
The source tree is optimized for fast comprehension by a new human contributor or an AI coding assistant. A contributor should be able to find the correct subsystem before reading implementation details.

## Architecture
The panel is a centralized controller. Mining servers stay simple: SSH + XMRig localhost API are enough. The panel collects state, stores history, evaluates health and exposes REST/Socket.IO to the browser.

### Backend boundaries
- `app`: startup and lifecycle wiring only.
- `api`: HTTP transport, input validation and DTO assembly.
- `ssh`: remote transport/security boundary.
- `monitoring`: read-mostly polling, baseline, degradation and recovery decisions.
- `operations`: explicit privileged/state-changing actions.
- `database`: persistence.
- `alerts/jobs/realtime/market/updates`: focused services.
- `miners`: component-specific public entry points and the preferred home for future XMRig/p2pool/monerod-specific logic.

### Frontend boundaries
The UI remains framework-free. Keep navigation/application state in `web/app`; reusable visual logic belongs under `web/components`; CSS belongs under `web/styles`. Chart scale math must remain independent of Chart.js so it can be unit-tested.

## API compatibility
`/api/v1` is canonical. `/api` remains a compatibility alias for v1.0 installations. New breaking API behavior requires a new versioned prefix rather than silently changing v1 semantics.

## Database compatibility
Never ask users to delete the database for an update. Schema changes are additive/idempotent and documented in `src/database/migrations/`. The host updater backs up persistent data before changing images.

## Release workflow
1. Develop and test locally on Windows.
2. Run `npm run check`, `npm test`, `npm run build:web`.
3. Push to `main` and wait for green CI.
4. Test the same code on the Chuwi/Docker appliance.
5. Only then tag `vX.Y.Z`; the release workflow publishes archive/checksum and multi-arch GHCR images.

No beta branch/channel is used; `main` is kept release-quality by this process.

## Host updater
`scripts/mfp` lives outside the container after installation. That is deliberate: a broken application container must not be responsible for restoring itself. See `docs/UPDATER.md`.
