
import { getSetting, audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { triggerAlert } from '../alerts/index.js';
import { setLiveState, emitServerUpdate } from './state.js';

const recoveryState = new Map();

function stateFor(serverId) {
  const id = Number(serverId);
  return recoveryState.get(id) || {
    failures: 0,
    lastAttempt: 0,
    recoveringUntil: 0,
    suppressedUntil: 0,
    suppressionReason: ''
  };
}

export function getRecoveryInfo(serverId) {
  return stateFor(serverId);
}

export function suppressAutoRecovery(serverId, durationMs = 15 * 60 * 1000, reason = 'manual-operation') {
  const id = Number(serverId);
  const rs = stateFor(id);
  rs.failures = 0;
  rs.suppressedUntil = Math.max(Number(rs.suppressedUntil || 0), Date.now() + Math.max(1000, Number(durationMs) || 0));
  rs.suppressionReason = String(reason || 'manual-operation');
  recoveryState.set(id, rs);
  return { suppressedUntil: rs.suppressedUntil, reason: rs.suppressionReason };
}

export function releaseAutoRecoverySuppression(serverId) {
  const id = Number(serverId);
  const rs = stateFor(id);
  rs.suppressedUntil = 0;
  rs.suppressionReason = '';
  recoveryState.set(id, rs);
}

async function runtimeUnitOwnership(server, service) {
  const cmd = `cg="$(systemctl show ${service} -p ControlGroup --value 2>/dev/null || true)"; `
    + `if [ -z "$cg" ]; then echo unknown; exit 0; fi; `
    + `for proc in monerod p2pool; do pid="$(pgrep -xo "$proc" 2>/dev/null | head -n1)"; `
    + `if [ -n "$pid" ] && [ -r "/proc/$pid/cgroup" ] && grep -Fq "$cg" "/proc/$pid/cgroup"; then echo shared; exit 0; fi; done; `
    + `echo dedicated`;
  try {
    const r = await ssh.exec(server, cmd, { timeoutMs: 7000 });
    return String(r.stdout || '').trim().split(/\r?\n/).at(-1) || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function maybeAutoRecover(server, live) {
  const rs = stateFor(server.id);
  if (Number(rs.suppressedUntil || 0) > Date.now()) {
    rs.failures = 0;
    recoveryState.set(server.id, rs);
    return;
  }
  if (rs.suppressedUntil) {
    rs.suppressedUntil = 0;
    rs.suppressionReason = '';
    recoveryState.set(server.id, rs);
  }

  if (String(getSetting('auto_recovery_enabled')) === '0' || live.status === 'offline' || live.grace) return;

  // A zero hashrate is NOT proof that XMRig itself is broken. It is commonly an
  // upstream problem (P2Pool/Proxy/monerod). If the XMRig API is alive, never
  // restart it automatically just because the current hashrate is zero.
  const xmrigApiAlive = live.xmrigStatus === 'active' || live.components?.xmrig === 'active';
  if (xmrigApiAlive && live.hash60s != null && Number(live.hash60s) < 1) {
    rs.failures = 0;
    recoveryState.set(server.id, rs);
    return;
  }

  // P2Pool intentionally waits while monerod is not synchronized. Restarting
  // anything in that state only delays recovery, especially on legacy installs
  // where all three processes are launched by one mining.service wrapper.
  if (live.monero?.synchronized === false) {
    rs.failures = 0;
    recoveryState.set(server.id, rs);
    return;
  }

  const broken = live.status === 'degraded' || live.xmrigStatus === 'inactive' || live.xmrigStatus === 'unknown';
  if (!broken) { rs.failures = 0; recoveryState.set(server.id, rs); return; }

  const service = safeServiceName(server.xmrig_service || 'xmrig');
  const monerodService = safeServiceName(server.monerod_service || 'monerod');
  const p2poolService = safeServiceName(server.p2pool_service || 'p2pool');
  const sharedByName = service === monerodService || service === p2poolService;

  // Never automatically restart a unit that is known to own monerod or P2Pool.
  if (sharedByName) {
    rs.failures = 0;
    recoveryState.set(server.id, rs);
    return;
  }

  rs.failures += 1;
  const needed = Math.max(1, Number(getSetting('auto_recovery_failures')) || 2);
  const cooldown = Math.max(60, Number(getSetting('auto_recovery_cooldown_seconds')) || 300) * 1000;
  if (rs.failures < needed || Date.now() - rs.lastAttempt < cooldown) { recoveryState.set(server.id, rs); return; }

  // Service names discovered on older installations can be misleading. Before
  // the destructive systemctl restart, inspect the real systemd cgroup. If the
  // XMRig unit also contains monerod or p2pool, or ownership cannot be proven,
  // suppress automatic recovery instead of risking a full mining-chain restart.
  const ownership = await runtimeUnitOwnership(server, service);
  if (ownership !== 'dedicated') {
    rs.lastAttempt = Date.now();
    rs.failures = 0;
    recoveryState.set(server.id, rs);
    audit({ serverId: server.id, action: 'auto-recovery-suppressed', details: `restart ${service} blocked: runtime ownership=${ownership}` });
    return;
  }

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
