import { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep } from './ui.js';
import { api, configureApi } from '../services/api.js';
import { charts, destroyCharts } from '../components/charts/registry.js';
import { createTerminalController } from '../components/terminal/index.js';
import { createDashboardPage } from '../pages/dashboard/index.js';
import { createServersPage } from '../pages/servers/index.js';
import { createOperationsPage } from '../pages/operations/index.js';
import { createUpdatesPage } from '../pages/updates/index.js';
import { createTopologyPage } from '../pages/topology/index.js';
import { createServerPage } from '../pages/server/index.js';
import { createSettingsPage } from '../pages/settings/index.js';
import { createAuditPage } from '../pages/audit/index.js';
import Chart from 'chart.js/auto';
import { hashrateScale, temperatureScale } from '../components/charts/scales.js';
import '../styles/app.css';


let csrf=decodeURIComponent((document.cookie.match(/(?:^|; )panel_csrf=([^;]*)/)||[])[1]||'');
let socket=null,overview=null,currentPage='dashboard',currentServerId=null,currentServerTab='overview';
let terminalController=null;
const qs=new URLSearchParams(location.search);if(qs.get('server')){currentServerId=Number(qs.get('server'));currentServerTab=qs.get('tab')||'overview';}

function toast(msg,kind='ok'){const n=document.createElement('div');n.className=`toast ${kind}`;n.textContent=msg;document.body.append(n);setTimeout(()=>n.remove(),5500);}
function showLogin(){$('#login').classList.remove('hidden');$('#app').classList.add('hidden');}
function showApp(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden');connectSocket();}
configureApi({getCsrf:()=>csrf,onUnauthorized:showLogin});
function modal(html){$('#modal-body').innerHTML=html;$('#modal').showModal();}
function closeModal(){if(terminalController?.isOpen())terminalController.close();const d=$('#modal');if(d.open)d.close();$('#modal-body').innerHTML='';}
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
terminalController=createTerminalController({$,esc,modal,closeModal,getSocket:()=>socket});
const openTerminal=s=>terminalController.open(s);

$('#login-form').addEventListener('submit',async e=>{e.preventDefault();$('#login-error').textContent='';try{const d=await api('/auth/login',{method:'POST',body:{password:$('#login-password').value}});csrf=d.csrf;showApp();await loadOverview();await render();}catch(err){$('#login-error').textContent=err.message;}});
$('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'});}catch{}location.reload();};

function connectSocket(){
  if(socket?.connected)return;socket=window.io({auth:{csrf}});
  socket.on('connect',()=>{$('#socket-state').textContent='подключено';$('#socket-state').className='pill online';});
  socket.on('disconnect',()=>{$('#socket-state').textContent='нет связи';$('#socket-state').className='pill';});
  socket.on('server:update',live=>{if(overview){const s=overview.servers.find(x=>x.id===live.serverId);if(s)s.live=live;recalcSummary();}if(currentPage==='dashboard'&&!currentServerId)renderDashboard(false);if(currentPage==='servers'&&!currentServerId)renderServers(false);if(currentPage==='topology'&&!currentServerId)renderTopology(false);if(currentServerId===live.serverId)refreshServerHeader(live);});
  socket.on('alerts:update',a=>{if(overview)overview.alerts=a;if(currentPage==='dashboard')renderDashboard(false);});
  socket.on('market:update',m=>{if(overview)overview.market=m;if(currentPage==='dashboard')renderDashboard(false);});
  socket.on('job:update',j=>{if(currentPage==='operations'||currentPage==='updates')render();});
  socket.on('terminal:data',({serverId,data})=>terminalController?.handleData(serverId,data));
  socket.on('terminal:close',({serverId})=>terminalController?.handleClose(serverId));
}
function recalcSummary(){if(!overview)return;const ss=overview.servers||[],temps=ss.map(s=>s.live?.tempC).filter(Number.isFinite);overview.summary={total:ss.length,online:ss.filter(s=>['online','starting'].includes(s.live?.status)).length,totalHash:ss.reduce((a,s)=>a+(Number(s.live?.hash60s)||0),0),maxTemp:temps.length?Math.max(...temps):null};}
async function loadOverview(){overview=await api('/overview');recalcSummary();}

$$('.nav').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
$('#add-server').onclick=()=>openServerForm();
function navigate(page,serverId=null,tab='overview'){
  currentPage=page;currentServerId=serverId;currentServerTab=tab;
  $$('.nav').forEach(b=>b.classList.toggle('active',!serverId&&b.dataset.page===page));
  const url=serverId?`/?server=${serverId}&tab=${encodeURIComponent(tab)}`:'/' ;history.replaceState({},'',url);
  void render().catch(err=>{console.error('[ui] render failed',err);toast(`Ошибка интерфейса: ${err.message||err}`,'error');});
}
async function render(){destroyCharts();if(currentServerId)return renderServer(currentServerId,currentServerTab);if(currentPage==='servers')return renderServers();if(currentPage==='operations')return renderOperations();if(currentPage==='updates')return renderUpdates();if(currentPage==='topology')return renderTopology();if(currentPage==='settings')return renderSettings();if(currentPage==='audit')return renderAudit();if(!overview)await loadOverview();return renderDashboard();}

