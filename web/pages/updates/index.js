export function createUpdatesPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };

async function renderUpdates(){
  const u=await api('/updates');const jobs=await api('/jobs?limit=8');setHeader('Центр обновлений','Проверка официальных релизов и rolling update','<button id="check-updates" class="ghost">Проверить сейчас</button>');
  const latest=u.data?.xmrig?.version||'—';
  $('#view').innerHTML=`<div class="stats"><div class="stat"><span>XMRig latest</span><b>${esc(latest)}</b></div><div class="stat"><span>p2pool latest</span><b>${esc(u.data?.p2pool?.version||'—')}</b></div><div class="stat"><span>Monero latest</span><b>${esc(u.data?.monero?.version||'—')}</b></div><div class="stat"><span>Последняя проверка</span><b class="small-value">${fmtDate(u.ts)}</b></div></div>${u.error?`<div class="notice warn">GitHub API: ${esc(u.error)}</div>`:''}
   <div class="panel table-wrap"><div class="panel-head"><h2>XMRig на серверах</h2><button id="update-selected" class="primary" ${latest==='—'?'disabled':''}>Rolling update до ${esc(latest)}</button></div><table><thead><tr><th></th><th>Сервер</th><th>Установлено</th><th>Статус</th><th>p2pool</th><th>monerod</th></tr></thead><tbody>${u.servers.map(s=>`<tr><td><input class="upd-server" type="checkbox" value="${s.id}" ${s.xmrigStatus==='update'?'checked':''}></td><td>${esc(s.icon)} ${esc(s.name)}</td><td>${esc(s.installedXmrig||'не определено')}</td><td><span class="pill ${s.xmrigStatus==='current'?'online':s.xmrigStatus==='update'?'warn':''}">${({current:'актуально',update:'есть обновление',newer:'новее latest',unknown:'неизвестно'})[s.xmrigStatus]||s.xmrigStatus}</span></td><td>${esc(s.p2poolVersion||'—')}</td><td>${esc(s.monerodVersion||'—')}</td></tr>`).join('')}</tbody></table><p class="muted small">Rolling update XMRig собирает официальный исходный код выбранной версии на каждом майнере, сохраняет backup текущего бинарника и переходит дальше только после health-check хешрейта. Если новая версия не поднимается, панель пытается автоматически вернуть предыдущий бинарник.</p></div>${jobsPanel(jobs)}`;
  $('#check-updates').onclick=async()=>{toast('Проверяю официальные релизы…');await api('/updates?force=1');renderUpdates();};
  $('#update-selected').onclick=async()=>{const ids=$$('.upd-server:checked').map(x=>Number(x.value));if(!ids.length)return toast('Выберите серверы','error');if(!confirm(`Последовательно обновить XMRig до ${latest}? Сборка на каждом сервере может занять несколько минут.`))return;try{await api('/fleet/actions/rolling-update',{method:'POST',body:{serverIds:ids,version:latest}});toast('Rolling update запущен');renderUpdates();}catch(e){toast(e.message,'error');}};
}

  return { renderUpdates };
}
