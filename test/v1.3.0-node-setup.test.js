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
  assert.match(operation, /status\.torConfigurable = status\.running/);
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

test('Tor setup supports a configless running monerod without rewriting its CLI arguments', () => {
  const script = read('scripts/remote-configure-monerod-tor.sh');
  const operation = read('src/operations/monerod-setup.js');
  assert.match(script, /pgrep -xo monerod/);
  assert.match(script, /--config-file/);
  assert.match(script, /--data-dir/);
  assert.match(script, /PROC_HOME/);
  assert.match(script, /bitmonero\.conf/);
  assert.match(script, /Created by Monero Farm Panel/);
  assert.match(script, /HiddenServiceVersion 3/);
  assert.match(script, /HiddenServicePort \$\{TOR_ONION_PORT\} 127\.0\.0\.1:\$\{TOR_ONION_PORT\}/);
  assert.match(script, /anonymous-inbound=/);
  assert.match(script, /tx-proxy=tor,127\.0\.0\.1:/);
  assert.match(script, /systemctl enable tor/);
  assert.match(operation, /MONEROD_CONFIG_PATH: monerod\.configPath \|\| ''/);
  assert.doesNotMatch(operation, /config file could not be located safely/);
  assert.doesNotMatch(script, /HiddenServicePort 18081/);
  assert.doesNotMatch(script, /rpc-bind-ip=0\.0\.0\.0/);
});

test('full P2P Tor experiment is recovery-only and restores the mining dependency chain', () => {
  const p2pScript = read('scripts/remote-set-monerod-tor-p2p.sh');
  const recoveryScript = read('scripts/remote-recover-mining-chain.sh');
  const operation = read('src/operations/monerod-tor-p2p.js');
  const router = read('src/api/setup-router.js');
  const page = read('web/pages/setup/index.js');
  assert.match(p2pScript, /BEGIN MFP TOR P2P/);
  assert.match(p2pScript, /TOR_P2P_MODE/);
  assert.match(p2pScript, /mfp-tor-p2p-backup/);
  assert.doesNotMatch(p2pScript, /rpc-bind-ip=/);
  assert.doesNotMatch(p2pScript, /rpc-bind-port=/);
  assert.match(recoveryScript, /Waiting for monerod RPC/);
  assert.match(recoveryScript, /Restarting \$P2POOL_SERVICE_UNIT/);
  assert.match(recoveryScript, /Restarting \$XMRIG_PROXY_SERVICE_UNIT/);
  assert.match(recoveryScript, /Restarting \$XMRIG_SERVICE_UNIT/);
  assert.match(operation, /remote-recover-mining-chain\.sh/);
  assert.match(operation, /before\.tor\.p2pConfigured/);
  assert.match(operation, /TOR_P2P_MODE: 'disable'/);
  assert.match(operation, /recovery-only/);
  assert.match(router, /monerod\/tor\/p2p/);
  assert.match(page, /body: \{ enabled: false \}/);
  assert.doesNotMatch(page, /body: \{ enabled: enable \}/);
});

test('Tor onion check validates the local hidden-service pipeline without self-connecting through Tor', () => {
  const script = read('scripts/remote-check-monerod-tor.sh');
  const operation = read('src/operations/tor-reachability.js');
  const router = read('src/api/setup-router.js');
  assert.match(script, /LOCAL_LISTENER/);
  assert.match(script, /HiddenServicePort/);
  assert.match(script, /127\.0\.0\.1/);
  assert.match(script, /MFP_EXTERNAL_VERIFIED=0/);
  assert.match(script, /Local Tor onion pipeline is ready/);
  assert.doesNotMatch(script, /--socks5-hostname/);
  assert.doesNotMatch(script, /telnet:\/\//);
  assert.match(operation, /timeoutMs: 15000/);
  assert.match(operation, /externalVerified/);
  assert.match(operation, /checkMonerodTorReachability/);
  assert.match(router, /monerod\/tor\/check/);
});

test('setup UI uses inline Tor icon, local pipeline check and recovery-only P2P control', () => {
  const router = read('src/api/setup-router.js');
  const page = read('web/pages/setup/index.js');
  const copy = read('web/i18n/messages/setup-copy.js');
  const css = read('web/styles/design-setup.css');
  assert.match(router, /servers\/:id\/monerod\/install/);
  assert.match(router, /servers\/:id\/monerod\/tor/);
  assert.match(page, /setup-node-mode/);
  assert.match(page, /body: \{ mode: selectedMode \}/);
  assert.match(page, /monerod\.torConfigurable/);
  assert.match(page, /monerod\.running/);
  assert.match(page, /rpcEndpoint/);
  assert.match(page, /const TOR_ICON_SVG/);
  assert.match(page, /#7d4698/i);
  assert.match(page, /#68b030/i);
  assert.match(page, /setup-check-tor/);
  assert.match(page, /monerod\/tor\/check/);
  assert.match(page, /setup-toggle-tor-p2p/);
  assert.match(page, /monerod\/tor\/p2p/);
  assert.match(page, /status\.p2pConfigured/);
  assert.match(page, /body: \{ enabled: false \}/);
  assert.match(page, /configNotUsed/);
  assert.match(page, /torWillCreateConfig/);
  assert.doesNotMatch(page, /<img class="setup-title-icon"/);
  assert.match(copy, /RPC monerod/);
  assert.match(copy, /Не используется/);
  assert.match(copy, /Восстановить обычный P2P \+ майнинг/);
  assert.match(copy, /Локальная цепочка onion/);
  assert.match(copy, /bitmonero\.conf/);
  assert.match(css, /setup-flag\.planned/);
});
