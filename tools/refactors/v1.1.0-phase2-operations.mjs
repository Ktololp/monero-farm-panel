#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = rel => path.join(root, ...rel.split('/'));
const read = rel => fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n');
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), `${content.replace(/\r\n/g, '\n').trimEnd()}\n`, 'utf8');
  console.log(`[phase2/operations] wrote ${rel}`);
};
const fail = msg => { console.error(`[phase2/operations] ERROR: ${msg}`); process.exit(1); };

const sourcePath = 'src/operations/index.js';
if (!fs.existsSync(p(sourcePath))) fail(`${sourcePath} not found. Run the v1.1.0 layout migration first.`);
const source = read(sourcePath);

const required = [
  'function serverById',
  'function validateWallet',
  'function validatePool',
  'async function readConfig',
  'async function writeConfig',
  'export const performanceProfiles',
  'export async function applyMiningConfig',
  'export async function restartXmrig',
  'export async function waitForMiner',
  'export async function applyPerformanceProfile',
  'export async function setHugePages',
  'export async function setMsr',
  'export async function autoFixServer',
  'export async function getXmrigLog',
  'function componentLogCommand',
  'async function readComponentLog',
  'export async function getP2poolLog',
  'export async function getMonerodLog',
  'export async function runCommand',
  'export async function bootstrapServer',
  'export async function rollingRestart',
  'export async function rollingUpdateXmrig'
];
for (const marker of required) if (!source.includes(marker)) fail(`Unexpected operations layout; missing marker: ${marker}`);

function chunk(start, end = null) {
  const a = source.indexOf(start);
  if (a < 0) fail(`Cannot find section start: ${start}`);
  const b = end ? source.indexOf(end, a + start.length) : source.length;
  if (end && b < 0) fail(`Cannot find section end: ${end}`);
  return source.slice(a, b).trim();
}

const serverById = chunk('function serverById', '\nfunction validateWallet');
const validateWallet = chunk('function validateWallet', '\nfunction validatePool');
const validatePool = chunk('function validatePool', '\nasync function readConfig');
const readConfig = chunk('async function readConfig', '\nasync function writeConfig');
const writeConfig = chunk('async function writeConfig', '\nexport const performanceProfiles');
const performanceProfiles = chunk('export const performanceProfiles', '\nexport async function applyMiningConfig');
const applyMiningConfig = chunk('export async function applyMiningConfig', '\nexport async function restartXmrig');
const restartXmrig = chunk('export async function restartXmrig', '\nexport async function waitForMiner');
const waitForMiner = chunk('export async function waitForMiner', '\nexport async function applyPerformanceProfile');
const applyPerformanceProfile = chunk('export async function applyPerformanceProfile', '\nexport async function setHugePages');
const setHugePages = chunk('export async function setHugePages', '\nexport async function setMsr');
const setMsr = chunk('export async function setMsr', '\nexport async function autoFixServer');
const autoFixServer = chunk('export async function autoFixServer', '\nexport async function getXmrigLog');
const getXmrigLog = chunk('export async function getXmrigLog', '\nfunction componentLogCommand');
const componentLogCommand = chunk('function componentLogCommand', '\nasync function readComponentLog');
const readComponentLog = chunk('async function readComponentLog', '\nexport async function getP2poolLog');
const getP2poolLog = chunk('export async function getP2poolLog', '\nexport async function getMonerodLog');
const getMonerodLog = chunk('export async function getMonerodLog', '\nexport async function runCommand');
const runCommand = chunk('export async function runCommand', '\nexport async function bootstrapServer');
const bootstrapServer = chunk('export async function bootstrapServer', '\nexport async function rollingRestart');
const rollingRestart = chunk('export async function rollingRestart', '\nexport async function rollingUpdateXmrig');
const rollingUpdateXmrig = chunk('export async function rollingUpdateXmrig');

write('src/operations/server.js', [
  "import { db } from '../database/index.js';",
  '',
  serverById.replace('function serverById', 'export function serverById'),
  '',
  validateWallet.replace('function validateWallet', 'export function validateWallet'),
  '',
  validatePool.replace('function validatePool', 'export function validatePool')
].join('\n'));

write('src/operations/xmrig-config.js', [
  "import { getSettings, audit } from '../database/index.js';",
  "import { ssh, shellQuote } from '../ssh/index.js';",
  "import { serverById, validateWallet, validatePool } from './server.js';",
  "import { restartXmrig } from './miner-control.js';",
  '',
  readConfig.replace('async function readConfig', 'export async function readConfig'),
  '',
  writeConfig.replace('async function writeConfig', 'export async function writeConfig'),
  '',
  applyMiningConfig
].join('\n'));

write('src/operations/miner-control.js', [
  "import { getSetting, audit } from '../database/index.js';",
  "import { ssh, safeServiceName } from '../ssh/index.js';",
  "import { pollServerNow } from '../monitoring/index.js';",
  "import { serverById } from './server.js';",
  '',
  restartXmrig,
  '',
  waitForMiner
].join('\n'));

write('src/operations/performance.js', [
  "import { db, audit } from '../database/index.js';",
  "import { serverById } from './server.js';",
  "import { readConfig, writeConfig } from './xmrig-config.js';",
  "import { restartXmrig } from './miner-control.js';",
  '',
  performanceProfiles,
  '',
  applyPerformanceProfile
].join('\n'));

write('src/operations/huge-pages.js', [
  "import { audit } from '../database/index.js';",
  "import { ssh, shellQuote } from '../ssh/index.js';",
  "import { serverById } from './server.js';",
  '',
  setHugePages
].join('\n'));

