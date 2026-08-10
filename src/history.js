export function clampHistoryHours(value, fallback = 24) {
  const hours = Number(value);
  return Math.max(1, Math.min(24 * 30, Number.isFinite(hours) && hours > 0 ? hours : fallback));
}

export function farmHistoryBucketMs(hours) {
  if (hours <= 6) return 60_000;
  if (hours <= 48) return 300_000;
  return 3_600_000;
}

/**
 * Returns the historical total farm hashrate.
 *
 * Metrics are normally persisted once per minute, while long-range charts use
 * wider buckets (5 minutes for a 24h chart). Summing every stored sample inside
 * a bucket would multiply a single server's hashrate by the number of samples.
 *
 * Instead, calculate each server's average hashrate inside the bucket first,
 * treating stored offline/null samples as zero, then sum those per-server
 * averages to get the farm total for that bucket.
 */
export function getFarmHistory(database, { hours = 24, now = Date.now() } = {}) {
  const normalizedHours = clampHistoryHours(hours);
  const bucket = farmHistoryBucketMs(normalizedHours);
  const cutoff = now - normalizedHours * 3_600_000;

  return database.prepare(`
    SELECT bucket_ts AS ts,
           SUM(server_hash60s) AS hash60s,
           MAX(server_max_temp) AS maxTemp
    FROM (
      SELECT CAST(ts / ? AS INTEGER) * ? AS bucket_ts,
             server_id,
             AVG(COALESCE(hash_60s, 0)) AS server_hash60s,
             MAX(temp_c) AS server_max_temp
      FROM metrics
      WHERE ts >= ?
      GROUP BY CAST(ts / ? AS INTEGER), server_id
    )
    GROUP BY bucket_ts
    ORDER BY bucket_ts
  `).all(bucket, bucket, cutoff, bucket);
}
