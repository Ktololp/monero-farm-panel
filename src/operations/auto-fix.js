import { getSettings, audit } from '../database/index.js';
import { ssh } from '../ssh/index.js';
import { discoverServer, getDiscovery } from '../discovery/index.js';
import { serverById } from './server.js';
import { readConfig, writeConfig } from './xmrig-config.js';
import { restartXmrig } from './miner-control.js';

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
