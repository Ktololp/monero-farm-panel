import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { getSettings, audit } from '../database/index.js';
import { ssh } from '../ssh/index.js';
import { serverById, validatePool, validateWallet } from './server.js';

const LATEST_RELEASE = 'https://api.github.com/repos/xmrig/xmrig-proxy/releases/latest';

function port(value, fallback) {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('Порт XMRig Proxy должен быть от 1024 до 65535');
  return n;
}

function cleanBindHost(value) {
  const host = String(value || '0.0.0.0').trim();
  if (!/^(?:0\.0\.0\.0|127\.0\.0\.1|::|[A-Za-z0-9_.:-]+)$/.test(host) || /[\s\r\n]/.test(host)) throw new Error('Некорректный bind host XMRig Proxy');
  return host;
}

async function runningProxy(server) {
  const r = await ssh.exec(server, "if pgrep -x xmrig-proxy >/dev/null 2>&1 || systemctl is-active --quiet xmrig-proxy 2>/dev/null; then echo RUNNING; fi", { timeoutMs: 8000 });
  if (!r.stdout.includes('RUNNING')) return null;
  const v = await ssh.exec(server, "/opt/xmrig-proxy/xmrig-proxy --version 2>/dev/null | head -n 1 || true", { timeoutMs: 8000 });
  const m = v.stdout.match(/(\d+\.\d+\.\d+)/);
  return { version: m?.[1] || '' };
}

async function latestLinuxX64Release() {
  const response = await fetch(LATEST_RELEASE, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Monero-Farm-Panel/1.2' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`GitHub XMRig Proxy release HTTP ${response.status}`);
  const release = await response.json();
  if (release.prerelease || release.draft) throw new Error('Последний XMRig Proxy release не является стабильным');

  const version = String(release.tag_name || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Некорректная версия XMRig Proxy в GitHub Release');

  const asset = (release.assets || []).find(a => /^xmrig-proxy-\d+\.\d+\.\d+-linux-static-x64\.tar\.gz$/.test(a.name));
  if (!asset?.browser_download_url) throw new Error('В официальном релизе нет linux-static-x64 архива XMRig Proxy');

  let sha256 = String(asset.digest || '').replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    const sumsAsset = (release.assets || []).find(a => a.name === 'SHA256SUMS');
    if (!sumsAsset?.browser_download_url) throw new Error('Не найден SHA256SUMS для XMRig Proxy');
    const sums = await fetch(sumsAsset.browser_download_url, { headers: { 'user-agent': 'Monero-Farm-Panel/1.2' }, signal: AbortSignal.timeout(10_000) });
    if (!sums.ok) throw new Error(`SHA256SUMS HTTP ${sums.status}`);
    const line = (await sums.text()).split(/\r?\n/).find(x => x.trim().endsWith(asset.name));
    sha256 = line?.trim().split(/\s+/)[0] || '';
  }
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Не удалось получить SHA256 официального XMRig Proxy');

  return { version, assetName: asset.name, url: asset.browser_download_url, sha256: sha256.toLowerCase() };
}

export async function installXmrigProxy(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);

  const existing = await runningProxy(server);
  if (existing) {
    audit({ ip: actorIp, serverId: server.id, action: 'install-xmrig-proxy', details: { alreadyInstalled: true, version: existing.version } });
    return { ok: true, alreadyInstalled: true, version: existing.version, message: 'XMRig Proxy уже установлен и запущен' };
  }

  const arch = await ssh.exec(server, 'uname -m', { timeoutMs: 8000 });
  const machine = arch.stdout.trim();
  if (!['x86_64', 'amd64'].includes(machine)) {
    throw new Error(`Автоустановка XMRig Proxy пока поддерживает Linux x86_64. На сервере: ${machine || 'неизвестно'}`);
  }

  const settings = getSettings({ includeSecrets: true });
  const upstream = String(options.upstream || settings.pool_url || '').trim();
  const upstreamUser = String(options.upstreamUser || settings.wallet || '').trim();
  validatePool(upstream);
  validateWallet(upstreamUser);

  const bindHost = cleanBindHost(options.bindHost);
  const bindPort = port(options.bindPort, 3334);
  const apiPort = port(options.apiPort, 60051);
  if (bindPort === apiPort) throw new Error('Stratum port и HTTP API port должны отличаться');

  const release = await latestLinuxX64Release();
  const script = fs.readFileSync(path.resolve('scripts/remote-install-xmrig-proxy.sh'), 'utf8');
  const apiToken = randomBytes(24).toString('hex');
  const env = {
    TARGET_USER: server.username,
    PROXY_VERSION: release.version,
    PROXY_ASSET_URL: release.url,
    PROXY_ASSET_NAME: release.assetName,
    PROXY_SHA256: release.sha256,
    UPSTREAM_URL: upstream,
    UPSTREAM_USER: upstreamUser,
    UPSTREAM_PASS: String(options.upstreamPass ?? settings.pool_pass ?? 'x'),
    UPSTREAM_TLS: String(options.upstreamTls ?? settings.pool_tls) === '1' || options.upstreamTls === true ? '1' : '0',
    BIND_HOST: bindHost,
    BIND_PORT: String(bindPort),
    API_PORT: String(apiPort),
    API_TOKEN: apiToken
  };

  const result = await ssh.runScript(server, script, env, { sudo: true, timeoutMs: 10 * 60 * 1000 });
  audit({
    ip: actorIp,
    serverId: server.id,
    action: 'install-xmrig-proxy',
    status: result.code === 0 ? 'ok' : 'error',
    details: { version: release.version, bind: `${bindHost}:${bindPort}`, apiPort, upstream, code: result.code }
  });
  if (result.code !== 0) throw new Error(`XMRig Proxy install failed: ${result.stderr.trim() || result.stdout.slice(-3000)}`);

  return { ok: true, version: release.version, bindHost, bindPort, apiPort, upstream, output: result.stdout };
}
