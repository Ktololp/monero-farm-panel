import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 XMRig Proxy uses a dedicated responsive visual layer',()=>{
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-proxies.css');
  assert.ok(kpi.includes("@import './design-proxies.css';"));
  assert.match(css,/\.proxy-install-grid/);
  assert.match(css,/\.proxy-panel \.farm-overview-stats/);
  assert.match(css,/\.proxy-routing-actions/);
  assert.match(css,/\.proxy-panel \.table-wrap/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
