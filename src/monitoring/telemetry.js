
import { getSetting } from '../database/index.js';
import { ssh, safeServiceName, shellQuote } from '../ssh/index.js';
import { decryptSecret } from '../security/crypto.js';

const lastNetworkCheck = new Map();
const networkCache = new Map();

export function getCachedNetwork(serverId) {
  return networkCache.get(Number(serverId)) || {};
}

export function parseTemp(data) {
  if (!data || typeof data !== 'object') return null;
  const candidates = [];
  const visit = (node, path = []) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const next = [...path, key];
      if (typeof value === 'number' && /^temp\d*_input$/i.test(key) && value >= 0 && value <= 130) {
        const label = next.join('/');
        let score = 0;
        if (/k10temp|zenpower|coretemp|cpu/i.test(label)) score += 5;
        if (/tctl|tdie|package|core/i.test(label)) score += 4;
        if (/nvme|pch|acpi|wifi|edge|mem/i.test(label)) score -= 3;
        candidates.push({ value, score });
      } else if (typeof value === 'object') visit(value, next);
    }
  };
  visit(data);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  const best = candidates[0].score;
  return Math.max(...candidates.filter(x => x.score === best).map(x => x.value));
}

export function parseSummary(data) {
  const rates = data?.hashrate?.total || [null, null, null];
  return {
    hash10s: Number.isFinite(rates[0]) ? rates[0] : null,
    hash60s: Number.isFinite(rates[1]) ? rates[1] : null,
    hash15m: Number.isFinite(rates[2]) ? rates[2] : null,
    uptime: data?.uptime ?? data?.connection?.uptime ?? null,
    version: data?.version || '',
    pool: data?.connection?.pool || '',
    accepted: data?.connection?.accepted ?? data?.results?.shares_good ?? 0,
    rejected: data?.connection?.rejected ?? Math.max(0, (data?.results?.shares_total || 0) - (data?.results?.shares_good || 0)),
    errors: [...(data?.results?.error_log || []), ...(data?.connection?.error_log || [])].slice(-20),
    hugepagesXMRig: data?.hugepages ?? null,
    algo: data?.algo || data?.connection?.algo || ''
  };
}

