export function createServerPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, helpIcon, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts, t, getLocale } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };


async function renderServer(id,tab='overview'){
  const s=await api(`/servers/${id}`);currentServerId=s.id;currentServerTab=tab;ctx.setCurrentServerState(s.id,tab);
  const term=`<button id="header-terminal" class="terminal-header" title="${esc(t('server.terminalTitle'))}">${t('server.terminal')}</button>`;
  setHeader(`<span class="title-icon">${esc(s.icon)}</span>${esc(s.name)}`,`${s.username}@${s.host}:${s.port}`,`${term}<button id="back-servers" class="ghost">${t('server.backServers')}</button>`);
  $('#header-terminal').onclick=()=>openTerminal(s);$('#back-servers').onclick=()=>navigate('servers');
  const tabs=[['overview','server.tab.overview'],['performance','server.tab.performance'],['components','server.tab.components'],['system','server.tab.system'],['logs','server.tab.logs'],['config','server.tab.config']];
  $('#view').innerHTML=`<div class="server-tabs">${tabs.map(([k,key])=>`<button class="server-tab ${tab===k?'active':''}" data-tab="${k}">${t(key)}</button>`).join('')}</div><div id="server-tab-view"></div>`;
  $$('.server-tab').forEach(b=>b.onclick=()=>navigate('server',s.id,b.dataset.tab));
  if(tab==='performance')return renderServerPerformance(s);if(tab==='components')return renderServerComponents(s);if(tab==='system')return renderServerSystem(s);if(tab==='logs')return renderServerLogs(s);if(tab==='config')return renderServerConfig(s);return renderServerOverview(s);
}
function refreshServerHeader(live){const host=$('#server-live-status');if(host)host.innerHTML=statusBadge(live);}


async function renderServerOverview(s){
  const l=s.live||{},hist=await api(`/servers/${s.id}/history?hours=24`);
  const baselineNote=l.baselineHash?t('server.samples',{count:l.baselineSamples||0}):t('server.training',{current:l.baselineSamples||0,required:l.baselineMinSamples||12});
  const remaining=l.graceRemaining?t('server.graceRemaining',{seconds:Math.ceil(l.graceRemaining)}):'';
  $('#server-tab-view').innerHTML=`<div class="stats stats-5"><div class="stat"><span>${t('server.status')}</span><b id="server-live-status">${statusBadge(l)}</b></div><div class="stat"><span>60s</span><b>${fmtHash(l.hash60s)}</b></div><div class="stat"><span>${t('server.baseline')}</span><b>${fmtHash(l.baselineHash)}</b><small>${baselineNote}</small></div><div class="stat"><span>CPU</span><b>${fmtTemp(l.tempC)}</b><small>${fmtMHz(l.cpuMHz)}</small></div><div class="stat"><span>Uptime XMRig</span><b>${fmtUptime(l.uptime)}</b></div></div><div class="grid2"><div class="panel chart-panel"><h2>${t('server.hashrate')}</h2><canvas id="srv-hash"></canvas></div><div class="panel chart-panel"><h2>${t('server.cpuTemperature')}</h2><canvas id="srv-temp"></canvas></div></div>${l.grace?`<div class="notice">${t('server.grace',{remaining})}</div>`:''}`;
  charts.push(lineChart($('#srv-hash'),hist.map(x=>x.ts),hist.map(x=>x.hash60s),{label:'H/s',tick:v=>fmtHash(v),scale:hashrateScale(hist.map(x=>x.hash60s),l.baselineHash||l.hash60s)}));
  charts.push(lineChart($('#srv-temp'),hist.map(x=>x.ts),hist.map(x=>x.tempC),{label:'°C',tick:v=>`${Number(v).toLocaleString(getLocale()==='en'?'en-US':'ru-RU',{maximumFractionDigits:1})}°`,scale:temperatureScale(hist.map(x=>x.tempC))}));
}
function lineChart(el,ts,data,{label,tick,scale={}}){return new Chart(el,{type:'line',data:{labels:ts.map(x=>new Date(x).toLocaleTimeString(getLocale()==='en'?'en-US':'ru-RU',{hour:'2-digit',minute:'2-digit'})),datasets:[{label,data,borderWidth:2,pointRadius:data.filter(Number.isFinite).length<3?3:0,pointHoverRadius:4,tension:.25}]},options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{beginAtZero:false,min:scale.min,max:scale.max,ticks:{stepSize:scale.stepSize,maxTicksLimit:6,callback:tick}}}}});}


