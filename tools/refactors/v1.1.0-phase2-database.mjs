import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dir = path.join(root, 'src', 'database');
const indexPath = path.join(dir, 'index.js');
const testPath = path.join(root, 'test', 'database-layout.test.js');

function fail(message) {
  console.error(`[phase2/database] ${message}`);
  process.exit(1);
}

function write(rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart().replace(/\r\n/g, '\n') + '\n', 'utf8');
  console.log(`[phase2/database] wrote ${rel}`);
}

if (!fs.existsSync(indexPath)) fail('src/database/index.js not found. Run the v1.1.0 phase-1 migration first.');
const current = fs.readFileSync(indexPath, 'utf8');
for (const marker of ['CREATE TABLE IF NOT EXISTS meta', 'export function getSettings', 'export function cleanupHistory']) {
  if (!current.includes(marker)) fail(`unexpected database/index.js; marker missing: ${marker}`);
}

write('src/database/connection.js', `
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config/index.js';

fs.mkdirSync(config.dataDir, { recursive: true });
const dbPath = path.join(config.dataDir, 'panel.sqlite3');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
`);

write('src/database/schema.js', `
import { db } from './connection.js';

function hasColumn(table, column) {
  return db.prepare(\`PRAGMA table_info(\${table})\`).all().some(row => row.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) db.exec(\`ALTER TABLE \${table} ADD COLUMN \${column} \${definition}\`);
}

export function initializeSchema() {
  db.exec(\`
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
\`);

  ensureColumn('servers', 'icon', \`TEXT NOT NULL DEFAULT '🖥️'\`);
  ensureColumn('servers', 'monerod_service', \`TEXT NOT NULL DEFAULT 'monerod'\`);
  ensureColumn('servers', 'monerod_rpc_port', \`INTEGER NOT NULL DEFAULT 18081\`);
  ensureColumn('servers', 'monerod_log_path', \`TEXT NOT NULL DEFAULT '/var/log/monero/monero.log'\`);
  ensureColumn('servers', 'performance_profile', \`TEXT NOT NULL DEFAULT 'maximum'\`);
  ensureColumn('servers', 'performance_backup_json', \`TEXT NOT NULL DEFAULT ''\`);
  ensureColumn('servers', 'discovery_json', \`TEXT NOT NULL DEFAULT ''\`);
  ensureColumn('servers', 'discovered_at', \`INTEGER\`);
  ensureColumn('metrics', 'cpu_mhz', \`REAL\`);
  ensureColumn('metrics', 'load_1', \`REAL\`);
  ensureColumn('metrics', 'load_5', \`REAL\`);
  ensureColumn('metrics', 'load_15', \`REAL\`);
  ensureColumn('metrics', 'hugepages_total', \`INTEGER\`);
  ensureColumn('metrics', 'hugepages_free', \`INTEGER\`);
  ensureColumn('metrics', 'hugepages_1g_total', \`INTEGER\`);
  ensureColumn('metrics', 'hugepages_1g_free', \`INTEGER\`);
  ensureColumn('metrics', 'msr_status', \`TEXT\`);
  ensureColumn('metrics', 'xmrig_status', \`TEXT\`);
  ensureColumn('metrics', 'monerod_status', \`TEXT\`);
  ensureColumn('metrics', 'monero_height', \`INTEGER\`);
  ensureColumn('metrics', 'monero_target_height', \`INTEGER\`);
  ensureColumn('metrics', 'network_status', \`TEXT\`);
  ensureColumn('metrics', 'baseline_hash', \`REAL\`);
}
`);

write('src/database/settings.js', `
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
  const stmt = db.prepare(\`INSERT INTO settings(key,value,secret,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, secret=excluded.secret, updated_at=excluded.updated_at\`);
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
`);

write('src/database/admin.js', `
import { db } from './connection.js';

export function getAdminPasswordHash() {
  return db.prepare("SELECT value FROM meta WHERE key='admin_password_hash'").get()?.value || '';
}

export function setAdminPasswordHash(hash) {
  db.prepare("INSERT INTO meta(key,value) VALUES('admin_password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hash);
}
`);

write('src/database/audit.js', `
import { db } from './connection.js';

export function audit({ actor = 'admin', ip = '', serverId = null, action, status = 'ok', details = '' }) {
  db.prepare('INSERT INTO actions(ts,actor,ip,server_id,action,status,details) VALUES(?,?,?,?,?,?,?)')
    .run(Date.now(), actor, ip, serverId, action, status, typeof details === 'string' ? details : JSON.stringify(details));
}
`);

