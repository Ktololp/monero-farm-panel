export function createAuditPage(ctx) {
  const { $, $$, esc, fmtHash, fmtTemp, fmtMHz, fmtUptime, fmtDate, fmtUsd, fmtPct, sleep, api, toast, setHeader, navigate, openServerForm, bootstrapModal, openTerminal, bindCommonServerActions, statusBadge, compBadge, serverById, jobsPanel, Chart, hashrateScale, temperatureScale, charts, destroyCharts } = ctx;
  let overview = ctx.getOverview();
  let currentServerId = ctx.getCurrentServerId();
  let currentServerTab = ctx.getCurrentServerTab();
  const recalcSummary = () => ctx.recalcSummary();
  const loadOverview = async () => { const result = await ctx.loadOverview(); overview = ctx.getOverview(); return result; };

async function renderAudit(){const rows=await api('/actions?limit=300');setHeader('Журнал действий','Подключения, автоматика, изменения и ошибки');$('#view').innerHTML=`<div class="panel table-wrap"><table><thead><tr><th>Время</th><th>Действие</th><th>Сервер</th><th>Статус</th><th>IP</th><th>Детали</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDate(r.ts)}</td><td>${esc(r.action)}</td><td>${esc(r.server_name||'—')}</td><td><span class="pill ${r.status==='ok'?'online':'error'}">${esc(r.status)}</span></td><td>${esc(r.ip||'')}</td><td class="details">${esc(r.details||'')}</td></tr>`).join('')}</tbody></table></div>`;}

  return { renderAudit };
}
