import { getSetupCopy } from '../../i18n/messages/setup-copy.js';

export function createSetupPage(ctx) {
  const { $, esc, api, toast, setHeader, t, getLocale } = ctx;
  const copy = () => getSetupCopy(getLocale());
  let selectedMode = 'pruned';

  function flag(ok, yes, no) {
    return `<span class="setup-flag ${ok ? 'ok' : 'missing'}">${esc(ok ? yes : no)}</span>`;
  }

  function modeLabel(status, c) {
    if (status.mode === 'pruned') return c.modePruned;
    if (status.mode === 'full') return c.modeFull;
    return c.modeUnknown;
  }

  function rpcLabel(status, c) {
    const endpoint = status.rpcEndpoint || '—';
    if (status.rpcAvailable) return `${endpoint} · ${c.available}`;
    if (status.rpcAuthRequired) return `${endpoint} · ${c.rpcAuthRequired}`;
    return `${endpoint} · ${c.unavailableShort}`;
  }

  async function loadStatus(serverId) {
    const c = copy();
    for (const id of ['#setup-xmrig-status', '#setup-monerod-status', '#setup-tor-status']) {
      const target = $(id);
      if (target) target.innerHTML = `<div class="setup-loading">${esc(c.checking)}</div>`;
    }
    try {
      const data = await api(`/setup/servers/${serverId}/status`);
      renderXmrigStatus(serverId, data.xmrig || {});
      renderMonerodStatus(serverId, data.monerod || {});
      renderTorStatus(serverId, data.monerod || {}, data.tor || {});
    } catch (error) {
      const html = `<div class="notice warn"><b>${esc(c.unavailable)}</b><br><span class="muted small">${esc(error.message)}</span></div>`;
      for (const id of ['#setup-xmrig-status', '#setup-monerod-status', '#setup-tor-status']) {
        const target = $(id);
        if (target) target.innerHTML = html;
      }
    }
  }

  function renderXmrigStatus(serverId, status) {
    const c = copy();
    const target = $('#setup-xmrig-status');
    if (!target) return;
    const fileState = status.installed
      ? flag(true, status.binaryPath || c.yes, c.no)
      : status.detected
        ? flag(true, c.xmrigProcessDetected, c.no)
        : flag(false, c.yes, c.no);
    target.innerHTML = `
      <div class="setup-status-grid">
        <div><span>${esc(c.xmrigFile)}</span>${fileState}</div>
        <div><span>${esc(c.version)}</span><b>${esc(status.version || '—')}</b></div>
        <div><span>${esc(c.config)}</span>${status.configExists ? flag(true, status.configPath || c.yes, c.no) : flag(false, c.yes, c.no)}</div>
        <div><span>${esc(c.service)}</span>${flag(status.serviceInstalled, c.yes, c.no)}</div>
        <div><span>${esc(c.autostart)}</span>${flag(status.enabled, c.enabled, c.disabled)}</div>
        <div><span>${esc(c.running)}</span>${flag(status.active, c.active, c.inactive)}</div>
      </div>
      <div class="setup-actions">
        <button class="ghost setup-refresh">${esc(c.refresh)}</button>
        <button id="setup-install-xmrig" class="${status.ready ? 'ghost' : 'primary'}" ${status.ready ? 'disabled' : ''}>${esc(status.ready ? c.xmrigReady : c.xmrigInstall)}</button>
      </div>`;

    target.querySelector('.setup-refresh').onclick = () => loadStatus(serverId);
    const install = $('#setup-install-xmrig');
    if (install && !status.ready) install.onclick = async () => {
      if (!confirm(c.xmrigConfirm)) return;
      try {
        install.disabled = true;
        install.textContent = t('bootstrap.running');
        await api(`/setup/servers/${serverId}/xmrig/install`, { method: 'POST', body: {} });
        toast(c.xmrigSuccess);
        await ctx.loadOverview().catch(() => null);
        await loadStatus(serverId);
      } catch (error) {
        toast(error.message, 'error');
        install.disabled = false;
        install.textContent = c.xmrigInstall;
      }
    };
  }

  function renderMonerodStatus(serverId, status) {
    const c = copy();
    const target = $('#setup-monerod-status');
    if (!target) return;
    const detected = Boolean(status.running);
    if (detected && ['pruned', 'full'].includes(status.mode)) selectedMode = status.mode;
    target.innerHTML = `
      <div class="setup-choice-row">
        <label><span>${esc(c.nodeType)}</span>
          <select id="setup-node-mode" ${detected ? 'disabled' : ''}>
            <option value="pruned" ${selectedMode === 'pruned' ? 'selected' : ''}>${esc(c.nodePruned)}</option>
            <option value="full" ${selectedMode === 'full' ? 'selected' : ''}>${esc(c.nodeFull)}</option>
          </select>
        </label>
        <div class="setup-mode-help">
          <b>${esc(selectedMode === 'pruned' ? c.nodePruned : c.nodeFull)}</b>
          <span>${esc(selectedMode === 'pruned' ? c.nodePrunedHelp : c.nodeFullHelp)}</span>
        </div>
      </div>
      <div class="setup-status-grid setup-status-grid-4">
        <div><span>${esc(c.monerodFile)}</span>${status.installed ? flag(true, status.binaryPath || c.yes, c.no) : status.detected ? flag(true, c.monerodProcessDetected, c.no) : flag(false, c.yes, c.no)}</div>
        <div><span>${esc(c.version)}</span><b>${esc(status.version || '—')}</b></div>
        <div><span>${esc(c.config)}</span>${status.configExists ? `<b>${esc(status.configPath || c.yes)}</b>` : flag(false, c.yes, c.no)}</div>
        <div><span>${esc(c.nodeType)}</span><b>${esc(modeLabel(status, c))}</b></div>
        <div><span>${esc(c.service)}</span>${flag(status.serviceInstalled, c.yes, c.no)}</div>
        <div><span>${esc(c.autostart)}</span>${flag(status.enabled, c.enabled, c.disabled)}</div>
        <div><span>${esc(c.running)}</span>${flag(status.active, c.active, c.inactive)}</div>
        <div><span>${esc(c.rpc)}</span>${flag(status.rpcAvailable, rpcLabel(status, c), rpcLabel(status, c))}</div>
      </div>
      <div class="setup-actions">
        <button class="ghost setup-refresh">${esc(c.refresh)}</button>
        <button id="setup-install-monerod" class="${detected ? 'ghost' : 'primary'}" ${detected ? 'disabled' : ''}>${esc(detected ? c.monerodDetected : c.installMonerod)}</button>
      </div>`;

    target.querySelector('.setup-refresh').onclick = () => loadStatus(serverId);
    const mode = $('#setup-node-mode');
    if (mode && !detected) mode.onchange = () => {
      selectedMode = mode.value;
      renderMonerodStatus(serverId, status);
    };
    const install = $('#setup-install-monerod');
    if (install && !detected) install.onclick = async () => {
      if (!confirm(c.monerodConfirm)) return;
      try {
        install.disabled = true;
        install.textContent = t('bootstrap.running');
        await api(`/setup/servers/${serverId}/monerod/install`, { method: 'POST', body: { mode: selectedMode } });
        toast(c.monerodSuccess);
        await ctx.loadOverview().catch(() => null);
        await loadStatus(serverId);
      } catch (error) {
        toast(error.message, 'error');
        install.disabled = false;
        install.textContent = c.installMonerod;
      }
    };
  }

  function renderTorStatus(serverId, monerod, status) {
    const c = copy();
    const target = $('#setup-tor-status');
    if (!target) return;
    const canConfigure = Boolean(monerod.torConfigurable);
    let blocker = '';
    if (!monerod.running) blocker = c.torNeedsMonerod;
    else if (!monerod.configExists || !monerod.configPath) blocker = c.torNeedsConfig;

    target.innerHTML = `
      <div class="setup-status-grid">
        <div><span>${esc(c.torPackage)}</span>${flag(status.installed, c.yes, c.no)}</div>
        <div><span>${esc(c.running)}</span>${flag(status.active, c.active, c.inactive)}</div>
        <div><span>${esc(c.autostart)}</span>${flag(status.enabled, c.enabled, c.disabled)}</div>
        <div><span>${esc(c.torConfig)}</span>${flag(status.torrcConfigured, c.yes, c.no)}</div>
        <div><span>${esc(c.monerodTorConfig)}</span>${flag(status.monerodConfigured, c.yes, c.no)}</div>
        <div><span>${esc(c.onion)}</span><b class="setup-onion">${esc(status.onion || '—')}</b></div>
      </div>
      ${blocker ? `<div class="notice warn setup-inline-notice">${esc(blocker)}</div>` : ''}
      <div class="setup-actions">
        <button class="ghost setup-refresh">${esc(c.refresh)}</button>
        <button id="setup-configure-tor" class="${status.ready ? 'ghost' : 'primary'}" ${status.ready || !canConfigure ? 'disabled' : ''}>${esc(status.ready ? c.torReady : c.configureTor)}</button>
      </div>`;

    target.querySelector('.setup-refresh').onclick = () => loadStatus(serverId);
    const button = $('#setup-configure-tor');
    if (button && canConfigure && !status.ready) button.onclick = async () => {
      if (!confirm(c.torConfirm)) return;
      try {
        button.disabled = true;
        button.textContent = t('bootstrap.running');
        await api(`/setup/servers/${serverId}/monerod/tor`, { method: 'POST', body: {} });
        toast(c.torSuccess);
        await loadStatus(serverId);
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
        button.textContent = c.configureTor;
      }
    };
  }

  async function renderSetup() {
    let overview = ctx.getOverview();
    if (!overview) {
      await ctx.loadOverview();
      overview = ctx.getOverview();
    }
    const c = copy();
    setHeader(c.title, c.subtitle);
    const servers = overview?.servers || [];
    if (!servers.length) {
      $('#view').innerHTML = `<div class="setup-page"><div class="panel empty">${esc(c.noServers)}</div></div>`;
      return;
    }

    $('#view').innerHTML = `
      <div class="setup-page">
        <div class="panel setup-server-picker">
          <label><span>${esc(c.server)}</span>
            <select id="setup-server">${servers.map(s => `<option value="${s.id}">${esc(s.icon || '🖥️')} ${esc(s.name)} — ${esc(s.host)}</option>`).join('')}</select>
          </label>
        </div>
        <article class="panel setup-component-card">
          <div class="setup-component-head"><div><span class="setup-kicker">MINER SOFTWARE</span><h2>⚒ ${esc(c.xmrig)}</h2></div></div>
          <p class="muted">${esc(c.xmrigHint)}</p>
          <div id="setup-xmrig-status"></div>
        </article>
        <article class="panel setup-component-card setup-node-card">
          <div class="setup-component-head"><div><span class="setup-kicker">BLOCKCHAIN NODE</span><h2>◉ ${esc(c.monerod)}</h2></div></div>
          <p class="muted">${esc(c.monerodHint)}</p>
          <div id="setup-monerod-status"></div>
        </article>
        <article class="panel setup-component-card setup-tor-card">
          <div class="setup-component-head"><div><span class="setup-kicker">PRIVATE P2P</span><h2 class="setup-title-with-icon"><img class="setup-title-icon" src="/assets/icons/tor.svg" alt="" aria-hidden="true">${esc(c.tor)}</h2></div></div>
          <p class="muted">${esc(c.torHint)}</p>
          <div id="setup-tor-status"></div>
        </article>
      </div>`;

    const select = $('#setup-server');
    select.onchange = () => {
      selectedMode = 'pruned';
      loadStatus(Number(select.value));
    };
    await loadStatus(Number(select.value));
  }

  return { renderSetup };
}
