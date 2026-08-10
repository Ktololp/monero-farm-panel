import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, getSetting, audit } from './db.js';
import { ssh, safeServiceName, shellQuote } from './ssh.js';
import { config } from './config.js';
import { discoverServer, getDiscovery } from './discovery.js';
import { pollServerNow } from './monitor.js';
import { updateXmrigBinary } from './updates.js';

function serverById(id) {
  const row = db.prepare('SELECT * FROM servers WHERE id=?').get(Number(id));
  if (!row) throw new Error('Сервер не найден');
  return row;
}
function validateWallet(wallet) {
  if (!wallet) throw new Error('Глобальный XMR-кошелёк не задан');
  if (!/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{90,110}$/.test(wallet)) throw new Error('Формат XMR-кошелька выглядит некорректно');
}
function validatePool(pool) { if (!pool || pool.length > 300 || /[\r\n\0]/.test(pool)) throw new Error('Некорректный адрес пула'); }

async function readConfig(server) {
  const p = shellQuote(server.xmrig_config_path);
  let r = await ssh.exec(server, `cat ${p}`, { timeoutMs: 8000 });
  if (r.code !== 0) r = await ssh.sudoExec(server, `cat ${p}`, { timeoutMs: 8000 });
  if (r.code !== 0) throw new Error(`Не удалось прочитать XMRig config: ${r.stderr.trim()}`);
  try { return JSON.parse(r.stdout); } catch (e) { throw new Error(`XMRig config содержит некорректный JSON: ${e.message}`); }
}
async function writeConfig(server, object) {
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

export const performanceProfiles = {
  maximum: { id:'maximum', name:'Максимум', percent:100, yield:false, priority:2, description:'Максимальный RandomX-хешрейт. XMRig получает до 100% автоматически доступных потоков; отзывчивость системы ниже.' },
  balanced: { id:'balanced', name:'Баланс', percent:85, yield:true, priority:1, description:'Около 85% автоматически доступных потоков, нормальная отзывчивость SSH и системных служб.' },
  eco: { id:'eco', name:'Эко', percent:65, yield:true, priority:1, description:'Около 65% потоков. Меньше нагрев и энергопотребление, ниже хешрейт.' }
};

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

export async function restartXmrig(serverId, { actorIp = '', auditAction = true } = {}) {
  const server = serverById(serverId); const service = safeServiceName(server.xmrig_service || 'xmrig');
  const r = await ssh.sudoExec(server, `systemctl restart ${service}`, { timeoutMs: 20000 });
  if (r.code !== 0) throw new Error(`Перезапуск не удался: ${r.stderr.trim() || r.stdout.trim()}`);
  if (auditAction) audit({ ip: actorIp, serverId: server.id, action: 'restart-xmrig', details: service });
  return { ok: true, output: r.stdout.trim(), graceSeconds: Number(getSetting('grace_period_seconds')) || 90 };
}

export async function waitForMiner(serverId, { timeoutMs=180000, intervalMs=10000, progress=()=>{} }={}) {
  const end=Date.now()+timeoutMs; let last=null;
  while(Date.now()<end){
    await new Promise(r=>setTimeout(r,intervalMs));
    try{last=await pollServerNow(serverId);if(last.status==='online' && Number(last.hash10s||last.hash60s)>0)return last;}catch{}
    progress(last);
  }
  throw new Error(`XMRig не вернулся в online за ${Math.round(timeoutMs/1000)} секунд`);
}

export async function applyPerformanceProfile(serverId, profileId, { actorIp='' }={}) {
  const server=serverById(serverId); const profile=performanceProfiles[profileId]; if(!profile)throw new Error('Неизвестный профиль производительности');
  const cfg=await readConfig(server); cfg.cpu ||= {};
  let backup={}; try{backup=server.performance_backup_json?JSON.parse(server.performance_backup_json):{};}catch{}
  if(!Object.keys(backup).length){
    for(const k of ['rx','rx/wow','rx/arq','rx/keva','max-threads-hint','yield','priority']) if(k in cfg.cpu) backup[k]=cfg.cpu[k];
    db.prepare('UPDATE servers SET performance_backup_json=? WHERE id=?').run(JSON.stringify(backup),server.id);
  }
  // Restore original generated RandomX profile before applying a new percentage.
  for(const k of ['rx','rx/wow','rx/arq','rx/keva']) {
    if(k in backup) cfg.cpu[k]=structuredClone(backup[k]);
  }
  cfg.cpu['max-threads-hint']=profile.percent; cfg.cpu.yield=profile.yield; cfg.cpu.priority=profile.priority;
  // If a generated rx array already exists, trim it deterministically; this makes profiles effective even with autosave=true.
  if(Array.isArray(cfg.cpu.rx) && cfg.cpu.rx.length>1 && profile.percent<100){cfg.cpu.rx=cfg.cpu.rx.slice(0,Math.max(1,Math.round(cfg.cpu.rx.length*profile.percent/100)));}
  if(profile.percent===100 && Array.isArray(backup.rx)) cfg.cpu.rx=structuredClone(backup.rx);
  await writeConfig(server,cfg); db.prepare('UPDATE servers SET performance_profile=?,updated_at=? WHERE id=?').run(profileId,Date.now(),server.id);
  await restartXmrig(server.id,{actorIp,auditAction:false}); audit({ip:actorIp,serverId:server.id,action:'performance-profile',details:profileId});
  return {ok:true,profile};
}

export async function setHugePages(serverId, { mode, count, reboot = false, actorIp = '' }) {
  const server = serverById(serverId); count = Math.max(0, Math.min(1024 * 1024, Number(count) || 0)); let cmd; let rebootRequired = false;
  if (mode === '2m') cmd = `printf 'vm.nr_hugepages=%s\\n' ${count} > /etc/sysctl.d/99-monero-farm-panel.conf && sysctl -p /etc/sysctl.d/99-monero-farm-panel.conf >/dev/null`;
  else if (mode === '1g') { rebootRequired = true; const grubScript = `# managed by monero-farm-panel\nGRUB_CMDLINE_LINUX_DEFAULT="$(printf '%s' "$GRUB_CMDLINE_LINUX_DEFAULT" | sed -E 's/(^| )default_hugepagesz=[^ ]+//g; s/(^| )hugepagesz=[^ ]+//g; s/(^| )hugepages=[0-9]+//g') default_hugepagesz=1G hugepagesz=1G hugepages=${count}"\n`; const b64 = Buffer.from(grubScript).toString('base64'); cmd = `mkdir -p /etc/default/grub.d; printf %s ${shellQuote(b64)} | base64 -d > /etc/default/grub.d/99-monero-farm-panel.cfg && update-grub`; }
  else throw new Error('mode должен быть 2m или 1g');
  const r = await ssh.sudoExec(server, cmd, { timeoutMs: 30000 }); if (r.code !== 0) throw new Error(`Настройка Huge Pages не удалась: ${r.stderr.trim()}`);
  if (reboot && rebootRequired) await ssh.sudoExec(server, 'systemctl reboot', { timeoutMs: 5000 }).catch(() => {});
  audit({ ip: actorIp, serverId: server.id, action: 'set-huge-pages', details: { mode, count, reboot } }); return { ok: true, rebootRequired: rebootRequired && !reboot };
}

export async function setMsr(serverId, { enabled, actorIp = '' }) {
  const server = serverById(serverId); const cfg = await readConfig(server); cfg.randomx ||= {}; cfg.randomx.rdmsr = Boolean(enabled); cfg.randomx.wrmsr = Boolean(enabled); await writeConfig(server, cfg);
  if (enabled) { const r = await ssh.sudoExec(server, 'modprobe msr && printf "msr\\n" > /etc/modules-load.d/monero-farm-panel.conf', { timeoutMs: 10000 }); if (r.code !== 0) throw new Error(`Не удалось загрузить модуль msr: ${r.stderr.trim()}`); }
  await restartXmrig(serverId, { actorIp, auditAction: false }); audit({ ip: actorIp, serverId: server.id, action: 'set-msr', details: { enabled: Boolean(enabled) } }); return { ok: true };
}

export async function autoFixServer(serverId,{actorIp=''}={}){
  let server=serverById(serverId); let inventory=getDiscovery(server);
  if(!inventory?.xmrig?.binary) inventory=await discoverServer(server.id,{apply:true,actorIp});
  server=serverById(server.id); const settings=getSettings({includeSecrets:true}); const fixes=[];
  const prereq=await ssh.exec(server,"command -v curl >/dev/null && command -v sensors >/dev/null && command -v python3 >/dev/null",{timeoutMs:7000});
  if(prereq.code!==0){const r=await ssh.sudoExec(server,'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y curl lm-sensors python3',{timeoutMs:120000});if(r.code!==0)throw new Error(`Не удалось установить диагностические пакеты: ${r.stderr.trim()}`);fixes.push('Установлены curl/lm-sensors/python3');}
  const cfg=await readConfig(server); let changed=false; cfg.http ||= {};
  if(cfg.http.enabled!==true||cfg.http.host!=='127.0.0.1'||Number(cfg.http.port)!==Number(server.xmrig_api_port)){cfg.http.enabled=true;cfg.http.host='127.0.0.1';cfg.http.port=Number(server.xmrig_api_port||60050);cfg.http.restricted=true;changed=true;fixes.push(`Включён XMRig API 127.0.0.1:${server.xmrig_api_port}`);}
  cfg.cpu ||= {}; if(String(settings.huge_pages_enabled)!=='0'&&cfg.cpu['huge-pages']!==true){cfg.cpu['huge-pages']=true;changed=true;fixes.push('Huge Pages включены в XMRig config');}
  cfg.randomx ||= {}; if(String(settings.huge_pages_1g)!=='0'&&cfg.randomx['1gb-pages']!==true){cfg.randomx['1gb-pages']=true;changed=true;fixes.push('1GB Pages включены в XMRig config');}
  if(String(settings.msr_enabled)!=='0'){if(cfg.randomx.rdmsr!==true||cfg.randomx.wrmsr!==true){cfg.randomx.rdmsr=true;cfg.randomx.wrmsr=true;changed=true;fixes.push('MSR включён в XMRig config');}const mr=await ssh.sudoExec(server,'modprobe msr; printf "msr\\n" > /etc/modules-load.d/monero-farm-panel.conf',{timeoutMs:10000});if(mr.code===0)fixes.push('Модуль msr загружен');}
  if(changed){await writeConfig(server,cfg);await restartXmrig(server.id,{actorIp,auditAction:false});fixes.push('Сервис майнинга перезапущен');}
  audit({ip:actorIp,serverId:server.id,action:'auto-fix',details:fixes}); return {ok:true,fixes,changed};
}

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
export async function runCommand(serverId, command, { actorIp = '' } = {}) { const server=serverById(serverId);if(!command||command.length>10000)throw new Error('Команда пустая или слишком длинная');const r=await ssh.exec(server,command,{timeoutMs:120000,maxBytes:4_000_000,pty:false});audit({ip:actorIp,serverId:server.id,action:'remote-command',status:r.code===0?'ok':'error',details:{command,code:r.code}});return r; }

export async function bootstrapServer(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId); const settings = getSettings({ includeSecrets: true }); validateWallet(settings.wallet); validatePool(settings.pool_url); const script = fs.readFileSync(path.resolve('scripts/remote-bootstrap.sh'), 'utf8');
  const env = { TARGET_USER: server.username, XMRIG_VERSION: options.xmrigVersion || settings.xmrig_version || '6.26.0', WALLET: settings.wallet, POOL_URL: settings.pool_url, POOL_PASS: settings.pool_pass || 'x', POOL_TLS: String(settings.pool_tls) === '1' ? '1' : '0', XMRIG_API_PORT: String(server.xmrig_api_port || 60050), INSTALL_P2POOL: options.installP2pool ? '1' : '0', P2POOL_SIDECHAIN: options.p2poolSidechain || 'mini', MONERO_HOST: options.moneroHost || '127.0.0.1', PANEL_PUBLIC_KEY: config.panelPublicKey || '' };
  if (!/^\d+\.\d+\.\d+$/.test(env.XMRIG_VERSION)) throw new Error('Некорректная версия XMRig'); if (!['mini','main','nano'].includes(env.P2POOL_SIDECHAIN)) throw new Error('Некорректный p2pool sidechain');
  const r=await ssh.runScript(server,script,env,{sudo:true,timeoutMs:45*60*1000});audit({ip:actorIp,serverId:server.id,action:'bootstrap-server',status:r.code===0?'ok':'error',details:{code:r.code,installP2pool:options.installP2pool}});if(r.code!==0)throw new Error(`Bootstrap failed: ${r.stderr.trim()||r.stdout.slice(-2000)}`);return {ok:true,output:r.stdout};
}

