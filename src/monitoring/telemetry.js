
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
out={'components':{'xmrig':svc(X,'xmrig'),'p2pool':svc(P,'p2pool'),'monerod':svc(M,'monerod'),'xmrigProxy':svc('xmrig-proxy','xmrig-proxy')},'xmrigServiceAge':age(X)}
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
# Process helpers
def proc_args(name):
 try:
  c,o,e=run(['pgrep','-xo',name])
  if c!=0 or not o:return []
  pid=o.splitlines()[0].strip()
  raw=open('/proc/'+pid+'/cmdline','rb').read().split(b'\\x00')
  return [x.decode(errors='ignore') for x in raw if x]
 except:return []

def arg_value(args,name):
 for i,a in enumerate(args):
  if a==name and i+1<len(args):return args[i+1]
  if a.startswith(name+'='):return a.split('=',1)[1]
 return ''

def read_json_file(fn):
 try:
  with open(fn,'r',errors='ignore') as f:return json.load(f)
 except:return None

# XMRig Proxy
proxy={'detected':False,'available':False,'apiPort':None,'version':'','mode':'','hashrate':[None,None,None],'minersNow':0,'minersMax':0,'workerCount':0,'workers':[],'upstreams':{},'results':{},'error':''}
try:
 args=proc_args('xmrig-proxy')
 proxy['detected']=bool(args) or out['components'].get('xmrigProxy')=='active'
 port=0;token='';cfg=''
 if args:
  v=arg_value(args,'--http-port')
  if v:
   try:port=int(v)
   except:pass
  cfg=arg_value(args,'--config') or arg_value(args,'-c')
  if not cfg:
   for a in args[1:]:
    if a.endswith('.json') and os.path.isfile(a):cfg=a;break
 if cfg and os.path.isfile(cfg):
  cj=read_json_file(cfg) or {}
  http=cj.get('http') or {}
  try:port=port or int(http.get('port') or 0)
  except:pass
  token=str(http.get('access-token') or '')
 if port>0:
  proxy['apiPort']=port
  headers={'Authorization':'Bearer '+token} if token else {}
  req=urllib.request.Request('http://127.0.0.1:%d/1/summary'%port,headers=headers)
  with urllib.request.urlopen(req,timeout=4) as r:sm=json.loads(r.read().decode())
  req=urllib.request.Request('http://127.0.0.1:%d/1/workers'%port,headers=headers)
  with urllib.request.urlopen(req,timeout=4) as r:wr=json.loads(r.read().decode())
  workers=[]
  for row in (wr.get('workers') or [])[:250]:
   if not isinstance(row,list) or len(row)<13:continue
   workers.append({'name':row[0],'ip':row[1],'connections':row[2],'accepted':row[3],'rejected':row[4],'invalid':row[5],'hashes':row[6],'lastHash':row[7],'hashrate1m':(row[8]*1000 if isinstance(row[8],(int,float)) else None),'hashrate10m':(row[9]*1000 if isinstance(row[9],(int,float)) else None),'hashrate1h':(row[10]*1000 if isinstance(row[10],(int,float)) else None),'hashrate12h':(row[11]*1000 if isinstance(row[11],(int,float)) else None),'hashrate24h':(row[12]*1000 if isinstance(row[12],(int,float)) else None)})
  proxy.update({'available':True,'version':sm.get('version') or '','mode':sm.get('mode') or wr.get('mode') or '','hashrate':[v*1000 if isinstance(v,(int,float)) else None for v in ((sm.get('hashrate') or {}).get('total') or [None,None,None])],'minersNow':(sm.get('miners') or {}).get('now') or 0,'minersMax':(sm.get('miners') or {}).get('max') or 0,'workerCount':sm.get('workers') or len(workers),'workers':workers,'upstreams':sm.get('upstreams') or {},'results':sm.get('results') or {}})
except Exception as e:proxy['error']=str(e)
out['proxy']=proxy

