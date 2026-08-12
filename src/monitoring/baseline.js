
import { db, getSetting } from '../database/index.js';

export function baselineFor(serverId) {
  const hours = Math.max(1, Math.min(168, Number(getSetting('baseline_window_hours')) || 24));
  const minSamples = Math.max(3, Number(getSetting('baseline_min_samples')) || 12);
  const rows = db.prepare(`SELECT hash_60s AS h FROM metrics WHERE server_id=? AND ts>? AND hash_60s>0 ORDER BY hash_60s`).all(serverId, Date.now() - hours * 3600000);
  if (rows.length < minSamples) return { value: null, samples: rows.length, minSamples };
  // Use the upper-middle portion instead of a plain average so downtime does not drag the personal baseline down.
  const vals = rows.map(r => Number(r.h)).filter(Number.isFinite);
  const start = Math.floor(vals.length * 0.25);
  const stable = vals.slice(start);
  const mid = Math.floor(stable.length / 2);
  const median = stable.length % 2 ? stable[mid] : (stable[mid - 1] + stable[mid]) / 2;
  return { value: median, samples: vals.length, minSamples };
}
