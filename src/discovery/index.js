import { db, audit } from '../database/index.js';
import { ssh, shellQuote } from '../ssh/index.js';
import { serverById } from './server.js';
import { toService, toPort } from './normalize.js';
import { REMOTE_DISCOVERY } from './remote-script.js';

export async function discoverServer(serverId, { apply = true, actorIp = '' } = {}) {
  const server = serverById(serverId);
  const encoded = Buffer.from(REMOTE_DISCOVERY, 'utf8').toString('base64');
  const r = await ssh.exec(server, `printf %s ${shellQuote(encoded)} | base64 -d | python3`, { timeoutMs: 25000, maxBytes: 1_000_000 });
  if (r.code !== 0 || !r.stdout.trim()) throw new Error(`Автоопределение не выполнено: ${r.stderr.trim() || `код ${r.code}`}`);
  let inventory;
  try { inventory = JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)); }
  catch (e) { throw new Error(`Не удалось разобрать результат автоопределения: ${e.message}`); }
  inventory.detectedAt = Date.now();
  inventory.xmrig.service = toService(inventory.xmrig?.service, server.xmrig_service || 'xmrig');
  inventory.p2pool.service = toService(inventory.p2pool?.service, server.p2pool_service || 'p2pool');
  inventory.monerod.service = toService(inventory.monerod?.service, server.monerod_service || 'monerod');
  inventory.xmrig.apiPort = toPort(inventory.xmrig?.apiPort, server.xmrig_api_port || 60050);
  inventory.monerod.rpcPort = server.monerod_rpc_port || 18081;
  inventory.p2pool.logPath = inventory.p2pool?.logPath || server.p2pool_log_path || '';
  inventory.monerod.logPath = inventory.monerod?.logPath || server.monerod_log_path || '';
  if (apply) {
    const cfg = inventory.xmrig?.config && inventory.xmrig.config.startsWith('/') ? inventory.xmrig.config : server.xmrig_config_path;
    db.prepare(`UPDATE servers SET xmrig_api_port=?,xmrig_config_path=?,xmrig_service=?,p2pool_service=?,p2pool_log_path=?,monerod_service=?,monerod_log_path=?,discovery_json=?,discovered_at=?,updated_at=? WHERE id=?`).run(
      inventory.xmrig.apiPort, cfg, inventory.xmrig.service, inventory.p2pool.service,
      inventory.p2pool.logPath || server.p2pool_log_path,
      inventory.monerod.service, inventory.monerod.logPath || server.monerod_log_path,
      JSON.stringify(inventory), inventory.detectedAt, Date.now(), server.id
    );
  }
  audit({ ip: actorIp, serverId: server.id, action: 'auto-discovery', details: { xmrig: inventory.xmrig?.binary || 'not found', service: inventory.xmrig?.service } });
  return inventory;
}

export function getDiscovery(server) {
  try { return server.discovery_json ? JSON.parse(server.discovery_json) : null; } catch { return null; }
}
