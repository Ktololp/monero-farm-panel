# Host-side updater (mfp)

The updater is intentionally installed on the Linux host, outside the application container. If a new image is broken, the old application does not need to be running to restore it.

## Install on an existing Docker host
From the repository directory:

```bash
chmod +x scripts/install-mfp.sh scripts/mfp
./scripts/install-mfp.sh
mfp status
```

The installer writes `/etc/monero-farm-panel/mfp.conf` containing the current repository/data path and installs `/usr/local/bin/mfp`. It does not move or delete `.env`, `data/` or `certs/`.

## Commands
`mfp status` · `mfp update` · `mfp update 1.1.0` · `mfp rollback` · `mfp backup` · `mfp restore FILE` · `mfp logs` · `mfp restart` · `mfp kiosk on|off`.

`mfp update` uses the latest stable GitHub Release. There is no beta channel. It pulls the new multi-arch GHCR image while the old panel is online, stops the container briefly for a consistent backup, starts the new image, waits for `/healthz` and automatically restores the previous data/image when the health check fails.

Backups are stored under `backups/` in the configured MFP directory.
