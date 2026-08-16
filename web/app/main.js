import { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, helpIcon, sleep } from './ui.js';
import { api, configureApi } from '../services/api.js';
import { charts, destroyCharts } from '../components/charts/registry.js';
import { createTerminalController } from '../components/terminal/index.js';
import { createServerDialogs } from '../components/server-dialogs/index.js';
import { createDashboardPage } from '../pages/dashboard/index.js';
import { createServersPage } from '../pages/servers/index.js';
import { createSetupPage } from '../pages/setup/index.js';
import { createOperationsPage } from '../pages/operations/index.js';
import { createUpdatesPage } from '../pages/updates/index.js';
import { createTopologyPage } from '../pages/topology/index.js';
import { createServerPage } from '../pages/server/index.js';
import { createSettingsPage } from '../pages/settings/index.js';
import { createAuditPage } from '../pages/audit/index.js';
import { createProxiesPage } from '../pages/proxies/index.js';
import { createDocsPage } from '../pages/docs/index.js';
import Chart from 'chart.js/auto';
import { hashrateScale, temperatureScale } from '../components/charts/scales.js';
import { t, getLocale, initI18n, onLocaleChange } from '../i18n/index.js';
import '../styles/app.css';
import '../styles/design-system.css';
import '../styles/design-pass2.css';
import '../styles/design-tooltips.css';
import '../styles/design-kpi.css';
import '../styles/design-setup.css';
import '../components/tooltip/index.js';


let csrf=decodeURIComponent((document.cookie.match(/(?:^|; )panel_csrf=([^;]*)/)||[])[1]||'');
let socket=null,overview=null,currentPage='dashboard',currentServerId=null,currentServerTab='overview';
let terminalController=null;
let openServerForm,bootstrapModal;initI18n();renderSocketState();onLocaleChange(()=>{renderSocketState();if(!$('#app').classList.contains('hidden'))void render();});
const qs=new URLSearchParams(location.search);if(qs.get('server')){currentServerId=Number(qs.get('server'));currentServerTab=qs.get('tab')||'overview';}

function toast(msg,kind='ok'){const n=document.createElement('div');n.className=`toast ${kind}`;n.textContent=msg;document.body.append(n);setTimeout(()=>n.remove(),5500);}
function showLogin(){$('#login').classList.remove('hidden');$('#app').classList.add('hidden');}
function showApp(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden');connectSocket();}
configureApi({getCsrf:()=>csrf,onUnauthorized:showLogin,t});
function modal(html){$('#modal-body').innerHTML=html;$('#modal').showModal();}
function closeModal(){if(terminalController?.isOpen())terminalController.close();const d=$('#modal');if(d.open)d.close();$('#modal-body').innerHTML='';}
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
terminalController=createTerminalController({$,esc,modal,closeModal,getSocket:()=>socket});
const openTerminal=s=>terminalController.open(s);

$('#login-form').addEventListener('submit',async e=>{e.preventDefault();$('#login-error').textContent='';try{const d=await api('/auth/login',{method:'POST',body:{password:$('#login-password').value}});csrf=d.csrf;showApp();await loadOverview();await render();}catch(err){$('#login-error').textContent=err.message;}});
$('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'});}catch{}location.reload();};

function renderSocketState(){const el=$('#socket-state');if(!el)return;const connected=Boolean(socket?.connected);el.textContent=t(connected?'socket.connected':'socket.disconnected');el.className=connected?'pill online':'pill';}
function connectSocket(){
  if(socket?.connected){renderSocketState();return;}socket=window.io({auth:{csrf}});
  socket.on('connect',renderSocketState);
  socket.on('disconnect',renderSocketState);
  socket.on('server:update',live=>{if(overview){const s=overview.servers.find(x=>x.id===live.serverId);if(s)s.live=live;recalcSummary();}if(currentPage==='dashboard'&&!currentServerId)renderDashboard(false);if(currentPage==='servers'&&!currentServerId)renderServers(false);if(currentPage==='topology'&&!currentServerId)renderTopology(false);if(currentServerId===live.serverId)refreshServerHeader(live);});
  socket.on('alerts:update',a=>{if(overview)overview.alerts=a;if(currentPage==='dashboard')renderDashboard(false);});
  socket.on('market:update',m=>{if(overview)overview.market=m;if(currentPage==='dashboard')renderDashboard(false);});
  socket.on('job:update',j=>{if(currentPage==='operations'||currentPage==='updates')render();});
  socket.on('terminal:data',({serverId,data})=>terminalController?.handleData(serverId,data));
  socket.on('terminal:close',({serverId})=>terminalController?.handleClose(serverId));
}
function recalcSummary(){if(!overview)return;const ss=overview.servers||[],temps=ss.map(s=>s.live?.tempC).filter(Number.isFinite),totalHash=ss.reduce((a,s)=>a+(Number(s.live?.hash60s)||0),0),scores=ss.map(s=>Number(s.live?.healthScore)).filter(Number.isFinite),healthScore=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null,network=ss.map(s=>s.live?.monero).find(m=>Number(m?.difficulty)>0&&Number(m?.blockRewardXmr)>0),difficulty=Number(network?.difficulty),reward=Number(network?.blockRewardXmr),xmrDay=totalHash>0&&difficulty>0&&reward>0?totalHash*86400/difficulty*reward:null,usdDay=Number.isFinite(xmrDay)&&Number(overview.market?.price)>0?xmrDay*Number(overview.market.price):null;overview.summary={total:ss.length,online:ss.filter(s=>['online','starting'].includes(s.live?.status)).length,totalHash,maxTemp:temps.length?Math.max(...temps):null,healthScore,economics:{xmrDay,usdDay,usdMonth:Number.isFinite(usdDay)?usdDay*30:null,difficulty:Number.isFinite(difficulty)?difficulty:null,blockRewardXmr:Number.isFinite(reward)?reward:null}};}
async function loadOverview(){overview=await api('/overview');recalcSummary();}

