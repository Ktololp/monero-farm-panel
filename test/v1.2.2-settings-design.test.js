import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 settings use a dedicated responsive visual layer',()=>{
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-settings.css');
  assert.ok(kpi.includes("@import './design-settings.css';"));
  assert.match(css,/\.settings-tabs/);
  assert.match(css,/\.settings\.panel/);
  assert.match(css,/\.setting-feature/);
  assert.match(css,/\.settings \.save-row/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
