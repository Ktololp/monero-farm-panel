#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = rel => path.join(root, ...rel.split('/'));
const read = rel => fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n');
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), `${content.replace(/\r\n/g, '\n').trimEnd()}\n`, 'utf8');
  console.log(`[phase2/frontend-core] wrote ${rel}`);
};
const fail = msg => { console.error(`[phase2/frontend-core] ERROR: ${msg}`); process.exit(1); };

const sourcePath = 'web/app/main.js';
if (!fs.existsSync(p(sourcePath))) fail(`${sourcePath} not found. Run the v1.1.0 layout migration first.`);
const source = read(sourcePath);

const required = [
  "import { Terminal } from '@xterm/xterm';",
  "import { FitAddon } from '@xterm/addon-fit';",
  "const $=(s,r=document)=>r.querySelector(s)",
  'async function api(path,options={})',
  'function destroyCharts()',
  'function closeModal()',
  'function connectSocket()',
  'async function openTerminal(s)',
  'function closeTerminal()',
  'async function renderSettings()'
];
for (const marker of required) if (!source.includes(marker)) fail(`Unexpected frontend layout; missing marker: ${marker}`);

function chunk(text, start, end) {
  const a = text.indexOf(start);
  if (a < 0) fail(`Cannot find section start: ${start}`);
  const b = text.indexOf(end, a + start.length);
  if (b < 0) fail(`Cannot find section end: ${end}`);
  return text.slice(a, b);
}

const lines = source.split('\n');
const helperNames = ['$', 'esc', 'fmtHash', 'fmtTemp', 'fmtMHz', 'fmtUptime', 'fmtDate', 'fmtUsd', 'fmtPct', 'sleep'];
const helperLines = [];
for (const name of helperNames) {
  const prefix = name === '$' ? 'const $=' : `const ${name}=`;
  const line = lines.find(x => x.startsWith(prefix));
  if (!line) fail(`Cannot find UI helper line: ${name}`);
  helperLines.push(line);
}

// The first helper line declares both $ and $$.
const uiLines = [...new Set(helperLines)].map(line => line.replace(/^const /, 'export const '));
write('web/app/ui.js', `${uiLines.join('\n')}\n`);

const apiChunk = chunk(source, 'async function api(path,options={})', 'function toast(').trimEnd();
let apiModule = apiChunk
  .replace('async function api(path,options={})', 'export async function api(path,options={})')
  .replace("headers['x-csrf-token']=csrf;", "headers['x-csrf-token']=getCsrf();")
  .replace('showLogin();throw new Error', 'onUnauthorized();throw new Error');
write('web/services/api.js', `
let getCsrf = () => '';
let onUnauthorized = () => {};

export function configureApi({ getCsrf: csrfProvider, onUnauthorized: unauthorizedHandler } = {}) {
  if (typeof csrfProvider === 'function') getCsrf = csrfProvider;
  if (typeof unauthorizedHandler === 'function') onUnauthorized = unauthorizedHandler;
}

${apiModule}
`);

write('web/components/charts/registry.js', `
export const charts = [];

export function destroyCharts() {
  charts.forEach(chart => {
    try { chart.destroy(); } catch {}
  });
  charts.length = 0;
}
`);

