import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mining recovery discovers the real P2Pool process and topology', () => {
  const script = read('scripts/remote-recover-mining-chain.sh');
  assert.match(script, /pgrep -xo/);
  assert.match(script, /p2pool_runtime_info/);
  assert.match(script, /--stratum/);
  assert.match(script, /--params-file/);
  assert.match(script, /P2POOL_STRATUM_PORTS/);
  assert.match(script, /P2POOL_ZMQ_PORT/);
  assert.match(script, /P2POOL_LOG_PATH/);
  assert.match(script, /real p2pool process/i);
  assert.match(script, /wait_listener_with_process/);
  assert.match(script, /XMRig Proxy expects local upstream port/);
  assert.match(script, /XMRig expects local pool port/);
});

test('recovery waits for monerod sync and never restarts a named shared mining wrapper', () => {
  const script = read('scripts/remote-recover-mining-chain.sh');
  const op = read('src/operations/monerod-tor-p2p.js');
  assert.match(script, /monerod_runtime_info/);
  assert.match(script, /synchronized=true/);
  assert.match(script, /synchronized=false after 180s/);
  assert.match(script, /MFP_MONEROD_SYNCED=1/);
  assert.match(script, /XMRIG_SHARED=0/);
  assert.match(script, /XMRIG_SERVICE_UNIT" = "\$MONEROD_SERVICE_UNIT/);
  assert.match(script, /XMRIG_SERVICE_UNIT" = "\$P2POOL_SERVICE_UNIT/);
  assert.match(script, /not restarting the whole chain/);
  assert.match(op, /P2POOL_LOG_PATH/);
  assert.match(op, /8 \* 60 \* 1000/);
  assert.match(op, /MONEROD_SYNCED/);
  assert.match(op, /P2POOL_ZMQ_READY/);
  assert.match(op, /concise/);
});

test('monitoring never auto-restarts a live zero-hash miner and verifies runtime cgroup ownership', () => {
  const poller = read('src/monitoring/poller.js');
  const recovery = read('src/monitoring/recovery.js');
  assert.match(poller, /monero\.synchronized === true/);
  assert.match(poller, /targetHeight > 0/);
  assert.match(poller, /Math\.min\(99\.999/);
  assert.doesNotMatch(poller, /monero\.targetHeight \|\| monero\.height/);
  assert.match(recovery, /xmrigApiAlive/);
  assert.match(recovery, /Number\(live\.hash60s\) < 1/);
  assert.match(recovery, /live\.monero\?\.synchronized === false/);
  assert.match(recovery, /runtimeUnitOwnership/);
  assert.match(recovery, /ControlGroup/);
  assert.match(recovery, /ownership !== 'dedicated'/);
  assert.match(recovery, /auto-recovery-suppressed/);
  assert.doesNotMatch(recovery, /const badHash/);
});

test('Tor P2P cleanup is no-op safe and only removes proven orphaned MFP options', () => {
  const script = read('scripts/remote-set-monerod-tor-p2p.sh');
  const op = read('src/operations/monerod-tor-p2p.js');
  assert.match(script, /mfp-tor-p2p-backup-/);
  assert.match(script, /OLD_BACKUPS/);
  assert.match(script, /ORPHAN_CLEANED/);
  assert.match(script, /cmp -s/);
  assert.match(script, /service restart skipped/);
  assert.match(script, /MFP_CHANGED=0/);
  assert.match(script, /MFP_CHANGED=1/);
  assert.match(op, /Always run the disable script as a probe/);
  assert.match(op, /ORPHAN_CLEANED/);
  assert.match(op, /p2pConfigChanged/);
  assert.match(op, /orphanedMfpOptionsCleaned/);
});

test('API errors are JSON and frontend strips fallback Express stacks', () => {
  const server = read('src/app/server.js');
  const client = read('web/services/api.js');
  assert.match(server, /originalUrl\.startsWith\('\/api\/'\)/);
  assert.match(server, /res\.status\(status\)\.json\(\{ error:/);
  assert.match(server, /console\.error\(`\[api\]/);
  assert.match(client, /withoutStack/);
  assert.match(client, /file:\\\/\\\/\\\//);
});
