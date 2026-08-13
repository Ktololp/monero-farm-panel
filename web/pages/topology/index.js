export function createTopologyPage(ctx) {
  const { $, esc, fmtHash, setHeader, bindCommonServerActions, t } = ctx;
  let overview = ctx.getOverview();
  const loadOverview = async () => { await ctx.loadOverview(); overview = ctx.getOverview(); };

  async function renderTopology(full=true){
    if(full||!overview)await loadOverview();
    setHeader(t('topology.title'),t('topology.subtitle'));
    $('#view').innerHTML=`<div class="topology-list">${overview.servers.map(s=>`<article class="panel topology-card">
      <div class="topology-title"><button class="link open-server" data-id="${s.id}">${esc(s.icon)} ${esc(s.name)}</button><button class="icon-btn quick-terminal" data-id="${s.id}" title="SSH">⌨</button></div>
      <div class="topology-chain">
        <div class="topo-node ${s.live?.components?.xmrig==='active'?'ok':'bad'}"><b>XMRig</b><span>${fmtHash(s.live?.hash60s)}</span></div><i>→</i>
        <div class="topo-node ${s.live?.components?.p2pool==='active'?'ok':'bad'}"><b>p2pool</b><span>${esc(s.live?.pool||'127.0.0.1:3333')}</span></div><i>→</i>
        <div class="topo-node ${s.live?.components?.monerod==='active'?'ok':'bad'}"><b>monerod</b><span>${s.live?.monero?.syncPercent!=null?`${Number(s.live.monero.syncPercent).toFixed(2)}%`:t('topology.syncUnknown')}</span></div><i>→</i>
        <div class="topo-node ${s.live?.network?.dns&&s.live?.network?.internet?'ok':'bad'}"><b>Internet</b><span>DNS ${s.live?.network?.dns?'OK':'?'} · WAN ${s.live?.network?.internet?'OK':'?'}</span></div>
      </div>
    </article>`).join('')}</div>`;
    bindCommonServerActions();
  }

  return { renderTopology };
}