export function makeTelemetryScript(server, { checkNetwork = false } = {}) {
  const xsvc = safeServiceName(server.xmrig_service || 'xmrig');
  const psvc = safeServiceName(server.p2pool_service || 'p2pool');
  const msvc = safeServiceName(server.monerod_service || 'monerod');
  const apiPort = Math.max(1, Math.min(65535, Number(server.xmrig_api_port || 60050)));
  const moneroPort = Math.max(1, Math.min(65535, Number(server.monerod_rpc_port || 18081)));
  const token = server.xmrig_api_token_enc ? decryptSecret(server.xmrig_api_token_enc) : '';
  const netHost = String(getSetting('network_check_host') || 'github.com').replace(/[^A-Za-z0-9.-]/g, '') || 'github.com';
  const py = `
import json,os,re,socket,subprocess,time,urllib.request
X=${JSON.stringify(xsvc)}; P=${JSON.stringify(psvc)}; M=${JSON.stringify(msvc)}; AP=${apiPort}; MP=${moneroPort}; TOKEN=${JSON.stringify(token)}; CHECK_NET=${checkNetwork ? 'True' : 'False'}; NET_HOST=${JSON.stringify(netHost)}
def run(args,timeout=4):
 try:
  p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=timeout,check=False)
  return p.returncode,(p.stdout or '').strip(),(p.stderr or '').strip()
 except Exception as e:return 127,'',str(e)
def proc(name):
 c,o,e=run(['pgrep','-x',name]);return bool(o.strip())
def svc(name,procname):
 c,o,e=run(['systemctl','is-active',name]); s=o.strip()
 if s in ('active','activating','reloading'): return 'starting' if s=='activating' else 'active'
 return 'active' if proc(procname) else 'inactive'
def age(name):
 c,o,e=run(['systemctl','show',name,'-p','ActiveEnterTimestampMonotonic','--value'])
 try:
  t=int(o or 0)/1000000.0; up=float(open('/proc/uptime').read().split()[0]); return max(0,up-t) if t else None
 except:return None
out={'components':{'xmrig':svc(X,'xmrig'),'p2pool':svc(P,'p2pool'),'monerod':svc(M,'monerod')},'xmrigServiceAge':age(X)}
# XMRig API
try:
 req=urllib.request.Request('http://127.0.0.1:%d/2/summary'%AP,headers={'Authorization':'Bearer '+TOKEN} if TOKEN else {})
 with urllib.request.urlopen(req,timeout=5) as r: out['xmrig']=json.loads(r.read().decode())
 out['components']['xmrig']='active'
except Exception as e: out['xmrigError']=str(e)
# sensors
try:
 c,o,e=run(['sensors','-j']);out['sensors']=json.loads(o) if c==0 and o else None;out['sensorsAvailable']=c==0
except:out['sensors']=None;out['sensorsAvailable']=False
# CPU frequency/load
try:
 mhz=[]
 for line in open('/proc/cpuinfo',errors='ignore'):
  if line.lower().startswith('cpu mhz'):
   try:mhz.append(float(line.split(':',1)[1]))
   except:pass
 out['cpuMHz']=sum(mhz)/len(mhz) if mhz else None
except:out['cpuMHz']=None
try:
 a=open('/proc/loadavg').read().split();out['load']=[float(a[0]),float(a[1]),float(a[2])];out['cpuCount']=os.cpu_count()
except:out['load']=[None,None,None];out['cpuCount']=os.cpu_count()
# Huge Pages
hp={}
try:
 for line in open('/proc/meminfo'):
  if ':' in line:
   k,v=line.split(':',1);hp[k]=v.strip()
except:pass
def hpi(k):
 try:return int((hp.get(k,'0').split() or ['0'])[0])
 except:return 0
out['hugepages']={'total':hpi('HugePages_Total'),'free':hpi('HugePages_Free'),'reserved':hpi('HugePages_Rsvd'),'sizeKB':hpi('Hugepagesize')}
def readint(p):
 try:return int(open(p).read().strip())
 except:return 0
base='/sys/kernel/mm/hugepages/hugepages-1048576kB/'
out['hugepages']['oneGTotal']=readint(base+'nr_hugepages');out['hugepages']['oneGFree']=readint(base+'free_hugepages')
out['msr']={'module':os.path.exists('/sys/module/msr'),'device':os.path.exists('/dev/cpu/0/msr')}
# Monero get_info
try:
 payload=json.dumps({'jsonrpc':'2.0','id':'0','method':'get_info'}).encode(); req=urllib.request.Request('http://127.0.0.1:%d/json_rpc'%MP,data=payload,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=4) as r: mi=json.loads(r.read().decode()).get('result') or {}
 out['monero']={'height':mi.get('height'),'targetHeight':mi.get('target_height'),'synchronized':mi.get('synchronized'),'incoming':mi.get('incoming_connections_count'),'outgoing':mi.get('outgoing_connections_count'),'nettype':mi.get('nettype'),'version':mi.get('version')}
 out['components']['monerod']='active'
except Exception as e:out['moneroError']=str(e)
if CHECK_NET:
 dns=False; internet=False;err=''
 try:socket.getaddrinfo(NET_HOST,443);dns=True
 except Exception as e:err='DNS: '+str(e)
 try:
  s=socket.create_connection(('1.1.1.1',443),3);s.close();internet=True
 except Exception as e:err=(err+'; ' if err else '')+'Internet: '+str(e)
 out['network']={'dns':dns,'internet':internet,'host':NET_HOST,'error':err}
print(json.dumps(out,ensure_ascii=False))
`;
  const b64 = Buffer.from(py, 'utf8').toString('base64');
  return `printf %s ${shellQuote(b64)} | base64 -d | python3`;
}

export async function collectTelemetry(server) {
  const checkNetwork = String(getSetting('network_check_enabled')) !== '0' && Date.now() - (lastNetworkCheck.get(server.id) || 0) >= 60000;
  if (checkNetwork) lastNetworkCheck.set(server.id, Date.now());
  const r = await ssh.exec(server, makeTelemetryScript(server, { checkNetwork }), { timeoutMs: 15000, maxBytes: 2_000_000 });
  if (r.code !== 0 || !r.stdout.trim()) throw new Error(r.stderr.trim() || `telemetry exit ${r.code}`);
  let data;
  try { data = JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)); }
  catch (e) { throw new Error(`Telemetry JSON error: ${e.message}`); }
  if (data.network) networkCache.set(server.id, data.network);
  data.network ||= networkCache.get(server.id) || { dns: null, internet: null, host: getSetting('network_check_host') || 'github.com', error: '' };
  return data;
}
