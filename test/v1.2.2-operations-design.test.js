import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 operations page uses an isolated responsive visual layer',()=>{
  const page=read('web/pages/operations/index.js');
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-operations.css');
  assert.match(page,/class="operations-page"/);
  assert.match(page,/operations-restart/);
  assert.match(page,/operations-profiles/);
  assert.ok(kpi.includes("@import './design-operations.css';"));
  assert.match(css,/\.operations-page \.server-check-list/);
  assert.match(css,/\.operations-page \.profile-grid/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
