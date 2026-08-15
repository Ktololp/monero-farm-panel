import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 performance and system tabs share a dedicated responsive layer',()=>{
  const server=read('web/styles/design-server.css');
  const css=read('web/styles/design-server-performance-system.css');
  assert.ok(server.includes("@import './design-server-performance-system.css';"));
  assert.match(css,/#server-tab-view \.profile-grid/);
  assert.match(css,/\.profile-card\.selected/);
  assert.match(css,/#server-tab-view \.control-block/);
  assert.match(css,/#server-tab-view \.discovery-grid/);
  assert.match(css,/#server-tab-view \.meter/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
