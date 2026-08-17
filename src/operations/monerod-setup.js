import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { serverById } from './server.js';

const monerodStatusScript = fs.readFileSync(path.resolve('scripts/remote-status-monerod.sh'), 'utf8');

const torStatusScript = `#!/usr/bin/env bash
set +e
INSTALLED=0
command -v tor >/dev/null 2>&1 && INSTALLED=1
ENABLED=0
systemctl is-enabled --quiet tor >/dev/null 2>&1 && ENABLED=1
ACTIVE=0
systemctl is-active --quiet tor >/dev/null 2>&1 && ACTIVE=1
ONION=""
TORRC=0
if [ -f /etc/tor/torrc ] && grep -q '^# BEGIN MFP MONEROD TOR$' /etc/tor/torrc; then TORRC=1; fi
MONERO_CONFIG=0
if [ -n "$MONEROD_CONFIG_PATH" ] && [ -f "$MONEROD_CONFIG_PATH" ] && grep -q '^# BEGIN MFP TOR$' "$MONEROD_CONFIG_PATH"; then
  MONERO_CONFIG=1
  ONION="$(sed -n 's/^anonymous-inbound=\\([^,]*\\),.*/\\1/p' "$MONEROD_CONFIG_PATH" | head -n 1)"
fi
if [ -z "$ONION" ] && [ -r /var/lib/tor/monerod/hostname ]; then ONION="$(tr -d '\\r\\n ' </var/lib/tor/monerod/hostname)"; fi
printf 'MFP_INSTALLED=%s\\n' "$INSTALLED"
printf 'MFP_ENABLED=%s\\n' "$ENABLED"
printf 'MFP_ACTIVE=%s\\n' "$ACTIVE"
printf 'MFP_ONION=%s\\n' "$ONION"
printf 'MFP_TORRC=%s\\n' "$TORRC"
printf 'MFP_MONERO_CONFIG=%s\\n' "$MONERO_CONFIG"
exit 0
`;

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

function parseMonerodStatus(output = '') {
  const values = parsePairs(output);
  const versionMatch = String(values.VERSION || '').match(/v?(\d+\.\d+\.\d+(?:\.\d+)?)/);
  const pruned = values.PRUNED === '1' ? true : values.PRUNED === '0' ? false : null;
  const status = {
    installed: Boolean(values.BINARY),
    processDetected: values.PROCESS === '1',
    binaryPath: values.BINARY || '',
    processPid: Number(values.PID || 0) || null,
    version: versionMatch?.[1] || '',
    configExists: values.CONFIG === '1',
    configPath: values.CONFIG_PATH || '',
    serviceInstalled: values.SERVICE === '1',
    enabled: values.ENABLED === '1',
    active: values.ACTIVE === '1',
    rpcAvailable: values.RPC === '1',
    rpcEndpoint: values.RPC_ENDPOINT || '',
    rpcPrivate: values.RPC_PRIVATE === '1',
    rpcAuthRequired: values.RPC_AUTH === '1',
    pruned,
    mode: pruned === true ? 'pruned' : pruned === false ? 'full' : 'unknown'
  };
  status.detected = status.installed || status.processDetected || (status.serviceInstalled && status.active);
  status.running = status.detected && status.serviceInstalled && status.active;
  status.operational = status.running;
  status.ready = status.running && status.enabled;
  // A configless running monerod is valid: Tor provisioning can create the
  // standard bitmonero.conf in the daemon's current data directory safely.
  status.torConfigurable = status.running;
  return status;
}

function parseTorStatus(output = '') {
  const values = parsePairs(output);
  const status = {
    installed: values.INSTALLED === '1',
    enabled: values.ENABLED === '1',
    active: values.ACTIVE === '1',
    onion: values.ONION || '',
    torrcConfigured: values.TORRC === '1',
    monerodConfigured: values.MONERO_CONFIG === '1'
  };
  status.ready = status.installed && status.enabled && status.active && Boolean(status.onion) && status.torrcConfigured && status.monerodConfigured;
  return status;
}

