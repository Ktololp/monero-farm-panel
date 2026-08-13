export function createUpdatesPage(ctx) {
  const { $, $$, esc, fmtDate, api, toast, setHeader, jobsPanel, t } = ctx;

  async function renderUpdates(){
    const u=await api('/updates');
    const jobs=await api('/jobs?limit=8');
    setHeader(t('updates.title'),t('updates.subtitle'),`<button id="check-updates" class="ghost">${t('updates.checkNow')}</button>`);
    const latest=u.data?.xmrig?.version||'—';
    const statusLabel=status=>t(`updates.status.${status||'unknown'}`);

    $('#view').innerHTML=`<div class="stats">
      <div class="stat"><span>XMRig latest</span><b>${esc(latest)}</b></div>
      <div class="stat"><span>p2pool latest</span><b>${esc(u.data?.p2pool?.version||'—')}</b></div>
      <div class="stat"><span>Monero latest</span><b>${esc(u.data?.monero?.version||'—')}</b></div>
      <div class="stat"><span>${t('updates.lastCheck')}</span><b class="small-value">${fmtDate(u.ts)}</b></div>
    </div>
    ${u.error?`<div class="notice warn">GitHub API: ${esc(u.error)}</div>`:''}
    <div class="panel table-wrap">
      <div class="panel-head"><h2>${t('updates.xmrigServers')}</h2><button id="update-selected" class="primary" ${latest==='—'?'disabled':''}>${t('updates.rollingTo',{version:esc(latest)})}</button></div>
      <table><thead><tr><th></th><th>${t('updates.server')}</th><th>${t('updates.installed')}</th><th>${t('updates.status')}</th><th>p2pool</th><th>monerod</th></tr></thead>
      <tbody>${u.servers.map(s=>`<tr><td><input class="upd-server" type="checkbox" value="${s.id}" ${s.xmrigStatus==='update'?'checked':''}></td><td>${esc(s.icon)} ${esc(s.name)}</td><td>${esc(s.installedXmrig||t('updates.notDetected'))}</td><td><span class="pill ${s.xmrigStatus==='current'?'online':s.xmrigStatus==='update'?'warn':''}">${esc(statusLabel(s.xmrigStatus))}</span></td><td>${esc(s.p2poolVersion||'—')}</td><td>${esc(s.monerodVersion||'—')}</td></tr>`).join('')}</tbody></table>
      <p class="muted small">${t('updates.rollingHint')}</p>
    </div>${jobsPanel(jobs)}`;

    $('#check-updates').onclick=async()=>{toast(t('updates.checking'));await api('/updates?force=1');renderUpdates();};
    $('#update-selected').onclick=async()=>{
      const ids=$$('.upd-server:checked').map(x=>Number(x.value));
      if(!ids.length)return toast(t('updates.selectServers'),'error');
      if(!confirm(t('updates.confirm',{version:latest})))return;
      try{
        await api('/fleet/actions/rolling-update',{method:'POST',body:{serverIds:ids,version:latest}});
        toast(t('updates.started'));
        renderUpdates();
      }catch(e){toast(e.message,'error');}
    };
  }

  return { renderUpdates };
}
