import crypto from 'node:crypto';
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
        client.exec("printf 'ok\n'; uname -srmo; printf 'user='; id -un", (err, stream) => {
          if (err) return finishError(err);
          let stdout = '', stderr = '';
          stream.on('data', chunk => { if (stdout.length < 200_000) stdout += chunk.toString('utf8'); });
          stream.stderr.on('data', chunk => { if (stderr.length < 200_000) stderr += chunk.toString('utf8'); });
          stream.on('error', finishError);
          stream.on('close', (code) => {
            if (finished) return;
            finished = true; clearTimeout(timer); try { client.end(); } catch {}
            resolve({ ok: code === 0 && /^ok\r?\n/.test(stdout), code: Number.isInteger(code) ? code : 0,
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
