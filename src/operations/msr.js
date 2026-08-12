import { audit } from '../database/index.js';
import { ssh } from '../ssh/index.js';
import { serverById } from './server.js';
import { readConfig, writeConfig } from './xmrig-config.js';
import { restartXmrig } from './miner-control.js';

export async function setMsr(serverId, { enabled, actorIp = '' }) {
  const server = serverById(serverId); const cfg = await readConfig(server); cfg.randomx ||= {}; cfg.randomx.rdmsr = Boolean(enabled); cfg.randomx.wrmsr = Boolean(enabled); await writeConfig(server, cfg);
  if (enabled) { const r = await ssh.sudoExec(server, 'modprobe msr && printf "msr\\n" > /etc/modules-load.d/monero-farm-panel.conf', { timeoutMs: 10000 }); if (r.code !== 0) throw new Error(`Не удалось загрузить модуль msr: ${r.stderr.trim()}`); }
  await restartXmrig(serverId, { actorIp, auditAction: false }); audit({ ip: actorIp, serverId: server.id, action: 'set-msr', details: { enabled: Boolean(enabled) } }); return { ok: true };
}
