import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const files = [
  'src/database/index.js',
  'src/database/connection.js',
  'src/database/schema.js',
  'src/database/defaults.js',
  'src/database/settings.js',
  'src/database/admin.js',
  'src/database/audit.js',
  'src/database/maintenance.js',
  'src/database/README.md'
];

test('database subsystem has documented responsibility files', () => {
  for (const rel of files) assert.ok(fs.existsSync(path.join(root, rel)), rel);
});

test('database index stays a small public facade', () => {
  const text = fs.readFileSync(path.join(root, 'src/database/index.js'), 'utf8');
  assert.ok(text.split(/\r?\n/).length <= 30, 'database/index.js should remain small');
  assert.match(text, /initializeSchema/);
  assert.match(text, /initializeDefaults/);
  assert.match(text, /export { db }/);
});
