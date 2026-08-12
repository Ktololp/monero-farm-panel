
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreLiveState } from '../src/monitoring/health-score.js';

test('offline server has zero fleet health score', () => {
  assert.equal(scoreLiveState({ status: 'offline' }).healthScore, 0);
});

test('healthy miner stays near 100', () => {
  const r = scoreLiveState({
    status: 'online',
    components: { xmrig: 'active' },
    hash60s: 44000,
    baselineHash: 44200,
    tempC: 55,
    accepted: 1000,
    rejected: 0,
    network: { dns: true, internet: true },
    monero: { syncPercent: 100 },
    errors: []
  });
  assert.equal(r.healthScore, 100);
  assert.equal(r.healthLevel, 'healthy');
});

test('degraded hot miner with low hashrate gets a low score', () => {
  const r = scoreLiveState({
    status: 'degraded',
    components: { xmrig: 'active' },
    hash60s: 20000,
    baselineHash: 44000,
    tempC: 92,
    accepted: 100,
    rejected: 10,
    network: { dns: false, internet: false },
    monero: { syncPercent: 95 },
    errors: ['fatal']
  });
  assert.ok(r.healthScore < 50);
  assert.equal(r.healthLevel, 'critical');
});