function statusBadge(live){const st=live?.status||'unknown',names={online:'в сети',offline:'не в сети',degraded:'частично',starting:'запуск',unknown:'неизвестно'};return`<span class="status ${esc(st)}"><i></i>${esc(names[st]||st)}</span>`;}
function compBadge(name,state){const s=state||'unknown',label={active:'OK',starting:'запуск',inactive:'off',unknown:'?'}[s]||s;return`<span class="component ${esc(s)}"><b>${esc(name)}</b>${esc(label)}</span>`;}
function serverById(id){return overview?.servers?.find(s=>s.id===Number(id));}
function setHeader(title,subtitle,actions=''){$('#page-title').innerHTML=title;$('#page-subtitle').textContent=subtitle||'';$('#top-actions').innerHTML=actions||'';}
function pageContext(){
  return {
    $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep,
    api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions,
    statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts,
    getOverview:()=>overview,
    getCurrentServerId:()=>currentServerId,
    getCurrentServerTab:()=>currentServerTab,
    setCurrentServerState:(id,tab)=>{currentServerId=Number(id);currentServerTab=tab;},
    loadOverview,
    recalcSummary
  };
}
const renderDashboard=(...args)=>createDashboardPage(pageContext()).renderDashboard(...args);
const renderServers=(...args)=>createServersPage(pageContext()).renderServers(...args);
const renderOperations=(...args)=>createOperationsPage(pageContext()).renderOperations(...args);
const renderUpdates=(...args)=>createUpdatesPage(pageContext()).renderUpdates(...args);
const renderTopology=(...args)=>createTopologyPage(pageContext()).renderTopology(...args);
const renderServer=(...args)=>createServerPage(pageContext()).renderServer(...args);
const refreshServerHeader=(...args)=>createServerPage(pageContext()).refreshServerHeader(...args);
const renderSettings=(...args)=>createSettingsPage(pageContext()).renderSettings(...args);
const renderAudit=(...args)=>createAuditPage(pageContext()).renderAudit(...args);


function bindCommonServerActions(){
  $$('.open-server').forEach(b=>b.onclick=()=>navigate('server',Number(b.dataset.id),'overview'));
  $$('.quick-terminal').forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=serverById(b.dataset.id)||await api(`/servers/${b.dataset.id}`);openTerminal(s);});
}

function jobsPanel(jobs){return`<div class="panel"><div class="panel-head"><h2>Фоновые задачи</h2></div>${jobs.length?jobs.map(j=>`<div class="job"><div><b>${esc(j.title)}</b><small>${esc(j.current_server_name||'')}${j.details?' · '+esc(j.details):''}</small></div><div class="job-progress"><span style="width:${j.progress}%"></span></div><span class="pill ${j.state==='done'?'online':j.state==='failed'?'error':''}">${esc(j.state)}</span></div>`).join(''):'<div class="empty">Задач нет</div>'}</div>`;}

