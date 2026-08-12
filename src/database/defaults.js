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
  db.prepare(`DELETE FROM settings WHERE key IN ('smtp_enabled','smtp_host','smtp_port','smtp_secure','smtp_user','smtp_password','smtp_from','alert_email_to')`).run();

  const admin = db.prepare("SELECT value FROM meta WHERE key='admin_password_hash'").get();
  if (!admin && config.adminPassword && config.adminPassword !== 'REPLACE_ME') {
    db.prepare("INSERT INTO meta(key,value) VALUES('admin_password_hash',?)").run(hashPassword(config.adminPassword));
  }
}
