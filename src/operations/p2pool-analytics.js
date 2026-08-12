import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../database/index.js';
import { ssh } from '../ssh/index.js';
import { pollServerNow } from '../monitoring/index.js';
import { serverById } from './server.js';

export async function enableP2poolAnalytics(serverId, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const script = fs.readFileSync(path.resolve('scripts/remote-enable-p2pool-analytics.sh'), 'utf8');
  const apiDir = `/home/${server.username}/.local/share/monero-farm-panel/p2pool-api`;

  const result = await ssh.runScript(server, script, {
    TARGET_USER: server.username,
    API_DIR: apiDir
  }, { sudo: true, timeoutMs: 4 * 60 * 1000 });

  const alreadyEnabled = /MFP_ALREADY=1/.test(result.stdout);
  const pathMatch = result.stdout.match(/MFP_P2POOL_API_DIR=(.+)/);
  const unitMatch = result.stdout.match(/MFP_SYSTEMD_UNIT=(.+)/);

  audit({
    ip: actorIp,
    serverId: server.id,
    action: 'enable-p2pool-analytics',
    status: result.code === 0 ? 'ok' : 'error',
    details: {
      code: result.code,
      alreadyEnabled,
      apiDir: pathMatch?.[1]?.trim() || apiDir,
      systemdUnit: unitMatch?.[1]?.trim() || ''
    }
  });

  if (result.code !== 0) throw new Error(`Не удалось включить P2Pool аналитику: ${result.stderr.trim() || result.stdout.slice(-3000)}`);

  await new Promise(resolve => setTimeout(resolve, 1500));
  const live = await pollServerNow(server.id).catch(() => null);
  return {
    ok: true,
    alreadyEnabled,
    apiDir: pathMatch?.[1]?.trim() || apiDir,
    systemdUnit: unitMatch?.[1]?.trim() || '',
    live,
    message: alreadyEnabled ? 'P2Pool аналитика уже включена' : 'P2Pool аналитика включена'
  };
}
