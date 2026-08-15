import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 updates page uses an isolated responsive visual layer',()=>{
  const page=read('web/pages/updates/index.js');
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-updates.css');
  assert.match(page,/class="updates-page"/);
  assert.match(page,/updates-stats/);
  assert.match(page,/updates-table/);
  assert.ok(kpi.includes("@import './design-updates.css';"));
  assert.match(css,/\.updates-page \.updates-stats/);
  assert.match(css,/\.updates-page \.updates-table/);
  assert.match(css,/\.updates-page \.pill\.online/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
