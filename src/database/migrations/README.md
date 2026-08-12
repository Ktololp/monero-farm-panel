# Migration policy

Never require users to recreate `data/panel.sqlite3`. Each schema change must be forward-compatible, idempotent and backed up by the host updater before deployment. v1.1.0 keeps the existing additive `ensureColumn` mechanism; future numbered migrations belong here.
