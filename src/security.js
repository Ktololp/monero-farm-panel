import crypto from 'node:crypto';
import { config } from './config.js';

const key = () => Buffer.from(config.encryptionKey, 'base64');
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function encryptSecret(value) {
  if (value == null || value === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${b64url(iv)}.${b64url(tag)}.${b64url(ciphertext)}`;
}

export function decryptSecret(payload) {
  if (!payload) return '';
  const [version, iv64, tag64, data64] = String(payload).split('.');
  if (version !== 'v1' || !iv64 || !tag64 || !data64) throw new Error('Invalid encrypted secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data64, 'base64url')), decipher.final()]).toString('utf8');
}

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt.${b64url(salt)}.${b64url(derived)}`;
}

export function verifyPassword(password, stored) {
  try {
    const [kind, salt64, hash64] = String(stored).split('.');
    if (kind !== 'scrypt') return false;
    const actual = crypto.scryptSync(String(password), Buffer.from(salt64, 'base64url'), 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(hash64, 'base64url');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sign(data) {
  return b64url(crypto.createHmac('sha256', config.sessionSecret).update(data).digest());
}

export function createSessionToken(ttlSeconds = 12 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iat: now, exp: now + ttlSeconds, nonce: b64url(crypto.randomBytes(12)) }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  try {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return false;
    const expected = sign(payload);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(obj.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 24) {
  return b64url(crypto.randomBytes(bytes));
}

export function parseCookies(header = '') {
  const decode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
  return Object.fromEntries(
    String(header).split(';').map(v => v.trim()).filter(Boolean).map(pair => {
      const idx = pair.indexOf('=');
      const k = idx >= 0 ? pair.slice(0, idx) : pair;
      const v = idx >= 0 ? pair.slice(idx + 1) : '';
      return [decode(k), decode(v)];
    })
  );
}

export function cookieOptions({ httpOnly = true, maxAge = 12 * 60 * 60 * 1000 } = {}) {
  return {
    httpOnly,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge
  };
}

export function redact(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 3)}••••${s.slice(-3)}`;
}
