import { audit } from '../database/index.js';
import { ssh, shellQuote } from '../ssh/index.js';
import { readConfig, writeConfig } from './xmrig-config.js';
import { restartXmrig, waitForMiner } from './miner-control.js';
import { serverById } from './server.js';

const PROXY_URL = '127.0.0.1:3334';

function isProxyUrl(value) {
  return /^(?:127\.0\.0\.1|localhost|\[::1\]):3334$/i.test(String(value || '').trim());
}

async function proxyPreflight(server) {
  const active = await ssh.exec(server, "systemctl is-active --quiet xmrig-proxy && ss -lnt | grep -Eq ':(3334)[[:space:]]'", { timeoutMs: 8000 });
  if (active.code !== 0) throw new Error('XMRig Proxy не запущен или порт 3334 не слушается');

  const py = [
    'import json',
    "p='/etc/xmrig-proxy/config.json'",
    'c=json.load(open(p))',
    "print(str(((c.get('pools') or [{}])[0]).get('url') or ''))"
  ].join(';');
  const upstream = await ssh.exec(server, `python3 -c ${shellQuote(py)}`, { timeoutMs: 8000 });
  if (upstream.code === 0 && isProxyUrl(upstream.stdout.trim())) {
    throw new Error('Защита от цикла: upstream самого XMRig Proxy указывает на его же порт 3334');
  }
}

export async function switchXmrigToProxy(serverId, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  await proxyPreflight(server);

  const cfg = await readConfig(server);
  cfg.pools ||= [{}];
  if (!cfg.pools.length) cfg.pools.push({});
  const currentUrl = String(cfg.pools[0]?.url || '');

  if (isProxyUrl(currentUrl)) {
    audit({ ip: actorIp, serverId: server.id, action: 'xmrig-to-proxy', details: { alreadyConfigured: true } });
    return { ok: true, alreadyConfigured: true, pool: PROXY_URL, message: 'XMRig уже использует XMRig Proxy' };
  }

  const original = structuredClone(cfg);
  cfg.pools[0] = { ...cfg.pools[0], url: PROXY_URL, keepalive: true };

  await writeConfig(server, cfg);
  try {
    await restartXmrig(server.id, { actorIp, auditAction: false });
    const live = await waitForMiner(server.id, { timeoutMs: 240_000, intervalMs: 10_000 });
    audit({ ip: actorIp, serverId: server.id, action: 'xmrig-to-proxy', details: { from: currentUrl, to: PROXY_URL } });
    return { ok: true, pool: PROXY_URL, previousPool: currentUrl, live };
  } catch (error) {
    let rollbackError = '';
    try {
      await writeConfig(server, original);
      await restartXmrig(server.id, { actorIp, auditAction: false });
      await waitForMiner(server.id, { timeoutMs: 240_000, intervalMs: 10_000 }).catch(() => null);
    } catch (e) {
      rollbackError = e.message;
    }
    audit({
      ip: actorIp,
      serverId: server.id,
      action: 'xmrig-to-proxy',
      status: 'error',
      details: { from: currentUrl, to: PROXY_URL, error: error.message, rollbackError }
    });
    throw new Error(`XMRig не восстановил майнинг через Proxy. Исходный config восстановлен${rollbackError ? `; ошибка проверки rollback: ${rollbackError}` : ''}.`);
  }
}