write('src/operations/msr.js', [
  "import { audit } from '../database/index.js';",
  "import { ssh } from '../ssh/index.js';",
  "import { serverById } from './server.js';",
  "import { readConfig, writeConfig } from './xmrig-config.js';",
  "import { restartXmrig } from './miner-control.js';",
  '',
  setMsr
].join('\n'));

write('src/operations/auto-fix.js', [
  "import { getSettings, audit } from '../database/index.js';",
  "import { ssh } from '../ssh/index.js';",
  "import { discoverServer, getDiscovery } from '../discovery/index.js';",
  "import { serverById } from './server.js';",
  "import { readConfig, writeConfig } from './xmrig-config.js';",
  "import { restartXmrig } from './miner-control.js';",
  '',
  autoFixServer
].join('\n'));

write('src/operations/logs.js', [
  "import { ssh, safeServiceName, shellQuote } from '../ssh/index.js';",
  "import { getDiscovery } from '../discovery/index.js';",
  "import { serverById } from './server.js';",
  '',
  getXmrigLog,
  '',
  componentLogCommand,
  '',
  readComponentLog,
  '',
  getP2poolLog,
  '',
  getMonerodLog
].join('\n'));

write('src/operations/remote-command.js', [
  "import { audit } from '../database/index.js';",
  "import { ssh } from '../ssh/index.js';",
  "import { serverById } from './server.js';",
  '',
  runCommand
].join('\n'));

write('src/operations/bootstrap.js', [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "import { getSettings, audit } from '../database/index.js';",
  "import { ssh } from '../ssh/index.js';",
  "import { config } from '../config/index.js';",
  "import { serverById, validateWallet, validatePool } from './server.js';",
  '',
  bootstrapServer
].join('\n'));

write('src/operations/rolling.js', [
  "import { getSetting, audit } from '../database/index.js';",
  "import { ssh, safeServiceName, shellQuote } from '../ssh/index.js';",
  "import { updateXmrigBinary } from '../updates/index.js';",
  "import { serverById } from './server.js';",
  "import { restartXmrig, waitForMiner } from './miner-control.js';",
  '',
  rollingRestart,
  '',
  rollingUpdateXmrig
].join('\n'));

write('src/operations/index.js', [
  "export { applyMiningConfig } from './xmrig-config.js';",
  "export { restartXmrig, waitForMiner } from './miner-control.js';",
  "export { performanceProfiles, applyPerformanceProfile } from './performance.js';",
  "export { setHugePages } from './huge-pages.js';",
  "export { setMsr } from './msr.js';",
  "export { autoFixServer } from './auto-fix.js';",
  "export { getXmrigLog, getP2poolLog, getMonerodLog } from './logs.js';",
  "export { runCommand } from './remote-command.js';",
  "export { bootstrapServer } from './bootstrap.js';",
  "export { rollingRestart, rollingUpdateXmrig } from './rolling.js';"
].join('\n'));

write('src/operations/README.md', [
  '# Operations subsystem',
  '',
  'The operations subsystem owns explicit remote management actions. The public entry point is index.js.',
  '',
  '- server.js — server lookup plus wallet/pool validation shared by operations.',
  '- xmrig-config.js — read/write/apply XMRig configuration.',
  '- miner-control.js — XMRig restart and health wait.',
  '- performance.js — RandomX performance profiles.',
  '- huge-pages.js — host Huge Pages changes.',
  '- msr.js — MSR configuration and module loading.',
  '- auto-fix.js — discovery-assisted repair actions.',
  '- logs.js — XMRig, p2pool and monerod log retrieval.',
  '- remote-command.js — audited arbitrary SSH command execution.',
  '- bootstrap.js — remote bootstrap script orchestration.',
  '- rolling.js — rolling restart and XMRig rolling update/rollback.',
  '- index.js — stable public facade.',
  '',
  'Operations may change remote hosts. Monitoring remains read/observe-oriented except for its narrowly scoped auto-recovery policy.'
].join('\n'));

write('test/operations-layout.test.js', [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  '',
  "const root = path.resolve(import.meta.dirname, '..');",
  "const operationsDir = path.join(root, 'src', 'operations');",
  '',
  "const expected = [",
  "  'index.js', 'server.js', 'xmrig-config.js', 'miner-control.js',",
  "  'performance.js', 'huge-pages.js', 'msr.js', 'auto-fix.js',",
  "  'logs.js', 'remote-command.js', 'bootstrap.js', 'rolling.js', 'README.md'",
  "];",
  '',
  "test('operations subsystem has explicit responsibility files', () => {",
  "  for (const file of expected) {",
  "    assert.equal(fs.existsSync(path.join(operationsDir, file)), true, 'missing src/operations/' + file);",
  "  }",
  "});",
  '',
  "test('operations index stays a small stable facade', () => {",
  "  const facade = fs.readFileSync(path.join(operationsDir, 'index.js'), 'utf8');",
  "  assert.ok(facade.split(/\\r?\\n/).length <= 30);",
  "  for (const name of ['applyMiningConfig','restartXmrig','waitForMiner','performanceProfiles','applyPerformanceProfile','setHugePages','setMsr','autoFixServer','getXmrigLog','getP2poolLog','getMonerodLog','runCommand','bootstrapServer','rollingRestart','rollingUpdateXmrig']) {",
  "    assert.match(facade, new RegExp(name));",
  "  }",
  "});"
].join('\n'));

console.log('[phase2/operations] OK');
console.log('[phase2/operations] src/operations/index.js is now a small stable facade.');
console.log('[phase2/operations] Next: npm run check && npm test');
