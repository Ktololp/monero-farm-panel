import fs from 'node:fs';
import path from 'node:path';
import { getSettings, audit } from '../database/index.js';
import { ssh } from '../ssh/index.js';
import { config } from '../config/index.js';
import { serverById, validateWallet, validatePool } from './server.js';

export async function bootstrapServer(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId); const settings = getSettings({ includeSecrets: true }); validateWallet(settings.wallet); validatePool(settings.pool_url); const script = fs.readFileSync(path.resolve('scripts/remote-bootstrap.sh'), 'utf8');
  const env = { TARGET_USER: server.username, XMRIG_VERSION: options.xmrigVersion || settings.xmrig_version || '6.26.0', WALLET: settings.wallet, POOL_URL: settings.pool_url, POOL_PASS: settings.pool_pass || 'x', POOL_TLS: String(settings.pool_tls) === '1' ? '1' : '0', XMRIG_API_PORT: String(server.xmrig_api_port || 60050), INSTALL_P2POOL: options.installP2pool ? '1' : '0', P2POOL_SIDECHAIN: options.p2poolSidechain || 'mini', MONERO_HOST: options.moneroHost || '127.0.0.1', PANEL_PUBLIC_KEY: config.panelPublicKey || '' };
  if (!/^\d+\.\d+\.\d+$/.test(env.XMRIG_VERSION)) throw new Error('Некорректная версия XMRig'); if (!['mini','main','nano'].includes(env.P2POOL_SIDECHAIN)) throw new Error('Некорректный p2pool sidechain');
  const r=await ssh.runScript(server,script,env,{sudo:true,timeoutMs:45*60*1000});audit({ip:actorIp,serverId:server.id,action:'bootstrap-server',status:r.code===0?'ok':'error',details:{code:r.code,installP2pool:options.installP2pool}});if(r.code!==0)throw new Error(`Bootstrap failed: ${r.stderr.trim()||r.stdout.slice(-2000)}`);return {ok:true,output:r.stdout};
}
