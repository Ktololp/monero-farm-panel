import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('XMRig setup detects a running miner even when proc exe is not readable', () => {
  const operation = read('src/operations/xmrig-install.js');
  const script = read('scripts/remote-status-xmrig.sh');
  assert.match(operation, /remote-status-xmrig\.sh/);
  assert.match(operation, /processDetected/);
  assert.match(operation, /status\.detected/);
  assert.match(script, /pgrep -xo "\$target"/);
  assert.match(script, /ControlGroup/);
  assert.match(script, /ps -p "\$pid" -o args=/);
  assert.match(script, /systemctl status "\$XMRIG_SERVICE_UNIT"/);
  assert.match(script, /MFP_PROCESS/);
  assert.match(script, /MFP_CONFIG_PATH/);
  assert.doesNotMatch(script, /MAIN_PID/);
});

test('monerod setup discovers legacy config locations and the actual RPC endpoint', () => {
  const operation = read('src/operations/monerod-setup.js');
  const script = read('scripts/remote-status-monerod.sh');
  assert.match(operation, /remote-status-monerod\.sh/);
  assert.match(operation, /rpcEndpoint/);
  assert.match(operation, /status\.running/);
  assert.match(operation, /torConfigurable/);
  assert.doesNotMatch(operation, /local RPC must be reachable before Tor setup/);
  assert.match(script, /pgrep -xo "\$target"/);
  assert.match(script, /DATA_DIR\/bitmonero\.conf/);
  assert.match(script, /PROC_CWD\/bitmonero\.conf/);
  assert.match(script, /rpc-bind-port/);
  assert.match(script, /rpc-restricted-bind-port/);
  assert.match(script, /\/json_rpc/);
  assert.match(script, /MFP_RPC_ENDPOINT/);
  assert.match(script, /MFP_RPC_PRIVATE/);
  assert.match(script, /--prune-blockchain/);
});

test('monerod installer verifies signed official hashes, supports pruning and enables autostart', () => {
  const script = read('scripts/remote-install-monerod.sh');
  assert.match(script, /https:\/\/www\.getmonero\.org\/downloads\/hashes\.txt/);
  assert.match(script, /binaryfate\.asc/);
  assert.match(script, /81AC591FE9C4B65C5806AFC3F0AF4D462A0BDF92/);
  assert.match(script, /gpg --batch --homedir "\$GNUPGHOME" --verify "\$TMP_HASHES"/);
  assert.match(script, /sha256sum/);
  assert.match(script, /monero-linux-x64/);
  assert.match(script, /monero-linux-armv8/);
  assert.match(script, /MONEROD_MODE/);
  assert.match(script, /prune-blockchain=1/);
  assert.match(script, /sync-pruned-blocks=1/);
  assert.match(script, /rpc-bind-ip=127\.0\.0\.1/);
  assert.match(script, /systemctl enable "\$MONEROD_SERVICE_UNIT"/);
});

test('Tor setup exposes monerod P2P onion while leaving RPC configuration alone', () => {
  const script = read('scripts/remote-configure-monerod-tor.sh');
  assert.match(script, /HiddenServiceVersion 3/);
  assert.match(script, /HiddenServicePort \$\{TOR_ONION_PORT\} 127\.0\.0\.1:\$\{TOR_ONION_PORT\}/);
  assert.match(script, /anonymous-inbound=/);
  assert.match(script, /tx-proxy=tor,127\.0\.0\.1:/);
  assert.match(script, /systemctl enable tor/);
  assert.doesNotMatch(script, /HiddenServicePort 18081/);
  assert.doesNotMatch(script, /rpc-bind-ip=0\.0\.0\.0/);
});

test('setup UI uses the Tor onion icon and does not offer reinstall for a running monerod', () => {
  const router = read('src/api/setup-router.js');
  const page = read('web/pages/setup/index.js');
  const copy = read('web/i18n/messages/setup-copy.js');
  const torIcon = read('web/assets/icons/tor.svg');
  assert.match(router, /servers\/:id\/monerod\/install/);
  assert.match(router, /servers\/:id\/monerod\/tor/);
  assert.match(page, /setup-node-mode/);
  assert.match(page, /body: \{ mode: selectedMode \}/);
  assert.match(page, /monerod\.torConfigurable/);
  assert.match(page, /monerod\.running/);
  assert.match(page, /rpcEndpoint/);
  assert.match(page, /\/assets\/icons\/tor\.svg/);
  assert.match(page, /torNeedsConfig/);
  assert.match(copy, /RPC monerod/);
  assert.match(copy, /Обрезанная нода/);
  assert.match(torIcon, /#7d4698/i);
  assert.match(torIcon, /#68b030/i);
});
