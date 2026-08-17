import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { decryptSecret } from '../security/crypto.js';
import { suppressAutoRecovery, releaseAutoRecoverySuppression } from '../monitoring/recovery.js';
import { serverById } from './server.js';
import { getMonerodInstallStatus } from './monerod-setup.js';
import { getXmrigInstallStatus } from './xmrig-install.js';

const torStatusScript = fs.readFileSync(path.resolve('scripts/remote-status-monerod-tor.sh'), 'utf8');
const torP2pScript = fs.readFileSync(path.resolve('scripts/remote-set-monerod-tor-p2p.sh'), 'utf8');
const miningRecoveryScript = fs.readFileSync(path.resolve('scripts/remote-recover-mining-chain.sh'), 'utf8');
const experimentSnapshotScript = fs.readFileSync(path.resolve('scripts/remote-tor-experiment-snapshot.sh'), 'utf8');
const miningHealthScript = fs.readFileSync(path.resolve('scripts/remote-validate-mining-health.sh'), 'utf8');

const restartRecoveryServiceScript = `#!/usr/bin/env bash
set -euo pipefail
test -n "$RECOVERY_SERVICE_UNIT"
systemctl reset-failed "$RECOVERY_SERVICE_UNIT" >/dev/null 2>&1 || true
systemctl restart "$RECOVERY_SERVICE_UNIT"
for _ in $(seq 1 45); do
  if systemctl is-active --quiet "$RECOVERY_SERVICE_UNIT" >/dev/null 2>&1; then
    printf 'MFP_RECOVERY_SERVICE_ACTIVE=1\n'
    printf 'MFP_RECOVERY_SERVICE_UNIT=%s\n' "$RECOVERY_SERVICE_UNIT"
    exit 0
  fi
  sleep 1
done
systemctl --no-pager --full status "$RECOVERY_SERVICE_UNIT" 2>&1 | head -n 80 || true
echo "recovery service did not become active: $RECOVERY_SERVICE_UNIT" >&2
exit 1
`;

function serviceUnit(value, fallback) {
  const raw = safeServiceName(value || fallback);
  return raw.endsWith('.service') ? raw : `${raw}.service`;
}

