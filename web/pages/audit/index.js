export function createAuditPage(ctx) {
  const { $, esc, fmtDate, api, setHeader, t } = ctx;

  async function renderAudit(){
    const rows=await api('/actions?limit=300');
    setHeader(t('audit.title'),t('audit.subtitle'));
    $('#view').innerHTML=`<div class="panel table-wrap"><table><thead><tr>
      <th>${t('audit.time')}</th><th>${t('audit.action')}</th><th>${t('audit.server')}</th><th>${t('audit.status')}</th><th>IP</th><th>${t('audit.details')}</th>
    </tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDate(r.ts)}</td><td>${esc(r.action)}</td><td>${esc(r.server_name||'—')}</td><td><span class="pill ${r.status==='ok'?'online':'error'}">${esc(r.status)}</span></td><td>${esc(r.ip||'')}</td><td class="details">${esc(r.details||'')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  return { renderAudit };
}
