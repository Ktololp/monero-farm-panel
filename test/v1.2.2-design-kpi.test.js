import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');

test('v1.2.2 KPI layout uses semantic mixed-width cards', () => {
  const css = read('web/styles/design-kpi.css');
  const dash = read('web/pages/dashboard/index.js');
  const main = read('web/app/main.js');

  assert.ok(main.includes("import '../styles/design-kpi.css';"));
  assert.ok(dash.includes('kpi-wide'));
  assert.ok(dash.includes('kpi-short'));
  assert.ok(dash.includes('kpi-regular'));
  assert.match(css, /\.kpi-wide/);
  assert.match(css, /flex:1\.48 1 0/);
  assert.match(css, /\.kpi-short/);
  assert.match(css, /flex:\.64 1 0/);
  assert.doesNotMatch(css, /nth-child/);
});
