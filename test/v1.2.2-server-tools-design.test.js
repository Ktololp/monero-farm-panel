import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 logs and management tabs use a dedicated visual layer',()=>{
  const server=read('web/styles/design-server.css');
  const css=read('web/styles/design-server-tools.css');
  assert.ok(server.includes("@import './design-server-tools.css';"));
  assert.match(css,/#server-tab-view \.log-tabs/);
  assert.match(css,/#server-tab-view \.log-load\.active/);
  assert.match(css,/#server-tab-view #component-log/);
  assert.match(css,/#server-tab-view \.action-stack/);
  assert.match(css,/#server-tab-view #remote-command/);
  assert.match(css,/#server-tab-view #command-output/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