function openServerForm(s=null){
  const editing=Boolean(s);modal(`<form id="server-form" class="modal-form"><div class="modal-head"><h2>${editing?'Редактировать сервер':'Добавить сервер'}</h2><button type="button" id="close-modal" class="ghost">✕</button></div><div class="form-grid"><label>Название<input name="name" value="${esc(s?.name||'')}"></label><label>Иконка<input name="icon" maxlength="8" value="${esc(s?.icon||'🖥️')}" placeholder="🖥️"></label><label>Хост/IP<input name="host" required value="${esc(s?.host||'')}"></label><label>SSH-порт<input name="port" type="number" value="${s?.port||22}"></label><label>Логин<input name="username" required value="${esc(s?.username||'monitor')}"></label><label>Авторизация<select name="authType"><option value="password" ${!s||s?.authType==='password'?'selected':''}>Пароль</option><option value="agent" ${s?.authType==='agent'?'selected':''}>SSH-агент</option><option value="key" ${s?.authType==='key'?'selected':''}>Приватный ключ</option></select></label><label id="ssh-password-field">SSH-пароль<input name="password" type="password" placeholder="${s?.hasPassword?'сохранён':'пароль SSH'}"></label><label>Пароль sudo<input name="sudoPassword" type="password" placeholder="${s?.hasSudoPassword?'сохранён':'пусто = sudo -n'}"></label></div><div id="ssh-agent-help" class="auth-help hidden">Ключ в форму не вставляется. Он должен быть загружен в ssh-agent центральной ноды.</div><div id="ssh-key-fields" class="hidden"><label>Приватный ключ OpenSSH/PEM<textarea name="privateKey" rows="5" placeholder="${s?.hasPrivateKey?'ключ сохранён':'-----BEGIN OPENSSH PRIVATE KEY-----'}"></textarea></label><label>Парольная фраза<input name="privateKeyPassphrase" type="password"></label></div><details class="advanced"><summary>Дополнительно · обычно определяется автоматически</summary><div class="form-grid"><label>Порт API XMRig<input name="xmrigApiPort" type="number" value="${s?.xmrigApiPort||60050}"></label><label>Путь config.json<input name="xmrigConfigPath" value="${esc(s?.xmrigConfigPath||'/opt/xmrig/config.json')}"></label><label>Сервис XMRig/mining<input name="xmrigService" value="${esc(s?.xmrigService||'xmrig')}"></label><label>Сервис p2pool<input name="p2poolService" value="${esc(s?.p2poolService||'p2pool')}"></label><label>Сервис monerod<input name="monerodService" value="${esc(s?.monerodService||'monerod')}"></label><label>RPC monerod<input name="monerodRpcPort" type="number" value="${s?.monerodRpcPort||18081}"></label><label>p2pool log<input name="p2poolLogPath" value="${esc(s?.p2poolLogPath||'/var/log/p2pool.log')}"></label><label>monerod log<input name="monerodLogPath" value="${esc(s?.monerodLogPath||`/home/${s?.username||'monitor'}/.bitmonero/bitmonero.log`)}"></label></div></details>${editing?'<label class="reset-fp"><input name="resetHostFingerprint" type="checkbox"> Сбросить сохранённый SSH host key</label>':''}<div class="notice">После добавления панель автоматически попробует определить реальный XMRig binary, config.json, systemd service, p2pool и monerod.</div><div class="modal-actions"><button type="button" id="test-server" class="ghost">Проверить SSH</button>${editing?'<button type="button" id="discover-form" class="ghost">Автоопределить</button><button type="button" id="delete-server" class="danger-soft">Удалить</button>':''}<button class="primary">${editing?'Сохранить':'Добавить'}</button></div><pre id="test-output" class="log small-log"></pre></form>`);
  $('#close-modal').onclick=closeModal;const form=$('#server-form'),values=()=>Object.fromEntries(new FormData(form).entries());const sync=()=>{const t=form.elements.authType.value;$('#ssh-password-field').classList.toggle('hidden',t!=='password');$('#ssh-agent-help').classList.toggle('hidden',t!=='agent');$('#ssh-key-fields').classList.toggle('hidden',t!=='key');};form.elements.authType.onchange=sync;sync();
  $('#test-server').onclick=async()=>{const out=$('#test-output');try{out.textContent='Подключение…';const r=await api('/servers/test',{method:'POST',body:values()});out.textContent=r.ok?(r.output||'SSH: OK'):`SSH: ОШИБКА\n${r.error||''}`;out.className=`log small-log ${r.ok?'test-ok':'test-fail'}`;}catch(e){out.textContent=e.message;out.classList.add('test-fail');}};
  if(editing){$('#discover-form').onclick=async()=>{try{const d=await api(`/servers/${s.id}/discover`,{method:'POST'});toast('Найдено: '+(d.xmrig?.binary||'XMRig не найден'));closeModal();renderServer(s.id,'system');}catch(e){toast(e.message,'error');}};$('#delete-server').onclick=async()=>{if(!confirm(`Удалить ${s.name}?`))return;await api(`/servers/${s.id}`,{method:'DELETE'});closeModal();await loadOverview();navigate('servers');};}
  form.onsubmit=async e=>{e.preventDefault();try{const data=values(),saved=editing?await api(`/servers/${s.id}`,{method:'PUT',body:data}):await api('/servers',{method:'POST',body:data});closeModal();await loadOverview();navigate('server',saved.id,'overview');}catch(err){toast(err.message,'error');}};
}

function bootstrapModal(s){modal(`<form id="bootstrap-form" class="modal-form"><div class="modal-head"><h2>Bootstrap ${esc(s.name)}</h2><button type="button" id="close-modal" class="ghost">✕</button></div><p class="muted">Устанавливает зависимости, собирает XMRig, создаёт systemd service и включает localhost API. Используйте для нового Ubuntu-сервера; для существующего майнера обычно достаточно «Исправить автоматически».</p><label><input name="installP2pool" type="checkbox"> Также установить p2pool</label><div class="form-grid"><label>Sidechain<select name="p2poolSidechain"><option>mini</option><option>main</option><option>nano</option></select></label><label>monerod host<input name="moneroHost" value="127.0.0.1"></label></div><button class="primary">Запустить</button><pre id="bootstrap-out" class="log"></pre></form>`);$('#close-modal').onclick=closeModal;$('#bootstrap-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;$('#bootstrap-out').textContent='Установка выполняется…';try{const r=await api(`/servers/${s.id}/actions/bootstrap`,{method:'POST',body:{installP2pool:f.installP2pool.checked,p2poolSidechain:f.p2poolSidechain.value,moneroHost:f.moneroHost.value}});$('#bootstrap-out').textContent=r.output||'Готово';toast('Bootstrap завершён');}catch(err){$('#bootstrap-out').textContent=err.message;toast(err.message,'error');}};}

(async function init(){if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});try{await api('/overview');showApp();await loadOverview();if(currentServerId)renderServer(currentServerId,currentServerTab);else render();}catch{showLogin();}})();
