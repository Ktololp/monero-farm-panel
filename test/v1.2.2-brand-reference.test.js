import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL('../'+p,import.meta.url));

const kpiIcons=['servers','hashrate','income','health','cpu','price','alerts'];

test('v1.2.2 reference brand and KPI silhouettes are explicit assets',()=>{
  const brand=read('web/assets/brand-mark.svg');
  const pick=read('web/assets/mining-pick.svg');
  const brandCss=read('web/styles/design-brand.css');
  const iconCss=read('web/styles/design-icons.css');
  const kpiCss=read('web/styles/design-kpi-icons.css');

  assert.match(brand,/FF6B1A/i);
  assert.match(brand,/stroke="url\(#frame\)"/);
  assert.match(brandCss,/brand-compact::after/);
  assert.match(brandCss,/mining-pick\.svg/);
  assert.match(brandCss,/background:#4D96FF/);
  assert.match(brandCss,/flex:0 0 22px/);
  assert.match(iconCss,/design-brand\.css/);
  assert.match(pick,/<svg[^>]+viewBox="0 0 24 24"/);
  assert.match(kpiCss,/width:17px/);
  assert.match(kpiCss,/height:17px/);

  for(const name of kpiIcons){
    assert.ok(exists(`web/assets/icons/kpi/${name}.svg`),`missing KPI icon ${name}`);
    assert.match(read(`web/assets/icons/kpi/${name}.svg`),/<svg[^>]+viewBox="0 0 24 24"/);
  }
});
