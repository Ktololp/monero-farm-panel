import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('v1.3.0 miner setup exposes a dedicated authenticated API', () => {
  const router = read('src/api/setup-router.js');
  const server = read('src/app/server.js');
  assert.match(router, /requireAuth/);
  assert.match(router, /requireCsrf/);
  assert.match(router, /servers\/:id\/status/);
  assert.match(router, /servers\/:id\/xmrig\/install/);
  assert.match(server, /\/api\/v1\/setup/);
});

test('XMRig installer is idempotent and enables autostart', () => {
  const script = read('scripts/remote-install-xmrig.sh');
  assert.match(script, /Existing config preserved/);
  assert.match(script, /if \[ -s "\$XMRIG_CONFIG_PATH" \]/);
  assert.match(script, /systemctl enable "\$XMRIG_SERVICE_UNIT"/);
  assert.match(script, /systemctl (restart|start)/);
  assert.match(script, /git clone --depth 1 --branch "v\$\{XMRIG_VERSION\}" https:\/\/github\.com\/xmrig\/xmrig\.git/);
});

test('XMRig setup operation checks state before and after installation', () => {
  const operation = read('src/operations/xmrig-install.js');
  assert.match(operation, /getXmrigInstallStatus/);
  assert.match(operation, /before\.xmrig\.ready/);
  assert.match(operation, /after\.xmrig\.ready/);
  assert.match(operation, /action: 'install-xmrig'/);
});

test('miner setup UI is routed, localized and checks XMRig before installing', () => {
  const main = read('web/app/main.js');
  const page = read('web/pages/setup/index.js');
  const copy = read('web/i18n/messages/setup-copy.js');
  const html = read('web/index.html');
  assert.match(main, /createSetupPage/);
  assert.match(main, /currentPage==='setup'/);
  assert.match(html, /data-page="setup"/);
  assert.match(page, /getSetupCopy/);
  assert.match(page, /\/setup\/servers\/\$\{serverId\}\/status/);
  assert.match(page, /\/setup\/servers\/\$\{serverId\}\/xmrig\/install/);
  assert.match(copy, /Autostart/);
  assert.match(copy, /Автозагрузка/);
});

test('DEV_SYNC follows the v1.3.0 development branch', () => {
  const sync = read('DEV_SYNC.cmd');
  assert.match(sync, /set "BRANCH=dev\/v1\.3\.0"/);
  assert.match(sync, /Monero Farm Panel v1\.3\.0 - DEV SYNC/);
});