async function renderServerPerformance(s){
  const l=s.live||{},profiles=await api('/profiles');
  const profileText=p=>({name:t(`profile.${p.id}.name`),description:t(`profile.${p.id}.description`)});
  const baselineNote=l.baselineHash?t('server.samples',{count:l.baselineSamples||0}):t('server.training',{current:l.baselineSamples||0,required:l.baselineMinSamples||12});
  $('#server-tab-view').innerHTML=`<div class="panel"><div class="panel-head"><div><h2>${t('server.performance.title')}</h2><span class="muted small">${t('server.performance.current',{profile:esc(s.performanceProfile||'maximum')})}</span></div></div><div class="profile-grid">${profiles.map(p=>{const pt=profileText(p);return `<article class="profile-card ${s.performanceProfile===p.id?'selected':''}"><b>${esc(pt.name)}</b><strong>${p.percent}%</strong><p>${esc(pt.description)}</p><button class="${s.performanceProfile===p.id?'primary':'ghost'} profile-one" data-profile="${p.id}">${s.performanceProfile===p.id?t('server.performance.applied'):t('server.performance.apply')}</button></article>`;}).join('')}</div></div><div class="stats"><div class="stat"><span>10s / 60s</span><b>${fmtHash(l.hash10s)}</b><small>${fmtHash(l.hash60s)}</small></div><div class="stat"><span>${t('server.baseline')}</span><b>${fmtHash(l.baselineHash)}</b><small>${baselineNote}</small></div><div class="stat"><span>CPU frequency</span><b>${fmtMHz(l.cpuMHz)}</b></div><div class="stat"><span>Load 1 / 5 / 15</span><b>${l.load1?.toFixed?.(1)??'—'}</b><small>${l.load5?.toFixed?.(1)??'—'} / ${l.load15?.toFixed?.(1)??'—'} · ${t('server.performance.cpuThreads',{count:l.cpuCount||'?'})}</small></div></div><div class="panel"><h2>${t('server.performance.detector')}</h2><p>${t('server.performance.detectorText')}</p><div class="meter"><span style="width:${l.baselineHash&&l.hash60s?Math.min(100,l.hash60s/l.baselineHash*100):0}%"></span></div><div class="muted small">${t('server.performance.currentVsBaseline',{current:fmtHash(l.hash60s),baseline:fmtHash(l.baselineHash)})}</div></div>`;
  $$('.profile-one').forEach(b=>b.onclick=async()=>{if(!confirm(t('server.performance.confirm')))return;try{await api(`/servers/${s.id}/actions/profile`,{method:'POST',body:{profile:b.dataset.profile}});toast(t('server.performance.done'));await sleep(700);renderServer(s.id,'performance');}catch(e){toast(e.message,'error');}});
}


