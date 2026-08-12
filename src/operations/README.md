# Operations subsystem

The operations subsystem owns explicit remote management actions. The public entry point is index.js.

- server.js — server lookup plus wallet/pool validation shared by operations.
- xmrig-config.js — read/write/apply XMRig configuration.
- miner-control.js — XMRig restart and health wait.
- performance.js — RandomX performance profiles.
- huge-pages.js — host Huge Pages changes.
- msr.js — MSR configuration and module loading.
- auto-fix.js — discovery-assisted repair actions.
- logs.js — XMRig, p2pool and monerod log retrieval.
- remote-command.js — audited arbitrary SSH command execution.
- bootstrap.js — remote bootstrap script orchestration.
- rolling.js — rolling restart and XMRig rolling update/rollback.
- index.js — stable public facade.

Operations may change remote hosts. Monitoring remains read/observe-oriented except for its narrowly scoped auto-recovery policy.
