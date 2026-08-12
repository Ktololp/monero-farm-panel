export function createServersPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };

async function renderServers(full=true){
  destroyCharts();
  if(full||!overview)await loadOverview();setHeader('Серверы','Майнеры, sparklines и быстрый SSH','<button id="add-server" class="primary">+ Сервер</button>');$('#add-server').onclick=()=>openServerForm();
  $('#view').innerHTML=`<div class="server-grid">${(overview.servers||[]).map(s=>`<article class="server-card"><div class="server-card-head"><button class="server-title open-server" data-id="${s.id}"><span>${esc(s.icon||'🖥️')}</span><div><b>${esc(s.name)}</b><small>${esc(s.host)}</small></div></button><button class="terminal-icon quick-terminal" data-id="${s.id}" title="Открыть SSH">⌨</button></div><div class="server-card-status">${statusBadge(s.live)}<span>${fmtTemp(s.live?.tempC)}</span><span>${fmtHash(s.live?.hash60s)}</span></div><div class="component-row">${compBadge('XMRig',s.live?.components?.xmrig)}${compBadge('p2pool',s.live?.components?.p2pool)}${compBadge('monerod',s.live?.components?.monerod)}</div><div class="spark-wrap"><canvas id="spark-${s.id}"></canvas></div><div class="server-meta"><span>Базовая норма <b>${s.live?.baselineHash?fmtHash(s.live.baselineHash):`обучение ${s.live?.baselineSamples||0}/${s.live?.baselineMinSamples||12}`}</b></span><span>CPU <b>${fmtMHz(s.live?.cpuMHz)}</b></span><span>Профиль <b>${esc(s.performanceProfile||'maximum')}</b></span></div></article>`).join('')||'<div class="panel empty">Серверов пока нет</div>'}</div>`;
  bindCommonServerActions();
  for(const s of overview.servers||[]){const el=$(`#spark-${s.id}`);if(!el)continue;const d=s.sparkline||[];const sparkValues=d.map(x=>x.hash60s);const sparkScale=hashrateScale(sparkValues,s.live?.baselineHash||s.live?.hash60s);const c=new Chart(el,{type:'line',data:{labels:d.map(()=>''),datasets:[{data:sparkValues,borderWidth:2,pointRadius:0,tension:.3,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false,min:sparkScale.min,max:sparkScale.max}}}});charts.push(c);}
}

  return { renderServers };
}
