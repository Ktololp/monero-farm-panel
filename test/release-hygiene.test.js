import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const permanent = [
  '.gitattributes',
  'AGENTS.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPER_GUIDE.md',
  'docs/openapi.yaml'
];

test('v1.1.0 release hygiene files exist', () => {
  for (const rel of permanent) assert.equal(fs.existsSync(path.join(root, rel)), true, `missing ${rel}`);
});

test('temporary v1.1.0 transfer and refactor helpers are absent', () => {
  for (const rel of ['tools/migrations', 'tools/refactors']) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) continue;
    const leftovers = fs.readdirSync(dir).filter(name => /^v1\.1\.0/i.test(name));
    assert.deepEqual(leftovers, [], `temporary files remain in ${rel}: ${leftovers.join(', ')}`);
  }
});
