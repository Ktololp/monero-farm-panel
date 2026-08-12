# ADR 0001: Agentless SSH management

## Context
Mining hosts should remain easy to deploy and recover.

## Decision
Use SSH as the management boundary instead of installing a custom MFP agent on every miner. XMRig API may remain localhost-only and is queried after SSH access.

## Consequences
Credential/host-key handling is security-critical; remote commands must never accidentally execute on the panel host.
