import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL('../'+p,import.meta.url));

test('v1.2.2 miners table polish is modular and semantic',()=>{
  const dashboardCss=read('web/styles/design-dashboard.css');
  const minersCss=read('web/styles/design-miners.css');
  const dashboard=read('web/pages/dashboard/index.js');

  assert.match(dashboardCss,/^@import '\.\/design-miners\.css';/);
  assert.ok(exists('web/assets/icons/terminal.svg'));
  assert.match(minersCss,/terminal\.svg/);
  assert.match(minersCss,/\.quick-terminal::before/);
  assert.match(minersCss,/\.component\.active/);
  assert.match(minersCss,/\.status\.online/);
  assert.match(dashboard,/class="icon-btn quick-terminal"/);
  assert.doesNotMatch(minersCss,/:nth-(?:child|last-child)\(/);
  assert.doesNotMatch(minersCss,/data:image\/svg\+xml/);
});