function renderServerComponents(s){
  const l=s.live||{},m=l.monero||{},p=l.p2poolAnalytics||{},q=l.proxy||{},proxyRouted=['127.0.0.1:3334','localhost:3334','[::1]:3334'].includes(String(l.pool||'').trim());
  const pWorkers=(p.workers||[]).slice(0,20).map(w=>`<tr><td>${esc(w.name||w.address||'worker')}</td><td>${esc(w.address||'—')}</td><td>${fmtHash(Number(w.hashrate))}</td><td>${esc(String(w.uptime??'—'))}</td></tr>`).join('');
  const qWorkers=(q.workers||[]).slice(0,30).map(w=>`<tr><td>${esc(w.name||'worker')}</td><td>${esc(w.ip||'—')}</td><td>${fmtHash(Number(w.hashrate1m))}</td><td>${w.accepted??0} / ${w.rejected??0}</td></tr>`).join('');
  const proxyHash=q.available?fmtHash(Number(q.hashrate?.[1]??q.hashrate?.[0])):(q.detected?t('server.components.apiUnavailable'):t('server.components.notFound'));
  const proxyButtons=!q.detected?`<button id="install-xmrig-proxy" class="primary">${t('server.components.installProxy')}</button>`:q.available&&!proxyRouted?`<button id="switch-xmrig-proxy" class="primary">${t('server.components.switchProxy')}</button>`:proxyRouted?`<button class="ghost" disabled>${t('server.components.proxyRouted')}</button>`:'';
  $('#server-tab-view').innerHTML=`
    <div class="component-cards component-cards-4">
      <article class="panel component-card"><div>${compBadge('XMRig',l.components?.xmrig)}</div><h2>⚒ XMRig ${helpIcon(t('server.components.xmrigHelp'))}</h2><b>${fmtHash(l.hash60s)}</b><span>${esc(l.pool||t('server.components.poolUnknown'))}</span></article>
      <article class="panel component-card"><div>${compBadge('p2pool',l.components?.p2pool)}</div><h2>🟠 P2Pool ${helpIcon(t('server.components.p2poolHelp'))}</h2><b>${p.available?fmtHash(Number(p.hashrate15m)):esc(l.p2poolStatus||'unknown')}</b><span>${p.available?`sidechain ${esc(p.sidechain)} · shares ${p.sharesFound??'—'}`:t('server.components.p2poolBasic')}</span></article>
      <article class="panel component-card"><div>${compBadge('monerod',l.components?.monerod)}</div><h2>◉ Monero node ${helpIcon(t('server.components.monerodHelp'))}</h2><b>${m.syncPercent!=null?`${Number(m.syncPercent).toFixed(2)}%`:'—'}</b><span>height ${m.height??'—'} / target ${m.targetHeight??m.height??'—'}</span></article>
      <article class="panel component-card"><div>${compBadge('Proxy',l.components?.xmrigProxy)}</div><h2>⇄ XMRig Proxy ${helpIcon(t('server.components.proxyHelp'))}</h2><b>${proxyHash}</b><span>${q.available?`${q.workerCount||0} workers · v${esc(q.version||'?')}`:t('server.components.proxyAuto')}</span>${proxyButtons}</article>
    </div>
    <div class="grid2">
      <div class="panel"><h2>${t('server.components.p2poolAnalytics')} ${helpIcon(t('server.components.p2poolAnalyticsHelp'))}</h2>
        ${p.available?`<div class="health-list"><div><span>Sidechain</span><b>${esc(p.sidechain||'main')}</b></div><div><span>15m / 1h / 24h</span><b>${fmtHash(Number(p.hashrate15m))} · ${fmtHash(Number(p.hashrate1h))} · ${fmtHash(Number(p.hashrate24h))}</b></div><div><span>Shares found / failed</span><b>${p.sharesFound??'—'} / ${p.sharesFailed??'—'}</b></div><div><span>Current / average effort</span><b>${p.currentEffort??'—'}% / ${p.averageEffort??'—'}%</b></div><div><span>Miner connections</span><b>${p.incomingConnections??p.workers?.length??'—'}</b></div><div><span>Pool hashrate</span><b>${fmtHash(Number(p.pool?.hashrate))}</b></div><div><span>Pool miners</span><b>${p.pool?.miners??'—'}</b></div><div><span>Blocks found</span><b>${p.pool?.totalBlocksFound??'—'}</b></div></div>`:`<div class="notice warn">${t('server.components.p2poolUnavailable')} <div class="button-row"><button id="enable-p2pool-analytics" class="primary">${t('server.components.enableP2pool')}</button></div><span class="muted small">${t('server.components.p2poolRollback')}</span></div>`}
        ${pWorkers?`<div class="table-wrap compact-table"><table><thead><tr><th>Worker</th><th>${t('server.components.address')}</th><th>Hashrate</th><th>Uptime</th></tr></thead><tbody>${pWorkers}</tbody></table></div>`:''}
      </div>
      <div class="panel"><h2>⇄ XMRig Proxy ${helpIcon(t('server.components.proxyStatsHelp'))}</h2>
        ${q.available?`<div class="health-list"><div><span>Version / mode</span><b>${esc(q.version||'—')} / ${esc(q.mode||'—')}</b></div><div><span>Hashrate</span><b>${fmtHash(Number(q.hashrate?.[1]??q.hashrate?.[0]))}</b></div><div><span>Workers</span><b>${q.workerCount??q.workers?.length??0}</b></div><div><span>Miners now / max</span><b>${q.minersNow??0} / ${q.minersMax??0}</b></div><div><span>Accepted / rejected / invalid</span><b>${q.results?.accepted??0} / ${q.results?.rejected??0} / ${q.results?.invalid??0}</b></div><div><span>Upstreams active / total</span><b>${q.upstreams?.active??'—'} / ${q.upstreams?.total??'—'}</b></div></div>`:`<div class="empty">${q.detected?t('server.components.proxyDetectedNoApi'):t('server.components.proxyAbsent')}</div>`}
        ${qWorkers?`<div class="table-wrap compact-table"><table><thead><tr><th>Worker</th><th>IP</th><th>1m</th><th>A/R</th></tr></thead><tbody>${qWorkers}</tbody></table></div>`:''}
      </div>
    </div>
    <div class="panel"><h2>${t('server.components.monerodSync')} ${helpIcon(t('server.components.monerodSyncHelp'))}</h2><div class="sync-line"><div class="meter"><span style="width:${Math.min(100,Number(m.syncPercent)||0)}%"></span></div><b>${m.synchronized?t('server.components.synced'):m.syncPercent!=null?`${Number(m.syncPercent).toFixed(3)}%`:t('server.components.rpcUnavailable')}</b></div><div class="form-grid read-grid"><div><span>Height</span><b>${m.height??'—'}</b></div><div><span>Target height</span><b>${m.targetHeight??'—'}</b></div><div><span>Inbound peers</span><b>${m.incoming??'—'}</b></div><div><span>Outbound peers</span><b>${m.outgoing??'—'}</b></div><div><span>Difficulty</span><b>${Number.isFinite(Number(m.difficulty))?Number(m.difficulty).toLocaleString(getLocale()==='en'?'en-US':'ru-RU'):'—'}</b></div><div><span>Last block reward</span><b>${Number.isFinite(Number(m.blockRewardXmr))?Number(m.blockRewardXmr).toFixed(6)+' XMR':'—'}</b></div></div></div>`;

  const installProxy=$('#install-xmrig-proxy');
  if(installProxy)installProxy.onclick=async()=>{if(!confirm(t('server.components.installProxyConfirm')))return;try{installProxy.disabled=true;installProxy.textContent=t('server.components.installing');const r=await api(`/servers/${s.id}/actions/install-xmrig-proxy`,{method:'POST',body:{}});toast(t('server.components.proxyInstalled',{version:r.version}));await sleep(700);renderServer(s.id,'components');}catch(e){toast(e.message,'error');installProxy.disabled=false;installProxy.textContent=t('server.components.installProxy');}};

  const switchProxy=$('#switch-xmrig-proxy');
  if(switchProxy)switchProxy.onclick=async()=>{if(!confirm(t('server.components.switchProxyConfirm')))return;try{switchProxy.disabled=true;switchProxy.textContent=t('server.components.switching');const r=await api(`/servers/${s.id}/actions/xmrig-to-proxy`,{method:'POST',body:{}});toast(r.alreadyConfigured?t('server.components.proxyAlready'):t('server.components.proxySwitched'));renderServer(s.id,'components');}catch(e){toast(e.message,'error');switchProxy.disabled=false;switchProxy.textContent=t('server.components.switchProxy');}};

  const enableP2pool=$('#enable-p2pool-analytics');
  if(enableP2pool)enableP2pool.onclick=async()=>{if(!confirm(t('server.components.enableP2poolConfirm')))return;try{enableP2pool.disabled=true;enableP2pool.textContent=t('server.components.enabling');const r=await api(`/servers/${s.id}/actions/enable-p2pool-analytics`,{method:'POST',body:{}});toast(r.alreadyEnabled?t('server.components.p2poolAlready'):t('server.components.p2poolEnabled'));await sleep(1200);renderServer(s.id,'components');}catch(e){toast(e.message,'error');enableP2pool.disabled=false;enableP2pool.textContent=t('server.components.enableP2pool');}};
}

