import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 tooltip lifecycle does not stick after native title suppression',()=>{
  const tooltip=read('web/components/tooltip/index.js');
  assert.match(tooltip,/data-mfp-tooltip-title/);
  assert.match(tooltip,/from===active \|\| active\.contains\(from\)/);
  assert.match(tooltip,/window\.addEventListener\('scroll',\(\)=>hideTooltip\(\)/);
  assert.match(tooltip,/window\.addEventListener\('blur',\(\)=>hideTooltip\(\)/);
  assert.match(tooltip,/document\.addEventListener\('pointerdown',\(\)=>hideTooltip\(\),true\)/);
});

test('v1.2.2 active alerts use a dedicated centered empty-state layer',()=>{
  const dashboard=read('web/styles/design-dashboard.css');
  const alerts=read('web/styles/design-alerts.css');
  assert.ok(dashboard.includes("@import './design-alerts.css';"));
  assert.match(alerts,/\.dashboard-alerts \.empty::before/);
  assert.match(alerts,/content:'✓'!important/);
  assert.match(alerts,/justify-content:center!important/);
  assert.doesNotMatch(alerts,/:nth-child\(/);
});
