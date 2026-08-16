import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pages = ['dashboard','servers','setup','server','operations','updates','topology','settings','audit'];

test('frontend page renderers live under web/pages', () => {
  for (const page of pages) assert.equal(fs.existsSync(path.join(root, 'web', 'pages', page, 'index.js')), true, `missing web/pages/${page}/index.js`);
});

test('frontend main is a composition root instead of a page monolith', () => {
  const source = fs.readFileSync(path.join(root, 'web', 'app', 'main.js'), 'utf8');
  for (const fn of ['async function renderDashboard','async function renderServers','async function renderOperations','async function renderUpdates','async function renderTopology','async function renderServer(','async function renderSettings','async function renderAudit']) assert.equal(source.includes(fn), false, `${fn} still lives in main.js`);
  assert.ok(source.split(/\r?\n/).length <= 120, 'web/app/main.js should stay a small composition root');
  assert.match(source, /createDashboardPage/);
  assert.match(source, /createServerPage/);
});
