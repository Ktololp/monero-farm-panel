import { db } from './connection.js';

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function initializeSchema() {
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
}
