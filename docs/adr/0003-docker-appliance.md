# ADR 0003: Docker for appliance hosts

## Context
Older hosts such as Ubuntu 18.04 cannot run current native Node.js because of host libc constraints.

## Decision
Use a modern multi-arch Docker image on appliance hosts while Windows development can remain native Node.js.

## Consequences
The host only needs Docker/curl/git; application runtime dependencies stay isolated.
