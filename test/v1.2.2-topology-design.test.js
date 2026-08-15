import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 topology page uses an isolated responsive visual layer',()=>{
  const page=read('web/pages/topology/index.js');
  const kpi=read('web/styles/design-kpi.css');
  const css=read('web/styles/design-topology.css');
  const operations=read('web/styles/design-operations.css');
  assert.match(page,/class="topology-page"/);
  assert.ok(kpi.includes("@import './design-topology.css';"));
  assert.match(css,/\.topology-page \.topology-chain/);
  assert.match(css,/\.topology-page \.topo-node\.ok/);
  assert.match(css,/\.topology-page \.quick-terminal/);
  assert.match(operations,/profile-card strong\{[^}]*#ffd17c/);
  assert.doesNotMatch(css,/:nth-child\(/);
  assert.doesNotMatch(css,/data:image\/svg\+xml/);
});
