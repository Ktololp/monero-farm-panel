export function createDashboardPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, helpIcon, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts, t, getLocale } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };

async function renderDashboard(full=true){
  destroyCharts();
  if(!overview)await loadOverview();recalcSummary();const s=overview.summary,e=s.economics||{};const hs=Number(s.healthScore);const healthLabel=!Number.isFinite(hs)?'—':hs>=90?t('dashboard.healthExcellent'):hs>=75?t('dashboard.healthAttention'):hs>=50?t('dashboard.healthProblems'):t('dashboard.healthCritical');
  setHeader(t('dashboard.title'),t('dashboard.subtitle'),`<button id="add-server" class="primary">${t('action.addServer')}</button>`);$('#add-server').onclick=()=>openServerForm();
  const rows=(overview.servers||[]).map(x=>`<tr><td><div class="server-name-cell"><button class="link open-server" data-id="${x.id}"><span class="server-icon">${esc(x.icon||'🖥️')}</span>${esc(x.name)}</button><button class="icon-btn quick-terminal" data-id="${x.id}" title="${esc(t('dashboard.sshTerminal'))}">⌨</button></div><div class="muted small">${esc(x.username)}@${esc(x.host)}:${x.port}</div></td><td>${statusBadge(x.live)}</td><td>${fmtHash(x.live?.hash60s)}</td><td>${fmtTemp(x.live?.tempC)}</td><td><div class="component-row">${compBadge('XMRig',x.live?.components?.xmrig)}${compBadge('p2pool',x.live?.components?.p2pool)}${compBadge('monerod',x.live?.components?.monerod)}${x.live?.proxy?.detected?compBadge('Proxy',x.live?.components?.xmrigProxy):''}</div></td><td>${x.live?.baselineHash?fmtHash(x.live.baselineHash):t('dashboard.training',{current:x.live?.baselineSamples||0,required:x.live?.baselineMinSamples||12})}</td></tr>`).join('');
  const alerts=(overview.alerts||[]).slice(0,6).map(a=>`<div class="alert-row"><strong>${esc(a.server_name||t('dashboard.farm'))}</strong><span>${esc(a.message)}</span><time>${fmtDate(a.last_ts)}</time></div>`).join('')||`<div class="empty">${t('dashboard.noAlerts')}</div>`;
  $('#view').innerHTML=`
   <div class="stats farm-overview-stats">
     <div class="stat tone-blue kpi-regular"><span><i class="kpi-icon kpi-servers" aria-hidden="true"></i>${t('dashboard.servers')} ${helpIcon(t('dashboard.serversHelp'))}</span><b>${s.online}/${s.total}</b></div>
     <div class="stat tone-orange kpi-regular"><span><i class="kpi-icon kpi-hashrate" aria-hidden="true"></i>${t('dashboard.total60s')} ${helpIcon(t('dashboard.total60sHelp'))}</span><b>${fmtHash(s.totalHash)}</b></div>
     <div class="stat tone-green kpi-wide"><span><i class="kpi-icon kpi-income" aria-hidden="true"></i>${t('dashboard.income')} ${helpIcon(t('dashboard.incomeHelp'))}</span><b>${Number.isFinite(e.xmrDay)?t('dashboard.xmrDay',{value:Number(e.xmrDay).toFixed(6)}):'—'}</b><small>${Number.isFinite(e.usdDay)?t('dashboard.usdIncome',{day:fmtUsd(e.usdDay),month:fmtUsd(e.usdMonth)}):t('dashboard.waitMonerod')}</small></div>
     <div class="stat tone-purple health-score kpi-regular ${Number.isFinite(hs)?(hs>=90?'good':hs>=75?'attention':hs>=50?'warn':'bad'):''}"><span><i class="kpi-icon kpi-health" aria-hidden="true"></i>${t('dashboard.fleetHealth')} ${helpIcon(t('dashboard.healthHelp'))}</span><b>${Number.isFinite(hs)?hs+'/100':'—'}</b><small>${healthLabel}</small></div>
     <div class="stat tone-cyan kpi-regular"><span><i class="kpi-icon kpi-cpu" aria-hidden="true"></i>${t('dashboard.maxCpu')} ${helpIcon(t('dashboard.maxCpuHelp'))}</span><b>${fmtTemp(s.maxTemp)}</b></div>
     <div class="stat tone-blue kpi-regular"><span><i class="kpi-icon kpi-price" aria-hidden="true"></i>XMR / USD ${helpIcon(t('dashboard.xmrUsdHelp'))}</span><b>${fmtUsd(overview.market?.price)}</b><small class="${Number(overview.market?.change24h)>=0?'price-up':'price-down'}">${t('dashboard.market24h',{change:fmtPct(overview.market?.change24h)})}</small></div>
     <div class="stat tone-warn kpi-short"><span><i class="kpi-icon kpi-alerts" aria-hidden="true"></i>${t('dashboard.alerts')} ${helpIcon(t('dashboard.alertsHelp'))}</span><b>${overview.alerts?.length||0}</b></div>
   </div>
   <div class="panel hero-chart dashboard-chart"><div class="panel-head"><div><h2>${t('dashboard.chartTitle')}</h2><span class="muted small">${t('dashboard.chartSubtitle')}</span></div><button id="refresh-all" class="ghost">${t('dashboard.refresh')}</button></div><canvas id="farm-chart"></canvas></div>
   <div class="panel table-wrap dashboard-miners"><div class="panel-head"><h2>${t('dashboard.miners')}</h2><button id="all-servers" class="ghost">${t('dashboard.openServers')}</button></div><table><thead><tr><th>${t('dashboard.server')}</th><th>${t('dashboard.status')}</th><th>60s</th><th>CPU</th><th>${t('dashboard.components')}</th><th>${t('dashboard.baseline')}</th></tr></thead><tbody>${rows||`<tr><td colspan="6" class="empty">${t('dashboard.addFirstServer')}</td></tr>`}</tbody></table></div>
   <div class="panel dashboard-alerts"><div class="panel-head"><h2>${t('dashboard.activeAlerts')}</h2></div>${alerts}</div>`;
  bindCommonServerActions();$('#all-servers').onclick=()=>navigate('servers');$('#refresh-all').onclick=async()=>{toast(t('dashboard.refreshing'));await Promise.allSettled((overview.servers||[]).map(x=>api(`/servers/${x.id}/poll`,{method:'POST'})));await loadOverview();renderDashboard();};
  try{
    const hist=await api('/history/farm?hours=24');
    const values=hist.map(x=>Number(x.hash60s)).filter(Number.isFinite);
    const farmScale=hashrateScale(values, overview?.summary?.totalHash);
    const c=new Chart($('#farm-chart'),{
      type:'line',
      data:{
        labels:hist.map(x=>new Date(x.ts).toLocaleTimeString(getLocale()==='en'?'en-US':'ru-RU',{hour:'2-digit',minute:'2-digit'})),
        datasets:[{
          label:t('dashboard.chartFarm'),
          data:hist.map(x=>x.hash60s),
          borderColor:'#f59e0b',
          backgroundColor:'rgba(245,158,11,.18)',
          pointBackgroundColor:'#f59e0b',
          pointBorderColor:'#f59e0b',
          borderWidth:2,
          pointRadius:hist.length<3?3:0,
          pointHoverRadius:4,
          tension:.25,
          fill:true
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{intersect:false,mode:'index'},
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:ctx=>t('dashboard.chartTooltip',{hash:fmtHash(ctx.parsed.y)})}}
        },
        scales:{
          x:{grid:{display:false},ticks:{maxTicksLimit:10}},
          y:{
            beginAtZero:false,
            min:farmScale.min,max:farmScale.max,
            ticks:{stepSize:farmScale.stepSize,maxTicksLimit:6,callback:v=>fmtHash(v)}
          }
        }
      }
    });
    charts.push(c);
  }catch{}
}

  return { renderDashboard };
}
