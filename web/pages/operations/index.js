export function createOperationsPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };

async function renderOperations(){
  await loadOverview();const profiles=await api('/profiles'),jobs=await api('/jobs?limit=8');setHeader('Операции','Безопасные массовые действия и профили производительности');
  const checks=overview.servers.map(s=>`<label class="server-check"><input type="checkbox" class="op-server" value="${s.id}" checked><span>${esc(s.icon)} ${esc(s.name)}</span><small>${fmtHash(s.live?.hash60s)}</small></label>`).join('');
  $('#view').innerHTML=`<div class="grid2"><div class="panel"><h2>Выбор серверов</h2><p class="muted">Rolling-операции выполняются строго по одному серверу: следующий начинается только после возврата предыдущего в online.</p><div class="server-check-list">${checks}</div></div><div class="panel"><h2>Rolling restart</h2><p class="muted">Последовательно перезапускает указанный XMRig/mining service и ждёт окончания grace period и появления хешрейта.</p><button id="rolling-restart" class="primary">Запустить rolling restart</button></div></div>
  <div class="panel"><div class="panel-head"><div><h2>Профили производительности</h2><span class="muted small">Профиль применяется к выбранным серверам с backup config.json и рестартом.</span></div></div><div class="profile-grid">${profiles.map(p=>`<article class="profile-card"><b>${esc(p.name)}</b><strong>${p.percent}%</strong><p>${esc(p.description)}</p><button class="ghost apply-profile" data-profile="${p.id}">Применить к выбранным</button></article>`).join('')}</div></div>
  ${jobsPanel(jobs)}`;
  const ids=()=>$$('.op-server:checked').map(x=>Number(x.value));
  $('#rolling-restart').onclick=async()=>{if(!ids().length)return toast('Выберите хотя бы один сервер','error');if(!confirm('Запустить последовательный перезапуск выбранных серверов?'))return;try{await api('/fleet/actions/rolling-restart',{method:'POST',body:{serverIds:ids()}});toast('Rolling restart запущен');await sleep(500);renderOperations();}catch(e){toast(e.message,'error');}};
  $$('.apply-profile').forEach(b=>b.onclick=async()=>{const selected=ids();if(!selected.length)return toast('Выберите серверы','error');b.disabled=true;let errors=0;for(const id of selected){try{await api(`/servers/${id}/actions/profile`,{method:'POST',body:{profile:b.dataset.profile}});}catch{errors++;}}toast(errors?`Готово, ошибок: ${errors}`:'Профиль применён',errors?'error':'ok');b.disabled=false;await loadOverview();});
}

  return { renderOperations };
}
