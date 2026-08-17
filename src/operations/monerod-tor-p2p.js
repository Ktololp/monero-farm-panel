import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { serverById } from './server.js';
import { getMonerodInstallStatus } from './monerod-setup.js';
import { getXmrigInstallStatus } from './xmrig-install.js';

const torStatusScript = fs.readFileSync(path.resolve('scripts/remote-status-monerod-tor.sh'), 'utf8');
const torP2pScript = fs.readFileSync(path.resolve('scripts/remote-set-monerod-tor-p2p.sh'), 'utf8');
const miningRecoveryScript = fs.readFileSync(path.resolve('scripts/remote-recover-mining-chain.sh'), 'utf8');

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

  if (result.code !== 0) {
    const concise = result.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)
      || result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
      || 'unknown recovery error';
    throw new Error(`Mining chain recovery failed: ${concise}`);
  }
  return { output: result.stdout, steps: parsePairs(result.stdout), monerod, xmrig };
}

export async function setMonerodTorP2p(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const requestedEnabled = options.enabled !== false;
  const monerod = (await getMonerodInstallStatus(serverId)).monerod;
  if (!monerod.running) throw new Error('monerod must be running before mining-chain recovery');
  if (!monerod.configExists || !monerod.configPath) throw new Error('monerod config must exist before mining-chain recovery');

  const before = await getMonerodTorStatus(serverId, monerod);

  // Recovery-only safety mode. Always run the disable script as a probe: it is
  // now a no-op without changes, but it can also remove proven orphaned options
  // left by early v1.3 full-P2P experiments even when the marker is already gone.
  const cleanupResult = await ssh.runScript(server, torP2pScript, {
    MONEROD_SERVICE_UNIT: serviceUnit(server.monerod_service, 'monerod'),
    MONEROD_CONFIG_PATH: monerod.configPath,
    TOR_SOCKS_PORT: '9050',
    TOR_P2P_MODE: 'disable'
  }, { sudo: true, timeoutMs: 3 * 60 * 1000 });
  const p2pOutput = cleanupResult.stdout;
  const cleanup = parsePairs(cleanupResult.stdout);
  if (cleanupResult.code !== 0) {
    audit({ ip: actorIp, serverId: server.id, action: 'recover-monerod-p2p', status: 'error', details: { stage: 'remove-tor-p2p', code: cleanupResult.code, requestedEnabled } });
    throw new Error(`Could not restore normal monerod P2P: ${cleanupResult.stderr.trim() || cleanupResult.stdout.slice(-2500)}`);
  }

  const freshMonerod = (await getMonerodInstallStatus(serverId)).monerod;
  const recovery = await recoverMiningChain(server, freshMonerod);
  const afterMonerod = (await getMonerodInstallStatus(serverId)).monerod;
  const after = await getMonerodTorStatus(serverId, afterMonerod);

  if (after.tor.p2pConfigured) {
    throw new Error('Mining recovery completed, but the managed full-P2P Tor block is still present in monerod config');
  }

  audit({
    ip: actorIp,
    serverId: server.id,
    action: 'recover-monerod-p2p',
    status: 'ok',
    details: {
      requestedEnabled,
      p2pConfigChanged: cleanup.CHANGED === '1',
      orphanedMfpOptionsCleaned: cleanup.ORPHAN_CLEANED === '1',
      rpcReady: recovery.steps.RPC_READY === '1',
      monerodSynced: recovery.steps.MONEROD_SYNCED === '1',
      p2poolRestarted: recovery.steps.P2POOL_RESTARTED === '1',
      p2poolStratumReady: recovery.steps.P2POOL_STRATUM_READY === '1',
      p2poolZmqReady: recovery.steps.P2POOL_ZMQ_READY === '1',
      proxyRestarted: recovery.steps.PROXY_RESTARTED === '1',
      proxyUpstreamReady: recovery.steps.PROXY_UPSTREAM_READY === '1',
      xmrigRestarted: recovery.steps.XMRIG_RESTARTED === '1',
      xmrigPoolLinkReady: recovery.steps.XMRIG_POOL_LINK_READY === '1'
    }
  });

  return {
    ok: true,
    changed: cleanup.CHANGED === '1',
    orphanedMfpOptionsCleaned: cleanup.ORPHAN_CLEANED === '1',
    enabled: false,
    recovered: true,
    tor: after.tor,
    monerod: afterMonerod,
    recovery: recovery.steps,
    output: `${p2pOutput}\n${recovery.output}`.trim()
  };
}
