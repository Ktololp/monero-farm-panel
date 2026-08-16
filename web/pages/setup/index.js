import { getSetupCopy } from '../../i18n/messages/setup-copy.js';

export function createSetupPage(ctx) {
  const { $, esc, api, toast, setHeader, t, getLocale } = ctx;

  const copy = () => getSetupCopy(getLocale());

  function flag(ok, yes, no) {
    return `<span class="setup-flag ${ok ? 'ok' : 'missing'}">${esc(ok ? yes : no)}</span>`;
  }

  async function loadStatus(serverId) {
    const c = copy();
    const target = $('#setup-xmrig-status');
    if (!target) return;
    target.innerHTML = `<div class="setup-loading">${esc(c.checking)}</div>`;
    try {
      const data = await api(`/setup/servers/${serverId}/status`);
      renderXmrigStatus(serverId, data.xmrig || {});
    } catch (error) {
      target.innerHTML = `<div class="notice warn"><b>${esc(c.unavailable)}</b><br><span class="muted small">${esc(error.message)}</span></div>`;
    }
  }

  function renderXmrigStatus(serverId, status) {
    const c = copy();
    const target = $('#setup-xmrig-status');
    if (!target) return;
    target.innerHTML = `
      <div class="setup-status-grid">
        <div><span>${esc(c.installed)}</span>${flag(status.installed, status.binaryPath || c.yes, c.no)}</div>
        <div><span>${esc(c.version)}</span><b>${esc(status.version || '—')}</b></div>
        <div><span>${esc(c.config)}</span>${flag(status.configExists, c.yes, c.no)}</div>
        <div><span>${esc(c.service)}</span>${flag(status.serviceInstalled, c.yes, c.no)}</div>
        <div><span>${esc(c.autostart)}</span>${flag(status.enabled, c.enabled, c.disabled)}</div>
        <div><span>${esc(c.running)}</span>${flag(status.active, c.active, c.inactive)}</div>
      </div>
      <div class="setup-actions">
        <button id="setup-refresh" class="ghost">${esc(c.refresh)}</button>
        <button id="setup-install-xmrig" class="${status.ready ? 'ghost' : 'primary'}" ${status.ready ? 'disabled' : ''}>${esc(status.ready ? c.installedButton : c.install)}</button>
      </div>`;

    $('#setup-refresh').onclick = () => loadStatus(serverId);
    const install = $('#setup-install-xmrig');
    if (install && !status.ready) install.onclick = async () => {
      if (!confirm(c.confirm)) return;
      try {
        install.disabled = true;
        install.textContent = t('bootstrap.running');
        await api(`/setup/servers/${serverId}/xmrig/install`, { method: 'POST', body: {} });
        toast(c.success);
        await ctx.loadOverview().catch(() => null);
        await loadStatus(serverId);
      } catch (error) {
        toast(error.message, 'error');
        install.disabled = false;
        install.textContent = c.install;
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
          <div class="setup-component-head">
            <div><span class="setup-kicker">MINER SOFTWARE</span><h2>⚒ ${esc(c.xmrig)}</h2></div>
          </div>
          <p class="muted">${esc(c.hint)}</p>
          <div id="setup-xmrig-status"></div>
        </article>
      </div>`;

    const select = $('#setup-server');
    select.onchange = () => loadStatus(Number(select.value));
    await loadStatus(Number(select.value));
  }

  return { renderSetup };
}
