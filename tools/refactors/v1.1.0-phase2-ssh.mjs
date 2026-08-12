#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = rel => path.join(root, ...rel.split('/'));
const read = rel => fs.readFileSync(p(rel), 'utf8');
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), content.replace(/\r\n/g, '\n'), 'utf8');
  console.log(`[phase2/ssh] wrote ${rel}`);
};
const fail = msg => { console.error(`[phase2/ssh] ERROR: ${msg}`); process.exit(1); };

if (!fs.existsSync(p('src/ssh/index.js'))) fail('src/ssh/index.js not found. Run the v1.1.0 layout migration first.');
const source = read('src/ssh/index.js');
for (const marker of ['export function shellQuote', 'export function safeServiceName', 'export function describeSshError', 'export function serverAuthConfig', 'export class SSHManager', 'export const ssh = new SSHManager()']) {
  if (!source.includes(marker)) fail(`Unexpected src/ssh/index.js layout; missing marker: ${marker}`);
}

write('src/ssh/utils.js', `/** Shell-safe helpers used by remote commands. */
export function shellQuote(value) {
  return \`'\${String(value ?? '').replace(/'/g, \`'"'"'\`)}'\`;
}

export function safeServiceName(name) {
  const s = String(name || '');
  if (!/^[A-Za-z0-9_.@-]+$/.test(s)) throw new Error('Invalid systemd service name');
  return s;
}
`);

write('src/ssh/errors.js', `function authLabel(type) {
  return ({ password: 'пароль', key: 'приватный ключ', agent: 'SSH-агент' })[type] || type;
}

/** Turn low-level ssh2/network failures into operator-facing diagnostics. */
export function describeSshError(error, server = {}) {
  const message = error?.message || String(error || 'Неизвестная ошибка SSH');
  const code = error?.code || '';
  if (code === 'ECONNREFUSED') return \`SSH-порт \${server.port || 22} отклоняет соединение на \${server.host}. Проверьте sshd и firewall.\`;
  if (code === 'ETIMEDOUT' || /timed? out|timeout/i.test(message)) return \`Таймаут подключения к \${server.host}:\${server.port || 22}. Проверьте IP, порт и доступность узла из компьютера с панелью.\`;
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return \`Нет маршрута до \${server.host}. Проверьте сеть/VPN и IP-адрес.\`;
  if (/All configured authentication methods failed/i.test(message)) {
    return \`SSH-сервер доступен, но авторизация (\${authLabel(server.auth_type)}) отклонена. Для пароля проверьте логин/пароль и PasswordAuthentication/KbdInteractiveAuthentication в sshd.\`;
  }
  if (/Cannot parse privateKey|privateKey|parse key/i.test(message)) return \`Не удалось прочитать приватный SSH-ключ. Нужен полный OpenSSH/PEM private key, а не файл .pub. \${message}\`;
  if (/agent/i.test(message) && /ENOENT|connect|socket|pipe|not configured/i.test(message)) return \`Не удалось подключиться к SSH-agent панели. \${message}\`;
  if (/Host key verification failed|host key/i.test(message)) return \`SSH host key не совпадает с сохранённым отпечатком. Если сервер переустановлен, сбросьте сохранённый host key в настройках сервера.\`;
  return message;
}
`);

write('src/ssh/authentication.js', `import { config } from '../config/index.js';
import { decryptSecret } from '../security/crypto.js';

export function secret(value) {
  return value ? decryptSecret(value) : '';
}

/** Build the ssh2 connect configuration without logging credentials. */
export function serverAuthConfig(server) {
  const cfg = {
    host: server.host,
    port: Number(server.port || 22),
    username: server.username,
    readyTimeout: 12_000,
    keepaliveInterval: 15_000,
    keepaliveCountMax: 3,
    hostHash: 'sha256'
  };

  if (server.auth_type === 'agent') {
    if (!config.sshAuthSock) throw new Error('SSH_AUTH_SOCK не настроен на центральной панели');
    cfg.agent = config.sshAuthSock;
  } else if (server.auth_type === 'password') {
    const password = secret(server.password_enc);
    if (!password) throw new Error('Для авторизации по паролю укажите SSH-пароль');
    cfg.password = password;
    cfg.tryKeyboard = true;
  } else if (server.auth_type === 'key') {
    const privateKey = secret(server.private_key_enc);
    if (!privateKey) throw new Error('Для авторизации по ключу укажите приватный SSH-ключ');
    cfg.privateKey = privateKey;
    const passphrase = secret(server.private_key_passphrase_enc);
    if (passphrase) cfg.passphrase = passphrase;
  } else {
    throw new Error(\`Unsupported SSH auth type: \${server.auth_type}\`);
  }
  return cfg;
}

/** Ubuntu/OpenSSH+PAM can expose password auth as keyboard-interactive. */
export function attachKeyboardInteractive(client, server) {
  if (server.auth_type !== 'password') return;
  const password = secret(server.password_enc);
  client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
    finish(prompts.map(() => password));
  });
}
`);

