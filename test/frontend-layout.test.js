import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const expected = [
  'web/app/ui.js',
  'web/services/api.js',
  'web/components/charts/registry.js',
  'web/components/terminal/index.js'
];

test('frontend core has explicit infrastructure modules', () => {
  for (const rel of expected) assert.equal(fs.existsSync(path.join(root, rel)), true, `missing ${rel}`);
});

test('frontend main delegates API, chart lifecycle and terminal implementation', () => {
  const source = fs.readFileSync(path.join(root, 'web', 'app', 'main.js'), 'utf8');
  assert.doesNotMatch(source, /async function api\(/);
  assert.doesNotMatch(source, /new Terminal\(/);
  assert.match(source, /configureApi/);
  assert.match(source, /createTerminalController/);
  assert.match(source, /destroyCharts/);
});
