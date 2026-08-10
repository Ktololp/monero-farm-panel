import crypto from 'node:crypto';
import { Client } from 'ssh2';
import { db } from './db.js';
import { config } from './config.js';
import { decryptSecret } from './security.js';

export function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'"'"'`)}'`;
}

export function safeServiceName(name) {
  const s = String(name || '');
  if (!/^[A-Za-z0-9_.@-]+$/.test(s)) throw new Error('Invalid systemd service name');
  return s;
}

function secret(v) {
  return v ? decryptSecret(v) : '';
}

function authLabel(type) {
  return ({ password: 'пароль', key: 'приватный ключ', agent: 'SSH-агент' })[type] || type;
}

export function describeSshError(error, server = {}) {
  const message = error?.message || String(error || 'Неизвестная ошибка SSH');
  const code = error?.code || '';
  if (code === 'ECONNREFUSED') return `SSH-порт ${server.port || 22} отклоняет соединение на ${server.host}. Проверьте sshd и firewall.`;
  if (code === 'ETIMEDOUT' || /timed? out|timeout/i.test(message)) return `Таймаут подключения к ${server.host}:${server.port || 22}. Проверьте IP, порт и доступность узла из компьютера с панелью.`;
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return `Нет маршрута до ${server.host}. Проверьте сеть/VPN и IP-адрес.`;
  if (/All configured authentication methods failed/i.test(message)) {
    return `SSH-сервер доступен, но авторизация (${authLabel(server.auth_type)}) отклонена. Для пароля проверьте логин/пароль и PasswordAuthentication/KbdInteractiveAuthentication в sshd.`;
  }
  if (/Cannot parse privateKey|privateKey|parse key/i.test(message)) return `Не удалось прочитать приватный SSH-ключ. Нужен полный OpenSSH/PEM private key, а не файл .pub. ${message}`;
  if (/agent/i.test(message) && /ENOENT|connect|socket|pipe|not configured/i.test(message)) return `Не удалось подключиться к SSH-agent панели. ${message}`;
  if (/Host key verification failed|host key/i.test(message)) return `SSH host key не совпадает с сохранённым отпечатком. Если сервер переустановлен, сбросьте сохранённый host key в настройках сервера.`;
  return message;
}

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
    // Ubuntu/OpenSSH+PAM may expose password login as keyboard-interactive.
    cfg.tryKeyboard = true;
  } else if (server.auth_type === 'key') {
    const privateKey = secret(server.private_key_enc);
    if (!privateKey) throw new Error('Для авторизации по ключу укажите приватный SSH-ключ');
    cfg.privateKey = privateKey;
    const passphrase = secret(server.private_key_passphrase_enc);
    if (passphrase) cfg.passphrase = passphrase;
  } else {
    throw new Error(`Unsupported SSH auth type: ${server.auth_type}`);
  }
  return cfg;
}

function attachKeyboardInteractive(client, server) {
  if (server.auth_type !== 'password') return;
  const password = secret(server.password_enc);
  client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
    // Only answer password-style prompts; never echo or log the secret.
    finish(prompts.map(() => password));
  });
}

export class SSHManager {
  constructor() {
    this.pool = new Map();
  }

  fingerprint(server) {
    return crypto.createHash('sha256').update(JSON.stringify({
      host: server.host, port: server.port, username: server.username, auth: server.auth_type,
      p: server.password_enc, k: server.private_key_enc, kp: server.private_key_passphrase_enc
    })).digest('hex');
  }