write('src/ssh/connection-manager.js', `import crypto from 'node:crypto';
import { Client } from 'ssh2';
import { db } from '../database/index.js';
import { attachKeyboardInteractive, serverAuthConfig } from './authentication.js';
import { describeSshError } from './errors.js';

/** Owns SSH connection pooling, host-key pinning and connection tests. */
export class SSHConnectionManager {
  constructor() { this.pool = new Map(); }

  fingerprint(server) {
    return crypto.createHash('sha256').update(JSON.stringify({
      host: server.host, port: server.port, username: server.username, auth: server.auth_type,
      p: server.password_enc, k: server.private_key_enc, kp: server.private_key_passphrase_enc
    })).digest('hex');
  }

  invalidate(serverId) {
    const id = Number(serverId);
    const item = this.pool.get(id);
    if (item) { this.pool.delete(id); try { item.client.end(); } catch {} }
  }

  async getClient(server) {
    const id = Number(server.id || 0);
    const fp = this.fingerprint(server);
    const existing = this.pool.get(id);
    if (existing && existing.fingerprint === fp && existing.ready) return existing.client;
    if (existing && existing.fingerprint === fp && existing.promise) return existing.promise;
    if (existing) this.invalidate(id);

    const client = new Client();
    const connectConfig = serverAuthConfig(server);
    attachKeyboardInteractive(client, server);
    connectConfig.hostVerifier = (hash) => {
      const known = server.host_fingerprint;
      if (!known) {
        if (id) db.prepare('UPDATE servers SET host_fingerprint=?, updated_at=? WHERE id=?').run(hash, Date.now(), id);
        server.host_fingerprint = hash;
        return true;
      }
      const a = Buffer.from(String(known));
      const b = Buffer.from(String(hash));
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    };

    const item = { client, fingerprint: fp, ready: false, promise: null, lastError: null };
    let settleReject = null;
    let settled = false;

    client.on('error', (err) => {
      item.lastError = err;
      if (!settled && settleReject) {
        settled = true; this.pool.delete(id);
        settleReject(new Error(describeSshError(err, server), { cause: err }));
      } else {
        console.error(\`[ssh] \${server.username}@\${server.host}:\${server.port || 22}:\`, describeSshError(err, server));
        if (this.pool.get(id)?.client === client) this.pool.delete(id);
      }
    });
    client.on('close', () => {
      item.ready = false;
      if (!settled && settleReject) {
        settled = true;
        settleReject(new Error(\`SSH-соединение с \${server.host}:\${server.port || 22} закрылось до завершения авторизации\`));
      }
      if (this.pool.get(id)?.client === client) this.pool.delete(id);
    });

    const promise = new Promise((resolve, reject) => {
      settleReject = reject;
      client.once('ready', () => {
        if (settled) return;
        settled = true; item.ready = true; item.promise = null; resolve(client);
      });
      try { client.connect(connectConfig); }
      catch (err) {
        if (settled) return;
        settled = true; this.pool.delete(id);
        reject(new Error(describeSshError(err, server), { cause: err }));
      }
    });

    item.promise = promise;
    this.pool.set(id, item);
    return promise;
  }

  async testConnection(server, { timeoutMs = 12_000 } = {}) {
    const client = new Client();
    const connectConfig = serverAuthConfig(server);
    let hostFingerprint = '';
    let negotiated = null;
    let banner = '';
    connectConfig.readyTimeout = timeoutMs;
    connectConfig.hostVerifier = (hash) => { hostFingerprint = String(hash || ''); return true; };
    attachKeyboardInteractive(client, server);

    let timer = null;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finishError = (err) => {
        if (finished) return;
        finished = true; try { client.end(); } catch {}
        reject(new Error(describeSshError(err, server), { cause: err }));
      };
      timer = setTimeout(() => finishError(Object.assign(new Error('SSH connection timeout'), { code: 'ETIMEDOUT' })), timeoutMs + 1000);
      client.on('banner', text => { banner = String(text || '').trim(); });
      client.on('handshake', details => { negotiated = details || null; });
      client.on('error', finishError);
      client.once('ready', () => {
        client.exec("printf 'ok\\n'; uname -srmo; printf 'user='; id -un", (err, stream) => {
          if (err) return finishError(err);
          let stdout = '', stderr = '';
          stream.on('data', chunk => { if (stdout.length < 200_000) stdout += chunk.toString('utf8'); });
          stream.stderr.on('data', chunk => { if (stderr.length < 200_000) stderr += chunk.toString('utf8'); });
          stream.on('error', finishError);
          stream.on('close', (code) => {
            if (finished) return;
            finished = true; clearTimeout(timer); try { client.end(); } catch {}
            resolve({ ok: code === 0 && /^ok\\r?\\n/.test(stdout), code: Number.isInteger(code) ? code : 0,
              stdout: stdout.trim(), stderr: stderr.trim(), authType: server.auth_type, hostFingerprint, banner, negotiated });
          });
        });
      });
      try { client.connect(connectConfig); } catch (err) { finishError(err); }
    }).finally(() => clearTimeout(timer));
  }

  closeAll() {
    for (const item of this.pool.values()) { try { item.client.end(); } catch {} }
    this.pool.clear();
  }
}
`);

