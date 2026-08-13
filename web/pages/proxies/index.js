export function createProxiesPage(ctx) {
  const { $, esc, fmtHash, helpIcon, api, toast, setHeader, navigate, t } = ctx;
  let overview = ctx.getOverview();
  const loadOverview = async () => { await ctx.loadOverview(); overview = ctx.getOverview(); };
  const routedThroughProxy = server => /^(?:127\.0\.0\.1|localhost|\[::1\]):3334$/i.test(String(server.live?.pool || '').trim());

  async function installProxy(serverId, button) {
    if (!confirm(t('proxy.installConfirm'))) return;
    const old = button?.textContent;
    try {
      if (button) { button.disabled = true; button.textContent = t('proxy.installing'); }
      const r = await api(`/servers/${serverId}/actions/install-xmrig-proxy`, { method: 'POST', body: {} });
      toast(r.alreadyInstalled ? t('proxy.alreadyInstalled') : t('proxy.installed',{version:r.version,port:r.bindPort}));
      await api(`/servers/${serverId}/poll`, { method: 'POST' }).catch(() => null);
      await loadOverview();
      await renderProxies();
    } catch (e) {
      toast(e.message, 'error');
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  async function switchToProxy(serverId, button) {
    if (!confirm(t('proxy.switchConfirm'))) return;
    const old = button?.textContent;
    try {
      if (button) { button.disabled = true; button.textContent = t('proxy.switching'); }
      const r = await api(`/servers/${serverId}/actions/xmrig-to-proxy`, { method: 'POST', body: {} });
      toast(r.alreadyConfigured ? t('proxy.alreadyRouted') : t('proxy.routed'));
      await loadOverview();
      await renderProxies();
    } catch (e) {
      toast(e.message, 'error');
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  async function renderProxies() {
    if (!overview) await loadOverview();
    setHeader('XMRig Proxy', t('proxy.subtitle'));

    const allServers = overview.servers || [];
    const detected = allServers.filter(s => s.live?.proxy?.detected || s.live?.components?.xmrigProxy === 'active');
    const missing = allServers.filter(s => !(s.live?.proxy?.detected || s.live?.components?.xmrigProxy === 'active'));

    const installPanel = missing.length ? `
      <section class="panel">
        <div class="panel-head"><div><h2>⇄ ${t('proxy.installTitle')} ${helpIcon(t('proxy.installHelp'))}</h2><span class="muted small">${t('proxy.installNote')}</span></div></div>
        <div class="proxy-install-grid">${missing.map(s => `
          <article class="proxy-install-card">
            <div><b>${esc(s.icon || '🖥️')} ${esc(s.name)}</b><small>${esc(s.username)}@${esc(s.host)}</small></div>
            <button class="primary proxy-install" data-id="${s.id}">⇄ ${t('proxy.install')}</button>
          </article>`).join('')}</div>
        <div class="notice">${t('proxy.defaultPorts')}</div>
      </section>` : '';

    const proxyPanels = detected.map(s => {
      const q = s.live?.proxy || {};
      const routed = routedThroughProxy(s);
      const workers = (q.workers || []).slice(0, 100).map(w => `
        <tr><td>${esc(w.name || 'worker')}</td><td>${esc(w.ip || '—')}</td><td>${w.connections ?? '—'}</td><td>${fmtHash(Number(w.hashrate1m))}</td><td>${fmtHash(Number(w.hashrate10m))}</td><td>${fmtHash(Number(w.hashrate1h))}</td><td>${w.accepted ?? 0}</td><td>${w.rejected ?? 0}</td><td>${w.invalid ?? 0}</td></tr>`).join('');
      return `<section class="panel proxy-panel">
        <div class="panel-head"><div><h2>⇄ ${esc(s.name)} ${helpIcon(t('proxy.serverHelp'))}</h2><span class="muted small">${esc(s.username)}@${esc(s.host)} · API ${q.apiPort || 'auto'} · ${q.available ? 'online' : 'API unavailable'} · XMRig: ${routed ? t('proxy.viaProxy') : esc(s.live?.pool || t('proxy.direct'))}</span></div><div class="button-row"><button class="ghost proxy-refresh" data-id="${s.id}">↻ ${t('proxy.refresh')}</button><button class="ghost proxy-server" data-id="${s.id}">${t('proxy.openServer')}</button></div></div>
        <div class="button-row proxy-routing-actions">
          ${routed ? `<button class="ghost" disabled>✓ ${t('proxy.alreadyUses')}</button>` : q.available ? `<button class="primary proxy-switch" data-id="${s.id}">⚡ ${t('proxy.switch')}</button>` : `<button class="ghost" disabled>${t('proxy.apiBlocked')}</button>`}
        </div>
        <div class="stats farm-overview-stats">
          <div class="stat"><span>⚡ Hashrate ${helpIcon(t('proxy.hashrateHelp'))}</span><b>${fmtHash(Number(q.hashrate?.[1] ?? q.hashrate?.[0]))}</b></div>
          <div class="stat"><span>👷 Workers ${helpIcon(t('proxy.workersHelp'))}</span><b>${q.workerCount ?? q.workers?.length ?? 0}</b></div>
          <div class="stat"><span>🔌 Miners now / max</span><b>${q.minersNow ?? 0} / ${q.minersMax ?? 0}</b></div>
          <div class="stat"><span>✅ Accepted</span><b>${q.results?.accepted ?? 0}</b><small>rejected ${q.results?.rejected ?? 0} · invalid ${q.results?.invalid ?? 0}</small></div>
          <div class="stat"><span>⇡ Upstreams ${helpIcon(t('proxy.upstreamsHelp'))}</span><b>${q.upstreams?.active ?? '—'} / ${q.upstreams?.total ?? '—'}</b></div>
        </div>
        ${q.available ? `<div class="table-wrap"><table><thead><tr><th>Worker</th><th>IP</th><th>Conn</th><th>1m</th><th>10m</th><th>1h</th><th>Accepted</th><th>Rejected</th><th>Invalid</th></tr></thead><tbody>${workers || `<tr><td colspan="9" class="empty">${t('proxy.noWorkers')}</td></tr>`}</tbody></table></div>` : `<div class="notice warn">${t('proxy.processNoApi')}</div>`}
      </section>`;
    }).join('');

    $('#view').innerHTML = installPanel + (proxyPanels || (!allServers.length ? `<div class="panel"><div class="empty">${t('proxy.addServerFirst')}</div></div>` : ''));

    document.querySelectorAll('.proxy-install').forEach(b => b.onclick = () => installProxy(Number(b.dataset.id), b));
    document.querySelectorAll('.proxy-switch').forEach(b => b.onclick = () => switchToProxy(Number(b.dataset.id), b));
    document.querySelectorAll('.proxy-server').forEach(b => b.onclick = () => navigate('server', Number(b.dataset.id), 'components'));
    document.querySelectorAll('.proxy-refresh').forEach(b => b.onclick = async () => {
      try {
        b.disabled = true;
        await api(`/servers/${b.dataset.id}/poll`, { method: 'POST' });
        await loadOverview();
        await renderProxies();
      } catch (e) { toast(e.message, 'error'); }
      finally { b.disabled = false; }
    });
  }

  return { renderProxies };
}
