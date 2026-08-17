import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { serverById } from './server.js';
import { getMonerodInstallStatus } from './monerod-setup.js';

const torStatusScript = fs.readFileSync(path.resolve('scripts/remote-status-monerod-tor.sh'), 'utf8');
const torP2pScript = fs.readFileSync(path.resolve('scripts/remote-set-monerod-tor-p2p.sh'), 'utf8');

function unitName(server) {
  const raw = safeServiceName(server.monerod_service || 'monerod');
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

export async function setMonerodTorP2p(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const enabled = options.enabled !== false;
  const monerod = (await getMonerodInstallStatus(serverId)).monerod;
  if (!monerod.running) throw new Error('monerod must be running before changing Tor P2P mode');
  if (!monerod.configExists || !monerod.configPath) throw new Error('monerod config must exist before changing Tor P2P mode');

  const before = await getMonerodTorStatus(serverId, monerod);
  if (enabled && !before.tor.ready) throw new Error('Tor onion must be fully configured before routing P2P through Tor');
  if (before.tor.p2pRouted === enabled) return { ok: true, changed: false, enabled, tor: before.tor, monerod, output: '' };

  const result = await ssh.runScript(server, torP2pScript, {
    MONEROD_SERVICE_UNIT: unitName(server),
    MONEROD_CONFIG_PATH: monerod.configPath,
    TOR_SOCKS_PORT: '9050',
    TOR_P2P_MODE: enabled ? 'enable' : 'disable'
  }, { sudo: true, timeoutMs: 3 * 60 * 1000 });

  audit({ ip: actorIp, serverId: server.id, action: 'set-monerod-tor-p2p', status: result.code === 0 ? 'ok' : 'error', details: { code: result.code, enabled } });
  if (result.code !== 0) throw new Error(`Tor P2P mode change failed: ${result.stderr.trim() || result.stdout.slice(-2500)}`);

  const freshMonerod = (await getMonerodInstallStatus(serverId)).monerod;
  const after = await getMonerodTorStatus(serverId, freshMonerod);
  if (after.tor.p2pRouted !== enabled) {
    const diag = enabled
      ? `configured=${after.tor.p2pConfigured}, loopback=${after.tor.p2pLoopback}, wildcard=${after.tor.p2pWildcard}, port=${after.tor.p2pPort}`
      : `configured=${after.tor.p2pConfigured}`;
    throw new Error(`monerod restarted, but Tor P2P mode did not match the requested state (${diag})`);
  }
  return { ok: true, changed: true, enabled, tor: after.tor, monerod: freshMonerod, output: result.stdout };
}