write('src/ssh/commands.js', `import { secret } from './authentication.js';
import { describeSshError } from './errors.js';
import { shellQuote } from './utils.js';

export async function execRemote(manager, server, command, { timeoutMs = 12000, maxBytes = 2_000_000, input = null, pty = false } = {}) {
  const client = await manager.getClient(server);
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', done = false, streamRef = null;
    const timer = setTimeout(() => {
      if (done) return; done = true; try { streamRef?.close?.(); } catch {}
      reject(new Error(\`SSH command timeout after \${timeoutMs}ms\`));
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
  const wrapped = sudoPassword ? \`sudo -S -p '' -- sh -lc \${shellQuote(command)}\` : \`sudo -n -- sh -lc \${shellQuote(command)}\`;
  const input = sudoPassword ? \`\${sudoPassword}\\n\${opts.input || ''}\` : (opts.input ?? null);
  return execRemote(manager, server, wrapped, { ...opts, input });
}

export async function runRemoteScript(manager, server, script, env = {}, { sudo = true, timeoutMs = 30 * 60 * 1000 } = {}) {
  const exports = Object.entries(env).map(([k, v]) => {
    if (!/^[A-Z0-9_]+$/.test(k)) throw new Error(\`Unsafe environment name: \${k}\`);
    return \`export \${k}=\${shellQuote(v)}\`;
  }).join('\\n');
  const payload = \`\${exports}\\n\${script}\\n\`;
  const encoded = Buffer.from(payload, 'utf8').toString('base64');
  const command = \`printf %s \${shellQuote(encoded)} | base64 -d | bash\`;
  if (!sudo) return execRemote(manager, server, command, { timeoutMs, maxBytes: 8_000_000 });
  return sudoExecRemote(manager, server, command, { timeoutMs, maxBytes: 8_000_000 });
}
`);

write('src/ssh/terminal.js', `import { describeSshError } from './errors.js';
export async function openShell(manager, server, { cols = 100, rows = 30 } = {}) {
  const client = await manager.getClient(server);
  return new Promise((resolve, reject) => {
    client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) =>
      err ? reject(new Error(describeSshError(err, server), { cause: err })) : resolve(stream));
  });
}
`);

write('src/ssh/index.js', `import { SSHConnectionManager } from './connection-manager.js';
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
`);

write('src/ssh/README.md', `# SSH transport

This directory is the security and transport boundary for every remote miner action. Mining-management commands must execute on the miner through this subsystem, never on the panel host.

## Files
- \`index.js\` — small stable facade exported to the rest of the application.
- \`authentication.js\` — password/private-key/ssh-agent configuration and keyboard-interactive support.
- \`connection-manager.js\` — connection pool, host-key pinning, reconnects and connection tests.
- \`commands.js\` — command execution, sudo wrapping and remote script execution.
- \`terminal.js\` — interactive xterm-compatible shell opening.
- \`errors.js\` — operator-facing SSH error diagnostics.
- \`utils.js\` — shell quoting and systemd service-name validation.

## Security rules
Secrets are decrypted only at the point where ssh2/sudo needs them. Never log passwords, private keys, passphrases or sudo passwords. Host keys use trust-on-first-use and are pinned for later connections.
`);

write('test/ssh-layout.test.js', `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = ['src/ssh/index.js','src/ssh/authentication.js','src/ssh/connection-manager.js','src/ssh/commands.js','src/ssh/terminal.js','src/ssh/errors.js','src/ssh/utils.js','src/ssh/README.md'];
test('SSH subsystem has explicit responsibility files',()=>{for(const file of files)assert.equal(fs.existsSync(file),true,'missing '+file);});
test('SSH index stays a small stable facade',()=>{const lines=fs.readFileSync('src/ssh/index.js','utf8').split(/\\r?\\n/).length;assert.ok(lines<=35,\`src/ssh/index.js is too large: \${lines} lines\`);});
`);

console.log('[phase2/ssh] OK');
console.log('[phase2/ssh] src/ssh/index.js is now a small stable facade.');
console.log('[phase2/ssh] Next: npm run check && npm test');
