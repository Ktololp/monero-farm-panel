# Discovery subsystem

The discovery subsystem detects the real mining layout of a remote Linux host without requiring an agent.

- `remote-script.js` — the Python inventory script executed remotely over SSH.
- `normalize.js` — validation and normalization of discovered service names and ports.
- `server.js` — database lookup helper for a configured server.
- `index.js` — public discovery API and persistence of accepted inventory data.

Data flow: API/operations -> discovery facade -> SSH -> remote Python inventory -> normalize -> optional database update.

The remote script is intentionally kept separate from the JavaScript orchestration so changes to Linux detection logic are easy to review without reading application control flow.
