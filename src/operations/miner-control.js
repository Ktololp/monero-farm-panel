import { getSetting, audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { pollServerNow } from '../monitoring/index.js';
import { serverById } from './server.js';

export async function restartXmrig(serverId, { actorIp = '', auditAction = true } = {}) {
  const server = serverById(serverId); const service = safeServiceName(server.xmrig_service || 'xmrig');
  const r = await ssh.sudoExec(server, `systemctl restart ${service}`, { timeoutMs: 20000 });
  if (r.code !== 0) throw new Error(`Перезапуск не удался: ${r.stderr.trim() || r.stdout.trim()}`);
  if (auditAction) audit({ ip: actorIp, serverId: server.id, action: 'restart-xmrig', details: service });
  return { ok: true, output: r.stdout.trim(), graceSeconds: Number(getSetting('grace_period_seconds')) || 90 };
}

export async function waitForMiner(serverId, { timeoutMs=180000, intervalMs=10000, progress=()=>{} }={}) {
  const end=Date.now()+timeoutMs; let last=null;
  while(Date.now()<end){
    await new Promise(r=>setTimeout(r,intervalMs));
    try{last=await pollServerNow(serverId);if(last.status==='online' && Number(last.hash10s||last.hash60s)>0)return last;}catch{}
    progress(last);
  }
  throw new Error(`XMRig не вернулся в online за ${Math.round(timeoutMs/1000)} секунд`);
}
