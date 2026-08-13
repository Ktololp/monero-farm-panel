export function createSettingsPage(ctx) {
  const { $, $$, esc, api, toast, setHeader, t } = ctx;

  async function renderSettings(){
    const s=await api('/settings');
    setHeader(t('settings.title'),t('settings.subtitle'));

    $('#view').innerHTML=`<div class="settings-tabs">
      <button class="settings-tab active" data-st="mining">${t('settings.tab.mining')}</button>
      <button class="settings-tab" data-st="automation">${t('settings.tab.automation')}</button>
      <button class="settings-tab" data-st="system">${t('settings.tab.system')}</button>
      <button class="settings-tab" data-st="notify">${t('settings.tab.notifications')}</button>
    </div>
    <form id="settings-form" class="settings panel">
      <section data-settings="mining">
        <h2>${t('settings.globalXmrig')}</h2>
        <label>${t('settings.wallet')}<input name="wallet" value="${esc(s.wallet)}"></label>
        <div class="form-grid">
          <label>${t('settings.pool')}<input name="pool_url" value="${esc(s.pool_url)}"></label>
          <label>${t('settings.poolPassword')}<input name="pool_pass" value="${esc(s.pool_pass)}"></label>
          <label>${t('settings.bootstrapVersion')}<input name="xmrig_version" value="${esc(s.xmrig_version)}"></label>
          <label>${t('settings.defaultProfile')}<select name="performance_profile_default">
            <option value="maximum" ${s.performance_profile_default==='maximum'?'selected':''}>${t('profile.maximum.name')}</option>
            <option value="balanced" ${s.performance_profile_default==='balanced'?'selected':''}>${t('profile.balanced.name')}</option>
            <option value="eco" ${s.performance_profile_default==='eco'?'selected':''}>${t('profile.eco.name')}</option>
          </select></label>
        </div>
        <div class="checks">
          <label><input name="pool_tls" type="checkbox" ${s.pool_tls==='1'?'checked':''}> ${t('settings.poolTls')}</label>
          <label><input name="auto_apply_config" type="checkbox" ${s.auto_apply_config==='1'?'checked':''}> ${t('settings.autoApplyPool')}</label>
        </div>
        <h2>${t('settings.degradation')}</h2>
        <div class="form-grid">
          <label>${t('settings.hashDrop')}<input name="hash_drop_percent" type="number" value="${esc(s.hash_drop_percent)}"></label>
          <label>${t('settings.baselineWindow')}<input name="baseline_window_hours" type="number" value="${esc(s.baseline_window_hours)}"></label>
          <label>${t('settings.baselineSamples')}<input name="baseline_min_samples" type="number" value="${esc(s.baseline_min_samples)}"></label>
          <label>${t('settings.tempCritical')}<input name="temp_critical" type="number" value="${esc(s.temp_critical)}"></label>
        </div>
      </section>

      <section data-settings="automation" class="hidden">
        <div class="setting-feature"><div><h2>${t('settings.autoRecovery')}</h2><p>${t('settings.autoRecoveryText')}</p></div>
          <label class="switch"><input name="auto_recovery_enabled" type="checkbox" ${s.auto_recovery_enabled==='1'?'checked':''}><span></span></label>
        </div>
        <div class="form-grid">
          <label>${t('settings.failuresBeforeRestart')}<input name="auto_recovery_failures" type="number" min="1" value="${esc(s.auto_recovery_failures)}"></label>
          <label>${t('settings.cooldownSeconds')}<input name="auto_recovery_cooldown_seconds" type="number" min="60" value="${esc(s.auto_recovery_cooldown_seconds)}"></label>
          <label>${t('settings.graceSeconds')}<input name="grace_period_seconds" type="number" min="15" value="${esc(s.grace_period_seconds)}"></label>
          <label>${t('settings.offlineSeconds')}<input name="offline_after_seconds" type="number" min="15" value="${esc(s.offline_after_seconds)}"></label>
        </div>
        <div class="notice">${t('settings.graceRecommendation')}</div>
      </section>

      <section data-settings="system" class="hidden">
        <h2>Huge Pages / MSR</h2>
        <div class="checks">
          <label><input name="huge_pages_enabled" type="checkbox" ${s.huge_pages_enabled==='1'?'checked':''}> ${t('settings.hugePagesXmrig')}</label>
          <label><input name="huge_pages_1g" type="checkbox" ${s.huge_pages_1g==='1'?'checked':''}> 1 GB Pages</label>
          <label><input name="msr_enabled" type="checkbox" ${s.msr_enabled==='1'?'checked':''}> MSR</label>
        </div>
        <div class="form-grid">
          <label>${t('settings.pages1gCount')}<input name="huge_pages_count" type="number" value="${esc(s.huge_pages_count)}"></label>
          <label>${t('settings.historyDays')}<input name="history_retention_days" type="number" value="${esc(s.history_retention_days)}"></label>
        </div>
        <h2>DNS / Internet</h2>
        <div class="checks">
          <label><input name="network_check_enabled" type="checkbox" ${s.network_check_enabled==='1'?'checked':''}> ${t('settings.checkNetwork')}</label>
          <label><input name="updates_auto_check" type="checkbox" ${s.updates_auto_check==='1'?'checked':''}> ${t('settings.autoCheckUpdates')}</label>
        </div>
        <div class="form-grid">
          <label>${t('settings.dnsHost')}<input name="network_check_host" value="${esc(s.network_check_host)}"></label>
          <label>${t('settings.updateInterval')}<input name="update_check_hours" type="number" value="${esc(s.update_check_hours)}"></label>
        </div>
      </section>

      <section data-settings="notify" class="hidden">
        <h2>Telegram</h2>
        <div class="checks"><label><input name="telegram_enabled" type="checkbox" ${s.telegram_enabled==='1'?'checked':''}> ${t('settings.telegramEnable')}</label></div>
        <div class="form-grid">
          <label>Chat ID<input name="telegram_chat_id" value="${esc(s.telegram_chat_id)}"></label>
          <label>Bot token<input name="telegram_bot_token" type="password" placeholder="${esc(s.telegram_bot_token||t('settings.notSet'))}"></label>
          <label>${t('settings.alertCooldown')}<input name="alert_cooldown_seconds" type="number" value="${esc(s.alert_cooldown_seconds)}"></label>
          <label>${t('settings.tempWarning')}<input name="temp_warn" type="number" value="${esc(s.temp_warn)}"></label>
        </div>
      </section>

      <div class="save-row"><label><input id="apply-all" type="checkbox"> ${t('settings.applyAll')}</label><button class="primary">${t('settings.save')}</button></div>
    </form>`;

    $$('.settings-tab').forEach(b=>b.onclick=()=>{
      $$('.settings-tab').forEach(x=>x.classList.toggle('active',x===b));
      $$('[data-settings]').forEach(x=>x.classList.toggle('hidden',x.dataset.settings!==b.dataset.st));
    });

    $('#settings-form').onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(e.currentTarget),settings={};
      for(const[k,v]of f.entries())settings[k]=v;
      for(const k of ['pool_tls','auto_apply_config','auto_recovery_enabled','huge_pages_enabled','huge_pages_1g','msr_enabled','network_check_enabled','updates_auto_check','telegram_enabled'])settings[k]=e.currentTarget.elements[k].checked?'1':'0';
      try{
        const r=await api('/settings',{method:'PUT',body:{settings,applyAll:$('#apply-all').checked}});
        const failed=r.applyResults?.filter(x=>!x.ok)||[];
        toast(failed.length?t('settings.savedErrors',{count:failed.length}):t('settings.saved'),failed.length?'error':'ok');
      }catch(err){toast(err.message,'error');}
    };
  }

  return { renderSettings };
}
