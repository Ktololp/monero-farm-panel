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
