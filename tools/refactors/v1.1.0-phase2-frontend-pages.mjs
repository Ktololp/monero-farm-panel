#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = rel => path.join(root, ...rel.split('/'));
const read = rel => fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n');
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), `${content.replace(/\r\n/g, '\n').trimEnd()}\n`, 'utf8');
  console.log(`[phase2/frontend-pages] wrote ${rel}`);
};
const fail = msg => { console.error(`[phase2/frontend-pages] ERROR: ${msg}`); process.exit(1); };

const sourcePath = 'web/app/main.js';
if (!fs.existsSync(p(sourcePath))) fail(`${sourcePath} not found.`);
const source = read(sourcePath);

const required = [
  "from './ui.js'",
  "from '../services/api.js'",
  "from '../components/charts/registry.js'",
  "from '../components/terminal/index.js'",
  'async function renderDashboard',
  'async function renderServers',
  'async function renderOperations',
  'function jobsPanel',
  'async function renderUpdates',
  'async function renderTopology',
  'async function renderServer(',
  'function refreshServerHeader',
  'async function renderSettings',
  'async function renderAudit',
  'function openServerForm',
  'function bootstrapModal'
];
for (const marker of required) if (!source.includes(marker)) fail(`Unexpected frontend layout; missing marker: ${marker}`);

function chunk(start, end) {
  const a = source.indexOf(start);
  if (a < 0) fail(`Cannot find section start: ${start}`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) fail(`Cannot find section end: ${end}`);
  return source.slice(a, b).trim();
}

const sections = {
  dashboard: chunk('async function renderDashboard', '\nfunction bindCommonServerActions'),
  servers: chunk('async function renderServers', '\nasync function renderOperations'),
  operations: chunk('async function renderOperations', '\nfunction jobsPanel'),
  updates: chunk('async function renderUpdates', '\nasync function renderTopology'),
  topology: chunk('async function renderTopology', '\nasync function renderServer('),
  server: chunk('async function renderServer(', '\nasync function renderSettings'),
  settings: chunk('async function renderSettings', '\nasync function renderAudit'),
  audit: chunk('async function renderAudit', '\nfunction openServerForm')
};

// Validate every section before writing anything so a bad marker cannot leave a partial refactor.
for (const [name, text] of Object.entries(sections)) {
  if (!text) fail(`Empty page section: ${name}`);
  const first = source.indexOf(text);
  const second = source.indexOf(text, first + text.length);
  if (first < 0 || second >= 0) fail(`Page section is not unique: ${name}`);
}

function factoryModule(factoryName, body, exportedNames) {
  let code = body;
  if (factoryName === 'createServerPage') {
    code = code.replace(
      'currentServerId=s.id;currentServerTab=tab;',
      'currentServerId=s.id;currentServerTab=tab;ctx.setCurrentServerState(s.id,tab);'
    );
  }

  return [
    `export function ${factoryName}(ctx) {`,
    `  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts } = ctx;`,
    `  let overview = ctx.getOverview();`,
    `  let currentServerId = ctx.getCurrentServerId();`,
    `  let currentServerTab = ctx.getCurrentServerTab();`,
    `  const recalcSummary = () => ctx.recalcSummary();`,
    `  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };`,
    '',
    code,
    '',
    `  return { ${exportedNames.join(', ')} };`,
    `}`,
    ''
  ].join('\n');
}

const pageFiles = new Map([
  ['web/pages/dashboard/index.js', factoryModule('createDashboardPage', sections.dashboard, ['renderDashboard'])],
  ['web/pages/servers/index.js', factoryModule('createServersPage', sections.servers, ['renderServers'])],
  ['web/pages/operations/index.js', factoryModule('createOperationsPage', sections.operations, ['renderOperations'])],
  ['web/pages/updates/index.js', factoryModule('createUpdatesPage', sections.updates, ['renderUpdates'])],
  ['web/pages/topology/index.js', factoryModule('createTopologyPage', sections.topology, ['renderTopology'])],
  ['web/pages/server/index.js', factoryModule('createServerPage', sections.server, ['renderServer', 'refreshServerHeader'])],
  ['web/pages/settings/index.js', factoryModule('createSettingsPage', sections.settings, ['renderSettings'])],
  ['web/pages/audit/index.js', factoryModule('createAuditPage', sections.audit, ['renderAudit'])]
]);

let main = source;
for (const [name, text] of Object.entries(sections)) {
  if (!main.includes(text)) fail(`Page section changed while preparing the refactor: ${name}`);
  main = main.replace(`${text}\n\n`, '');
  if (main.includes(text)) main = main.replace(`${text}\n`, '');
  if (main.includes(text)) fail(`Could not remove page section cleanly: ${name}`);
}

