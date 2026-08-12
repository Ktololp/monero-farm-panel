import { audit } from '../database/index.js';
import { ssh, shellQuote } from '../ssh/index.js';
import { serverById } from './server.js';

export async function setHugePages(serverId, { mode, count, reboot = false, actorIp = '' }) {
  const server = serverById(serverId); count = Math.max(0, Math.min(1024 * 1024, Number(count) || 0)); let cmd; let rebootRequired = false;
  if (mode === '2m') cmd = `printf 'vm.nr_hugepages=%s\\n' ${count} > /etc/sysctl.d/99-monero-farm-panel.conf && sysctl -p /etc/sysctl.d/99-monero-farm-panel.conf >/dev/null`;
  else if (mode === '1g') { rebootRequired = true; const grubScript = `# managed by monero-farm-panel\nGRUB_CMDLINE_LINUX_DEFAULT="$(printf '%s' "$GRUB_CMDLINE_LINUX_DEFAULT" | sed -E 's/(^| )default_hugepagesz=[^ ]+//g; s/(^| )hugepagesz=[^ ]+//g; s/(^| )hugepages=[0-9]+//g') default_hugepagesz=1G hugepagesz=1G hugepages=${count}"\n`; const b64 = Buffer.from(grubScript).toString('base64'); cmd = `mkdir -p /etc/default/grub.d; printf %s ${shellQuote(b64)} | base64 -d > /etc/default/grub.d/99-monero-farm-panel.cfg && update-grub`; }
  else throw new Error('mode должен быть 2m или 1g');
  const r = await ssh.sudoExec(server, cmd, { timeoutMs: 30000 }); if (r.code !== 0) throw new Error(`Настройка Huge Pages не удалась: ${r.stderr.trim()}`);
  if (reboot && rebootRequired) await ssh.sudoExec(server, 'systemctl reboot', { timeoutMs: 5000 }).catch(() => {});
  audit({ ip: actorIp, serverId: server.id, action: 'set-huge-pages', details: { mode, count, reboot } }); return { ok: true, rebootRequired: rebootRequired && !reboot };
}
