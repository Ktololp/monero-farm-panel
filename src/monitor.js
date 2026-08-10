import { db, getSetting, cleanupHistory, audit } from './db.js';
import { ssh, safeServiceName, shellQuote } from './ssh.js';
import { triggerAlert, resolveAlert } from './alerts.js';
import { config } from './config.js';
import { decryptSecret } from './security.js';

const state = new Map();
let ioRef = null;
let pollTimer = null;
let cleanupTimer = null;
let running = false;
const lastPersist = new Map();
const lastLogCheck = new Map();
const lastNetworkCheck = new Map();
const networkCache = new Map();
const recoveryState = new Map();

export function setMonitorIO(io) { ioRef = io; }
export function getLiveState(serverId) { return state.get(Number(serverId)) || null; }
export function getAllLiveStates() { return Object.fromEntries(state.entries()); }

function parseTemp(data) {
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

function parseSummary(data) {
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

function getServers() { return db.prepare('SELECT * FROM servers WHERE enabled=1 ORDER BY id').all(); }

function baselineFor(serverId) {
  const hours = Math.max(1, Math.min(168, Number(getSetting('baseline_window_hours')) || 24));
  const minSamples = Math.max(3, Number(getSetting('baseline_min_samples')) || 12);
  const rows = db.prepare(`SELECT hash_60s AS h FROM metrics WHERE server_id=? AND ts>? AND hash_60s>0 ORDER BY hash_60s`).all(serverId, Date.now() - hours * 3600000);
  if (rows.length < minSamples) return { value: null, samples: rows.length, minSamples };
  // Use the upper-middle portion instead of a plain average so downtime does not drag the personal baseline down.
  const vals = rows.map(r => Number(r.h)).filter(Number.isFinite);
  const start = Math.floor(vals.length * 0.25);
  const stable = vals.slice(start);
  const mid = Math.floor(stable.length / 2);
  const median = stable.length % 2 ? stable[mid] : (stable[mid - 1] + stable[mid]) / 2;
  return { value: median, samples: vals.length, minSamples };
}

function makeTelemetryScript(server, { checkNetwork = false } = {}) {
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

async function collectTelemetry(server) {
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

async function pollOne(server) {
  const started = Date.now();
  try {
    const telemetry = await collectTelemetry(server);
    const summary = telemetry.xmrig ? parseSummary(telemetry.xmrig) : null;
    const baseline = baselineFor(server.id);
    const graceSec = Math.max(15, Number(getSetting('grace_period_seconds')) || 90);
    const rec = recoveryState.get(server.id) || { failures: 0, lastAttempt: 0, recoveringUntil: 0 };
    const grace = (Number(telemetry.xmrigServiceAge) >= 0 && Number(telemetry.xmrigServiceAge) < graceSec) || Date.now() < rec.recoveringUntil;
    const checkLogs = Date.now() - (lastLogCheck.get(server.id) || 0) >= 60000;
    if (checkLogs) lastLogCheck.set(server.id, Date.now());
    let logErrors = state.get(server.id)?.logErrors || [];
    if (checkLogs) {
      const xsvc = safeServiceName(server.xmrig_service || 'xmrig');
      const jr = await ssh.exec(server, `journalctl -u ${xsvc} -n 100 --no-pager -o cat 2>/dev/null | grep -Ei 'error|failed|fatal|exception' | tail -n 10 || true`, { timeoutMs: 7000 });
      logErrors = jr.stdout.split('\n').map(x => x.trim()).filter(Boolean).slice(-10);
    }
    const hp = telemetry.hugepages || {};
    const monero = telemetry.monero || {};
    const components = telemetry.components || {};
    const live = {
      serverId: server.id,
      status: summary ? (grace ? 'starting' : 'online') : (grace ? 'starting' : 'degraded'),
      ts: Date.now(), latencyMs: Date.now() - started,
      tempC: parseTemp(telemetry.sensors), cpuMHz: telemetry.cpuMHz ?? null,
      load1: telemetry.load?.[0] ?? null, load5: telemetry.load?.[1] ?? null, load15: telemetry.load?.[2] ?? null, cpuCount: telemetry.cpuCount ?? null,
      components: { xmrig: summary ? 'active' : (components.xmrig || 'inactive'), p2pool: components.p2pool || 'inactive', monerod: components.monerod || 'inactive' },
      p2poolStatus: components.p2pool || 'inactive', monerodStatus: components.monerod || 'inactive', xmrigStatus: summary ? 'active' : (components.xmrig || 'inactive'),
      monero: { ...monero, syncPercent: Number(monero.targetHeight || monero.height) > 0 ? Math.min(100, Number(monero.height || 0) / Number(monero.targetHeight || monero.height) * 100) : (monero.synchronized ? 100 : null) },
      hugePages: { total: hp.total || 0, free: hp.free || 0, reserved: hp.reserved || 0, sizeKB: hp.sizeKB || 0, oneGTotal: hp.oneGTotal || 0, oneGFree: hp.oneGFree || 0 },
      msr: { module: Boolean(telemetry.msr?.module), device: Boolean(telemetry.msr?.device), status: telemetry.msr?.device ? 'active' : telemetry.msr?.module ? 'module' : 'inactive' },
      network: telemetry.network,
      baselineHash: baseline.value, baselineSamples: baseline.samples, baselineMinSamples: baseline.minSamples,
      grace, graceRemaining: grace && Number.isFinite(Number(telemetry.xmrigServiceAge)) ? Math.max(0, graceSec - Number(telemetry.xmrigServiceAge)) : 0,
      sensorsAvailable: Boolean(telemetry.sensorsAvailable),
      lastError: summary ? '' : `XMRig API недоступен: ${telemetry.xmrigError || 'нет ответа'}`,
      ...(summary || { hash10s: null, hash60s: null, hash15m: null, uptime: null, version: '', pool: '', accepted: 0, rejected: 0, errors: [], hugepagesXMRig: null, algo: '' }),
      logErrors
    };
    live.errors = [...(live.errors || []), ...logErrors].slice(-20);
    state.set(server.id, live);
    if (summary) db.prepare("UPDATE servers SET status=?, last_seen_at=?, last_error=NULL, updated_at=? WHERE id=?").run(live.status, live.ts, live.ts, server.id);
    else db.prepare('UPDATE servers SET status=?, last_error=?, updated_at=? WHERE id=?').run(live.status, live.lastError.slice(0, 1000), live.ts, server.id);
    persistMetric(server, live);
    await evaluateAlerts(server, live);
    await maybeAutoRecover(server, live);
    ioRef?.emit('server:update', state.get(server.id));
    return state.get(server.id);
  } catch (err) {
    const live = {
      serverId: server.id, status: 'offline', ts: Date.now(), latencyMs: Date.now() - started,
      hash10s: null, hash60s: null, hash15m: null, tempC: null, cpuMHz: null, load1: null, load5: null, load15: null,
      uptime: null, version: '', pool: '', accepted: 0, rejected: 0, errors: [], components: { xmrig: 'unknown', p2pool: 'unknown', monerod: 'unknown' },
      p2poolStatus: 'unknown', monerodStatus: 'unknown', xmrigStatus: 'unknown', monero: {}, hugePages: {}, msr: { status: 'unknown' }, network: networkCache.get(server.id) || {},
      baselineHash: baselineFor(server.id).value, baselineSamples: baselineFor(server.id).samples, baselineMinSamples: baselineFor(server.id).minSamples, grace: false, lastError: err.message
    };
    state.set(server.id, live);
    db.prepare('UPDATE servers SET status=?, last_error=?, updated_at=? WHERE id=?').run('offline', err.message.slice(0, 1000), live.ts, server.id);
    persistMetric(server, live);
    await evaluateAlerts(server, live);
    ioRef?.emit('server:update', live);
    return live;
  }
}

function persistMetric(server, live) {
  const prev = lastPersist.get(server.id) || 0;
  if (Date.now() - prev < config.historyIntervalMs) return;
  lastPersist.set(server.id, Date.now());
  db.prepare(`INSERT INTO metrics(server_id,ts,hash_10s,hash_60s,hash_15m,temp_c,accepted,rejected,uptime,version,pool,p2pool_status,error_count,cpu_mhz,load_1,load_5,load_15,hugepages_total,hugepages_free,hugepages_1g_total,hugepages_1g_free,msr_status,xmrig_status,monerod_status,monero_height,monero_target_height,network_status,baseline_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      server.id, live.ts, live.hash10s, live.hash60s, live.hash15m, live.tempC, live.accepted, live.rejected, live.uptime, live.version, live.pool, live.p2poolStatus, live.errors?.length || 0,
      live.cpuMHz, live.load1, live.load5, live.load15, live.hugePages?.total || 0, live.hugePages?.free || 0, live.hugePages?.oneGTotal || 0, live.hugePages?.oneGFree || 0,
      live.msr?.status || 'unknown', live.xmrigStatus || 'unknown', live.monerodStatus || 'unknown', live.monero?.height || null, live.monero?.targetHeight || null,
      live.network?.internet === true && live.network?.dns === true ? 'online' : live.network?.internet === false || live.network?.dns === false ? 'degraded' : 'unknown', live.baselineHash
    );
}

async function evaluateAlerts(server, live) {
  const globalTemp = Number(getSetting('temp_critical')) || 90;
  const tempMax = Number(server.temp_max) || globalTemp;
  const globalDrop = Number(getSetting('hash_drop_percent')) || 20;
  const hashMin = Number(server.hash_min) || null;

  if (live.status === 'offline') {
    const offlineAfter = Math.max(15, Number(getSetting('offline_after_seconds')) || 90) * 1000;
    const lastSeen = Number(server.last_seen_at) || 0;
    if (!lastSeen || Date.now() - lastSeen >= offlineAfter) await triggerAlert(server, 'offline', 'SSH-соединение недоступно.');
  } else await resolveAlert(server, 'offline', 'SSH-соединение восстановлено.');

  if (!live.grace && live.status === 'degraded') await triggerAlert(server, 'xmrig', live.lastError || 'API XMRig недоступен.');
  else if (live.status === 'online') await resolveAlert(server, 'xmrig', 'API XMRig снова доступен.');

  if (live.tempC != null && live.tempC >= tempMax) await triggerAlert(server, 'temperature', `Температура CPU ${live.tempC.toFixed(1)} °C, лимит ${tempMax} °C.`);
  else if (live.tempC != null) await resolveAlert(server, 'temperature', `Температура CPU вернулась к ${live.tempC.toFixed(1)} °C.`);

  if (live.status === 'online' && live.hash60s != null && !live.grace) {
    const threshold = hashMin || (live.baselineHash ? live.baselineHash * (1 - globalDrop / 100) : null);
    if (threshold && live.hash60s < threshold) await triggerAlert(server, 'hashrate', `Деградация: ${(live.hash60s/1000).toFixed(2)} kH/s при персональном пороге ${(threshold/1000).toFixed(2)} kH/s.`);
    else await resolveAlert(server, 'hashrate', `Хешрейт восстановился до ${(live.hash60s/1000).toFixed(2)} kH/s.`);
  }

  if (live.network?.dns === false || live.network?.internet === false) await triggerAlert(server, 'network', `Проблема сети: DNS ${live.network?.dns ? 'OK' : 'FAIL'}, Internet ${live.network?.internet ? 'OK' : 'FAIL'}.`);
  else if (live.network?.dns === true && live.network?.internet === true) await resolveAlert(server, 'network', 'DNS и доступ в Интернет восстановлены.');

  if (live.errors?.length) await triggerAlert(server, 'xmrig-errors', `XMRig сообщает об ошибках (${live.errors.length}): ${String(live.errors.at(-1)).slice(0, 300)}`);
  else if (live.status === 'online') await resolveAlert(server, 'xmrig-errors', 'Ошибки XMRig больше не обнаруживаются.');
}

async function maybeAutoRecover(server, live) {
  if (String(getSetting('auto_recovery_enabled')) === '0' || live.status === 'offline' || live.grace) return;
  const rs = recoveryState.get(server.id) || { failures: 0, lastAttempt: 0, recoveringUntil: 0 };
  const badHash = live.hash60s != null && live.hash60s < 1;
  const broken = live.status === 'degraded' || live.xmrigStatus === 'inactive' || badHash;
  if (!broken) { rs.failures = 0; recoveryState.set(server.id, rs); return; }
  rs.failures += 1;
  const needed = Math.max(1, Number(getSetting('auto_recovery_failures')) || 2);
  const cooldown = Math.max(60, Number(getSetting('auto_recovery_cooldown_seconds')) || 300) * 1000;
  if (rs.failures < needed || Date.now() - rs.lastAttempt < cooldown) { recoveryState.set(server.id, rs); return; }
  rs.lastAttempt = Date.now(); rs.failures = 0;
  const graceMs = Math.max(15, Number(getSetting('grace_period_seconds')) || 90) * 1000;
  rs.recoveringUntil = Date.now() + graceMs;
  recoveryState.set(server.id, rs);
  const service = safeServiceName(server.xmrig_service || 'xmrig');
  try {
    const r = await ssh.sudoExec(server, `systemctl restart ${service}`, { timeoutMs: 20000 });
    if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`);
    audit({ serverId: server.id, action: 'auto-recovery', details: `restart ${service}` });
    const updated = { ...live, status: 'starting', grace: true, graceRemaining: Math.round(graceMs / 1000), autoRecovery: { triggered: true, ts: Date.now(), service } };
    state.set(server.id, updated);
    ioRef?.emit('server:update', updated);
  } catch (e) {
    audit({ serverId: server.id, action: 'auto-recovery', status: 'error', details: e.message });
    await triggerAlert(server, 'auto-recovery', `Автовосстановление не удалось: ${e.message}`);
  }
}

async function runLimited(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

export async function pollAll() {
  if (running) return;
  running = true;
  try { await runLimited(getServers(), 8, pollOne); }
  finally { running = false; }
}

export function startMonitor() {
  pollAll().catch(err => console.error('[monitor] initial poll:', err));
  pollTimer = setInterval(() => pollAll().catch(err => console.error('[monitor] poll:', err)), config.pollIntervalMs);
  cleanupHistory(); cleanupTimer = setInterval(cleanupHistory, 6 * 3600000);
}
export function stopMonitor() { if (pollTimer) clearInterval(pollTimer); if (cleanupTimer) clearInterval(cleanupTimer); }
export async function pollServerNow(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id=?').get(Number(serverId));
  if (!server) throw new Error('Server not found');
  return pollOne(server);
}