export async function getMonerodInstallStatus(serverId) {
  const server = serverById(serverId);
  const env = {
    TARGET_USER: server.username,
    MONEROD_SERVICE_UNIT: unitName(server),
    MONEROD_RPC_PORT: String(server.monerod_rpc_port || 18081),
    MONEROD_CONFIG_PATH: '/etc/monero/monerod.conf'
  };
  const result = await ssh.runScript(server, monerodStatusScript, env, { sudo: false, timeoutMs: 15000 });
  if (result.code !== 0) throw new Error(`monerod status check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  return { ok: true, monerod: parseMonerodStatus(result.stdout) };
}

export async function getMonerodTorStatus(serverId, monerodStatus = null) {
  const server = serverById(serverId);
  const monerod = monerodStatus || (await getMonerodInstallStatus(serverId)).monerod;
  const env = { MONEROD_CONFIG_PATH: monerod.configPath || '' };
  const result = await ssh.runScript(server, torStatusScript, env, { sudo: false, timeoutMs: 15000 });
  if (result.code !== 0) throw new Error(`Tor status check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  return { ok: true, tor: parseTorStatus(result.stdout) };
}

export async function installMonerod(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const mode = String(options.mode || 'pruned').trim();
  if (!['pruned', 'full'].includes(mode)) throw new Error('Invalid monerod mode');

  const before = await getMonerodInstallStatus(serverId);
  if (before.monerod.running) {
    if (before.monerod.mode !== 'unknown' && before.monerod.mode !== mode) {
      throw new Error(`monerod is already configured as ${before.monerod.mode}; changing node type after initial sync is intentionally not automatic`);
    }
    return { ok: true, alreadyInstalled: true, monerod: before.monerod, output: '' };
  }

  const script = fs.readFileSync(path.resolve('scripts/remote-install-monerod.sh'), 'utf8');
  const env = {
    MONEROD_MODE: mode,
    MONEROD_SERVICE_UNIT: unitName(server),
    MONEROD_RPC_PORT: String(server.monerod_rpc_port || 18081),
    MONEROD_CONFIG_PATH: before.monerod.configPath || '/etc/monero/monerod.conf',
    MONEROD_BINARY_PATH: before.monerod.binaryPath || ''
  };

  let result;
  try {
    result = await ssh.runScript(server, script, env, { sudo: true, timeoutMs: 45 * 60 * 1000 });
  } catch (error) {
    audit({ ip: actorIp, serverId: server.id, action: 'install-monerod', status: 'error', details: error.message });
    throw error;
  }
  audit({ ip: actorIp, serverId: server.id, action: 'install-monerod', status: result.code === 0 ? 'ok' : 'error', details: { code: result.code, mode } });
  if (result.code !== 0) throw new Error(`monerod installation failed: ${result.stderr.trim() || result.stdout.slice(-2500)}`);

  const after = await getMonerodInstallStatus(serverId);
  if (!after.monerod.running) throw new Error('monerod installation finished, but the daemon is not running');
  if (after.monerod.mode !== 'unknown' && after.monerod.mode !== mode) throw new Error(`monerod started, but existing config kept node mode ${after.monerod.mode}`);
  return { ok: true, alreadyInstalled: false, monerod: after.monerod, output: result.stdout };
}

export async function configureMonerodTor(serverId, _options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const monerod = (await getMonerodInstallStatus(serverId)).monerod;
  if (!monerod.running) throw new Error('monerod must be running before Tor setup');
  const before = await getMonerodTorStatus(serverId, monerod);
  if (before.tor.ready) return { ok: true, alreadyConfigured: true, tor: before.tor, output: '' };

  const script = fs.readFileSync(path.resolve('scripts/remote-configure-monerod-tor.sh'), 'utf8');
  const env = {
    TARGET_USER: server.username,
    MONEROD_SERVICE_UNIT: unitName(server),
    MONEROD_CONFIG_PATH: monerod.configPath || '',
    TOR_ONION_PORT: '18084',
    TOR_SOCKS_PORT: '9050'
  };

  let result;
  try {
    result = await ssh.runScript(server, script, env, { sudo: true, timeoutMs: 20 * 60 * 1000 });
  } catch (error) {
    audit({ ip: actorIp, serverId: server.id, action: 'configure-monerod-tor', status: 'error', details: error.message });
    throw error;
  }
  audit({ ip: actorIp, serverId: server.id, action: 'configure-monerod-tor', status: result.code === 0 ? 'ok' : 'error', details: { code: result.code } });
  if (result.code !== 0) throw new Error(`Tor setup failed: ${result.stderr.trim() || result.stdout.slice(-2500)}`);

  const freshMonerod = (await getMonerodInstallStatus(serverId)).monerod;
  const after = await getMonerodTorStatus(serverId, freshMonerod);
  if (!after.tor.ready) throw new Error('Tor setup finished, but onion service is not fully ready');
  return { ok: true, alreadyConfigured: false, tor: after.tor, monerod: freshMonerod, output: result.stdout };
}
