export function createProxiesPage(ctx) {
  const { $, esc, fmtHash, helpIcon, api, toast, setHeader, navigate } = ctx;
  let overview = ctx.getOverview();
  const loadOverview = async () => { await ctx.loadOverview(); overview = ctx.getOverview(); };
  const routedThroughProxy = server => /^(?:127\.0\.0\.1|localhost|\[::1\]):3334$/i.test(String(server.live?.pool || '').trim());

  async function installProxy(serverId, button) {
    if (!confirm('Установить официальный XMRig Proxy на этот сервер?\n\nStratum: 0.0.0.0:3334\nHTTP API: 127.0.0.1:60051\nUpstream: из Настройки → Майнинг\n\nТекущий XMRig автоматически переключён НЕ будет.')) return;
    const old = button?.textContent;
    try {
      if (button) { button.disabled = true; button.textContent = 'Установка…'; }
      const r = await api(`/servers/${serverId}/actions/install-xmrig-proxy`, { method: 'POST', body: {} });
      toast(r.alreadyInstalled ? 'XMRig Proxy уже установлен' : `XMRig Proxy ${r.version} установлен · порт ${r.bindPort}`);
      await api(`/servers/${serverId}/poll`, { method: 'POST' }).catch(() => null);
      await loadOverview();
      await renderProxies();
    } catch (e) {
      toast(e.message, 'error');
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  async function switchToProxy(serverId, button) {
    if (!confirm('Перевести XMRig на XMRig Proxy?\n\nПанель сделает backup config.json, заменит pool на 127.0.0.1:3334 и перезапустит майнинг. Если хешрейт не восстановится, исходный config будет возвращён автоматически.\n\nОперация может занять 1–4 минуты.')) return;
    const old = button?.textContent;
    try {
      if (button) { button.disabled = true; button.textContent = 'Переключение…'; }
      const r = await api(`/servers/${serverId}/actions/xmrig-to-proxy`, { method: 'POST', body: {} });
      toast(r.alreadyConfigured ? 'XMRig уже использует XMRig Proxy' : 'XMRig переведён на XMRig Proxy');
      await loadOverview();
      await renderProxies();
    } catch (e) {
      toast(e.message, 'error');
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  async function renderProxies() {
    if (!overview) await loadOverview();
    setHeader('XMRig Proxy', 'Установка, безопасное переключение XMRig, workers, hashrate и upstream-соединения');

    const allServers = overview.servers || [];
    const detected = allServers.filter(s => s.live?.proxy?.detected || s.live?.components?.xmrigProxy === 'active');
    const missing = allServers.filter(s => !(s.live?.proxy?.detected || s.live?.components?.xmrigProxy === 'active'));

    const installPanel = missing.length ? `
      <section class="panel">
        <div class="panel-head"><div><h2>⇄ Установить XMRig Proxy ${helpIcon('Панель скачает последний стабильный официальный linux-static-x64 релиз, проверит SHA256, создаст config.json и systemd service. Повторная установка уже запущенного Proxy блокируется и в интерфейсе, и на сервере.')}</h2><span class="muted small">Установка не меняет существующий XMRig и не открывает firewall автоматически.</span></div></div>
        <div class="proxy-install-grid">${missing.map(s => `
          <article class="proxy-install-card">
            <div><b>${esc(s.icon || '🖥️')} ${esc(s.name)}</b><small>${esc(s.username)}@${esc(s.host)}</small></div>
            <button class="primary proxy-install" data-id="${s.id}">⇄ Установить</button>
          </article>`).join('')}</div>
        <div class="notice">По умолчанию Proxy слушает <code>0.0.0.0:3334</code>, а HTTP API — только <code>127.0.0.1:60051</code>. После установки майнер можно безопасно переключить отдельной кнопкой.</div>
      </section>` : '';

    const proxyPanels = detected.map(s => {
      const q = s.live?.proxy || {};
      const routed = routedThroughProxy(s);
      const workers = (q.workers || []).slice(0, 100).map(w => `
        <tr><td>${esc(w.name || 'worker')}</td><td>${esc(w.ip || '—')}</td><td>${w.connections ?? '—'}</td><td>${fmtHash(Number(w.hashrate1m))}</td><td>${fmtHash(Number(w.hashrate10m))}</td><td>${fmtHash(Number(w.hashrate1h))}</td><td>${w.accepted ?? 0}</td><td>${w.rejected ?? 0}</td><td>${w.invalid ?? 0}</td></tr>`).join('');
      return `<section class="panel proxy-panel">
        <div class="panel-head"><div><h2>⇄ ${esc(s.name)} ${helpIcon('XMRig Proxy на этом сервере. Повторная установка не предлагается. Для перевода майнера используется отдельная операция с backup и автоматическим rollback.')}</h2><span class="muted small">${esc(s.username)}@${esc(s.host)} · API ${q.apiPort || 'auto'} · ${q.available ? 'online' : 'API unavailable'} · XMRig: ${routed ? 'через Proxy' : esc(s.live?.pool || 'напрямую')}</span></div><div class="button-row"><button class="ghost proxy-refresh" data-id="${s.id}">↻ Обновить</button><button class="ghost proxy-server" data-id="${s.id}">Открыть сервер</button></div></div>
        <div class="button-row proxy-routing-actions">
          ${routed ? '<button class="ghost" disabled>✓ XMRig уже использует XMRig Proxy</button>' : q.available ? `<button class="primary proxy-switch" data-id="${s.id}">⚡ Перевести XMRig на XMRig Proxy</button>` : '<button class="ghost" disabled>API Proxy недоступен — переключение заблокировано</button>'}
        </div>
        <div class="stats farm-overview-stats"><div class="stat"><span>⚡ Hashrate ${helpIcon('Суммарный хешрейт через XMRig Proxy.')}</span><b>${fmtHash(Number(q.hashrate?.[1] ?? q.hashrate?.[0]))}</b></div><div class="stat"><span>👷 Workers ${helpIcon('Логические workers, которые Proxy видит по подключениям.')}</span><b>${q.workerCount ?? q.workers?.length ?? 0}</b></div><div class="stat"><span>🔌 Miners now / max</span><b>${q.minersNow ?? 0} / ${q.minersMax ?? 0}</b></div><div class="stat"><span>✅ Accepted</span><b>${q.results?.accepted ?? 0}</b><small>rejected ${q.results?.rejected ?? 0} · invalid ${q.results?.invalid ?? 0}</small></div><div class="stat"><span>⇡ Upstreams ${helpIcon('Соединения XMRig Proxy с upstream pool/P2Pool.')}</span><b>${q.upstreams?.active ?? '—'} / ${q.upstreams?.total ?? '—'}</b></div></div>
        ${q.available ? `<div class="table-wrap"><table><thead><tr><th>Worker</th><th>IP</th><th>Conn</th><th>1m</th><th>10m</th><th>1h</th><th>Accepted</th><th>Rejected</th><th>Invalid</th></tr></thead><tbody>${workers || '<tr><td colspan="9" class="empty">Workers пока нет</td></tr>'}</tbody></table></div>` : `<div class="notice warn">Процесс XMRig Proxy найден, но HTTP API недоступен. Переключение XMRig заблокировано, пока API не станет доступен.</div>`}
      </section>`;
    }).join('');

    $('#view').innerHTML = installPanel + (proxyPanels || (!allServers.length ? '<div class="panel"><div class="empty">Сначала добавьте сервер.</div></div>' : ''));

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
