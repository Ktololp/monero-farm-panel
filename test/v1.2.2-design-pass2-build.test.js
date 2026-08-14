import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 pass2 build resolves SVG brand and uses tooltip component',()=>{
  const build=read('build.mjs');
  const tips=read('web/components/tooltip/index.js');
  const css=read('web/styles/design-tooltips.css');
  const ui=read('web/app/ui.js');
  assert.ok(build.includes("'.svg':'dataurl'"));
  assert.ok(ui.includes('class=\"help-icon\"'));
  assert.ok(ui.includes('data-tip='));
  assert.ok(tips.includes("getAttribute('data-tip')"));
  assert.ok(tips.includes('positionTooltip'));
  assert.ok(css.includes('.mfp-tooltip'));
  assert.ok(css.includes('.help-icon'));
});
