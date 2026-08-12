import { decryptSecret, encryptSecret } from '../security/crypto.js';
import { db } from './connection.js';

export function getSettings({ includeSecrets = false } = {}) {
  const rows = db.prepare('SELECT key,value,secret FROM settings ORDER BY key').all();
  const out = {};
  for (const row of rows) {
    if (row.secret) out[row.key] = includeSecrets ? decryptSecret(row.value) : (row.value ? '••••••••' : '');
    else out[row.key] = row.value ?? '';
  }
  return out;
}

export function getSetting(key, { decrypt = true } = {}) {
  const row = db.prepare('SELECT value,secret FROM settings WHERE key=?').get(key);
  if (!row) return '';
  return row.secret && decrypt ? decryptSecret(row.value) : (row.value ?? '');
}

export function setSettings(patch, secretKeys = new Set(['telegram_bot_token'])) {
  const stmt = db.prepare(`INSERT INTO settings(key,value,secret,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, secret=excluded.secret, updated_at=excluded.updated_at`);
  const tx = db.transaction(() => {
    for (const [key, raw] of Object.entries(patch)) {
      if (raw === undefined) continue;
      const secret = secretKeys.has(key);
      if (secret && (raw === '••••••••' || raw === '')) continue;
      stmt.run(key, secret ? encryptSecret(String(raw)) : String(raw), secret ? 1 : 0, Date.now());
    }
  });
  tx();
}
