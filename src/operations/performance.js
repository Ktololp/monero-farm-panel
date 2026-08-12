import { db, audit } from '../database/index.js';
import { serverById } from './server.js';
import { readConfig, writeConfig } from './xmrig-config.js';
import { restartXmrig } from './miner-control.js';

export const performanceProfiles = {
  maximum: { id:'maximum', name:'Максимум', percent:100, yield:false, priority:2, description:'Максимальный RandomX-хешрейт. XMRig получает до 100% автоматически доступных потоков; отзывчивость системы ниже.' },
  balanced: { id:'balanced', name:'Баланс', percent:85, yield:true, priority:1, description:'Около 85% автоматически доступных потоков, нормальная отзывчивость SSH и системных служб.' },
  eco: { id:'eco', name:'Эко', percent:65, yield:true, priority:1, description:'Около 65% потоков. Меньше нагрев и энергопотребление, ниже хешрейт.' }
};

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
