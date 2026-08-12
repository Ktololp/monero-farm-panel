import { getSetting, audit } from '../database/index.js';
import { ssh, safeServiceName, shellQuote } from '../ssh/index.js';
import { updateXmrigBinary } from '../updates/index.js';
import { serverById } from './server.js';
import { restartXmrig, waitForMiner } from './miner-control.js';

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