$$('.nav').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
$('#add-server').onclick=()=>openServerForm();
function navigate(page,serverId=null,tab='overview'){
  currentPage=page;currentServerId=serverId;currentServerTab=tab;
  $$('.nav').forEach(b=>b.classList.toggle('active',!serverId&&b.dataset.page===page));
  const url=serverId?`/?server=${serverId}&tab=${encodeURIComponent(tab)}`:'/' ;history.replaceState({},'',url);
  void render().catch(err=>{console.error('[ui] render failed',err);toast(t('ui.renderError',{error:err.message||err}),'error');});
}
async function render(){destroyCharts();if(currentServerId)return renderServer(currentServerId,currentServerTab);if(currentPage==='servers')return renderServers();if(currentPage==='setup')return renderSetup();if(currentPage==='operations')return renderOperations();if(currentPage==='updates')return renderUpdates();if(currentPage==='topology')return renderTopology();if(currentPage==='settings')return renderSettings();if(currentPage==='audit')return renderAudit();if(currentPage==='proxies')return renderProxies();if(currentPage==='docs')return renderDocs();if(!overview)await loadOverview();return renderDashboard();}

function statusBadge(live){const st=live?.status||'unknown',names={online:t('status.online'),offline:t('status.offline'),degraded:t('status.degraded'),starting:t('status.starting'),unknown:t('status.unknown')};return`<span class="status ${esc(st)}"><i></i>${esc(names[st]||st)}</span>`;}
function compBadge(name,state){const s=state||'unknown',label={active:'OK',starting:t('component.starting'),inactive:'off',unknown:'?'}[s]||s;return`<span class="component ${esc(s)}"><b>${esc(name)}</b>${esc(label)}</span>`;}
function serverById(id){return overview?.servers?.find(s=>s.id===Number(id));}
function setHeader(title,subtitle,actions=''){$('#page-title').innerHTML=title;$('#page-subtitle').textContent=subtitle||'';$('#top-actions').innerHTML=actions||'';}
function pageContext(){
  return {
    $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, helpIcon, sleep,
    api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions,
    statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts,
    getOverview:()=>overview,
    getCurrentServerId:()=>currentServerId,
    getCurrentServerTab:()=>currentServerTab,
    t, getLocale,
    setCurrentServerState:(id,tab)=>{currentServerId=Number(id);currentServerTab=tab;},
    loadOverview,
    recalcSummary
  };
}
const renderDashboard=(...args)=>createDashboardPage(pageContext()).renderDashboard(...args);
const renderServers=(...args)=>createServersPage(pageContext()).renderServers(...args);
const renderSetup=(...args)=>createSetupPage(pageContext()).renderSetup(...args);
const renderOperations=(...args)=>createOperationsPage(pageContext()).renderOperations(...args);
const renderUpdates=(...args)=>createUpdatesPage(pageContext()).renderUpdates(...args);
const renderTopology=(...args)=>createTopologyPage(pageContext()).renderTopology(...args);
const renderServer=(...args)=>createServerPage(pageContext()).renderServer(...args);
const refreshServerHeader=(...args)=>createServerPage(pageContext()).refreshServerHeader(...args);
const renderSettings=(...args)=>createSettingsPage(pageContext()).renderSettings(...args);
const renderAudit=(...args)=>createAuditPage(pageContext()).renderAudit(...args);
const renderProxies=(...args)=>createProxiesPage(pageContext()).renderProxies(...args);
const renderDocs=(...args)=>createDocsPage(pageContext()).renderDocs(...args);
({openServerForm,bootstrapModal}=createServerDialogs({
  $,esc,t,api,toast,modal,closeModal,renderServer,loadOverview,navigate
}));


function bindCommonServerActions(){
  $$('.open-server').forEach(b=>b.onclick=()=>navigate('server',Number(b.dataset.id),'overview'));
  $$('.quick-terminal').forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=serverById(b.dataset.id)||await api(`/servers/${b.dataset.id}`);openTerminal(s);});
}

function jobsPanel(jobs){return`<div class="panel"><div class="panel-head"><h2>${t('jobs.title')}</h2></div>${jobs.length?jobs.map(j=>`<div class="job"><div><b>${esc(j.title)}</b><small>${esc(j.current_server_name||'')}${j.details?' · '+esc(j.details):''}</small></div><div class="job-progress"><span style="width:${j.progress}%"></span></div><span class="pill ${j.state==='done'?'online':j.state==='failed'?'error':''}">${esc(j.state)}</span></div>`).join(''):`<div class="empty">${t('jobs.empty')}</div>`}</div>`;}







(async function init(){if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});try{await api('/overview');showApp();await loadOverview();if(currentServerId)renderServer(currentServerId,currentServerTab);else render();}catch{showLogin();}})();
