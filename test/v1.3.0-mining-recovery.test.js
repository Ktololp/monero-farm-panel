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

test('recovery waits for monerod sync and never restarts a shared mining wrapper', () => {
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

test('monitoring does not fake 100 percent sync or auto-restart shared services', () => {
  const poller = read('src/monitoring/poller.js');
  const recovery = read('src/monitoring/recovery.js');
  assert.match(poller, /monero\.synchronized === true/);
  assert.match(poller, /targetHeight > 0/);
  assert.match(poller, /Math\.min\(99\.999/);
  assert.doesNotMatch(poller, /monero\.targetHeight \|\| monero\.height/);
  assert.match(recovery, /live\.monero\?\.synchronized === false/);
  assert.match(recovery, /sharedMiningService/);
  assert.match(recovery, /service === monerodService \|\| service === p2poolService/);
  assert.match(recovery, /Never automatically restart a unit/);
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
