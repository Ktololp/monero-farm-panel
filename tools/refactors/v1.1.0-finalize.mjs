#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = rel => path.join(root, ...rel.split('/'));
const fail = msg => { console.error(`[v1.1.0/finalize] ERROR: ${msg}`); process.exit(1); };

const pkg = JSON.parse(fs.readFileSync(p('package.json'), 'utf8'));
if (pkg.version !== '1.1.0') fail(`Expected package version 1.1.0, got ${pkg.version}.`);

const required = [
  'AGENTS.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPER_GUIDE.md',
  'docs/openapi.yaml',
  'src/database/index.js',
  'src/ssh/index.js',
  'src/monitoring/index.js',
  'src/operations/index.js',
  'src/discovery/index.js',
  'web/app/main.js',
  'web/pages/dashboard/index.js',
  'web/pages/servers/index.js',
  'web/pages/server/index.js',
  'web/pages/operations/index.js',
  'web/pages/updates/index.js',
  'web/pages/topology/index.js',
  'web/pages/settings/index.js',
  'web/pages/audit/index.js'
];
for (const rel of required) if (!fs.existsSync(p(rel))) fail(`Required v1.1.0 file is missing: ${rel}`);

const attributes = `* text=auto

*.js text eol=lf
*.mjs text eol=lf
*.json text eol=lf
*.md text eol=lf
*.yaml text eol=lf
*.yml text eol=lf
*.css text eol=lf
*.html text eol=lf
*.webmanifest text eol=lf
*.sh text eol=lf
Dockerfile text eol=lf

*.cmd text eol=crlf
*.bat text eol=crlf
*.ps1 text eol=crlf
`;
fs.writeFileSync(p('.gitattributes'), attributes, 'utf8');
console.log('[v1.1.0/finalize] wrote .gitattributes');

const hygieneTest = `import test from 'node:test';
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
  for (const rel of permanent) assert.equal(fs.existsSync(path.join(root, rel)), true, \`missing \${rel}\`);
});

test('temporary v1.1.0 transfer and refactor helpers are absent', () => {
  for (const rel of ['tools/migrations', 'tools/refactors']) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) continue;
    const leftovers = fs.readdirSync(dir).filter(name => /^v1\\.1\\.0/i.test(name));
    assert.deepEqual(leftovers, [], \`temporary files remain in \${rel}: \${leftovers.join(', ')}\`);
  }
});
`;
fs.writeFileSync(p('test/release-hygiene.test.js'), hygieneTest, 'utf8');
console.log('[v1.1.0/finalize] wrote test/release-hygiene.test.js');

const removed = [];
for (const rel of ['tools/migrations', 'tools/refactors']) {
  const dir = p(rel);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!/^v1\.1\.0/i.test(name)) continue;
    const target = path.join(dir, name);
    const stat = fs.statSync(target);
    if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
    else fs.rmSync(target, { force: true });
    removed.push(`${rel}/${name}`);
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}
const toolsDir = p('tools');
if (fs.existsSync(toolsDir) && fs.readdirSync(toolsDir).length === 0) fs.rmdirSync(toolsDir);

console.log(`[v1.1.0/finalize] removed ${removed.length} temporary v1.1.0 helper artifact(s)`);
for (const rel of removed) console.log(`  - ${rel}`);
console.log('[v1.1.0/finalize] OK');
console.log('[v1.1.0/finalize] Next: npm run check && npm test && npm run build:web && git diff --check');
