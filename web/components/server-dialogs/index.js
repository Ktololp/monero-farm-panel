// Shared Add/Edit Server and Bootstrap dialogs.
// Kept outside app/main.js so main remains a small composition root.
export function createServerDialogs(ctx) {
  const { $, esc, t, api, toast, modal, closeModal, renderServer, loadOverview, navigate } = ctx;

  function openServerForm(s=null){
    const editing=Boolean(s);
    modal(`<form id="server-form" class="modal-form">
      <div class="modal-head"><h2>${editing?t('serverForm.editTitle'):t('serverForm.addTitle')}</h2><button type="button" id="close-modal" class="ghost">✕</button></div>
      <div class="form-grid">
        <label>${t('serverForm.name')}<input name="name" value="${esc(s?.name||'')}"></label>
        <label>${t('serverForm.icon')}<input name="icon" maxlength="8" value="${esc(s?.icon||'🖥️')}" placeholder="🖥️"></label>
        <label>${t('serverForm.host')}<input name="host" required value="${esc(s?.host||'')}"></label>
        <label>${t('serverForm.sshPort')}<input name="port" type="number" value="${s?.port||22}"></label>
        <label>${t('serverForm.username')}<input name="username" required value="${esc(s?.username||'monitor')}"></label>
        <label>${t('serverForm.auth')}<select name="authType">
          <option value="password" ${!s||s?.authType==='password'?'selected':''}>${t('serverForm.password')}</option>
          <option value="agent" ${s?.authType==='agent'?'selected':''}>${t('serverForm.agent')}</option>
          <option value="key" ${s?.authType==='key'?'selected':''}>${t('serverForm.privateKey')}</option>
        </select></label>
        <label id="ssh-password-field">${t('serverForm.sshPassword')}<input name="password" type="password" placeholder="${s?.hasPassword?t('serverForm.saved'):t('serverForm.sshPasswordPlaceholder')}"></label>
        <label>${t('serverForm.sudoPassword')}<input name="sudoPassword" type="password" placeholder="${s?.hasSudoPassword?t('serverForm.saved'):t('serverForm.sudoEmpty')}"></label>
      </div>
      <div id="ssh-agent-help" class="auth-help hidden">${t('serverForm.agentHelp')}</div>
      <div id="ssh-key-fields" class="hidden">
        <label>${t('serverForm.privateKeyLabel')}<textarea name="privateKey" rows="5" placeholder="${s?.hasPrivateKey?t('serverForm.keySaved'):'-----BEGIN OPENSSH PRIVATE KEY-----'}"></textarea></label>
        <label>${t('serverForm.passphrase')}<input name="privateKeyPassphrase" type="password"></label>
      </div>
      <details class="advanced"><summary>${t('serverForm.advanced')}</summary><div class="form-grid">
        <label>${t('serverForm.xmrigApi')}<input name="xmrigApiPort" type="number" value="${s?.xmrigApiPort||60050}"></label>
        <label>${t('serverForm.configPath')}<input name="xmrigConfigPath" value="${esc(s?.xmrigConfigPath||'/opt/xmrig/config.json')}"></label>
        <label>${t('serverForm.xmrigService')}<input name="xmrigService" value="${esc(s?.xmrigService||'xmrig')}"></label>
        <label>${t('serverForm.p2poolService')}<input name="p2poolService" value="${esc(s?.p2poolService||'p2pool')}"></label>
        <label>${t('serverForm.monerodService')}<input name="monerodService" value="${esc(s?.monerodService||'monerod')}"></label>
        <label>${t('serverForm.monerodRpc')}<input name="monerodRpcPort" type="number" value="${s?.monerodRpcPort||18081}"></label>
        <label>p2pool log<input name="p2poolLogPath" value="${esc(s?.p2poolLogPath||'/var/log/p2pool.log')}"></label>
        <label>monerod log<input name="monerodLogPath" value="${esc(s?.monerodLogPath||`/home/${s?.username||'monitor'}/.bitmonero/bitmonero.log`)}"></label>
      </div></details>
      ${editing?`<label class="reset-fp"><input name="resetHostFingerprint" type="checkbox"> ${t('serverForm.resetHostKey')}</label>`:''}
      <div class="notice">${t('serverForm.afterAdd')}</div>
      <div class="modal-actions">
        <button type="button" id="test-server" class="ghost">${t('serverForm.testSsh')}</button>
        ${editing?`<button type="button" id="discover-form" class="ghost">${t('serverForm.discover')}</button><button type="button" id="delete-server" class="danger-soft">${t('serverForm.delete')}</button>`:''}
        <button class="primary">${editing?t('serverForm.save'):t('serverForm.add')}</button>
      </div>
      <pre id="test-output" class="log small-log"></pre>
    </form>`);
  
    $('#close-modal').onclick=closeModal;
    const form=$('#server-form'),values=()=>Object.fromEntries(new FormData(form).entries());
    const sync=()=>{const auth=form.elements.authType.value;$('#ssh-password-field').classList.toggle('hidden',auth!=='password');$('#ssh-agent-help').classList.toggle('hidden',auth!=='agent');$('#ssh-key-fields').classList.toggle('hidden',auth!=='key');};
    form.elements.authType.onchange=sync;sync();
  
    $('#test-server').onclick=async()=>{
      const out=$('#test-output');
      try{
        out.textContent=t('serverForm.connecting');
        const r=await api('/servers/test',{method:'POST',body:values()});
        out.textContent=r.ok?(r.output||'SSH: OK'):`SSH: ${t('serverForm.error').toUpperCase()}\n${r.error||''}`;
        out.className=`log small-log ${r.ok?'test-ok':'test-fail'}`;
      }catch(e){out.textContent=e.message;out.classList.add('test-fail');}
    };
  
    if(editing){
      $('#discover-form').onclick=async()=>{
        try{
          const d=await api(`/servers/${s.id}/discover`,{method:'POST'});
          toast(t('serverForm.found',{value:d.xmrig?.binary||t('serverForm.xmrigNotFound')}));
          closeModal();renderServer(s.id,'system');
        }catch(e){toast(e.message,'error');}
      };
      $('#delete-server').onclick=async()=>{
        if(!confirm(t('serverForm.deleteConfirm',{name:s.name})))return;
        await api(`/servers/${s.id}`,{method:'DELETE'});
        closeModal();await loadOverview();navigate('servers');
      };
    }
  
    form.onsubmit=async e=>{
      e.preventDefault();
      try{
        const data=values(),saved=editing?await api(`/servers/${s.id}`,{method:'PUT',body:data}):await api('/servers',{method:'POST',body:data});
        closeModal();await loadOverview();navigate('server',saved.id,'overview');
      }catch(err){toast(err.message,'error');}
    };
  }

  function bootstrapModal(s){
    modal(`<form id="bootstrap-form" class="modal-form">
      <div class="modal-head"><h2>Bootstrap ${esc(s.name)}</h2><button type="button" id="close-modal" class="ghost">✕</button></div>
      <p class="muted">${t('bootstrap.description')}</p>
      <label><input name="installP2pool" type="checkbox"> ${t('bootstrap.installP2pool')}</label>
      <div class="form-grid"><label>Sidechain<select name="p2poolSidechain"><option>mini</option><option>main</option><option>nano</option></select></label><label>monerod host<input name="moneroHost" value="127.0.0.1"></label></div>
      <button class="primary">${t('bootstrap.start')}</button><pre id="bootstrap-out" class="log"></pre>
    </form>`);
    $('#close-modal').onclick=closeModal;
    $('#bootstrap-form').onsubmit=async e=>{
      e.preventDefault();
      const f=e.currentTarget;
      $('#bootstrap-out').textContent=t('bootstrap.running');
      try{
        const r=await api(`/servers/${s.id}/actions/bootstrap`,{method:'POST',body:{installP2pool:f.installP2pool.checked,p2poolSidechain:f.p2poolSidechain.value,moneroHost:f.moneroHost.value}});
        $('#bootstrap-out').textContent=r.output||t('bootstrap.done');
        toast(t('bootstrap.completed'));
      }catch(err){$('#bootstrap-out').textContent=err.message;toast(err.message,'error');}
    };
  }

  return { openServerForm, bootstrapModal };
}
