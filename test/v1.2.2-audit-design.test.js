import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 audit uses an isolated table visual layer',()=>{
  const page=read('web/pages/audit/index.js');
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-audit.css');
  assert.match(page,/class="audit-page"/);
  assert.ok(kpi.includes("@import './design-audit.css';"));
  assert.match(css,/\.audit-page \.audit-table/);
  assert.match(css,/\.audit-page \.pill\.online/);
  assert.match(css,/\.audit-page \.details/);
  assert.doesNotMatch(css,/:nth-child\(/);
});