const pageImports = [
  "import { createDashboardPage } from '../pages/dashboard/index.js';",
  "import { createServersPage } from '../pages/servers/index.js';",
  "import { createOperationsPage } from '../pages/operations/index.js';",
  "import { createUpdatesPage } from '../pages/updates/index.js';",
  "import { createTopologyPage } from '../pages/topology/index.js';",
  "import { createServerPage } from '../pages/server/index.js';",
  "import { createSettingsPage } from '../pages/settings/index.js';",
  "import { createAuditPage } from '../pages/audit/index.js';"
].join('\n');

const importAnchor = "import { createTerminalController } from '../components/terminal/index.js';";
if (!main.includes(importAnchor)) fail('Cannot find frontend-core import anchor.');
main = main.replace(importAnchor, `${importAnchor}\n${pageImports}`);

const sharedAnchor = "function setHeader(title,subtitle,actions=''){$('#page-title').innerHTML=title;$('#page-subtitle').textContent=subtitle||'';$('#top-actions').innerHTML=actions||'';}";
if (!main.includes(sharedAnchor)) fail('Cannot find shared UI anchor.');

const wrappers = [
  '',
  'function pageContext(){',
  '  return {',
  '    $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep,',
  '    api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions,',
  '    statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts,',
  '    getOverview:()=>overview,',
  '    getCurrentServerId:()=>currentServerId,',
  '    getCurrentServerTab:()=>currentServerTab,',
  '    setCurrentServerState:(id,tab)=>{currentServerId=Number(id);currentServerTab=tab;},',
  '    loadOverview,',
  '    recalcSummary',
  '  };',
  '}',
  'const renderDashboard=(...args)=>createDashboardPage(pageContext()).renderDashboard(...args);',
  'const renderServers=(...args)=>createServersPage(pageContext()).renderServers(...args);',
  'const renderOperations=(...args)=>createOperationsPage(pageContext()).renderOperations(...args);',
  'const renderUpdates=(...args)=>createUpdatesPage(pageContext()).renderUpdates(...args);',
  'const renderTopology=(...args)=>createTopologyPage(pageContext()).renderTopology(...args);',
  'const renderServer=(...args)=>createServerPage(pageContext()).renderServer(...args);',
  'const refreshServerHeader=(...args)=>createServerPage(pageContext()).refreshServerHeader(...args);',
  'const renderSettings=(...args)=>createSettingsPage(pageContext()).renderSettings(...args);',
  'const renderAudit=(...args)=>createAuditPage(pageContext()).renderAudit(...args);',
  ''
].join('\n');
main = main.replace(sharedAnchor, `${sharedAnchor}${wrappers}`);

const pagesReadme = [
  '# Frontend pages',
  '',
  'Each page owns its renderer and page-local event handlers. `web/app/main.js` remains the composition root: authentication, Socket.IO, navigation, shared modal helpers and page wiring.',
  '',
  '- `dashboard/` — farm summary, alerts and 24h farm chart.',
  '- `servers/` — server cards and sparklines.',
  '- `server/` — per-server tabs: overview, performance, components, system, logs and control.',
  '- `operations/` — fleet rolling actions and performance profiles.',
  '- `updates/` — release status and rolling XMRig updates.',
  '- `topology/` — mining path visualization.',
  '- `settings/` — global settings.',
  '- `audit/` — action journal.',
  '',
  'Page modules are factories receiving the application context. This keeps shared state and routing in one place without introducing a framework or duplicating global state.',
  ''
].join('\n');

const layoutTest = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  '',
  "const root = path.resolve(import.meta.dirname, '..');",
  "const pages = ['dashboard','servers','server','operations','updates','topology','settings','audit'];",
  '',
  "test('frontend page renderers live under web/pages', () => {",
  "  for (const page of pages) assert.equal(fs.existsSync(path.join(root, 'web', 'pages', page, 'index.js')), true, `missing web/pages/${page}/index.js`);",
  "});",
  '',
  "test('frontend main is a composition root instead of a page monolith', () => {",
  "  const source = fs.readFileSync(path.join(root, 'web', 'app', 'main.js'), 'utf8');",
  "  for (const fn of ['async function renderDashboard','async function renderServers','async function renderOperations','async function renderUpdates','async function renderTopology','async function renderServer(','async function renderSettings','async function renderAudit']) assert.equal(source.includes(fn), false, `${fn} still lives in main.js`);",
  "  assert.ok(source.split(/\\r?\\n/).length <= 120, 'web/app/main.js should stay a small composition root');",
  "  assert.match(source, /createDashboardPage/);",
  "  assert.match(source, /createServerPage/);",
  "});",
  ''
].join('\n');

// All preflight and transformation checks are complete. Only now write files.
for (const [rel, content] of pageFiles) write(rel, content);
write(sourcePath, main);
write('web/pages/README.md', pagesReadme);
write('test/frontend-pages-layout.test.js', layoutTest);

console.log('[phase2/frontend-pages] OK');
console.log('[phase2/frontend-pages] page renderers moved under web/pages/.');
console.log('[phase2/frontend-pages] Next: npm run check && npm test && npm run build:web');
