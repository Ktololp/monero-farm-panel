import { ssh, safeServiceName, shellQuote } from '../ssh/index.js';
import { getDiscovery } from '../discovery/index.js';
import { serverById } from './server.js';

export async function getXmrigLog(serverId, lines = 300) {
  const server=serverById(serverId),service=safeServiceName(server.xmrig_service||'xmrig');
  lines=Math.max(10,Math.min(5000,Number(lines)||300));
  let r=await ssh.exec(server,`journalctl -u ${service} -n ${lines} --no-pager -o short-iso 2>&1`,{timeoutMs:10000,maxBytes:4_000_000});
  if(r.code!==0||/permission denied|not permitted/i.test(r.stdout+r.stderr))r=await ssh.sudoExec(server,`journalctl -u ${service} -n ${lines} --no-pager -o short-iso`,{timeoutMs:10000,maxBytes:4_000_000});
  return r.stdout||r.stderr;
}

function componentLogCommand({ component, processName, service, xmrigService, paths, lines }) {
  const unique=[...new Set(paths.filter(Boolean))];
  const pathArgs=unique.map(shellQuote).join(' ');
  const fileProbe=pathArgs ? `for f in ${pathArgs}; do if [ -r "$f" ]; then printf '[source: %s]\n' "$f"; tail -n ${lines} "$f"; exit 0; fi; done;` : '';
  const dedicatedService=service!==xmrigService
    ? `if systemctl status ${service} >/dev/null 2>&1; then printf '[source: journalctl -u ${service}]\n'; journalctl -u ${service} -n ${lines} --no-pager -o short-iso; exit 0; fi;`
    : '';
  return `${fileProbe}
pid=$(pgrep -xo ${processName} 2>/dev/null || true)
if [ -n "$pid" ]; then
  out=$(journalctl _PID="$pid" -n ${lines} --no-pager -o short-iso 2>/dev/null || true)
  if [ -n "$out" ]; then printf '[source: journalctl _PID=%s]\n%s\n' "$pid" "$out"; exit 0; fi
fi
${dedicatedService}
printf '${component} log unavailable. Separate log file was not found; the component may share ${xmrigService}.\n'`;
}

async function readComponentLog(server, options) {
  const cmd=componentLogCommand(options);
  let r=await ssh.exec(server,cmd,{timeoutMs:10000,maxBytes:4_000_000});
  const output=(r.stdout||r.stderr||'').trim();
  if(!output || / log unavailable\./i.test(output)) {
    try {
      const sr=await ssh.sudoExec(server,cmd,{timeoutMs:10000,maxBytes:4_000_000});
      if((sr.stdout||sr.stderr||'').trim()) r=sr;
    } catch {}
  }
  return r.stdout||r.stderr;
}

export async function getP2poolLog(serverId, lines = 200) {
  const server=serverById(serverId),inventory=getDiscovery(server)||{};
  lines=Math.max(10,Math.min(5000,Number(lines)||200));
  const service=safeServiceName(server.p2pool_service||'p2pool');
  const xmrigService=safeServiceName(server.xmrig_service||'xmrig');
  const home=`/home/${server.username}`;
  return readComponentLog(server,{component:'p2pool',processName:'p2pool',service,xmrigService,lines,paths:[inventory.p2pool?.logPath,`${home}/p2pool.log`,server.p2pool_log_path,'/var/log/p2pool.log']});
}

export async function getMonerodLog(serverId, lines = 200) {
  const server=serverById(serverId),inventory=getDiscovery(server)||{};
  lines=Math.max(10,Math.min(5000,Number(lines)||200));
  const service=safeServiceName(server.monerod_service||'monerod');
  const xmrigService=safeServiceName(server.xmrig_service||'xmrig');
  const home=`/home/${server.username}`;
  return readComponentLog(server,{component:'monerod',processName:'monerod',service,xmrigService,lines,paths:[inventory.monerod?.logPath,`${home}/.bitmonero/bitmonero.log`,server.monerod_log_path,'/var/log/monero/monero.log','/var/log/monerod.log']});
}
