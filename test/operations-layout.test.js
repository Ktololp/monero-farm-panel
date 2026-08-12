import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const operationsDir = path.join(root, 'src', 'operations');

const expected = [
  'index.js', 'server.js', 'xmrig-config.js', 'miner-control.js',
  'performance.js', 'huge-pages.js', 'msr.js', 'auto-fix.js',
  'logs.js', 'remote-command.js', 'bootstrap.js', 'rolling.js', 'README.md'
];

test('operations subsystem has explicit responsibility files', () => {
  for (const file of expected) {
    assert.equal(fs.existsSync(path.join(operationsDir, file)), true, 'missing src/operations/' + file);
  }
});

test('operations index stays a small stable facade', () => {
  const facade = fs.readFileSync(path.join(operationsDir, 'index.js'), 'utf8');
  assert.ok(facade.split(/\r?\n/).length <= 30);
  for (const name of ['applyMiningConfig','restartXmrig','waitForMiner','performanceProfiles','applyPerformanceProfile','setHugePages','setMsr','autoFixServer','getXmrigLog','getP2poolLog','getMonerodLog','runCommand','bootstrapServer','rollingRestart','rollingUpdateXmrig']) {
    assert.match(facade, new RegExp(name));
  }
});
