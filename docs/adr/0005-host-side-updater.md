# ADR 0005: Host-side updater

## Context
An application container cannot reliably repair/replace itself if the image is broken.

## Decision
Install a small `mfp` command on the Linux host. It owns backup, image pull, replacement, health check and rollback.

## Consequences
Persistent state stays outside the container and failed releases can be rolled back independently of the application process.
