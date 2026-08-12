import { audit } from '../database/index.js';
import { ssh } from '../ssh/index.js';
import { serverById } from './server.js';

export async function runCommand(serverId, command, { actorIp = '' } = {}) { const server=serverById(serverId);if(!command||command.length>10000)throw new Error('Команда пустая или слишком длинная');const r=await ssh.exec(server,command,{timeoutMs:120000,maxBytes:4_000_000,pty:false});audit({ip:actorIp,serverId:server.id,action:'remote-command',status:r.code===0?'ok':'error',details:{command,code:r.code}});return r; }
