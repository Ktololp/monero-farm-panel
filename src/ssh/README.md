# SSH transport

This directory is the security and transport boundary for every remote miner action. Mining-management commands must execute on the miner through this subsystem, never on the panel host.

## Files
- `index.js` — small stable facade exported to the rest of the application.
- `authentication.js` — password/private-key/ssh-agent configuration and keyboard-interactive support.
- `connection-manager.js` — connection pool, host-key pinning, reconnects and connection tests.
- `commands.js` — command execution, sudo wrapping and remote script execution.
- `terminal.js` — interactive xterm-compatible shell opening.
- `errors.js` — operator-facing SSH error diagnostics.
- `utils.js` — shell quoting and systemd service-name validation.

## Security rules
Secrets are decrypted only at the point where ssh2/sudo needs them. Never log passwords, private keys, passphrases or sudo passwords. Host keys use trust-on-first-use and are pinned for later connections.
