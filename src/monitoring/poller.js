
import { db, getSetting, cleanupHistory } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { config } from '../config/index.js';
import { collectTelemetry, getCachedNetwork, parseTemp, parseSummary } from './telemetry.js';
import { baselineFor } from './baseline.js';
import { persistMetric } from './persistence.js';
import { evaluateAlerts } from './alerts.js';
import { getRecoveryInfo, maybeAutoRecover } from './recovery.js';
import { getLiveState, setLiveState, emitServerUpdate } from './state.js';
import { scoreLiveState } from './health-score.js';

let pollTimer = null;
let cleanupTimer = null;
let running = false;
const lastLogCheck = new Map();

function getServers() { return db.prepare('SELECT * FROM servers WHERE enabled=1 ORDER BY id').all(); }

async function pollOne(server) {
  const started = Date.now();
  try {
    const telemetry = await collectTelemetry(server);
    const summary = telemetry.xmrig ? parseSummary(telemetry.xmrig) : null;
    const baseline = baselineFor(server.id);
    const graceSec = Math.max(15, Number(getSetting('grace_period_seconds')) || 90);
    const rec = getRecoveryInfo(server.id);
    const grace = (Number(telemetry.xmrigServiceAge) >= 0 && Number(telemetry.xmrigServiceAge) < graceSec) || Date.now() < rec.recoveringUntil;
    const checkLogs = Date.now() - (lastLogCheck.get(server.id) || 0) >= 60000;
    if (checkLogs) lastLogCheck.set(server.id, Date.now());
    let logErrors = getLiveState(server.id)?.logErrors || [];
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
      components: { xmrig: summary ? 'active' : (components.xmrig || 'inactive'), p2pool: components.p2pool || 'inactive', monerod: components.monerod || 'inactive', xmrigProxy: components.xmrigProxy || 'inactive' },
      p2poolStatus: components.p2pool || 'inactive', monerodStatus: components.monerod || 'inactive', xmrigStatus: summary ? 'active' : (components.xmrig || 'inactive'),
      monero: { ...monero, syncPercent: Number(monero.targetHeight || monero.height) > 0 ? Math.min(100, Number(monero.height || 0) / Number(monero.targetHeight || monero.height) * 100) : (monero.synchronized ? 100 : null) },
      proxy: telemetry.proxy || { detected: false, available: false, workers: [] },
      p2poolAnalytics: telemetry.p2poolAnalytics || { detected: components.p2pool === 'active', available: false, dataApiEnabled: false, localApiEnabled: false, workers: [] },
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
    Object.assign(live, scoreLiveState(live, { tempWarn: Number(getSetting('temp_warn')) || 80, tempCritical: Number(getSetting('temp_critical')) || 90 }));
    setLiveState(server.id, live);
    if (summary) db.prepare("UPDATE servers SET status=?, last_seen_at=?, last_error=NULL, updated_at=? WHERE id=?").run(live.status, live.ts, live.ts, server.id);
    else db.prepare('UPDATE servers SET status=?, last_error=?, updated_at=? WHERE id=?').run(live.status, live.lastError.slice(0, 1000), live.ts, server.id);
    persistMetric(server, live);
    await evaluateAlerts(server, live);
    await maybeAutoRecover(server, live);
    emitServerUpdate(getLiveState(server.id));
    return getLiveState(server.id);
  } catch (err) {
    const live = {
      serverId: server.id, status: 'offline', ts: Date.now(), latencyMs: Date.now() - started,
      hash10s: null, hash60s: null, hash15m: null, tempC: null, cpuMHz: null, load1: null, load5: null, load15: null,
      uptime: null, version: '', pool: '', accepted: 0, rejected: 0, errors: [], components: { xmrig: 'unknown', p2pool: 'unknown', monerod: 'unknown' },
      p2poolStatus: 'unknown', monerodStatus: 'unknown', xmrigStatus: 'unknown', monero: {}, proxy: { detected: false, available: false, workers: [] }, p2poolAnalytics: { detected: false, available: false, dataApiEnabled: false, localApiEnabled: false, workers: [] }, hugePages: {}, msr: { status: 'unknown' }, network: getCachedNetwork(server.id),
      baselineHash: baselineFor(server.id).value, baselineSamples: baselineFor(server.id).samples, baselineMinSamples: baselineFor(server.id).minSamples, grace: false, lastError: err.message
    };
    Object.assign(live, scoreLiveState(live, { tempWarn: Number(getSetting('temp_warn')) || 80, tempCritical: Number(getSetting('temp_critical')) || 90 }));
    setLiveState(server.id, live);
    db.prepare('UPDATE servers SET status=?, last_error=?, updated_at=? WHERE id=?').run('offline', err.message.slice(0, 1000), live.ts, server.id);
    persistMetric(server, live);
    await evaluateAlerts(server, live);
    emitServerUpdate(live);
    return live;
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
