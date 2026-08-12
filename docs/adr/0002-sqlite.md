# ADR 0002: SQLite persistence

## Context
The target is a home/small-server farm with simple backup/restore.

## Decision
Use SQLite with WAL and additive in-place upgrades.

## Consequences
No external database service is required. Updates must preserve `data/` and back it up before migrations.