write('web/components/terminal/index.js', `
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function createTerminalController({ $, esc, modal, closeModal, getSocket }) {
  let terminal = null;
  let fitAddon = null;
  let terminalServerId = null;

  function fitTerminal() {
    try { fitAddon?.fit(); } catch {}
  }

  function close() {
    if (terminalServerId) getSocket()?.emit('terminal:close', { serverId: terminalServerId });
    window.removeEventListener('resize', fitTerminal);
    try { terminal?.dispose(); } catch {}
    terminal = null;
    fitAddon = null;
    terminalServerId = null;
  }

  async function open(server) {
    if (terminal) close();
    terminalServerId = Number(server.id);
    modal(`<div class="modal-head"><div><h2>⌨ SSH · ${esc(server.name)}</h2><div class="muted small">${esc(server.username)}@${esc(server.host)}:${server.port}</div></div><button id="close-terminal" class="ghost">✕</button></div><div id="terminal-box"></div>`);
    $('#close-terminal').onclick = closeModal;

    terminal = new Terminal({ cursorBlink: true, fontFamily: 'Consolas,Menlo,monospace', fontSize: 14, theme: { background: '#070b14' } });
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open($('#terminal-box'));
    fitAddon.fit();
    terminal.focus();

    terminal.onData(data => getSocket()?.emit('terminal:input', { serverId: server.id, data }));
    terminal.onResize(({ cols, rows }) => getSocket()?.emit('terminal:resize', { serverId: server.id, cols, rows }));
    getSocket()?.emit('terminal:open', { serverId: server.id, cols: terminal.cols, rows: terminal.rows }, ack => {
      if (!ack?.ok) terminal.write(`\\r\\n\\x1b[31m${ack?.error || 'SSH error'}\\x1b[0m\\r\\n`);
    });

    setTimeout(() => fitAddon?.fit(), 100);
    window.addEventListener('resize', fitTerminal);
  }

  function handleData(serverId, data) {
    if (terminal && terminalServerId === Number(serverId)) terminal.write(data);
  }

  function handleClose(serverId) {
    if (terminal && terminalServerId === Number(serverId)) terminal.write('\\r\\n\\x1b[33m[SSH-сессия закрыта]\\x1b[0m\\r\\n');
  }

  return {
    open,
    close,
    isOpen: () => Boolean(terminal),
    handleData,
    handleClose
  };
}
`);

let main = source;
main = main.replace(/^import \{ Terminal \} from '@xterm\/xterm';\n/m, '');
main = main.replace(/^import \{ FitAddon \} from '@xterm\/addon-fit';\n/m, '');
main = main.replace(/^import '@xterm\/xterm\/css\/xterm\.css';\n/m, '');

for (const line of [...new Set(helperLines)]) main = main.replace(`${line}\n`, '');
main = main.replace(`${apiChunk}\n`, '');
main = main.replace(/function destroyCharts\(\)\{charts\.forEach\(c=>\{try\{c\.destroy\(\);\}catch\{\}\}\);charts=\[\];\}\n/, '');

const stateLine = "let socket=null,overview=null,currentPage='dashboard',currentServerId=null,currentServerTab='overview',charts=[],terminal=null,fitAddon=null,terminalServerId=null;";
if (!main.includes(stateLine)) fail('Unexpected frontend state declaration.');
main = main.replace(stateLine, "let socket=null,overview=null,currentPage='dashboard',currentServerId=null,currentServerTab='overview';\nlet terminalController=null;");

const terminalChunk = chunk(main, 'async function openTerminal(s)', 'async function renderSettings()');
main = main.replace(terminalChunk, '');

main = main.replace(
  "function closeModal(){if(terminal)closeTerminal();const d=$('#modal');if(d.open)d.close();$('#modal-body').innerHTML='';}",
  "function closeModal(){if(terminalController?.isOpen())terminalController.close();const d=$('#modal');if(d.open)d.close();$('#modal-body').innerHTML='';}"
);

const modalClick = "$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});";
if (!main.includes(modalClick)) fail('Cannot find modal click hook.');
main = main.replace(modalClick, `${modalClick}\nterminalController=createTerminalController({$,esc,modal,closeModal,getSocket:()=>socket});\nconst openTerminal=s=>terminalController.open(s);`);

main = main.replace(
  "socket.on('terminal:data',({serverId,data})=>{if(terminal&&terminalServerId===serverId)terminal.write(data);});",
  "socket.on('terminal:data',({serverId,data})=>terminalController?.handleData(serverId,data));"
);
main = main.replace(
  "socket.on('terminal:close',({serverId})=>{if(terminal&&terminalServerId===serverId)terminal.write('\\r\\n\\x1b[33m[SSH-сессия закрыта]\\x1b[0m\\r\\n');});",
  "socket.on('terminal:close',({serverId})=>terminalController?.handleClose(serverId));"
);

const imports = `import { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep } from './ui.js';\nimport { api, configureApi } from '../services/api.js';\nimport { charts, destroyCharts } from '../components/charts/registry.js';\nimport { createTerminalController } from '../components/terminal/index.js';\n`;
main = `${imports}${main}`;

const configureMarker = "function showApp(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden');connectSocket();}";
if (!main.includes(configureMarker)) fail('Cannot find showApp function.');
main = main.replace(configureMarker, `${configureMarker}\nconfigureApi({getCsrf:()=>csrf,onUnauthorized:showLogin});`);

write(sourcePath, main);

write('web/app/README.md', `# Frontend application core

The browser UI is intentionally framework-free. \`main.js\` is the composition root and router while reusable infrastructure is split by responsibility.

- \`ui.js\` — DOM selectors, escaping and display formatting.
- \`../services/api.js\` — versioned HTTP API client and CSRF handling.
- \`../components/charts/registry.js\` — Chart.js instance lifecycle.
- \`../components/charts/scales.js\` — stable visual scaling rules.
- \`../components/terminal/index.js\` — xterm.js SSH terminal lifecycle.
- \`main.js\` — login, Socket.IO orchestration, navigation and page composition.

Phase 2b moves page renderers from \`main.js\` into \`web/pages/\` without changing the visual design.
`);

write('test/frontend-layout.test.js', `
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
`);

console.log('[phase2/frontend-core] OK');
console.log('[phase2/frontend-core] API, UI helpers, chart registry and terminal were extracted.');
console.log('[phase2/frontend-core] Next: npm run check && npm test && npm run build:web');
