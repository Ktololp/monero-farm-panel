import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 dashboard polish is isolated in its own style layer',()=>{
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-dashboard.css');

  assert.match(kpi,/^@import '\.\/design-dashboard\.css';/);
  assert.match(css,/\.dashboard-chart canvas/);
  assert.match(css,/height:244px!important/);
  assert.match(css,/\.dashboard-miners thead th/);
  assert.match(css,/\.dashboard-miners \.component-row/);
  assert.match(css,/\.dashboard-alerts/);
  assert.match(css,/@media\(max-width:1320px\)/);
  assert.doesNotMatch(css,/nth-child/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
