import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 final design layer polishes login and safe responsive breakpoints',()=>{
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-final.css');
  assert.ok(kpi.includes("@import './design-final.css';"));
  assert.match(css,/\.login-card/);
  assert.match(css,/\.login-card \.login-language/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
