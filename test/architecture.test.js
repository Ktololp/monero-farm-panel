import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pkg from '../package.json' with { type: 'json' };

const required=[
  'AGENTS.md','docs/DEVELOPER_GUIDE.md','docs/openapi.yaml','scripts/mfp',
  'src/app/start.js','src/app/server.js','src/api/router.js','src/config/index.js','src/database/index.js',
  'src/ssh/index.js','src/discovery/index.js','src/monitoring/index.js','src/monitoring/history.js',
  'src/operations/index.js','src/updates/index.js','src/security/auth.js','src/security/crypto.js',
  'src/miners/xmrig/README.md','src/miners/p2pool/README.md','src/miners/monerod/README.md',
  'web/app/main.js','web/components/charts/scales.js','web/styles/app.css'
];
test('v1.1.0 architecture map exists',()=>{assert.equal(pkg.version,'1.1.0');for(const p of required)assert.equal(fs.existsSync(p),true,'missing '+p);});
test('legacy monolithic top-level modules were moved',()=>{for(const p of ['src/api.js','src/db.js','src/ssh.js','src/monitor.js','src/operations.js','web/main.js','web/chart-scales.js'])assert.equal(fs.existsSync(p),false,'legacy file still exists: '+p);});
