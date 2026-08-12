
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
  assert.ok(source.split(/\r?\n/).length <= 30);
  for (const name of ['setMonitorIO', 'getLiveState', 'getAllLiveStates', 'pollAll', 'startMonitor', 'stopMonitor', 'pollServerNow']) {
    assert.match(source, new RegExp(name));
  }
});
