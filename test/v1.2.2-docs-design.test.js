import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 documentation uses a dedicated responsive visual layer',()=>{
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-docs.css');
  assert.ok(kpi.includes("@import './design-docs.css';"));
  assert.match(css,/\.docs-grid/);
  assert.match(css,/\.doc-card/);
  assert.match(css,/\.doc-icon/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.doesNotMatch(css,/:nth-child\(/);
});
