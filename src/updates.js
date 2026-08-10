import { db, getSetting, audit } from './db.js';
import { ssh, safeServiceName, shellQuote } from './ssh.js';
import { discoverServer, getDiscovery } from './discovery.js';

const REPOS = {
  xmrig: 'xmrig/xmrig',
  p2pool: 'SChernykh/p2pool',
  monero: 'monero-project/monero'
};
let cache = { ts: 0, data: null, error: '' };
let ioRef = null;
let timer = null;

export function setUpdatesIO(io) { ioRef = io; }

function cleanTag(tag) { return String(tag || '').replace(/^v/i,'').replace(/-release$/i,''); }
function versionParts(v) {
  const m=cleanTag(v).match(/(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? m.slice(1).map(x=>Number(x||0)) : null;
}
export function compareVersions(a,b) {
  const A=versionParts(a),B=versionParts(b); if(!A||!B)return null;
  for(let i=0;i<Math.max(A.length,B.length);i++){const d=(A[i]||0)-(B[i]||0);if(d)return d<0?-1:1;} return 0;
}

async function latest(repo) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'Accept':'application/vnd.github+json','User-Agent':'Monero-Farm-Panel/1.0.0' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`GitHub ${repo}: HTTP ${r.status}`);
  const j=await r.json();
  return { repo, tag: j.tag_name || '', version: cleanTag(j.tag_name), name: j.name || j.tag_name || '', publishedAt: j.published_at || '', url: j.html_url || '' };
}

export async function refreshUpdates({ force=false }={}) {
  if (!force && cache.data && Date.now()-cache.ts < 30*60_000) return cache;
  try {
    const [xmrig,p2pool,monero]=await Promise.all([latest(REPOS.xmrig),latest(REPOS.p2pool),latest(REPOS.monero)]);
    cache={ts:Date.now(),data:{xmrig,p2pool,monero},error:''};
    ioRef?.emit('updates:update',cache);
    return cache;
  } catch(e) {
    cache={...cache,ts:Date.now(),error:e.message}; ioRef?.emit('updates:update',cache); return cache;
  }
}

export function getUpdatesState() { return cache; }

export function startUpdateChecker() {
  if (String(getSetting('updates_auto_check')) === '0') return;
  refreshUpdates().catch(()=>{});
  const hours=Math.max(1,Number(getSetting('update_check_hours'))||6);
  timer=setInterval(()=>refreshUpdates({force:true}).catch(()=>{}),hours*3600000);
}
export function stopUpdateChecker(){ if(timer)clearInterval(timer);timer=null; }

function serverById(id){const s=db.prepare('SELECT * FROM servers WHERE id=?').get(Number(id));if(!s)throw new Error('Сервер не найден');return s;}

export async function updateXmrigBinary(serverId, version, { actorIp='', progress=()=>{} }={}) {
  const server=serverById(serverId);
  if(!/^\d+\.\d+\.\d+$/.test(String(version)))throw new Error('Некорректная версия XMRig');
  progress(`Автоопределение XMRig на ${server.name}…`);
  let inv=getDiscovery(server);
  if(!inv?.xmrig?.binary) inv=await discoverServer(server.id,{apply:true,actorIp});
  const binary=inv?.xmrig?.binary;
  if(!binary || !String(binary).startsWith('/')) throw new Error(`Не удалось определить исполняемый файл XMRig на ${server.name}`);
  const service=safeServiceName(server.xmrig_service||inv.xmrig.service||'xmrig');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const buildScript=`set -euo pipefail\nexport DEBIAN_FRONTEND=noninteractive\necho '[1/4] dependencies'\napt-get update -qq\napt-get install -y --no-install-recommends ca-certificates git build-essential cmake pkg-config libuv1-dev libssl-dev libhwloc-dev >/dev/null\necho '[2/4] build XMRig v${version}'\nrm -rf /tmp/mfp-xmrig-update\nGIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch v${version} https://github.com/xmrig/xmrig.git /tmp/mfp-xmrig-update\ncmake -S /tmp/mfp-xmrig-update -B /tmp/mfp-xmrig-update/build -DWITH_HWLOC=ON >/dev/null\nnice -n 15 cmake --build /tmp/mfp-xmrig-update/build -j\"$(nproc)\"\necho '[3/4] backup/install'\ntarget=${shellQuote(binary)}\nbackup=\"$target.bak-${stamp}\"\ncp -a \"$target\" \"$backup\"\ninstall -m 0755 /tmp/mfp-xmrig-update/build/xmrig \"$target\"\necho '[4/4] restart'\nif ! systemctl restart ${service}; then cp -a \"$backup\" \"$target\"; systemctl restart ${service} || true; exit 20; fi\necho \"backup=$backup\"`;
  progress(`Сборка XMRig ${version} на ${server.name}…`);
  const r=await ssh.sudoExec(server,buildScript,{timeoutMs:45*60_000,maxBytes:8_000_000});
  if(r.code!==0)throw new Error(`Обновление XMRig на ${server.name} не удалось: ${r.stderr.trim()||r.stdout.slice(-2000)}`);
  audit({ip:actorIp,serverId:server.id,action:'xmrig-update',details:{version,binary}});
  db.prepare('UPDATE servers SET discovery_json=?,discovered_at=?,updated_at=? WHERE id=?').run('',null,Date.now(),server.id);
  return {ok:true,serverId:server.id,version,binary,backup:`${binary}.bak-${stamp}`,service,output:r.stdout.slice(-4000)};
}

export function versionStatus(installed, latestVersion) {
  const c=compareVersions(installed,latestVersion); return c===null?'unknown':c<0?'update':c===0?'current':'newer';
}
