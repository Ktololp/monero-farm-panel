import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('XMRig Proxy installation is idempotent and installer permissions are correct', () => {
  const op = read('src/operations/xmrig-proxy.js');
  const script = read('scripts/remote-install-xmrig-proxy.sh');
  assert.match(op, /alreadyInstalled/);
  assert.match(op, /pgrep -x xmrig-proxy/);
  assert.match(script, /chown root:"\$GROUP" "\$CONFIG_DIR"/);
  assert.match(script, /chmod 0750 "\$CONFIG_DIR"/);
  assert.doesNotMatch(script, /--dry-run/);
});

test('XMRig can be safely routed through XMRig Proxy with rollback', () => {
  const src = read('src/operations/proxy-routing.js');
  assert.match(src, /127\.0\.0\.1:3334/);
  assert.match(src, /waitForMiner/);
  assert.match(src, /writeConfig\(server, original\)/);
  assert.match(src, /Защита от цикла/);
});

test('P2Pool analytics has one-click persistent enablement and rollback', () => {
  const op = read('src/operations/p2pool-analytics.js');
  const script = read('scripts/remote-enable-p2pool-analytics.sh');
  assert.match(op, /enableP2poolAnalytics/);
  assert.match(script, /--data-api/);
  assert.match(script, /--local-api/);
  assert.match(script, /rollback/);
  assert.match(script, /systemctl restart/);
});

test('API and frontend expose dummy-proof safety actions', () => {
  const api = read('src/api/router.js'),
    server = read('web/pages/server/index.js'),
    proxy = read('web/pages/proxies/index.js'),
    messages = read('web/i18n/messages/server.js');
  assert.match(api, /actions\/xmrig-to-proxy/);
  assert.match(api, /actions\/enable-p2pool-analytics/);
  assert.match(server, /actions\/enable-p2pool-analytics/);
  assert.match(server, /server\.components\.enableP2pool/);
  assert.match(messages, /server\.components\.enableP2pool/);
  assert.match(proxy, /actions\/xmrig-to-proxy/);
  assert.match(proxy, /proxy-switch/);
  assert.match(proxy, /r\.alreadyConfigured/);
  assert.match(proxy, /r\.alreadyInstalled/);
});

test('P2Pool one-click editor does not patch pgrep checks', () => {
  const script = read('scripts/remote-enable-p2pool-analytics.sh');
  assert.match(script, /skip_words/);
  assert.match(script, /pgrep/);
  assert.match(script, /bash -n/);
  assert.match(script, /real p2pool launch command/);
});

test('P2Pool launch detection avoids fragile regex quoting', () => {
  const script = read('scripts/remote-enable-p2pool-analytics.sh');
  assert.match(script, /tokens = line\.strip\(\)\.split\(\)/);
  assert.match(script, /clean in \('p2pool', '\.\/p2pool'\)/);
  assert.match(script, /clean\.endswith\('\/p2pool'\)/);
  assert.doesNotMatch(script, /binary_re\s*=\s*re\.compile/);
});
