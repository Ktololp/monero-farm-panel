import { getSettings, audit } from '../database/index.js';
import { ssh, shellQuote } from '../ssh/index.js';
import { serverById, validateWallet, validatePool } from './server.js';
import { restartXmrig } from './miner-control.js';

export async function readConfig(server) {
  const p = shellQuote(server.xmrig_config_path);
  let r = await ssh.exec(server, `cat ${p}`, { timeoutMs: 8000 });
  if (r.code !== 0) r = await ssh.sudoExec(server, `cat ${p}`, { timeoutMs: 8000 });
  if (r.code !== 0) throw new Error(`Не удалось прочитать XMRig config: ${r.stderr.trim()}`);
  try { return JSON.parse(r.stdout); } catch (e) { throw new Error(`XMRig config содержит некорректный JSON: ${e.message}`); }
}

export async function writeConfig(server, object) {
  const json = `${JSON.stringify(object, null, 4)}\n`;
  const b64 = Buffer.from(json).toString('base64');
  const target = server.xmrig_config_path;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cmd = `set -eu; target=${shellQuote(target)}; if [ -f "$target" ]; then cp -a "$target" "$target.bak-${stamp}"; printf %s ${shellQuote(b64)} | base64 -d > "$target.tmp"; chown --reference="$target" "$target.tmp"; chmod --reference="$target" "$target.tmp"; else printf %s ${shellQuote(b64)} | base64 -d > "$target.tmp"; chmod 600 "$target.tmp"; fi; mv "$target.tmp" "$target"`;
  let r = await ssh.sudoExec(server, cmd, { timeoutMs: 10000 });
  if (r.code !== 0) {
    const fallback = `set -eu; target=${shellQuote(target)}; cp -a "$target" "$target.bak-${stamp}" 2>/dev/null || true; printf %s ${shellQuote(b64)} | base64 -d > "$target.tmp"; mv "$target.tmp" "$target"`;
    r = await ssh.exec(server, fallback, { timeoutMs: 10000 });
  }
  if (r.code !== 0) throw new Error(`Не удалось записать XMRig config: ${r.stderr.trim()}`);
}

export async function applyMiningConfig(serverId, { actorIp = '' } = {}) {
  const server = serverById(serverId); const settings = getSettings({ includeSecrets: true });
  validateWallet(settings.wallet); validatePool(settings.pool_url);
  const cfg = await readConfig(server);
  cfg.http ||= {}; cfg.http.enabled = true; cfg.http.host = '127.0.0.1'; cfg.http.port = Number(server.xmrig_api_port || 60050); cfg.http.restricted = true;
  cfg.cpu ||= {}; cfg.cpu.enabled = true; cfg.cpu['huge-pages'] = String(settings.huge_pages_enabled) !== '0';
  cfg.randomx ||= {}; cfg.randomx['1gb-pages'] = String(settings.huge_pages_1g) !== '0'; cfg.randomx.rdmsr = String(settings.msr_enabled) !== '0'; cfg.randomx.wrmsr = String(settings.msr_enabled) !== '0';
  cfg.pools ||= [{}]; if (!cfg.pools.length) cfg.pools.push({});
  cfg.pools[0] = { ...cfg.pools[0], url: settings.pool_url, user: settings.wallet, pass: settings.pool_pass || 'x', tls: String(settings.pool_tls) === '1', keepalive: true };
  await writeConfig(server, cfg); await restartXmrig(serverId, { actorIp, auditAction: false });
  audit({ ip: actorIp, serverId: server.id, action: 'apply-mining-config', details: `pool=${settings.pool_url}` }); return { ok: true };
}
