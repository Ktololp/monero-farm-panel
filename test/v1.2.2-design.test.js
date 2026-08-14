import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');

test('v1.2.2 design system is layered without replacing app structure', () => {
  const main = read('web/app/main.js');
  const css = read('web/styles/design-system.css');
  const html = read('web/index.html');
  const dashboard = read('web/pages/dashboard/index.js');
  const pkg = JSON.parse(read('package.json'));
  const sw = read('web/sw.js');

  assert.equal(pkg.version, '1.2.2');
  assert.ok(main.includes("import '../styles/app.css';"));
  assert.ok(main.includes("import '../styles/design-system.css';"));
  assert.match(css, /--bg:#050b16/);
  assert.match(css, /--accent:#ff9f0a/);
  assert.match(css, /\.farm-overview-stats/);
  assert.match(css, /@media\(max-width:1180px\)/);
  assert.ok(html.includes('class="brand brand-compact"'));
  assert.ok(html.includes('data-locale="ru"'));
  assert.ok(html.includes('data-locale="en"'));
  assert.ok(dashboard.includes('dashboard-chart'));
  assert.ok(dashboard.includes('dashboard-miners'));
  assert.ok(dashboard.includes('dashboard-alerts'));
  assert.ok(sw.includes("const CACHE='mfp-v1.2.2';"));
});
