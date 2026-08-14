import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 tooltip is viewport-safe and does not depend on DOM mutation scans',()=>{
  const tips=read('web/components/tooltip/index.js');
  const css=read('web/styles/design-tooltips.css');
  assert.ok(tips.includes('getBoundingClientRect'));
  assert.ok(tips.includes('document.documentElement.clientWidth'));
  assert.ok(tips.includes('document.documentElement.clientHeight'));
  assert.ok(tips.includes('Math.max(margin,Math.min'));
  assert.ok(tips.includes("'.help-icon[data-tip]'"));
  assert.doesNotMatch(tips,/MutationObserver/);
  assert.ok(css.includes('position:fixed'));
  assert.ok(css.includes('max-width:min(300px,calc(100vw - 20px))'));
  assert.ok(css.includes('content:none!important'));
});
