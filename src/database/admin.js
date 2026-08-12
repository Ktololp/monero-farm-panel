import { db } from './connection.js';

export function getAdminPasswordHash() {
  return db.prepare("SELECT value FROM meta WHERE key='admin_password_hash'").get()?.value || '';
}

export function setAdminPasswordHash(hash) {
  db.prepare("INSERT INTO meta(key,value) VALUES('admin_password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hash);
}
