import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL('../'+p,import.meta.url));
const icons=['servers','hashrate','income','health','cpu','price','alerts'];

test('v1.2.2 KPI cards use standalone semantic SVG icons',()=>{
  const iconCss=read('web/styles/design-icons.css');
  const kpiCss=read('web/styles/design-kpi-icons.css');
  const dashboard=read('web/pages/dashboard/index.js');

  assert.match(iconCss,/^@import '\.\/design-kpi-icons\.css';/);
  assert.doesNotMatch(kpiCss,/data:image\/svg\+xml/);

  for(const name of icons){
    const asset=`web/assets/icons/kpi/${name}.svg`;
    assert.ok(exists(asset),`missing ${asset}`);
    assert.ok(dashboard.includes(`kpi-${name}`),`missing dashboard class kpi-${name}`);
    assert.ok(kpiCss.includes(`../assets/icons/kpi/${name}.svg`),`missing CSS mapping for ${name}`);
    assert.match(read(asset),/<svg[^>]+viewBox="0 0 24 24"/);
  }
});
