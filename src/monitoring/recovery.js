
import { getSetting, audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { triggerAlert } from '../alerts/index.js';
import { setLiveState, emitServerUpdate } from './state.js';

const recoveryState = new Map();

export function getRecoveryInfo(serverId) {
  return recoveryState.get(Number(serverId)) || { failures: 0, lastAttempt: 0, recoveringUntil: 0 };
}

export async function maybeAutoRecover(server, live) {
  if (String(getSetting('auto_recovery_enabled')) === '0' || live.status === 'offline' || live.grace) return;
  const rs = recoveryState.get(server.id) || { failures: 0, lastAttempt: 0, recoveringUntil: 0 };

  // A zero XMRig hashrate is expected while P2Pool is waiting for monerod to
  // synchronize. Restarting the miner here can be actively harmful on legacy
  // installations where monerod, P2Pool and XMRig share one mining.service.
  if (live.monero?.synchronized === false) {
    rs.failures = 0;
    recoveryState.set(server.id, rs);
    return;
  }

  const badHash = live.hash60s != null && live.hash60s < 1;
  const broken = live.status === 'degraded' || live.xmrigStatus === 'inactive' || badHash;
  if (!broken) { rs.failures = 0; recoveryState.set(server.id, rs); return; }

  const service = safeServiceName(server.xmrig_service || 'xmrig');
  const monerodService = safeServiceName(server.monerod_service || 'monerod');
  const p2poolService = safeServiceName(server.p2pool_service || 'p2pool');
  const sharedMiningService = service === monerodService || service === p2poolService;

  // Never automatically restart a unit that also owns monerod or P2Pool.
  // Component-aware recovery may be added later; restarting the shared wrapper
  // can reset node synchronization and create an endless zero-hash restart loop.
  if (sharedMiningService) {
    rs.failures = 0;
    recoveryState.set(server.id, rs);
    return;
  }

  rs.failures += 1;
  const needed = Math.max(1, Number(getSetting('auto_recovery_failures')) || 2);
  const cooldown = Math.max(60, Number(getSetting('auto_recovery_cooldown_seconds')) || 300) * 1000;
  if (rs.failures < needed || Date.now() - rs.lastAttempt < cooldown) { recoveryState.set(server.id, rs); return; }
  rs.lastAttempt = Date.now(); rs.failures = 0;
  const graceMs = Math.max(15, Number(getSetting('grace_period_seconds')) || 90) * 1000;
  rs.recoveringUntil = Date.now() + graceMs;
  recoveryState.set(server.id, rs);
  try {
    const r = await ssh.sudoExec(server, `systemctl restart ${service}`, { timeoutMs: 20000 });
    if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`);
    audit({ serverId: server.id, action: 'auto-recovery', details: `restart ${service}` });
    const updated = { ...live, status: 'starting', grace: true, graceRemaining: Math.round(graceMs / 1000), autoRecovery: { triggered: true, ts: Date.now(), service } };
    setLiveState(server.id, updated);
    emitServerUpdate(updated);
  } catch (e) {
    audit({ serverId: server.id, action: 'auto-recovery', status: 'error', details: e.message });
    await triggerAlert(server, 'auto-recovery', `Автовосстановление не удалось: ${e.message}`);
  }
}
