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
const decode = value => Buffer.from(value, 'base64').toString('utf8');
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

write('web/components/terminal/index.js', decode('aW1wb3J0IHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nOwppbXBvcnQgeyBGaXRBZGRvbiB9IGZyb20gJ0B4dGVybS9hZGRvbi1maXQnOwppbXBvcnQgJ0B4dGVybS94dGVybS9jc3MveHRlcm0uY3NzJzsKCmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXJtaW5hbENvbnRyb2xsZXIoeyAkLCBlc2MsIG1vZGFsLCBjbG9zZU1vZGFsLCBnZXRTb2NrZXQgfSkgewogIGxldCB0ZXJtaW5hbCA9IG51bGw7CiAgbGV0IGZpdEFkZG9uID0gbnVsbDsKICBsZXQgdGVybWluYWxTZXJ2ZXJJZCA9IG51bGw7CgogIGZ1bmN0aW9uIGZpdFRlcm1pbmFsKCkgewogICAgdHJ5IHsgZml0QWRkb24/LmZpdCgpOyB9IGNhdGNoIHt9CiAgfQoKICBmdW5jdGlvbiBjbG9zZSgpIHsKICAgIGlmICh0ZXJtaW5hbFNlcnZlcklkKSBnZXRTb2NrZXQoKT8uZW1pdCgndGVybWluYWw6Y2xvc2UnLCB7IHNlcnZlcklkOiB0ZXJtaW5hbFNlcnZlcklkIH0pOwogICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGZpdFRlcm1pbmFsKTsKICAgIHRyeSB7IHRlcm1pbmFsPy5kaXNwb3NlKCk7IH0gY2F0Y2gge30KICAgIHRlcm1pbmFsID0gbnVsbDsKICAgIGZpdEFkZG9uID0gbnVsbDsKICAgIHRlcm1pbmFsU2VydmVySWQgPSBudWxsOwogIH0KCiAgYXN5bmMgZnVuY3Rpb24gb3BlbihzZXJ2ZXIpIHsKICAgIGlmICh0ZXJtaW5hbCkgY2xvc2UoKTsKICAgIHRlcm1pbmFsU2VydmVySWQgPSBOdW1iZXIoc2VydmVyLmlkKTsKICAgIG1vZGFsKGA8ZGl2IGNsYXNzPSJtb2RhbC1oZWFkIj48ZGl2PjxoMj7ijKggU1NIIMK3ICR7ZXNjKHNlcnZlci5uYW1lKX08L2gyPjxkaXYgY2xhc3M9Im11dGVkIHNtYWxsIj4ke2VzYyhzZXJ2ZXIudXNlcm5hbWUpfUAke2VzYyhzZXJ2ZXIuaG9zdCl9OiR7c2VydmVyLnBvcnR9PC9kaXY+PC9kaXY+PGJ1dHRvbiBpZD0iY2xvc2UtdGVybWluYWwiIGNsYXNzPSJnaG9zdCI+4pyVPC9idXR0b24+PC9kaXY+PGRpdiBpZD0idGVybWluYWwtYm94Ij48L2Rpdj5gKTsKICAgICQoJyNjbG9zZS10ZXJtaW5hbCcpLm9uY2xpY2sgPSBjbG9zZU1vZGFsOwoKICAgIHRlcm1pbmFsID0gbmV3IFRlcm1pbmFsKHsgY3Vyc29yQmxpbms6IHRydWUsIGZvbnRGYW1pbHk6ICdDb25zb2xhcyxNZW5sbyxtb25vc3BhY2UnLCBmb250U2l6ZTogMTQsIHRoZW1lOiB7IGJhY2tncm91bmQ6ICcjMDcwYjE0JyB9IH0pOwogICAgZml0QWRkb24gPSBuZXcgRml0QWRkb24oKTsKICAgIHRlcm1pbmFsLmxvYWRBZGRvbihmaXRBZGRvbik7CiAgICB0ZXJtaW5hbC5vcGVuKCQoJyN0ZXJtaW5hbC1ib3gnKSk7CiAgICBmaXRBZGRvbi5maXQoKTsKICAgIHRlcm1pbmFsLmZvY3VzKCk7CgogICAgdGVybWluYWwub25EYXRhKGRhdGEgPT4gZ2V0U29ja2V0KCk/LmVtaXQoJ3Rlcm1pbmFsOmlucHV0JywgeyBzZXJ2ZXJJZDogc2VydmVyLmlkLCBkYXRhIH0pKTsKICAgIHRlcm1pbmFsLm9uUmVzaXplKCh7IGNvbHMsIHJvd3MgfSkgPT4gZ2V0U29ja2V0KCk/LmVtaXQoJ3Rlcm1pbmFsOnJlc2l6ZScsIHsgc2VydmVySWQ6IHNlcnZlci5pZCwgY29scywgcm93cyB9KSk7CiAgICBnZXRTb2NrZXQoKT8uZW1pdCgndGVybWluYWw6b3BlbicsIHsgc2VydmVySWQ6IHNlcnZlci5pZCwgY29sczogdGVybWluYWwuY29scywgcm93czogdGVybWluYWwucm93cyB9LCBhY2sgPT4gewogICAgICBpZiAoIWFjaz8ub2spIHRlcm1pbmFsLndyaXRlKGBcclxuXHgxYlszMW0ke2Fjaz8uZXJyb3IgfHwgJ1NTSCBlcnJvcid9XHgxYlswbVxyXG5gKTsKICAgIH0pOwoKICAgIHNldFRpbWVvdXQoKCkgPT4gZml0QWRkb24/LmZpdCgpLCAxMDApOwogICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGZpdFRlcm1pbmFsKTsKICB9CgogIGZ1bmN0aW9uIGhhbmRsZURhdGEoc2VydmVySWQsIGRhdGEpIHsKICAgIGlmICh0ZXJtaW5hbCAmJiB0ZXJtaW5hbFNlcnZlcklkID09PSBOdW1iZXIoc2VydmVySWQpKSB0ZXJtaW5hbC53cml0ZShkYXRhKTsKICB9CgogIGZ1bmN0aW9uIGhhbmRsZUNsb3NlKHNlcnZlcklkKSB7CiAgICBpZiAodGVybWluYWwgJiYgdGVybWluYWxTZXJ2ZXJJZCA9PT0gTnVtYmVyKHNlcnZlcklkKSkgdGVybWluYWwud3JpdGUoJ1xyXG5ceDFiWzMzbVtTU0gt0YHQtdGB0YHQuNGPINC30LDQutGA0YvRgtCwXVx4MWJbMG1cclxuJyk7CiAgfQoKICByZXR1cm4gewogICAgb3BlbiwKICAgIGNsb3NlLAogICAgaXNPcGVuOiAoKSA9PiBCb29sZWFuKHRlcm1pbmFsKSwKICAgIGhhbmRsZURhdGEsCiAgICBoYW5kbGVDbG9zZQogIH07Cn0K'));

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
write('web/app/README.md', decode('IyBGcm9udGVuZCBhcHBsaWNhdGlvbiBjb3JlCgpUaGUgYnJvd3NlciBVSSBpcyBpbnRlbnRpb25hbGx5IGZyYW1ld29yay1mcmVlLiBgbWFpbi5qc2AgaXMgdGhlIGNvbXBvc2l0aW9uIHJvb3QgYW5kIHJvdXRlciB3aGlsZSByZXVzYWJsZSBpbmZyYXN0cnVjdHVyZSBpcyBzcGxpdCBieSByZXNwb25zaWJpbGl0eS4KCi0gYHVpLmpzYCDigJQgRE9NIHNlbGVjdG9ycywgZXNjYXBpbmcgYW5kIGRpc3BsYXkgZm9ybWF0dGluZy4KLSBgLi4vc2VydmljZXMvYXBpLmpzYCDigJQgdmVyc2lvbmVkIEhUVFAgQVBJIGNsaWVudCBhbmQgQ1NSRiBoYW5kbGluZy4KLSBgLi4vY29tcG9uZW50cy9jaGFydHMvcmVnaXN0cnkuanNgIOKAlCBDaGFydC5qcyBpbnN0YW5jZSBsaWZlY3ljbGUuCi0gYC4uL2NvbXBvbmVudHMvY2hhcnRzL3NjYWxlcy5qc2Ag4oCUIHN0YWJsZSB2aXN1YWwgc2NhbGluZyBydWxlcy4KLSBgLi4vY29tcG9uZW50cy90ZXJtaW5hbC9pbmRleC5qc2Ag4oCUIHh0ZXJtLmpzIFNTSCB0ZXJtaW5hbCBsaWZlY3ljbGUuCi0gYG1haW4uanNgIOKAlCBsb2dpbiwgU29ja2V0LklPIG9yY2hlc3RyYXRpb24sIG5hdmlnYXRpb24gYW5kIHBhZ2UgY29tcG9zaXRpb24uCgpQaGFzZSAyYiBtb3ZlcyBwYWdlIHJlbmRlcmVycyBmcm9tIGBtYWluLmpzYCBpbnRvIGB3ZWIvcGFnZXMvYCB3aXRob3V0IGNoYW5naW5nIHRoZSB2aXN1YWwgZGVzaWduLgo='));
write('test/frontend-layout.test.js', decode('aW1wb3J0IHRlc3QgZnJvbSAnbm9kZTp0ZXN0JzsKaW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnOwppbXBvcnQgZnMgZnJvbSAnbm9kZTpmcyc7CmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCc7Cgpjb25zdCByb290ID0gcGF0aC5yZXNvbHZlKGltcG9ydC5tZXRhLmRpcm5hbWUsICcuLicpOwoKY29uc3QgZXhwZWN0ZWQgPSBbCiAgJ3dlYi9hcHAvdWkuanMnLAogICd3ZWIvc2VydmljZXMvYXBpLmpzJywKICAnd2ViL2NvbXBvbmVudHMvY2hhcnRzL3JlZ2lzdHJ5LmpzJywKICAnd2ViL2NvbXBvbmVudHMvdGVybWluYWwvaW5kZXguanMnCl07Cgp0ZXN0KCdmcm9udGVuZCBjb3JlIGhhcyBleHBsaWNpdCBpbmZyYXN0cnVjdHVyZSBtb2R1bGVzJywgKCkgPT4gewogIGZvciAoY29uc3QgcmVsIG9mIGV4cGVjdGVkKSBhc3NlcnQuZXF1YWwoZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4ocm9vdCwgcmVsKSksIHRydWUsIGBtaXNzaW5nICR7cmVsfWApOwp9KTsKCnRlc3QoJ2Zyb250ZW5kIG1haW4gZGVsZWdhdGVzIEFQSSwgY2hhcnQgbGlmZWN5Y2xlIGFuZCB0ZXJtaW5hbCBpbXBsZW1lbnRhdGlvbicsICgpID0+IHsKICBjb25zdCBzb3VyY2UgPSBmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKHJvb3QsICd3ZWInLCAnYXBwJywgJ21haW4uanMnKSwgJ3V0ZjgnKTsKICBhc3NlcnQuZG9lc05vdE1hdGNoKHNvdXJjZSwgL2FzeW5jIGZ1bmN0aW9uIGFwaVwoLyk7CiAgYXNzZXJ0LmRvZXNOb3RNYXRjaChzb3VyY2UsIC9uZXcgVGVybWluYWxcKC8pOwogIGFzc2VydC5tYXRjaChzb3VyY2UsIC9jb25maWd1cmVBcGkvKTsKICBhc3NlcnQubWF0Y2goc291cmNlLCAvY3JlYXRlVGVybWluYWxDb250cm9sbGVyLyk7CiAgYXNzZXJ0Lm1hdGNoKHNvdXJjZSwgL2Rlc3Ryb3lDaGFydHMvKTsKfSk7Cg=='));

console.log('[phase2/frontend-core] OK');
console.log('[phase2/frontend-core] API, UI helpers, chart registry and terminal were extracted.');
console.log('[phase2/frontend-core] Next: npm run check && npm test && npm run build:web');