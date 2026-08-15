import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 server overview uses a dedicated maintainable visual layer',()=>{
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-server.css');
  assert.ok(kpi.includes("@import './design-server.css';"));
  assert.match(css,/#header-terminal/);
  assert.match(css,/\.server-tab\.active/);
  assert.match(css,/#server-tab-view > \.stats\.stats-5/);
  assert.match(css,/mask:url\('\.\.\/assets\/icons\/terminal\.svg'\)/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/:nth-child\(/);
});
