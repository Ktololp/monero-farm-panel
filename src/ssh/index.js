import { SSHConnectionManager } from './connection-manager.js';
import { execRemote, runRemoteScript, sudoExecRemote } from './commands.js';
import { openShell } from './terminal.js';
export { serverAuthConfig } from './authentication.js';
export { describeSshError } from './errors.js';
export { safeServiceName, shellQuote } from './utils.js';

/** Stable SSH facade used by the rest of the application. */
export class SSHManager extends SSHConnectionManager {
  exec(server, command, opts) { return execRemote(this, server, command, opts); }
  sudoExec(server, command, opts) { return sudoExecRemote(this, server, command, opts); }
  runScript(server, script, env, opts) { return runRemoteScript(this, server, script, env, opts); }
  shell(server, opts) { return openShell(this, server, opts); }
}
export const ssh = new SSHManager();