export async function rollingRestart(serverIds,{actorIp='',progress=()=>{}}={}){
  const ids=[...new Set(serverIds.map(Number))].filter(Boolean);const results=[];
  for(let i=0;i<ids.length;i++){const s=serverById(ids[i]);progress({progress:Math.round(i/ids.length*100),currentServerId:s.id,details:`Перезапуск ${s.name} (${i+1}/${ids.length})`});try{await restartXmrig(s.id,{actorIp});await waitForMiner(s.id,{timeoutMs:Math.max(120000,(Number(getSetting('grace_period_seconds'))||90)*2000),progress:()=>{}});results.push({id:s.id,name:s.name,ok:true});}catch(e){results.push({id:s.id,name:s.name,ok:false,error:e.message});throw new Error(`Rolling restart остановлен на ${s.name}: ${e.message}`);}}
  return results;
}

export async function rollingUpdateXmrig(serverIds,version,{actorIp='',progress=()=>{}}={}){
  const ids=[...new Set(serverIds.map(Number))].filter(Boolean);const results=[];
  for(let i=0;i<ids.length;i++){
    const s=serverById(ids[i]);
    progress({progress:Math.round(i/ids.length*100),currentServerId:s.id,details:`Обновление ${s.name} до XMRig ${version} (${i+1}/${ids.length})`});
    const update=await updateXmrigBinary(s.id,version,{actorIp,progress:(msg)=>progress({currentServerId:s.id,details:msg})});
    try{
      await waitForMiner(s.id,{timeoutMs:240000});
      results.push({id:s.id,name:s.name,ok:true,version});
    }catch(e){
      progress({currentServerId:s.id,details:`Health-check ${s.name} не пройден. Возврат предыдущего XMRig…`});
      const target=shellQuote(update.binary),backup=shellQuote(update.backup),service=safeServiceName(update.service||s.xmrig_service||'xmrig');
      const rr=await ssh.sudoExec(s,`set -e; test -f ${backup}; cp -a ${backup} ${target}; systemctl restart ${service}`,{timeoutMs:30000});
      audit({ip:actorIp,serverId:s.id,action:'xmrig-update-rollback',status:rr.code===0?'ok':'error',details:{version,reason:e.message}});
      if(rr.code===0){try{await waitForMiner(s.id,{timeoutMs:240000});}catch{}}
      throw new Error(`Rolling update остановлен на ${s.name}: новая версия не прошла health-check и была ${rr.code===0?'откачена':'НЕ откачена автоматически'}. ${e.message}`);
    }
  }
  progress({progress:100,details:`Rolling update XMRig ${version} завершён`});
  return results;
}