# P2Pool local/data API
p2={'detected':False,'available':False,'dataApiEnabled':False,'localApiEnabled':False,'sidechain':'main','dataPath':'','hashrate15m':None,'hashrate1h':None,'hashrate24h':None,'sharesFound':None,'sharesFailed':None,'currentEffort':None,'averageEffort':None,'incomingConnections':None,'blockRewardSharePercent':None,'workers':[],'pool':{},'network':{},'error':''}
try:
 args=proc_args('p2pool')
 p2['detected']=bool(args) or out['components'].get('p2pool')=='active'
 if '--mini' in args:p2['sidechain']='mini'
 elif '--nano' in args:p2['sidechain']='nano'
 p2['localApiEnabled']=('--local-api' in args or '--stratum-api' in args)
 data_path=arg_value(args,'--data-api') if args else ''
 if data_path:
  try:
   if not os.path.isabs(data_path):
    c,o,e=run(['pgrep','-xo','p2pool'])
    if o:data_path=os.path.join(os.readlink('/proc/'+o.splitlines()[0].strip()+'/cwd'),data_path)
  except:pass
  p2['dataApiEnabled']=True;p2['dataPath']=data_path
  local=read_json_file(os.path.join(data_path,'local','stratum')) or {}
  pool=read_json_file(os.path.join(data_path,'pool','stats')) or {}
  network=read_json_file(os.path.join(data_path,'network','stats')) or {}
  workers=[]
  for item in (local.get('workers') or [])[:250]:
   parts=str(item).split(',',4)
   if len(parts)>=4:
    workers.append({'address':parts[0],'uptime':parts[1],'difficulty':parts[2],'hashrate':parts[3],'name':parts[4] if len(parts)>4 else ''})
  ps=pool.get('pool_statistics') or {}
  p2.update({'available':bool(local or pool or network),'hashrate15m':local.get('hashrate_15m'),'hashrate1h':local.get('hashrate_1h'),'hashrate24h':local.get('hashrate_24h'),'sharesFound':local.get('shares_found'),'sharesFailed':local.get('shares_failed'),'currentEffort':local.get('current_effort'),'averageEffort':local.get('average_effort'),'incomingConnections':local.get('incoming_connections'),'blockRewardSharePercent':local.get('block_reward_share_percent'),'workers':workers,'pool':{'hashrate':ps.get('hashRate'),'miners':ps.get('miners'),'lastBlockFound':ps.get('lastBlockFound'),'lastBlockFoundTime':ps.get('lastBlockFoundTime'),'totalBlocksFound':ps.get('totalBlocksFound'),'totalHashes':ps.get('totalHashes'),'pplnsWeight':ps.get('pplnsWeight'),'sidechainDifficulty':ps.get('sidechainDifficulty')},'network':network})
except Exception as e:p2['error']=str(e)
out['p2poolAnalytics']=p2

# Monero RPC + last block reward
try:
 def rpc(method):
  payload=json.dumps({'jsonrpc':'2.0','id':'0','method':method}).encode()
  req=urllib.request.Request('http://127.0.0.1:%d/json_rpc'%MP,data=payload,headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=4) as r:return json.loads(r.read().decode()).get('result') or {}
 mi=rpc('get_info'); bh=(rpc('get_last_block_header').get('block_header') or {})
 diff=bh.get('difficulty') or mi.get('difficulty')
 reward=bh.get('reward')
 out['monero']={'height':mi.get('height'),'targetHeight':mi.get('target_height'),'synchronized':mi.get('synchronized'),'incoming':mi.get('incoming_connections_count'),'outgoing':mi.get('outgoing_connections_count'),'nettype':mi.get('nettype'),'version':mi.get('version'),'difficulty':diff,'blockTarget':mi.get('target') or 120,'blockRewardXmr':(float(reward)/1e12) if reward is not None else None,'lastBlockTimestamp':bh.get('timestamp')}
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
