
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('v1.2 feature modules and pages exist', () => {
  for (const file of [
    'src/monitoring/health-score.js',
    'web/pages/proxies/index.js',
    'web/pages/docs/index.js',
    'docs/FEATURES.md'
  ]) assert.equal(fs.existsSync(new URL('../' + file, import.meta.url)), true, 'missing ' + file);
});

test('telemetry includes proxy, p2pool analytics and monero network economics inputs', () => {
  const src = read('src/monitoring/telemetry.js');
  assert.match(src, /XMRig Proxy/);
  assert.match(src, /p2poolAnalytics/);
  assert.match(src, /blockRewardXmr/);
  assert.match(src, /difficulty/);
});

test('frontend exposes proxies, docs, fleet health and estimated income', () => {
  const app = read('web/app/main.js');
  const dash = read('web/pages/dashboard/index.js');
  assert.match(app, /createProxiesPage/);
  assert.match(app, /createDocsPage/);
  assert.match(dash, /Fleet Health/);
  assert.match(dash, /Оценка дохода/);
});
