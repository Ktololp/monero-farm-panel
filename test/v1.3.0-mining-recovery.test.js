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

test('recovery wrapper passes diagnostics and allows slow wrapper startup', () => {
  const op = read('src/operations/monerod-tor-p2p.js');
  assert.match(op, /P2POOL_LOG_PATH/);
  assert.match(op, /7 \* 60 \* 1000/);
  assert.match(op, /P2POOL_ZMQ_READY/);
  assert.match(op, /concise/);
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
