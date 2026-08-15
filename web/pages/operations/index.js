export function createOperationsPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts, t } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };

async function renderOperations(){
  await loadOverview();
  const profiles=await api('/profiles'),jobs=await api('/jobs?limit=8');
  setHeader(t('operations.title'),t('operations.subtitle'));
  const profileText=p=>({name:t(`profile.${p.id}.name`),description:t(`profile.${p.id}.description`)});
  const checks=overview.servers.map(s=>`<label class="server-check"><input type="checkbox" class="op-server" value="${s.id}" checked><span>${esc(s.icon)} ${esc(s.name)}</span><small>${fmtHash(s.live?.hash60s)}</small></label>`).join('');
  $('#view').innerHTML=`<div class="operations-page"><div class="grid2"><div class="panel"><h2>${t('operations.selectServers')}</h2><p class="muted">${t('operations.rollingHint')}</p><div class="server-check-list">${checks}</div></div><div class="panel operations-restart"><h2>Rolling restart</h2><p class="muted">${t('operations.restartHint')}</p><button id="rolling-restart" class="primary">${t('operations.startRestart')}</button></div></div>
  <div class="panel operations-profiles"><div class="panel-head"><div><h2>${t('operations.profiles')}</h2><span class="muted small">${t('operations.profilesHint')}</span></div></div><div class="profile-grid">${profiles.map(p=>{const pt=profileText(p);return `<article class="profile-card"><b>${esc(pt.name)}</b><strong>${p.percent}%</strong><p>${esc(pt.description)}</p><button class="ghost apply-profile" data-profile="${p.id}">${t('operations.applySelected')}</button></article>`;}).join('')}</div></div>
  ${jobsPanel(jobs)}</div>`;
  const ids=()=>$$('.op-server:checked').map(x=>Number(x.value));
  $('#rolling-restart').onclick=async()=>{if(!ids().length)return toast(t('operations.selectAtLeastOne'),'error');if(!confirm(t('operations.restartConfirm')))return;try{await api('/fleet/actions/rolling-restart',{method:'POST',body:{serverIds:ids()}});toast(t('operations.restartStarted'));await sleep(500);renderOperations();}catch(e){toast(e.message,'error');}};
  $$('.apply-profile').forEach(b=>b.onclick=async()=>{const selected=ids();if(!selected.length)return toast(t('operations.selectServersError'),'error');b.disabled=true;let errors=0;for(const id of selected){try{await api(`/servers/${id}/actions/profile`,{method:'POST',body:{profile:b.dataset.profile}});}catch{errors++;}}toast(errors?t('operations.doneErrors',{count:errors}):t('operations.profileApplied'),errors?'error':'ok');b.disabled=false;await loadOverview();});
}

  return { renderOperations };
}
