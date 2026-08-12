#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = rel => path.join(root, ...rel.split('/'));
const read = rel => fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n');
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), `${content.replace(/\r\n/g, '\n').trimEnd()}\n`, 'utf8');
  console.log(`[phase2/monitoring] wrote ${rel}`);
};
const fail = msg => { console.error(`[phase2/monitoring] ERROR: ${msg}`); process.exit(1); };

const sourcePath = 'src/monitoring/index.js';
if (!fs.existsSync(p(sourcePath))) fail(`${sourcePath} not found. Run the v1.1.0 layout migration first.`);
const source = read(sourcePath);

const required = [
  'function parseTemp',
  'function parseSummary',
  'function getServers',
  'function baselineFor',
  'function makeTelemetryScript',
  'async function collectTelemetry',
  'async function pollOne',
  'function persistMetric',
  'async function evaluateAlerts',
  'async function maybeAutoRecover',
  'async function runLimited',
  'export async function pollAll',
  'export function startMonitor',
  'export function stopMonitor',
  'export async function pollServerNow'
];
for (const marker of required) if (!source.includes(marker)) fail(`Unexpected monitoring layout; missing marker: ${marker}`);

function chunk(start, end = null) {
  const a = source.indexOf(start);
  if (a < 0) fail(`Cannot find section start: ${start}`);
  const b = end ? source.indexOf(end, a + start.length) : source.length;
  if (end && b < 0) fail(`Cannot find section end: ${end}`);
  return source.slice(a, b).trim();
}

const parseTemp = chunk('function parseTemp', '\nfunction parseSummary');
const parseSummary = chunk('function parseSummary', '\nfunction getServers');
const getServers = chunk('function getServers', '\nfunction baselineFor');
const baselineFor = chunk('function baselineFor', '\nfunction makeTelemetryScript');
const makeTelemetryScript = chunk('function makeTelemetryScript', '\nasync function collectTelemetry');
const collectTelemetry = chunk('async function collectTelemetry', '\nasync function pollOne');
const pollOneOriginal = chunk('async function pollOne', '\nfunction persistMetric');
const persistMetric = chunk('function persistMetric', '\nasync function evaluateAlerts');
const evaluateAlerts = chunk('async function evaluateAlerts', '\nasync function maybeAutoRecover');
const maybeAutoRecoverOriginal = chunk('async function maybeAutoRecover', '\nasync function runLimited');
const runLimited = chunk('async function runLimited', '\nexport async function pollAll');
const pollAll = chunk('export async function pollAll', '\nexport function startMonitor');
const startMonitor = chunk('export function startMonitor', '\nexport function stopMonitor');
const stopMonitor = chunk('export function stopMonitor', '\nexport async function pollServerNow');
const pollServerNow = chunk('export async function pollServerNow');

write('src/monitoring/state.js', `
const state = new Map();
let ioRef = null;

export function setMonitorIO(io) {
  ioRef = io;
}

export function getLiveState(serverId) {
  return state.get(Number(serverId)) || null;
}

export function getAllLiveStates() {
  return Object.fromEntries(state.entries());
}

export function setLiveState(serverId, live) {
  state.set(Number(serverId), live);
  return live;
}

export function emitServerUpdate(live) {
  ioRef?.emit('server:update', live);
}
`);

write('src/monitoring/baseline.js', `
import { db, getSetting } from '../database/index.js';

${baselineFor.replace('function baselineFor', 'export function baselineFor')}
`);

write('src/monitoring/telemetry.js', `
import { getSetting } from '../database/index.js';
import { ssh, safeServiceName, shellQuote } from '../ssh/index.js';
import { decryptSecret } from '../security/crypto.js';

const lastNetworkCheck = new Map();
const networkCache = new Map();

export function getCachedNetwork(serverId) {
  return networkCache.get(Number(serverId)) || {};
}

${parseTemp.replace('function parseTemp', 'export function parseTemp')}

${parseSummary.replace('function parseSummary', 'export function parseSummary')}

${makeTelemetryScript.replace('function makeTelemetryScript', 'export function makeTelemetryScript')}

${collectTelemetry.replace('async function collectTelemetry', 'export async function collectTelemetry')}
`);

write('src/monitoring/persistence.js', `
import { db } from '../database/index.js';
import { config } from '../config/index.js';

const lastPersist = new Map();

${persistMetric.replace('function persistMetric', 'export function persistMetric')}
`);

write('src/monitoring/alerts.js', `
import { getSetting } from '../database/index.js';
import { triggerAlert, resolveAlert } from '../alerts/index.js';

${evaluateAlerts.replace('async function evaluateAlerts', 'export async function evaluateAlerts')}
`);

