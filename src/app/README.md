# Application lifecycle

Entry point and HTTP/Socket.IO lifecycle. `src/start.js` is a stable compatibility shim; real bootstrap is `src/app/start.js`. `server.js` wires infrastructure together and should contain orchestration, not mining business logic.
