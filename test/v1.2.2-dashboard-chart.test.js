import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('v1.2.2 dashboard chart follows the blue reference visual language',()=>{
  const dashboard=read('web/pages/dashboard/index.js');
  assert.match(dashboard,/borderColor:'#3d91ff'/);
  assert.match(dashboard,/createLinearGradient/);
  assert.match(dashboard,/rgba\(61,145,255,\.28\)/);
  assert.match(dashboard,/cubicInterpolationMode:'monotone'/);
  assert.match(dashboard,/backgroundColor:'rgba\(8,20,36,\.96\)'/);
  assert.match(dashboard,/grid:\{color:'rgba\(102,132,170,\.10\)'/);
  assert.match(dashboard,/const farmScale=hashrateScale/);
  assert.doesNotMatch(dashboard,/borderColor:'#f59e0b'/);
});
