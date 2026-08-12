import { db } from './connection.js';

export function audit({ actor = 'admin', ip = '', serverId = null, action, status = 'ok', details = '' }) {
  db.prepare('INSERT INTO actions(ts,actor,ip,server_id,action,status,details) VALUES(?,?,?,?,?,?,?)')
    .run(Date.now(), actor, ip, serverId, action, status, typeof details === 'string' ? details : JSON.stringify(details));
}
