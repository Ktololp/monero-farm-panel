# ADR 0004: Localhost XMRig API

## Context
Opening miner-management APIs to LAN/Internet creates unnecessary exposure.

## Decision
Default XMRig API to 127.0.0.1:60050 and access it through the authenticated SSH session.

## Consequences
No XMRig API port-forward/firewall opening is required.