function renderServerSystem(s){
  const l=s.live||{},hp=l.hugePages||{},d=s.discovery;
  $('#server-tab-view').innerHTML=`
    <div class="grid2">
      <div class="panel"><h2>Huge Pages</h2><div class="health-list">
        <div><span>Huge Pages (default size)</span><b>${hp.total??0} total / ${hp.free??0} free</b></div>
        <div><span>${t('server.system.size')}</span><b>${hp.sizeKB?`${hp.sizeKB} KB`:'—'}</b></div>
        <div><span>1 GB pages</span><b>${hp.oneGTotal??0} total / ${hp.oneGFree??0} free</b></div>
        <div><span>XMRig allocation</span><b>${esc(String(l.hugepagesXMRig??'—'))}</b></div>
      </div><div class="control-block"><label>${t('server.system.pages2m')}<input id="hp-2m-count" type="number" min="0" max="1048576" value="${hp.sizeKB===2048?(hp.total??0):0}"></label><button id="hp-2m-apply" class="ghost">${t('server.system.applyNow')}</button><label>${t('server.system.pages1g')}<input id="hp-1g-count" type="number" min="0" max="1024" value="${hp.oneGTotal??5}"></label><button id="hp-1g-apply" class="ghost">${t('server.system.configureBoot')}</button><span class="muted small">${t('server.system.hugePagesHint')}</span></div></div>
      <div class="panel"><h2>${t('server.system.msrNetwork')}</h2><div class="health-list">
        <div><span>MSR module</span><b>${l.msr?.module?t('server.system.loaded'):t('server.system.notLoaded')}</b></div>
        <div><span>/dev/cpu/0/msr</span><b>${l.msr?.device?t('server.system.available'):t('server.system.no')}</b></div>
        <div><span>DNS</span><b>${l.network?.dns===true?'OK':l.network?.dns===false?'FAIL':'—'}</b></div>
        <div><span>Internet</span><b>${l.network?.internet===true?'OK':l.network?.internet===false?'FAIL':'—'}</b></div>
      </div><div class="button-row"><button id="msr-on" class="ghost">MSR ON</button><button id="msr-off" class="danger-soft">MSR OFF</button></div></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h2>${t('server.system.discoveryTitle')}</h2><span class="muted small">${t('server.system.discoveryHint')}</span></div><div class="button-row"><button id="discover" class="ghost">${t('server.system.discover')}</button><button id="auto-fix" class="primary">${t('server.system.autoFix')}</button></div></div>
      ${d?`<div class="discovery-grid"><div><span>CPU</span><b>${esc(d.hardware?.cpuModel||'—')}</b></div><div><span>OS</span><b>${esc(d.hardware?.os||'—')}</b></div><div><span>XMRig binary</span><code>${esc(d.xmrig?.binary||'—')}</code></div><div><span>config.json</span><code>${esc(d.xmrig?.config||s.xmrigConfigPath)}</code></div><div><span>XMRig service</span><code>${esc(d.xmrig?.service||s.xmrigService)}</code></div><div><span>NUMA</span><b>${d.hardware?.numaNodes??'—'}</b></div></div>`:`<div class="empty">${t('server.system.discoveryEmpty')}</div>`}
    </div>`;
  $('#discover').onclick=async()=>{try{toast(t('server.system.searching'));await api(`/servers/${s.id}/discover`,{method:'POST'});toast(t('server.system.discoveryDone'));renderServer(s.id,'system');}catch(e){toast(e.message,'error');}};
  $('#auto-fix').onclick=async()=>{if(!confirm(t('server.system.autoFixConfirm')))return;try{const r=await api(`/servers/${s.id}/actions/auto-fix`,{method:'POST'});toast(r.fixes?.length?r.fixes.join(' · '):t('server.system.noFixes'));renderServer(s.id,'system');}catch(e){toast(e.message,'error');}};
  $('#hp-2m-apply').onclick=async()=>{const count=Number($('#hp-2m-count').value)||0;try{await api(`/servers/${s.id}/actions/hugepages`,{method:'POST',body:{mode:'2m',count}});toast(t('server.system.pages2mApplied'));setTimeout(()=>renderServer(s.id,'system'),800);}catch(e){toast(e.message,'error');}};
  $('#hp-1g-apply').onclick=async()=>{const count=Number($('#hp-1g-count').value)||0;if(!confirm(t('server.system.pages1gConfirm',{count})))return;try{const r=await api(`/servers/${s.id}/actions/hugepages`,{method:'POST',body:{mode:'1g',count}});toast(r.rebootRequired?t('server.system.pagesReboot'):t('server.system.pagesConfigured'));}catch(e){toast(e.message,'error');}};
  $('#msr-on').onclick=async()=>{try{await api(`/servers/${s.id}/actions/msr`,{method:'POST',body:{enabled:true}});toast(t('server.system.msrOn'));setTimeout(()=>renderServer(s.id,'system'),1200);}catch(e){toast(e.message,'error');}};
  $('#msr-off').onclick=async()=>{if(!confirm(t('server.system.msrOffConfirm')))return;try{await api(`/servers/${s.id}/actions/msr`,{method:'POST',body:{enabled:false}});toast(t('server.system.msrOff'));setTimeout(()=>renderServer(s.id,'system'),1200);}catch(e){toast(e.message,'error');}};
}

