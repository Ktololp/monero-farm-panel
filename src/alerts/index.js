import { db, getSetting } from '../database/index.js';

let ioRef = null;
export function setAlertIO(io) { ioRef = io; }

function enabled(key) { return ['1', 'true', 'yes', 'on'].includes(String(getSetting(key)).toLowerCase()); }
function num(key, fallback) { const n = Number(getSetting(key)); return Number.isFinite(n) ? n : fallback; }

async function sendTelegram(text) {
  if (!enabled('telegram_enabled')) return;
  const token = getSetting('telegram_bot_token');
  const chatId = getSetting('telegram_chat_id');
  if (!token || !chatId) return;
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!res.ok) throw new Error(`Telegram returned HTTP ${res.status}`);
}

async function notify(text) {
  try { await sendTelegram(text); }
  catch (error) { console.error('[alerts] Telegram error:', error?.message || error); }
}

export async function triggerAlert(server, type, message) {
  const now = Date.now();
  const cooldown = Math.max(60, num('alert_cooldown_seconds', 900)) * 1000;
  let row = db.prepare('SELECT * FROM alerts WHERE server_id=? AND type=? ORDER BY id DESC LIMIT 1').get(server.id, type);
  let shouldNotify = false;
  if (!row) {
    const info = db.prepare('INSERT INTO alerts(server_id,type,state,message,first_ts,last_ts,last_notified_ts) VALUES(?,?,?,?,?,?,NULL)')
      .run(server.id, type, 'active', message, now, now);
    row = db.prepare('SELECT * FROM alerts WHERE id=?').get(info.lastInsertRowid);
    shouldNotify = true;
  } else if (row.state !== 'active') {
    db.prepare("UPDATE alerts SET state='active',message=?,first_ts=?,last_ts=?,last_notified_ts=NULL WHERE id=?")
      .run(message, now, now, row.id);
    row = db.prepare('SELECT * FROM alerts WHERE id=?').get(row.id);
    shouldNotify = true;
  } else {
    db.prepare('UPDATE alerts SET message=?,last_ts=? WHERE id=?').run(message, now, row.id);
    shouldNotify = !row.last_notified_ts || now - row.last_notified_ts >= cooldown;
  }

  if (shouldNotify) {
    await notify(`⚠️ ${server.name} (${server.host})\n${message}`);
    db.prepare('UPDATE alerts SET last_notified_ts=? WHERE id=?').run(now, row.id);
  }
  ioRef?.emit('alerts:update', listActiveAlerts());
}

export async function resolveAlert(server, type, resolution = 'Recovered') {
  const row = db.prepare("SELECT * FROM alerts WHERE server_id=? AND type=? AND state='active' ORDER BY id DESC LIMIT 1").get(server.id, type);
  if (!row) return;
  const now = Date.now();
  db.prepare("UPDATE alerts SET state='resolved',message=?,last_ts=? WHERE id=?").run(resolution, now, row.id);
  await notify(`✅ ${server.name} (${server.host})\n${resolution}`);
  ioRef?.emit('alerts:update', listActiveAlerts());
}

export function listActiveAlerts() {
  return db.prepare(`SELECT a.*, s.name AS server_name, s.host AS server_host
    FROM alerts a LEFT JOIN servers s ON s.id=a.server_id
    WHERE a.state='active' ORDER BY a.last_ts DESC`).all();
}
