import { describeSshError } from './errors.js';
export async function openShell(manager, server, { cols = 100, rows = 30 } = {}) {
  const client = await manager.getClient(server);
  return new Promise((resolve, reject) => {
    client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) =>
      err ? reject(new Error(describeSshError(err, server), { cause: err })) : resolve(stream));
  });
}
