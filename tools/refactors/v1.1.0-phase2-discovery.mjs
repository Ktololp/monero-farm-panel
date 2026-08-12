#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = rel => path.join(root, ...rel.split('/'));
const read = rel => fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n');
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), `${content.replace(/\r\n/g, '\n').trimEnd()}\n`, 'utf8');
  console.log(`[phase2/discovery] wrote ${rel}`);
};
const fail = msg => { console.error(`[phase2/discovery] ERROR: ${msg}`); process.exit(1); };

const sourcePath = 'src/discovery/index.js';
if (!fs.existsSync(p(sourcePath))) fail(`${sourcePath} not found. Run the v1.1.0 layout migration first.`);
const source = read(sourcePath);

const required = [
  'function serverById',
  'function toService',
  'function toPort',
  'const REMOTE_DISCOVERY = String.raw`',
  'export async function discoverServer',
  'export function getDiscovery'
];
for (const marker of required) if (!source.includes(marker)) fail(`Unexpected discovery layout; missing marker: ${marker}`);

function chunk(start, end = null) {
  const a = source.indexOf(start);
  if (a < 0) fail(`Cannot find section start: ${start}`);
  const b = end ? source.indexOf(end, a + start.length) : source.length;
  if (end && b < 0) fail(`Cannot find section end: ${end}`);
  return source.slice(a, b).trim();
}

const serverById = chunk('function serverById', '\nfunction toService');
const toService = chunk('function toService', '\nfunction toPort');
const toPort = chunk('function toPort', '\n\nconst REMOTE_DISCOVERY');
const remote = chunk('const REMOTE_DISCOVERY = String.raw`', '\n\nexport async function discoverServer');
const discoverServer = chunk('export async function discoverServer', '\n\nexport function getDiscovery');
const getDiscovery = chunk('export function getDiscovery');

write('src/discovery/server.js', [
  "import { db } from '../database/index.js';",
  '',
  serverById.replace('function serverById', 'export function serverById')
].join('\n'));

write('src/discovery/normalize.js', [
  toService.replace('function toService', 'export function toService'),
  '',
  toPort.replace('function toPort', 'export function toPort')
].join('\n'));

write('src/discovery/remote-script.js', remote.replace('const REMOTE_DISCOVERY', 'export const REMOTE_DISCOVERY'));

write('src/discovery/index.js', [
  "import { db, audit } from '../database/index.js';",
  "import { ssh, shellQuote } from '../ssh/index.js';",
  "import { serverById } from './server.js';",
  "import { toService, toPort } from './normalize.js';",
  "import { REMOTE_DISCOVERY } from './remote-script.js';",
  '',
  discoverServer,
  '',
  getDiscovery
].join('\n'));

write('src/discovery/README.md', `# Discovery subsystem

The discovery subsystem detects the real mining layout of a remote Linux host without requiring an agent.

- \`remote-script.js\` — the Python inventory script executed remotely over SSH.
- \`normalize.js\` — validation and normalization of discovered service names and ports.
- \`server.js\` — database lookup helper for a configured server.
- \`index.js\` — public discovery API and persistence of accepted inventory data.

Data flow: API/operations -> discovery facade -> SSH -> remote Python inventory -> normalize -> optional database update.

The remote script is intentionally kept separate from the JavaScript orchestration so changes to Linux detection logic are easy to review without reading application control flow.
`);

write('test/discovery-layout.test.js', [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  '',
  "const root = path.resolve(import.meta.dirname, '..');",
  "const dir = path.join(root, 'src', 'discovery');",
  "const expected = ['index.js', 'remote-script.js', 'normalize.js', 'server.js', 'README.md'];",
  '',
  "test('discovery subsystem has explicit responsibility files', () => {",
  "  for (const file of expected) assert.equal(fs.existsSync(path.join(dir, file)), true, `missing src/discovery/${file}`);",
  "});",
  '',
  "test('discovery index no longer embeds the remote Python script', () => {",
  "  const source = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');",
  "  assert.doesNotMatch(source, /String\\.raw`/);",
  "  assert.ok(source.split(/\\r?\\n/).length <= 90);",
  "  assert.match(source, /discoverServer/);",
  "  assert.match(source, /getDiscovery/);",
  "});"
].join('\n'));

console.log('[phase2/discovery] OK');
console.log('[phase2/discovery] remote Python inventory moved out of src/discovery/index.js.');
console.log('[phase2/discovery] Next: npm run check && npm test');
