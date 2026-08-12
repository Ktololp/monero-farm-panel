export function createDashboardPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, helpIcon, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };

async function renderDashboard(full=true){
  destroyCharts();
  if(!overview)await loadOverview();recalcSummary();const s=overview.summary,e=s.economics||{};const hs=Number(s.healthScore);const healthLabel=!Number.isFinite(hs)?'—':hs>=90?'Отлично':hs>=75?'Внимание':hs>=50?'Проблемы':'Критично';
  setHeader('Дашборд','Состояние фермы в реальном времени','<button id="add-server" class="primary">+ Сервер</button>');$('#add-server').onclick=()=>openServerForm();
  const rows=(overview.servers||[]).map(x=>`<tr><td><div class="server-name-cell"><button class="link open-server" data-id="${x.id}"><span class="server-icon">${esc(x.icon||'🖥️')}</span>${esc(x.name)}</button><button class="icon-btn quick-terminal" data-id="${x.id}" title="SSH-терминал">⌨</button></div><div class="muted small">${esc(x.username)}@${esc(x.host)}:${x.port}</div></td><td>${statusBadge(x.live)}</td><td>${fmtHash(x.live?.hash60s)}</td><td>${fmtTemp(x.live?.tempC)}</td><td><div class="component-row">${compBadge('XMRig',x.live?.components?.xmrig)}${compBadge('p2pool',x.live?.components?.p2pool)}${compBadge('monerod',x.live?.components?.monerod)}${x.live?.proxy?.detected?compBadge('Proxy',x.live?.components?.xmrigProxy):''}</div></td><td>${x.live?.baselineHash?fmtHash(x.live.baselineHash):`обучение ${x.live?.baselineSamples||0}/${x.live?.baselineMinSamples||12}`}</td></tr>`).join('');
  const alerts=(overview.alerts||[]).slice(0,6).map(a=>`<div class="alert-row"><strong>${esc(a.server_name||'Ферма')}</strong><span>${esc(a.message)}</span><time>${fmtDate(a.last_ts)}</time></div>`).join('')||'<div class="empty">Активных оповещений нет</div>';
  $('#view').innerHTML=`
   <div class="stats farm-overview-stats">
     <div class="stat"><span>🖥 Серверы ${helpIcon('Сколько серверов сейчас в сети из общего количества.')}</span><b>${s.online}/${s.total}</b></div>
     <div class="stat"><span>⚡ Общий 60s ${helpIcon('Сумма 60-секундного хешрейта всех серверов.')}</span><b>${fmtHash(s.totalHash)}</b></div>
     <div class="stat"><span>💰 Оценка дохода ${helpIcon('Предполагаемый доход по текущему хешрейту, сложности сети и награде последнего блока. Это оценка, а не гарантия выплаты.')}</span><b>${Number.isFinite(e.xmrDay)?'≈ '+Number(e.xmrDay).toFixed(6)+' XMR/сут':'—'}</b><small>${Number.isFinite(e.usdDay)?fmtUsd(e.usdDay)+'/сут · '+fmtUsd(e.usdMonth)+'/30д':'ожидание данных monerod'}</small></div>
     <div class="stat health-score ${Number.isFinite(hs)?(hs>=90?'good':hs>=75?'attention':hs>=50?'warn':'bad'):''}"><span>❤ Fleet Health ${helpIcon('Сводная оценка здоровья фермы 0–100: доступность, хешрейт относительно базовой нормы, температура, rejected shares, сеть и синхронизация monerod.')}</span><b>${Number.isFinite(hs)?hs+'/100':'—'}</b><small>${healthLabel}</small></div>
     <div class="stat"><span>🌡 Макс. CPU ${helpIcon('Самая высокая текущая температура CPU среди серверов.')}</span><b>${fmtTemp(s.maxTemp)}</b></div>
     <div class="stat"><span>🪙 XMR / USD ${helpIcon('Текущий ориентировочный курс Monero по данным CoinGecko.')}</span><b>${fmtUsd(overview.market?.price)}</b><small class="${Number(overview.market?.change24h)>=0?'price-up':'price-down'}">24ч: ${fmtPct(overview.market?.change24h)} · CoinGecko</small></div>
     <div class="stat"><span>🔔 Алерты ${helpIcon('Активные предупреждения, которые требуют внимания.')}</span><b>${overview.alerts?.length||0}</b></div>
   </div>
   <div class="panel hero-chart"><div class="panel-head"><div><h2>Хешрейт всей фермы</h2><span class="muted small">Сумма 60s, последние 24 часа</span></div><button id="refresh-all" class="ghost">Обновить</button></div><canvas id="farm-chart"></canvas></div>
   <div class="panel table-wrap"><div class="panel-head"><h2>Майнеры</h2><button id="all-servers" class="ghost">Открыть серверы</button></div><table><thead><tr><th>Сервер</th><th>Статус</th><th>60s</th><th>CPU</th><th>Компоненты</th><th>Базовая норма</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">Добавьте первый сервер</td></tr>'}</tbody></table></div>
   <div class="panel"><div class="panel-head"><h2>Активные оповещения</h2></div>${alerts}</div>`;
  bindCommonServerActions();$('#all-servers').onclick=()=>navigate('servers');$('#refresh-all').onclick=async()=>{toast('Запрашиваю свежие данные…');await Promise.allSettled((overview.servers||[]).map(x=>api(`/servers/${x.id}/poll`,{method:'POST'})));await loadOverview();renderDashboard();};
  try{
    const hist=await api('/history/farm?hours=24');
    const values=hist.map(x=>Number(x.hash60s)).filter(Number.isFinite);
    const farmScale=hashrateScale(values, overview?.summary?.totalHash);
    const c=new Chart($('#farm-chart'),{
      type:'line',
      data:{
        labels:hist.map(x=>new Date(x.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})),
        datasets:[{
          label:'Ферма',
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
          tooltip:{callbacks:{label:ctx=>`Ферма: ${fmtHash(ctx.parsed.y)}`}}
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
