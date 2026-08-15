import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 servers page uses an isolated responsive visual layer',()=>{
  const page=read('web/pages/servers/index.js');
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-servers.css');
  assert.match(page,/class="servers-page"/);
  assert.ok(kpi.includes("@import './design-servers.css';"));
  assert.match(css,/\.servers-page \.server-grid/);
  assert.match(css,/\.servers-page \.server-card/);
  assert.match(css,/\.servers-page \.quick-terminal/);
  assert.match(css,/\.servers-page \.server-meta/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
