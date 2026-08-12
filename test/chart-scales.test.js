import test from 'node:test';
import assert from 'node:assert/strict';
import { hashrateScale, temperatureScale, percentageScale, latencyScale } from '../web/chart-scales.js';

test('temperature scale does not exaggerate a 47.7 to 48.0 C change', () => {
  const scale = temperatureScale([47.7, 47.8, 47.9, 48.0]);
  assert.ok(scale.max - scale.min >= 20);
  assert.equal(scale.stepSize, 5);
  assert.ok(scale.min <= 47.7);
  assert.ok(scale.max >= 48.0);
});

test('temperature scale still expands for a genuinely large rise', () => {
  const scale = temperatureScale([65, 70, 82]);
  assert.ok(scale.min <= 65);
  assert.ok(scale.max >= 82);
  assert.equal(scale.stepSize, 5);
});

test('hashrate scale gives normal 44 kH/s jitter a useful visual window', () => {
  const scale = hashrateScale([44_620, 44_650, 44_590], 44_600);
  assert.ok(scale.max - scale.min >= 44_600 * 0.15);
  assert.ok(scale.min <= 44_590);
  assert.ok(scale.max >= 44_650);
});

test('hashrate scale keeps a real degradation visible', () => {
  const scale = hashrateScale([44_000, 35_000], 44_000);
  assert.ok(scale.min <= 35_000);
  assert.ok(scale.max >= 44_000);
  assert.ok(scale.max - scale.min < 30_000);
});

test('percentage and latency scales have predictable baselines', () => {
  assert.deepEqual(percentageScale(), { min: 0, max: 100, stepSize: 20 });
  const latency = latencyScale([12, 18, 20]);
  assert.equal(latency.min, 0);
  assert.ok(latency.max >= 20);
});
