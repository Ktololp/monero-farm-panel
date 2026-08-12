import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'src', 'discovery');
const expected = ['index.js', 'remote-script.js', 'normalize.js', 'server.js', 'README.md'];

test('discovery subsystem has explicit responsibility files', () => {
  for (const file of expected) assert.equal(fs.existsSync(path.join(dir, file)), true, `missing src/discovery/${file}`);
});

test('discovery index no longer embeds the remote Python script', () => {
  const source = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
  assert.doesNotMatch(source, /String\.raw`/);
  assert.ok(source.split(/\r?\n/).length <= 90);
  assert.match(source, /discoverServer/);
  assert.match(source, /getDiscovery/);
});
