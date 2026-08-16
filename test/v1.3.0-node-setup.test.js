import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('XMRig setup discovers custom binaries from the running systemd service', () => {
  const operation = read('src/operations/xmrig-install.js');
  assert.match(operation, /MainPID/);
  assert.match(operation, /\/proc\/\$MAIN_PID\/exe/);
  assert.match(operation, /ExecStart/);
  assert.match(operation, /path=/);
});

test('monerod installer uses official hashes, supports pruning and enables autostart', () => {
  const script = read('scripts/remote-install-monerod.sh');
  assert.match(script, /https:\/\/www\.getmonero\.org\/downloads\/hashes\.txt/);
  assert.match(script, /sha256sum/);
  assert.match(script, /monero-linux-x64/);
  assert.match(script, /monero-linux-armv8/);
  assert.match(script, /MONEROD_MODE/);
  assert.match(script, /prune-blockchain=1/);
  assert.match(script, /sync-pruned-blocks=1/);
  assert.match(script, /rpc-bind-ip=127\.0\.0\.1/);
  assert.match(script, /systemctl enable "\$MONEROD_SERVICE_UNIT"/);
});

test('Tor setup exposes monerod P2P onion while keeping RPC private', () => {
  const script = read('scripts/remote-configure-monerod-tor.sh');
  assert.match(script, /HiddenServiceVersion 3/);
  assert.match(script, /HiddenServicePort \$\{TOR_ONION_PORT\} 127\.0\.0\.1:\$\{TOR_ONION_PORT\}/);
  assert.match(script, /anonymous-inbound=/);
  assert.match(script, /tx-proxy=tor,127\.0\.0\.1:/);
  assert.match(script, /systemctl enable tor/);
  assert.doesNotMatch(script, /HiddenServicePort 18081/);
  assert.doesNotMatch(script, /rpc-bind-ip=0\.0\.0\.0/);
});

test('setup API and UI expose monerod mode selection and Tor configuration', () => {
  const router = read('src/api/setup-router.js');
  const page = read('web/pages/setup/index.js');
  const copy = read('web/i18n/messages/setup-copy.js');
  assert.match(router, /servers\/:id\/monerod\/install/);
  assert.match(router, /servers\/:id\/monerod\/tor/);
  assert.match(page, /setup-node-mode/);
  assert.match(page, /body: \{ mode: selectedMode \}/);
  assert.match(page, /\/monerod\/tor/);
  assert.match(copy, /Pruned node/);
  assert.match(copy, /Обрезанная нода/);
  assert.match(copy, /Onion/);
});
