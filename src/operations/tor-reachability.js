import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../database/index.js';
import { ssh } from '../ssh/index.js';
import { serverById } from './server.js';
import { getMonerodInstallStatus } from './monerod-setup.js';
import { getMonerodTorStatus } from './monerod-tor-p2p.js';

const reachabilityScript = fs.readFileSync(path.resolve('scripts/remote-check-monerod-tor.sh'), 'utf8');

function parsePairs(output = '') {
  const values = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = /^MFP_([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

export async function checkMonerodTorReachability(serverId, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const monerod = (await getMonerodInstallStatus(serverId)).monerod;
  if (!monerod.running) throw new Error('monerod must be running before onion pipeline check');

  const tor = (await getMonerodTorStatus(serverId, monerod)).tor;
  if (!tor.ready || !tor.onion) throw new Error('Tor onion must be fully configured before pipeline check');

  const result = await ssh.runScript(server, reachabilityScript, {
    TOR_ONION_TARGET: tor.onion
  }, { sudo: false, timeoutMs: 15000 });

  if (result.code !== 0) throw new Error(`Tor onion pipeline check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  const values = parsePairs(result.stdout);
  const reachable = values.REACHABLE === '1';
  const localListener = values.LOCAL_LISTENER === '1';
  const torrcOk = values.TORRC_OK === '1';
  const externalVerified = values.EXTERNAL_VERIFIED === '1';
  const seconds = Number(values.SECONDS || 0) || 0;
  const detail = values.DETAIL || '';

  audit({
    ip: actorIp,
    serverId: server.id,
    action: 'check-monerod-tor-pipeline',
    status: 'ok',
    details: { reachable, localListener, torrcOk, externalVerified, seconds, detail }
  });

  return { ok: true, reachable, localListener, torrcOk, externalVerified, seconds, detail, onion: tor.onion };
}