function parsePairs(output = '') {
  const values = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = /^MFP_([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function conciseResult(result, fallback = 'remote operation failed') {
  return result?.stderr?.trim().split(/\r?\n/).filter(Boolean).at(-1)
    || result?.stdout?.trim().split(/\r?\n/).filter(Boolean).at(-1)
    || fallback;
}

export async function getMonerodTorStatus(serverId, monerodStatus = null) {
  const server = serverById(serverId);
  const monerod = monerodStatus || (await getMonerodInstallStatus(serverId)).monerod;
  const result = await ssh.runScript(server, torStatusScript, {
    MONEROD_CONFIG_PATH: monerod.configPath || '',
    TOR_SOCKS_PORT: '9050',
    MONEROD_P2P_PORT: '18080'
  }, { sudo: false, timeoutMs: 15000 });
  if (result.code !== 0) throw new Error(`Tor status check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  const values = parsePairs(result.stdout);
  const tor = {
    installed: values.INSTALLED === '1',
    enabled: values.ENABLED === '1',
    active: values.ACTIVE === '1',
    onion: values.ONION || '',
    torrcConfigured: values.TORRC === '1',
    monerodConfigured: values.MONERO_CONFIG === '1',
    p2pConfigured: values.P2P_CONFIGURED === '1',
    p2pRuntimeKnown: values.P2P_RUNTIME_KNOWN === '1',
    p2pLoopback: values.P2P_LOOPBACK === '1',
    p2pWildcard: values.P2P_WILDCARD === '1',
    p2pPort: Number(values.P2P_PORT || 18080) || 18080,
    p2pRouted: values.P2P_ROUTED === '1'
  };
  tor.ready = tor.installed && tor.enabled && tor.active && Boolean(tor.onion) && tor.torrcConfigured && tor.monerodConfigured;
  return { ok: true, tor };
}

async function recoverMiningChain(server, monerod) {
  const xmrig = (await getXmrigInstallStatus(server.id)).xmrig;
  const result = await ssh.runScript(server, miningRecoveryScript, {
    MONEROD_SERVICE_UNIT: serviceUnit(server.monerod_service, 'monerod'),
    P2POOL_SERVICE_UNIT: serviceUnit(server.p2pool_service, 'p2pool'),
    XMRIG_PROXY_SERVICE_UNIT: 'xmrig-proxy.service',
    XMRIG_SERVICE_UNIT: serviceUnit(server.xmrig_service, 'xmrig'),
    MONEROD_RPC_PORT: String(server.monerod_rpc_port || 18081),
    P2POOL_LOG_PATH: server.p2pool_log_path || '/var/log/p2pool.log',
    XMRIG_CONFIG_PATH: xmrig.configPath || ''
  }, { sudo: true, timeoutMs: 8 * 60 * 1000 });

  if (result.code !== 0) throw new Error(`Mining chain recovery failed: ${conciseResult(result, 'unknown recovery error')}`);
  return { output: result.stdout, steps: parsePairs(result.stdout), monerod, xmrig };
}

async function restartRecoveryService(server) {
  const unit = serviceUnit(server.monerod_service, 'monerod');
  const result = await ssh.runScript(server, restartRecoveryServiceScript, {
    RECOVERY_SERVICE_UNIT: unit
  }, { sudo: true, timeoutMs: 60 * 1000 });
  if (result.code !== 0) throw new Error(`Could not restart ${unit} for recovery retry: ${conciseResult(result)}`);
  return { unit, output: result.stdout, steps: parsePairs(result.stdout) };
}

async function recoverAfterRestoreWithRetry(server, monerod) {
  try {
    return { recovery: await recoverMiningChain(server, monerod), retry: null };
  } catch (firstError) {
    const restart = await restartRecoveryService(server);
    const freshMonerod = (await getMonerodInstallStatus(server.id)).monerod;
    try {
      const recovery = await recoverMiningChain(server, freshMonerod);
      return {
        recovery,
        retry: {
          restartedUnit: restart.unit,
          firstError: firstError.message
        }
      };
    } catch (retryError) {
      throw new Error(
        `${firstError.message}. Recovery retry after restarting ${restart.unit} also failed: ${retryError.message}`
      );
    }
  }
}

async function validateMiningHealth(server, waitSeconds) {
  const token = server.xmrig_api_token_enc ? decryptSecret(server.xmrig_api_token_enc) : '';
  const result = await ssh.runScript(server, miningHealthScript, {
    XMRIG_API_PORT: String(server.xmrig_api_port || 60050),
    XMRIG_API_TOKEN: token,
    HEALTH_WAIT_SECONDS: String(waitSeconds)
  }, { sudo: false, timeoutMs: (Number(waitSeconds) + 15) * 1000 });
  if (result.code !== 0) throw new Error(`Mining health validation failed: ${conciseResult(result)}`);
  const values = parsePairs(result.stdout);
  return {
    hashHs: Number(values.XMRIG_HASH_HS || 0) || 0,
    accepted: Number(values.XMRIG_ACCEPTED || 0) || 0,
    output: result.stdout
  };
}

async function createExperimentSnapshot(server, monerod) {
  const result = await ssh.runScript(server, experimentSnapshotScript, {
    MONEROD_CONFIG_PATH: monerod.configPath,
    MONEROD_SERVICE_UNIT: serviceUnit(server.monerod_service, 'monerod'),
    EXPERIMENT_ACTION: 'snapshot',
    SNAPSHOT_PATH: ''
  }, { sudo: true, timeoutMs: 20000 });
  if (result.code !== 0) throw new Error(`Could not create Tor experiment checkpoint: ${conciseResult(result)}`);
  const values = parsePairs(result.stdout);
  if (!values.SNAPSHOT_PATH) throw new Error('Tor experiment checkpoint was created without a snapshot path');
  return { path: values.SNAPSHOT_PATH, sha256: values.SNAPSHOT_SHA256 || '', output: result.stdout };
}

async function restoreExperimentSnapshot(server, monerod, snapshotPath) {
  const result = await ssh.runScript(server, experimentSnapshotScript, {
    MONEROD_CONFIG_PATH: monerod.configPath,
    MONEROD_SERVICE_UNIT: serviceUnit(server.monerod_service, 'monerod'),
    EXPERIMENT_ACTION: 'restore',
    SNAPSHOT_PATH: snapshotPath
  }, { sudo: true, timeoutMs: 3 * 60 * 1000 });
  if (result.code !== 0) throw new Error(`Could not restore pre-experiment config: ${conciseResult(result)}`);
  return { ...parsePairs(result.stdout), output: result.stdout };
}

async function setP2pMode(server, monerod, enabled) {
  const result = await ssh.runScript(server, torP2pScript, {
    MONEROD_SERVICE_UNIT: serviceUnit(server.monerod_service, 'monerod'),
    MONEROD_CONFIG_PATH: monerod.configPath,
    TOR_SOCKS_PORT: '9050',
    TOR_P2P_MODE: enabled ? 'enable' : 'disable'
  }, { sudo: true, timeoutMs: 3 * 60 * 1000 });
  if (result.code !== 0) throw new Error(`${enabled ? 'Could not enable Tor P2P experiment' : 'Could not restore normal monerod P2P'}: ${conciseResult(result)}`);
  return { ...parsePairs(result.stdout), output: result.stdout };
}

async function stopTorP2pExperiment(server, monerod, before, { actorIp = '', requestedEnabled = false } = {}) {
  suppressAutoRecovery(server.id, 10 * 60 * 1000, 'tor-p2p-restore');
  try {
    const cleanup = await setP2pMode(server, monerod, false);
    if (cleanup.CHANGED !== '1') {
      releaseAutoRecoverySuppression(server.id);
      return { ok: true, changed: false, enabled: false, recovered: false, tor: before.tor, recovery: {} };
    }
    const freshMonerod = (await getMonerodInstallStatus(server.id)).monerod;
    const recovered = await recoverAfterRestoreWithRetry(server, freshMonerod);
    const recovery = recovered.recovery;
    const health = await validateMiningHealth(server, 90);
    const afterMonerod = (await getMonerodInstallStatus(server.id)).monerod;
    const after = await getMonerodTorStatus(server.id, afterMonerod);
    if (after.tor.p2pConfigured || after.tor.p2pRouted) throw new Error('normal P2P restore finished but the managed full-P2P Tor mode is still detected');
    releaseAutoRecoverySuppression(server.id);
    audit({
      ip: actorIp,
      serverId: server.id,
      action: 'tor-p2p-experiment-stop',
      status: 'ok',
      details: {
        requestedEnabled,
        hashHs: health.hashHs,
        accepted: health.accepted,
        orphanedMfpOptionsCleaned: cleanup.ORPHAN_CLEANED === '1',
        recoveryRetried: Boolean(recovered.retry),
        recoveryRetryUnit: recovered.retry?.restartedUnit || '',
        firstRecoveryError: recovered.retry?.firstError || ''
      }
    });
    return {
      ok: true,
      changed: true,
      enabled: false,
      recovered: true,
      tor: after.tor,
      monerod: afterMonerod,
      recovery: recovery.steps,
      recoveryRetry: recovered.retry,
      health
    };
  } catch (error) {
    audit({ ip: actorIp, serverId: server.id, action: 'tor-p2p-experiment-stop', status: 'error', details: error.message });
    throw error;
  }
}

async function startTorP2pExperiment(server, monerod, before, { actorIp = '' } = {}) {
  if (!before.tor.ready) throw new Error('Tor onion must be configured and healthy before the full-P2P experiment');
  if (before.tor.p2pRouted) return { ok: true, changed: false, enabled: true, experimentPassed: true, tor: before.tor };

  const suppression = suppressAutoRecovery(server.id, 15 * 60 * 1000, 'tor-p2p-experiment');
  let baseline;
  try {
    baseline = await validateMiningHealth(server, 30);
  } catch (error) {
    releaseAutoRecoverySuppression(server.id);
    throw new Error(`Tor experiment was not started because the baseline mining state is not healthy: ${error.message}`);
  }

  const snapshot = await createExperimentSnapshot(server, monerod);

  try {
    await setP2pMode(server, monerod, true);
    const freshMonerod = (await getMonerodInstallStatus(server.id)).monerod;
    const recovery = await recoverMiningChain(server, freshMonerod);
    const health = await validateMiningHealth(server, 90);
    const afterMonerod = (await getMonerodInstallStatus(server.id)).monerod;
    const after = await getMonerodTorStatus(server.id, afterMonerod);
    if (!after.tor.p2pConfigured || !after.tor.p2pRouted) throw new Error('Tor P2P config was applied, but runtime loopback/proxy routing is not confirmed');

    audit({
      ip: actorIp,
      serverId: server.id,
      action: 'tor-p2p-experiment',
      status: 'ok',
      details: {
        snapshot: snapshot.path,
        baselineHashHs: baseline.hashHs,
        finalHashHs: health.hashHs,
        accepted: health.accepted,
        monerodSynced: recovery.steps.MONEROD_SYNCED === '1',
        p2poolStratumReady: recovery.steps.P2POOL_STRATUM_READY === '1',
        proxyUpstreamReady: recovery.steps.PROXY_UPSTREAM_READY === '1',
        xmrigPoolLinkReady: recovery.steps.XMRIG_POOL_LINK_READY === '1'
      }
    });

    return {
      ok: true,
      changed: true,
      enabled: true,
      experimentPassed: true,
      autoRecoverySuppressedUntil: suppression.suppressedUntil,
      snapshot: { path: snapshot.path, sha256: snapshot.sha256 },
      baseline,
      health,
      recovery: recovery.steps,
      tor: after.tor,
      monerod: afterMonerod
    };
  } catch (experimentError) {
    let rollbackError = null;
    let rollbackHealth = null;
    let rollbackRecovery = null;
    let rollbackRetry = null;
    try {
      await restoreExperimentSnapshot(server, monerod, snapshot.path);
      const restoredMonerod = (await getMonerodInstallStatus(server.id)).monerod;
      const recovered = await recoverAfterRestoreWithRetry(server, restoredMonerod);
      rollbackRecovery = recovered.recovery;
      rollbackRetry = recovered.retry;
      rollbackHealth = await validateMiningHealth(server, 120);
      releaseAutoRecoverySuppression(server.id);
    } catch (error) {
      rollbackError = error;
    }

    audit({
      ip: actorIp,
      serverId: server.id,
      action: 'tor-p2p-experiment',
      status: 'error',
      details: {
        error: experimentError.message,
        snapshot: snapshot.path,
        rollbackOk: !rollbackError,
        rollbackError: rollbackError?.message || '',
        rollbackHashHs: rollbackHealth?.hashHs || 0,
        rollbackRecoveryRetried: Boolean(rollbackRetry),
        rollbackRecoveryRetryUnit: rollbackRetry?.restartedUnit || '',
        rollbackFirstRecoveryError: rollbackRetry?.firstError || '',
        rollbackMonerodSynced: rollbackRecovery?.steps?.MONEROD_SYNCED === '1',
        rollbackP2poolStratumReady: rollbackRecovery?.steps?.P2POOL_STRATUM_READY === '1',
        rollbackProxyUpstreamReady: rollbackRecovery?.steps?.PROXY_UPSTREAM_READY === '1',
        rollbackXmrigPoolLinkReady: rollbackRecovery?.steps?.XMRIG_POOL_LINK_READY === '1'
      }
    });

    if (rollbackError) {
      throw new Error(`Tor P2P experiment failed: ${experimentError.message}. Automatic rollback also failed: ${rollbackError.message}. Auto Recovery remains suppressed to prevent restart loops.`);
    }
    const retryNote = rollbackRetry ? ` Recovery needed one controlled restart of ${rollbackRetry.restartedUnit}.` : '';
    throw new Error(`Tor P2P experiment failed: ${experimentError.message}. Automatic rollback succeeded and mining returned at ${Math.round(rollbackHealth.hashHs)} H/s.${retryNote}`);
  }
}

export async function setMonerodTorP2p(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const monerod = (await getMonerodInstallStatus(serverId)).monerod;
  if (!monerod.running) throw new Error('monerod must be running before Tor P2P operations');
  if (!monerod.configExists || !monerod.configPath) throw new Error('monerod config must exist before Tor P2P operations');

  const before = await getMonerodTorStatus(serverId, monerod);
  // Older v1.3 UI builds always post {enabled:false}. Treat that request as a
  // safe toggle: start the guarded experiment when normal P2P is active, and
  // restore normal P2P when an experimental managed Tor mode is already active.
  const requestedEnabled = options.enabled === true
    || (options.enabled === false && !before.tor.p2pConfigured && !before.tor.p2pRouted);
  if (requestedEnabled) return startTorP2pExperiment(server, monerod, before, { actorIp });
  return stopTorP2pExperiment(server, monerod, before, { actorIp, requestedEnabled });
}
