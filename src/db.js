import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { encryptSecret, decryptSecret, hashPassword } from './security.js';

fs.mkdirSync(config.dataDir, { recursive: true });
const dbPath = path.join(config.dataDir, 'panel.sqlite3');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'agent',
  password_enc TEXT,
  private_key_enc TEXT,
  private_key_passphrase_enc TEXT,
  sudo_password_enc TEXT,
  xmrig_api_token_enc TEXT,
  host_fingerprint TEXT,
  xmrig_api_port INTEGER NOT NULL DEFAULT 60050,
  xmrig_config_path TEXT NOT NULL DEFAULT '/opt/xmrig/config.json',
  xmrig_service TEXT NOT NULL DEFAULT 'xmrig',
  p2pool_service TEXT NOT NULL DEFAULT 'p2pool',
  p2pool_log_path TEXT NOT NULL DEFAULT '/var/log/p2pool.log',
  enabled INTEGER NOT NULL DEFAULT 1,
  tags TEXT NOT NULL DEFAULT '',
  hash_min REAL,
  temp_max REAL,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(host, port, username)
);
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  hash_10s REAL,
  hash_60s REAL,
  hash_15m REAL,
  temp_c REAL,
  accepted INTEGER,
  rejected INTEGER,
  uptime INTEGER,
  version TEXT,
  pool TEXT,
  p2pool_status TEXT,
  error_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_metrics_server_ts ON metrics(server_id, ts);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  secret INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  ip TEXT,
  server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_actions_ts ON actions(ts DESC);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  message TEXT NOT NULL,
  first_ts INTEGER NOT NULL,
  last_ts INTEGER NOT NULL,
  last_notified_ts INTEGER,
  UNIQUE(server_id, type, state)
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  title TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  current_server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
  details TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
`);

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === column);
}
function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Schema upgrades are additive so an existing farm database survives application updates.
ensureColumn('servers', 'icon', `TEXT NOT NULL DEFAULT '🖥️'`);
ensureColumn('servers', 'monerod_service', `TEXT NOT NULL DEFAULT 'monerod'`);
ensureColumn('servers', 'monerod_rpc_port', `INTEGER NOT NULL DEFAULT 18081`);
ensureColumn('servers', 'monerod_log_path', `TEXT NOT NULL DEFAULT '/var/log/monero/monero.log'`);
ensureColumn('servers', 'performance_profile', `TEXT NOT NULL DEFAULT 'maximum'`);
ensureColumn('servers', 'performance_backup_json', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('servers', 'discovery_json', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('servers', 'discovered_at', `INTEGER`);
ensureColumn('metrics', 'cpu_mhz', `REAL`);
ensureColumn('metrics', 'load_1', `REAL`);
ensureColumn('metrics', 'load_5', `REAL`);
ensureColumn('metrics', 'load_15', `REAL`);
ensureColumn('metrics', 'hugepages_total', `INTEGER`);
ensureColumn('metrics', 'hugepages_free', `INTEGER`);
ensureColumn('metrics', 'hugepages_1g_total', `INTEGER`);
ensureColumn('metrics', 'hugepages_1g_free', `INTEGER`);
ensureColumn('metrics', 'msr_status', `TEXT`);
ensureColumn('metrics', 'xmrig_status', `TEXT`);
ensureColumn('metrics', 'monerod_status', `TEXT`);
ensureColumn('metrics', 'monero_height', `INTEGER`);
ensureColumn('metrics', 'monero_target_height', `INTEGER`);
ensureColumn('metrics', 'network_status', `TEXT`);
ensureColumn('metrics', 'baseline_hash', `REAL`);

const now = Date.now();
const defaults = {
  wallet: '',
  pool_url: '127.0.0.1:3333',
  pool_pass: 'x',
  pool_tls: '0',
  xmrig_version: '6.26.0',
  temp_warn: '80',
  temp_critical: '90',
  hash_drop_percent: '20',
  offline_after_seconds: '90',
  alert_cooldown_seconds: '900',
  history_retention_days: String(config.historyRetentionDays),
  auto_apply_config: '0',
  huge_pages_enabled: '1',
  huge_pages_1g: '1',
  huge_pages_count: '5',
  msr_enabled: '1',
  telegram_enabled: '0',
  telegram_chat_id: '',
  auto_recovery_enabled: '1',
  auto_recovery_failures: '2',
  auto_recovery_cooldown_seconds: '300',
  grace_period_seconds: '90',
  baseline_window_hours: '24',
  baseline_min_samples: '12',
  performance_profile_default: 'maximum',
  network_check_enabled: '1',
  network_check_host: 'github.com',
  updates_auto_check: '1',
  update_check_hours: '6'
};
const secretDefaults = { telegram_bot_token: '' };
const insSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value,secret,updated_at) VALUES(?,?,?,?)');
for (const [k, v] of Object.entries(defaults)) insSetting.run(k, v, 0, now);
for (const [k, v] of Object.entries(secretDefaults)) insSetting.run(k, v ? encryptSecret(v) : '', 1, now);

// SMTP was removed in v1.2.
db.prepare(`DELETE FROM settings WHERE key IN ('smtp_enabled','smtp_host','smtp_port','smtp_secure','smtp_user','smtp_password','smtp_from','alert_email_to')`).run();

const admin = db.prepare("SELECT value FROM meta WHERE key='admin_password_hash'").get();
if (!admin && config.adminPassword && config.adminPassword !== 'REPLACE_ME') {
  db.prepare("INSERT INTO meta(key,value) VALUES('admin_password_hash',?)").run(hashPassword(config.adminPassword));
}

export function getAdminPasswordHash() {
  return db.prepare("SELECT value FROM meta WHERE key='admin_password_hash'").get()?.value || '';
}
export function setAdminPasswordHash(hash) {
  db.prepare("INSERT INTO meta(key,value) VALUES('admin_password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hash);
}

export function getSettings({ includeSecrets = false } = {}) {
  const rows = db.prepare('SELECT key,value,secret FROM settings ORDER BY key').all();
  const out = {};
  for (const r of rows) {
    if (r.secret) out[r.key] = includeSecrets ? decryptSecret(r.value) : (r.value ? '••••••••' : '');
    else out[r.key] = r.value ?? '';
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

export function audit({ actor = 'admin', ip = '', serverId = null, action, status = 'ok', details = '' }) {
  db.prepare('INSERT INTO actions(ts,actor,ip,server_id,action,status,details) VALUES(?,?,?,?,?,?,?)')
    .run(Date.now(), actor, ip, serverId, action, status, typeof details === 'string' ? details : JSON.stringify(details));
}

export function cleanupHistory() {
  const days = Math.max(1, Number(getSetting('history_retention_days')) || config.historyRetentionDays);
  const cutoff = Date.now() - days * 86400000;
  db.prepare('DELETE FROM metrics WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM actions WHERE ts < ?').run(Date.now() - 180 * 86400000);
  db.prepare("DELETE FROM alerts WHERE state='resolved' AND last_ts < ?").run(Date.now() - 30 * 86400000);
  db.prepare("DELETE FROM jobs WHERE created_at < ? AND state IN ('done','failed')").run(Date.now() - 30 * 86400000);
}
