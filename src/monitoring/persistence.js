
import { db } from '../database/index.js';
import { config } from '../config/index.js';

const lastPersist = new Map();

export function persistMetric(server, live) {
  const prev = lastPersist.get(server.id) || 0;
  if (Date.now() - prev < config.historyIntervalMs) return;
  lastPersist.set(server.id, Date.now());
  db.prepare(`INSERT INTO metrics(server_id,ts,hash_10s,hash_60s,hash_15m,temp_c,accepted,rejected,uptime,version,pool,p2pool_status,error_count,cpu_mhz,load_1,load_5,load_15,hugepages_total,hugepages_free,hugepages_1g_total,hugepages_1g_free,msr_status,xmrig_status,monerod_status,monero_height,monero_target_height,network_status,baseline_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      server.id, live.ts, live.hash10s, live.hash60s, live.hash15m, live.tempC, live.accepted, live.rejected, live.uptime, live.version, live.pool, live.p2poolStatus, live.errors?.length || 0,
      live.cpuMHz, live.load1, live.load5, live.load15, live.hugePages?.total || 0, live.hugePages?.free || 0, live.hugePages?.oneGTotal || 0, live.hugePages?.oneGFree || 0,
      live.msr?.status || 'unknown', live.xmrigStatus || 'unknown', live.monerodStatus || 'unknown', live.monero?.height || null, live.monero?.targetHeight || null,
      live.network?.internet === true && live.network?.dns === true ? 'online' : live.network?.internet === false || live.network?.dns === false ? 'degraded' : 'unknown', live.baselineHash
    );
}
