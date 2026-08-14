import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 design pass 2 assets and hooks exist',()=>{
  const main=read('web/app/main.js');
  const html=read('web/index.html');
  const css=read('web/styles/design-pass2.css');
  const dashboard=read('web/pages/dashboard/index.js');
  const brand=read('web/assets/brand-mark.svg');
  assert.ok(main.includes("import '../styles/design-pass2.css';"));
  assert.ok(main.includes("import '../components/tooltip/index.js';"));
  assert.ok(html.includes('brand-mark-image'));
  assert.ok(css.includes('.farm-overview-stats'));
  assert.ok(css.includes('.kpi-icon'));
  assert.ok(dashboard.includes('kpi-wide'));
  assert.ok(dashboard.includes('kpi-short'));
  assert.ok(dashboard.includes('kpi-income'));
  assert.match(brand,/svg/i);
});