  invalidate(serverId) {
    const id = Number(serverId);
    const item = this.pool.get(id);
    if (item) {
      this.pool.delete(id);
      try { item.client.end(); } catch {}
    }
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
        return true; // Trust on first use; subsequent connections are pinned.
      }
      const a = Buffer.from(String(known));
      const b = Buffer.from(String(hash));
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    };

    const item = { client, fingerprint: fp, ready: false, promise: null, lastError: null };
    let settleReject = null;
    let settled = false;

    // Keep a permanent error listener. EventEmitters with no error listener can terminate Node.js.
    client.on('error', (err) => {
      item.lastError = err;
      if (!settled && settleReject) {
        settled = true;
        this.pool.delete(id);
        settleReject(new Error(describeSshError(err, server), { cause: err }));
      } else {
        console.error(`[ssh] ${server.username}@${server.host}:${server.port || 22}:`, describeSshError(err, server));
        if (this.pool.get(id)?.client === client) this.pool.delete(id);
      }
    });
    client.on('close', () => {
      item.ready = false;
      if (!settled && settleReject) {
        settled = true;
        settleReject(new Error(`SSH-соединение с ${server.host}:${server.port || 22} закрылось до завершения авторизации`));
      }
      if (this.pool.get(id)?.client === client) this.pool.delete(id);
    });

    const promise = new Promise((resolve, reject) => {
      settleReject = reject;
      client.once('ready', () => {
        if (settled) return;
        settled = true;
        item.ready = true;
        item.promise = null;
        resolve(client);
      });
      try {
        client.connect(connectConfig);
      } catch (err) {
        if (settled) return;
        settled = true;
        this.pool.delete(id);
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
        finished = true;
        try { client.end(); } catch {}
        reject(new Error(describeSshError(err, server), { cause: err }));
      };
      timer = setTimeout(() => finishError(Object.assign(new Error('SSH connection timeout'), { code: 'ETIMEDOUT' })), timeoutMs + 1000);

      client.on('banner', text => { banner = String(text || '').trim(); });
      client.on('handshake', details => { negotiated = details || null; });
      client.on('error', finishError); // permanent listener prevents uncaught EventEmitter errors
      client.once('ready', () => {
        client.exec("printf 'ok\\n'; uname -srmo; printf 'user='; id -un", (err, stream) => {
          if (err) return finishError(err);
          let stdout = '';
          let stderr = '';
          stream.on('data', chunk => { if (stdout.length < 200_000) stdout += chunk.toString('utf8'); });
          stream.stderr.on('data', chunk => { if (stderr.length < 200_000) stderr += chunk.toString('utf8'); });
          stream.on('error', finishError);
          stream.on('close', (code) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { client.end(); } catch {}
            resolve({
              ok: code === 0 && /^ok\r?\n/.test(stdout),
              code: Number.isInteger(code) ? code : 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              authType: server.auth_type,
              hostFingerprint,
              banner,
              negotiated
            });
          });
        });
      });
      try { client.connect(connectConfig); }
      catch (err) { finishError(err); }
    }).finally(() => clearTimeout(timer));
  }

  async exec(server, command, { timeoutMs = 12000, maxBytes = 2_000_000, input = null, pty = false } = {}) {
    const client = await this.getClient(server);
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let done = false;
      let streamRef = null;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { streamRef?.close?.(); } catch {}
        reject(new Error(`SSH command timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      client.exec(command, pty ? { pty: true } : {}, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          done = true;
          return reject(new Error(describeSshError(err, server), { cause: err }));
        }
        streamRef = stream;
        stream.on('data', chunk => {
          if (stdout.length < maxBytes) stdout += chunk.toString('utf8');
        });
        stream.stderr.on('data', chunk => {
          if (stderr.length < maxBytes) stderr += chunk.toString('utf8');
        });
        stream.on('close', (code, signal) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ code: Number.isInteger(code) ? code : 0, signal, stdout, stderr });
        });
        stream.on('error', err2 => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(new Error(describeSshError(err2, server), { cause: err2 }));
        });
        if (input != null) {
          stream.write(input);
          stream.end();
        }
      });
    });
  }

  async sudoExec(server, command, opts = {}) {
    const sudoPassword = secret(server.sudo_password_enc);
    const wrapped = sudoPassword
      ? `sudo -S -p '' -- sh -lc ${shellQuote(command)}`
      : `sudo -n -- sh -lc ${shellQuote(command)}`;
    const input = sudoPassword ? `${sudoPassword}\n${opts.input || ''}` : (opts.input ?? null);
    return this.exec(server, wrapped, { ...opts, input });
  }

  async runScript(server, script, env = {}, { sudo = true, timeoutMs = 30 * 60 * 1000 } = {}) {
    const exports = Object.entries(env).map(([k, v]) => {
      if (!/^[A-Z0-9_]+$/.test(k)) throw new Error(`Unsafe environment name: ${k}`);
      return `export ${k}=${shellQuote(v)}`;
    }).join('\n');
    const payload = `${exports}\n${script}\n`;
    const encoded = Buffer.from(payload, 'utf8').toString('base64');
    const command = `printf %s ${shellQuote(encoded)} | base64 -d | bash`;
    if (!sudo) return this.exec(server, command, { timeoutMs, maxBytes: 8_000_000 });
    return this.sudoExec(server, command, { timeoutMs, maxBytes: 8_000_000 });
  }

  async shell(server, { cols = 100, rows = 30 } = {}) {
    const client = await this.getClient(server);
    return new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => err ? reject(new Error(describeSshError(err, server), { cause: err })) : resolve(stream));
    });
  }

  closeAll() {
    for (const item of this.pool.values()) {
      try { item.client.end(); } catch {}
    }
    this.pool.clear();
  }
}

export const ssh = new SSHManager();
