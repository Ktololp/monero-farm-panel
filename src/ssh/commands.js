import { secret } from './authentication.js';
import { describeSshError } from './errors.js';
import { shellQuote } from './utils.js';

export async function execRemote(manager, server, command, { timeoutMs = 12000, maxBytes = 2_000_000, input = null, pty = false } = {}) {
  const client = await manager.getClient(server);
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', done = false, streamRef = null;
    const timer = setTimeout(() => {
      if (done) return; done = true; try { streamRef?.close?.(); } catch {}
      reject(new Error(`SSH command timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    client.exec(command, pty ? { pty: true } : {}, (err, stream) => {
      if (err) { clearTimeout(timer); done = true; return reject(new Error(describeSshError(err, server), { cause: err })); }
      streamRef = stream;
      stream.on('data', chunk => { if (stdout.length < maxBytes) stdout += chunk.toString('utf8'); });
      stream.stderr.on('data', chunk => { if (stderr.length < maxBytes) stderr += chunk.toString('utf8'); });
      stream.on('close', (code, signal) => {
        if (done) return; done = true; clearTimeout(timer);
        resolve({ code: Number.isInteger(code) ? code : 0, signal, stdout, stderr });
      });
      stream.on('error', err2 => {
        if (done) return; done = true; clearTimeout(timer);
        reject(new Error(describeSshError(err2, server), { cause: err2 }));
      });
      if (input != null) { stream.write(input); stream.end(); }
    });
  });
}

export async function sudoExecRemote(manager, server, command, opts = {}) {
  const sudoPassword = secret(server.sudo_password_enc);
  const wrapped = sudoPassword ? `sudo -S -p '' -- sh -lc ${shellQuote(command)}` : `sudo -n -- sh -lc ${shellQuote(command)}`;
  const input = sudoPassword ? `${sudoPassword}\n${opts.input || ''}` : (opts.input ?? null);
  return execRemote(manager, server, wrapped, { ...opts, input });
}

export async function runRemoteScript(manager, server, script, env = {}, { sudo = true, timeoutMs = 30 * 60 * 1000 } = {}) {
  const exports = Object.entries(env).map(([k, v]) => {
    if (!/^[A-Z0-9_]+$/.test(k)) throw new Error(`Unsafe environment name: ${k}`);
    return `export ${k}=${shellQuote(v)}`;
  }).join('\n');
  const payload = `${exports}\n${script}\n`;
  const encoded = Buffer.from(payload, 'utf8').toString('base64');
  const command = `printf %s ${shellQuote(encoded)} | base64 -d | bash`;
  if (!sudo) return execRemote(manager, server, command, { timeoutMs, maxBytes: 8_000_000 });
  return sudoExecRemote(manager, server, command, { timeoutMs, maxBytes: 8_000_000 });
}
