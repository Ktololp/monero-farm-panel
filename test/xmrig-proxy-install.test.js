import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('xmrig-proxy installer has an isolated operations module and remote script', () => {
  assert.equal(fs.existsSync(new URL('../src/operations/xmrig-proxy.js', import.meta.url)), true);
  assert.equal(fs.existsSync(new URL('../scripts/remote-install-xmrig-proxy.sh', import.meta.url)), true);
});

test('xmrig-proxy installer uses official stable release and verifies SHA256', () => {
  const op = read('src/operations/xmrig-proxy.js');
  const script = read('scripts/remote-install-xmrig-proxy.sh');
  assert.match(op, /api\.github\.com\/repos\/xmrig\/xmrig-proxy\/releases\/latest/);
  assert.match(op, /linux-static-x64/);
  assert.match(script, /sha256sum -c/);
  assert.match(script, /127\.0\.0\.1/);
  assert.match(script, /systemctl enable --now xmrig-proxy\.service/);
});

test('API and frontend expose XMRig Proxy installation', () => {
  assert.match(read('src/api/router.js'), /actions\/install-xmrig-proxy/);
  assert.match(read('web/pages/proxies/index.js'), /Установить XMRig Proxy|Установить/);
  assert.match(read('web/pages/server/index.js'), /install-xmrig-proxy/);
});
