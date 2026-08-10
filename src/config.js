import path from 'node:path';

const bool = (name, fallback) => {
  const v = process.env[name];
  if (v == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};
const int = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
};

export const config = {
  port: int('PORT', 3000),
  dataDir: process.env.DATA_DIR || path.resolve('data'),
  certDir: process.env.CERT_DIR || path.resolve('certs'),
  tlsPfxPath: process.env.TLS_PFX_PATH || '',
  tlsPfxPassphrase: process.env.TLS_PFX_PASSPHRASE || '',
  httpsEnabled: bool('HTTPS_ENABLED', true),
  cookieSecure: bool('COOKIE_SECURE', true),
  trustProxy: int('TRUST_PROXY', 0),
  adminPassword: process.env.PANEL_ADMIN_PASSWORD || '',
  encryptionKey: process.env.PANEL_ENCRYPTION_KEY || '',
  sessionSecret: process.env.PANEL_SESSION_SECRET || '',
  sshAuthSock: process.env.SSH_AUTH_SOCK || '',
  panelPublicKey: process.env.PANEL_SSH_PUBLIC_KEY || '',
  pollIntervalMs: int('POLL_INTERVAL_MS', 15000),
  historyIntervalMs: int('HISTORY_INTERVAL_MS', 60000),
  historyRetentionDays: int('HISTORY_RETENTION_DAYS', 30),
  nodeEnv: process.env.NODE_ENV || 'development'
};

export function validateConfig() {
  const errors = [];
  if (!config.adminPassword || config.adminPassword === 'REPLACE_ME') errors.push('PANEL_ADMIN_PASSWORD is not configured');
  if (!config.sessionSecret || config.sessionSecret.length < 24 || config.sessionSecret.startsWith('REPLACE_')) errors.push('PANEL_SESSION_SECRET must be a random string of at least 24 characters');
  try {
    const key = Buffer.from(config.encryptionKey, 'base64');
    if (key.length !== 32) throw new Error('bad length');
  } catch {
    errors.push('PANEL_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64');
  }
  if (errors.length) throw new Error(`Configuration error:\n- ${errors.join('\n- ')}`);
}