let recovery = maybeAutoRecoverOriginal
  .replace('async function maybeAutoRecover', 'export async function maybeAutoRecover')
  .replace(/state\.set\(server\.id, updated\);/g, 'setLiveState(server.id, updated);')
  .replace(/ioRef\?\.emit\('server:update', updated\);/g, 'emitServerUpdate(updated);');

write('src/monitoring/recovery.js', `
import { getSetting, audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { triggerAlert } from '../alerts/index.js';
import { setLiveState, emitServerUpdate } from './state.js';

const recoveryState = new Map();

export function getRecoveryInfo(serverId) {
  return recoveryState.get(Number(serverId)) || { failures: 0, lastAttempt: 0, recoveringUntil: 0 };
}

${recovery}
`);

let pollOne = pollOneOriginal
  .replace('const rec = recoveryState.get(server.id) || { failures: 0, lastAttempt: 0, recoveringUntil: 0 };', 'const rec = getRecoveryInfo(server.id);')
  .replace(/state\.get\(server\.id\)\?\.logErrors/g, 'getLiveState(server.id)?.logErrors')
  .replace(/state\.set\(server\.id, live\);/g, 'setLiveState(server.id, live);')
  .replace(/ioRef\?\.emit\('server:update', state\.get\(server\.id\)\);/g, 'emitServerUpdate(getLiveState(server.id));')
  .replace(/return state\.get\(server\.id\);/g, 'return getLiveState(server.id);')
  .replace(/ioRef\?\.emit\('server:update', live\);/g, 'emitServerUpdate(live);')
  .replace(/networkCache\.get\(server\.id\) \|\| \{\}/g, 'getCachedNetwork(server.id)');

write('src/monitoring/poller.js', `
import { db, getSetting, cleanupHistory } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { config } from '../config/index.js';
import { collectTelemetry, getCachedNetwork, parseTemp, parseSummary } from './telemetry.js';
import { baselineFor } from './baseline.js';
import { persistMetric } from './persistence.js';
import { evaluateAlerts } from './alerts.js';
import { getRecoveryInfo, maybeAutoRecover } from './recovery.js';
import { getLiveState, setLiveState, emitServerUpdate } from './state.js';

let pollTimer = null;
let cleanupTimer = null;
let running = false;
const lastLogCheck = new Map();

${getServers}

${pollOne}

${runLimited}

${pollAll}

${startMonitor}

${stopMonitor}

${pollServerNow}
`);

write('src/monitoring/index.js', `
export {
  setMonitorIO,
  getLiveState,
  getAllLiveStates
} from './state.js';

export {
  pollAll,
  startMonitor,
  stopMonitor,
  pollServerNow
} from './poller.js';
`);

write('src/monitoring/README.md', `# Monitoring subsystem

The monitoring subsystem owns live farm telemetry and health evaluation. The public entry point is \`index.js\`; other subsystems should normally import from that facade.

- \`state.js\` — in-memory live state and Socket.IO emission hook.
- \`telemetry.js\` — remote telemetry collection, XMRig summary parsing, CPU temperature parsing, network cache.
- \`baseline.js\` — per-server learned hashrate baseline.
- \`persistence.js\` — periodic metrics persistence.
- \`alerts.js\` — monitoring-derived alert evaluation.
- \`recovery.js\` — automatic XMRig recovery state and restart policy.
- \`poller.js\` — polling orchestration, scheduling, per-server polling and history cleanup.
- \`history.js\` — historical aggregation queries used by API routes.
- \`index.js\` — stable public facade.

Data flow: scheduler -> poller -> telemetry -> normalized live state -> persistence/alerts/recovery -> Socket.IO.

Monitoring does not expose the XMRig API publicly. Miner and daemon access remains remote through SSH and localhost services on the mining host.
`);

write('test/monitoring-layout.test.js', `
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const monitorDir = path.join(root, 'src', 'monitoring');

const expected = [
  'index.js',
  'state.js',
  'telemetry.js',
  'baseline.js',
  'persistence.js',
  'alerts.js',
  'recovery.js',
  'poller.js',
  'history.js',
  'README.md'
];

test('monitoring subsystem has explicit responsibility files', () => {
  for (const file of expected) {
    assert.equal(fs.existsSync(path.join(monitorDir, file)), true, 'missing src/monitoring/' + file);
  }
});

test('monitoring index stays a small stable facade', () => {
  const source = fs.readFileSync(path.join(monitorDir, 'index.js'), 'utf8');
  assert.ok(source.split(/\\r?\\n/).length <= 30);
  for (const name of ['setMonitorIO', 'getLiveState', 'getAllLiveStates', 'pollAll', 'startMonitor', 'stopMonitor', 'pollServerNow']) {
    assert.match(source, new RegExp(name));
  }
});
`);

console.log('[phase2/monitoring] OK');
console.log('[phase2/monitoring] src/monitoring/index.js is now a small stable facade.');
console.log('[phase2/monitoring] Next: npm run check && npm test');
