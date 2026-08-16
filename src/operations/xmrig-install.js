import fs from 'node:fs';
import path from 'node:path';
import { getSettings, audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { serverById, validateWallet, validatePool } from './server.js';

const statusScript = fs.readFileSync(path.resolve('scripts/remote-status-xmrig.sh'), 'utf8');

function unitName(server) {
  const raw = safeServiceName(server.xmrig_service || 'xmrig');
  return raw.endsWith('.service') ? raw : `${raw}.service`;
}

function parseStatus(output = '') {
  const values = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = /^MFP_([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  const versionMatch = String(values.VERSION || '').match(/(\d+\.\d+\.\d+)/);
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
    active: values.ACTIVE === '1'
  };
  status.detected = status.installed || status.processDetected || (status.serviceInstalled && status.active);
  status.ready = status.detected && status.configExists && status.serviceInstalled && status.enabled && status.active;
  return status;
}

export async function getXmrigInstallStatus(serverId) {
  const server = serverById(serverId);
  const env = {
    XMRIG_CONFIG_PATH: server.xmrig_config_path || '/opt/xmrig/config.json',
    XMRIG_SERVICE_UNIT: unitName(server)
  };
  const result = await ssh.runScript(server, statusScript, env, { sudo: false, timeoutMs: 15000 });
  if (result.code !== 0) throw new Error(`XMRig status check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  return { ok: true, xmrig: parseStatus(result.stdout) };
}

export async function installXmrig(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const before = await getXmrigInstallStatus(serverId);
  if (before.xmrig.ready && !options.force) return { ok: true, alreadyInstalled: true, xmrig: before.xmrig, output: '' };

  const settings = getSettings({ includeSecrets: true });
  validateWallet(settings.wallet);
  validatePool(settings.pool_url);
  const version = String(options.xmrigVersion || settings.xmrig_version || '6.26.0').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Некорректная версия XMRig');

  const script = fs.readFileSync(path.resolve('scripts/remote-install-xmrig.sh'), 'utf8');
  const env = {
    XMRIG_VERSION: version,
    WALLET: settings.wallet,
    POOL_URL: settings.pool_url,
    POOL_PASS: settings.pool_pass || 'x',
    POOL_TLS: String(settings.pool_tls) === '1' ? '1' : '0',
    XMRIG_API_PORT: String(server.xmrig_api_port || 60050),
    XMRIG_CONFIG_PATH: before.xmrig.configPath || server.xmrig_config_path || '/opt/xmrig/config.json',
    XMRIG_SERVICE_UNIT: unitName(server)
  };

  let result;
  try {
    result = await ssh.runScript(server, script, env, { sudo: true, timeoutMs: 45 * 60 * 1000 });
  } catch (error) {
    audit({ ip: actorIp, serverId: server.id, action: 'install-xmrig', status: 'error', details: error.message });
    throw error;
  }
  audit({ ip: actorIp, serverId: server.id, action: 'install-xmrig', status: result.code === 0 ? 'ok' : 'error', details: { code: result.code, version } });
  if (result.code !== 0) throw new Error(`XMRig installation failed: ${result.stderr.trim() || result.stdout.slice(-2000)}`);

  const after = await getXmrigInstallStatus(serverId);
  if (!after.xmrig.ready) throw new Error('XMRig installation finished, but the service is not fully ready');
  return { ok: true, alreadyInstalled: false, xmrig: after.xmrig, output: result.stdout };
}
