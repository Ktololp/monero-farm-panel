import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL('../'+p,import.meta.url));

const icons=['dashboard','servers','operations','updates','topology','proxy','settings','audit','docs'];

test('v1.2.2 sidebar uses semantic standalone SVG icons',()=>{
  const html=read('web/index.html');
  const css=read('web/styles/design-icons.css');
  const tooltipCss=read('web/styles/design-tooltips.css');

  assert.match(tooltipCss,/^@import '\.\/design-icons\.css';/);
  assert.equal((html.match(/class="nav-icon nav-icon-/g)||[]).length,icons.length);
  assert.doesNotMatch(css,/:nth-of-type\(/);

  for(const name of icons){
    assert.ok(exists(`web/assets/icons/${name}.svg`),`missing ${name}.svg`);
    assert.ok(html.includes(`nav-icon-${name}`),`missing nav class for ${name}`);
    assert.ok(css.includes(`../assets/icons/${name}.svg`),`missing CSS mapping for ${name}`);
    assert.match(read(`web/assets/icons/${name}.svg`),/<svg[^>]+viewBox="0 0 24 24"/);
  }
});
