import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 server components use a dedicated responsive visual layer',()=>{
  const server=read('web/styles/design-server.css');
  const css=read('web/styles/design-server-components.css');
  assert.ok(server.includes("@import './design-server-components.css';"));
  assert.match(css,/#server-tab-view > \.component-cards-4/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/#server-tab-view \.component-card/);
  assert.match(css,/#server-tab-view \.health-list/);
  assert.match(css,/#server-tab-view \.compact-table/);
  assert.match(css,/#server-tab-view \.sync-line/);
  assert.match(css,/#server-tab-view \.read-grid/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