write('src/database/defaults.js', `
import { config } from '../config/index.js';
import { encryptSecret, hashPassword } from '../security/crypto.js';
import { db } from './connection.js';

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

export function initializeDefaults() {
  const now = Date.now();
  const insert = db.prepare('INSERT OR IGNORE INTO settings(key,value,secret,updated_at) VALUES(?,?,?,?)');
  for (const [key, value] of Object.entries(defaults)) insert.run(key, value, 0, now);
  for (const [key, value] of Object.entries(secretDefaults)) insert.run(key, value ? encryptSecret(value) : '', 1, now);

  // SMTP support was removed from the public panel. Delete obsolete settings from older databases.
  db.prepare(\`DELETE FROM settings WHERE key IN ('smtp_enabled','smtp_host','smtp_port','smtp_secure','smtp_user','smtp_password','smtp_from','alert_email_to')\`).run();

  const admin = db.prepare("SELECT value FROM meta WHERE key='admin_password_hash'").get();
  if (!admin && config.adminPassword && config.adminPassword !== 'REPLACE_ME') {
    db.prepare("INSERT INTO meta(key,value) VALUES('admin_password_hash',?)").run(hashPassword(config.adminPassword));
  }
}
`);

write('src/database/maintenance.js', `
import { config } from '../config/index.js';
import { db } from './connection.js';
import { getSetting } from './settings.js';

export function cleanupHistory() {
  const days = Math.max(1, Number(getSetting('history_retention_days')) || config.historyRetentionDays);
  const cutoff = Date.now() - days * 86400000;
  db.prepare('DELETE FROM metrics WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM actions WHERE ts < ?').run(Date.now() - 180 * 86400000);
  db.prepare("DELETE FROM alerts WHERE state='resolved' AND last_ts < ?").run(Date.now() - 30 * 86400000);
  db.prepare("DELETE FROM jobs WHERE created_at < ? AND state IN ('done','failed')").run(Date.now() - 30 * 86400000);
}
`);

write('src/database/index.js', `
import { initializeDefaults } from './defaults.js';
import { initializeSchema } from './schema.js';

initializeSchema();
initializeDefaults();

export { db } from './connection.js';
export { getAdminPasswordHash, setAdminPasswordHash } from './admin.js';
export { audit } from './audit.js';
export { cleanupHistory } from './maintenance.js';
export { getSetting, getSettings, setSettings } from './settings.js';
`);

write('src/database/README.md', `
# Database subsystem

SQLite persistence for Monero Farm Panel. Other subsystems should normally import only from \`src/database/index.js\`.

## Files

- \`index.js\` — public facade; initializes schema/defaults and re-exports the stable database API.
- \`connection.js\` — opens SQLite and configures WAL, foreign keys and busy timeout.
- \`schema.js\` — base tables and additive schema upgrades for existing installations.
- \`defaults.js\` — inserts default settings and performs one-time compatibility cleanup.
- \`settings.js\` — settings read/write API, including encrypted secret values.
- \`admin.js\` — admin password hash storage.
- \`audit.js\` — audit log writes.
- \`maintenance.js\` — retention cleanup for metrics, actions, alerts and jobs.
- \`migrations/\` — reserved for future explicit migrations that cannot be expressed as additive column checks.

## Design rules

1. Routes and monitoring code must not open SQLite directly.
2. Keep schema changes backward-compatible whenever possible.
3. Never log decrypted settings/secrets.
4. Existing \`data/panel.sqlite3\` must survive application updates without manual conversion.
`);

write('test/database-layout.test.js', `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const files = [
  'src/database/index.js',
  'src/database/connection.js',
  'src/database/schema.js',
  'src/database/defaults.js',
  'src/database/settings.js',
  'src/database/admin.js',
  'src/database/audit.js',
  'src/database/maintenance.js',
  'src/database/README.md'
];

test('database subsystem has documented responsibility files', () => {
  for (const rel of files) assert.ok(fs.existsSync(path.join(root, rel)), rel);
});

test('database index stays a small public facade', () => {
  const text = fs.readFileSync(path.join(root, 'src/database/index.js'), 'utf8');
  assert.ok(text.split(/\\r?\\n/).length <= 30, 'database/index.js should remain small');
  assert.match(text, /initializeSchema/);
  assert.match(text, /initializeDefaults/);
  assert.match(text, /export \{ db \}/);
});
`);

const checkFiles = [
  'src/database/index.js', 'src/database/connection.js', 'src/database/schema.js',
  'src/database/defaults.js', 'src/database/settings.js', 'src/database/admin.js',
  'src/database/audit.js', 'src/database/maintenance.js', 'test/database-layout.test.js'
];
for (const rel of checkFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`syntax check failed for ${rel}:\n${result.stderr || result.stdout}`);
}

console.log('[phase2/database] OK');
console.log('[phase2/database] src/database/index.js is now a small stable facade.');
console.log('[phase2/database] Next: npm run check && npm test');