async function renderServerLogs(s){
  $('#server-tab-view').innerHTML=`<div class="log-tabs"><button class="ghost log-load active" data-kind="xmrig">XMRig</button><button class="ghost log-load" data-kind="p2pool">p2pool</button><button class="ghost log-load" data-kind="monerod">monerod</button></div><div class="panel"><pre id="component-log" class="log">${t('server.logs.loading')}</pre></div>`;
  const load=async kind=>{const out=$('#component-log');out.textContent=t('server.logs.loading');try{out.textContent=await api(`/servers/${s.id}/logs/${kind}?lines=500`);}catch(e){out.textContent=e.message;}$$('.log-load').forEach(b=>b.classList.toggle('active',b.dataset.kind===kind));};
  $$('.log-load').forEach(b=>b.onclick=()=>load(b.dataset.kind));load('xmrig');
}

function renderServerConfig(s){
  $('#server-tab-view').innerHTML=`<div class="grid2"><div class="panel"><h2>${t('server.config.quickActions')}</h2><div class="action-stack"><button id="cfg-restart" class="primary">${t('server.config.restart')}</button><button id="cfg-apply" class="ghost">${t('server.config.applyGlobal')}</button><button id="cfg-terminal" class="ghost">${t('server.config.openTerminal')}</button><button id="cfg-edit" class="ghost">${t('server.config.editServer')}</button><button id="cfg-bootstrap" class="danger-soft">${t('server.config.bootstrap')}</button></div></div><div class="panel"><h2>${t('server.config.sshCommand')}</h2><p class="muted small">${t('server.config.sshHint')}</p><textarea id="remote-command" rows="5" placeholder="systemctl status mining --no-pager"></textarea><button id="run-command" class="ghost">${t('server.config.execute')}</button><pre id="command-output" class="log small-log"></pre></div></div>`;
  $('#cfg-terminal').onclick=()=>openTerminal(s);
  $('#cfg-edit').onclick=()=>openServerForm(s);
  $('#cfg-restart').onclick=async()=>{try{await api(`/servers/${s.id}/actions/restart`,{method:'POST'});toast(t('server.config.restartStarted'));}catch(e){toast(e.message,'error');}};
  $('#cfg-apply').onclick=async()=>{try{await api(`/servers/${s.id}/actions/apply-config`,{method:'POST'});toast(t('server.config.configApplied'));}catch(e){toast(e.message,'error');}};
  $('#cfg-bootstrap').onclick=()=>bootstrapModal(s);
  $('#run-command').onclick=async()=>{try{const r=await api(`/servers/${s.id}/actions/command`,{method:'POST',body:{command:$('#remote-command').value}});$('#command-output').textContent=`$ code=${r.code}\n${r.stdout}${r.stderr?`\n[stderr]\n${r.stderr}`:''}`;}catch(e){$('#command-output').textContent=e.message;}};
}

  return { renderServer, refreshServerHeader };
}
