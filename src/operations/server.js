import { db } from '../database/index.js';

export function serverById(id) {
  const row = db.prepare('SELECT * FROM servers WHERE id=?').get(Number(id));
  if (!row) throw new Error('Сервер не найден');
  return row;
}

export function validateWallet(wallet) {
  if (!wallet) throw new Error('Глобальный XMR-кошелёк не задан');
  if (!/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{90,110}$/.test(wallet)) throw new Error('Формат XMR-кошелька выглядит некорректно');
}

export function validatePool(pool) { if (!pool || pool.length > 300 || /[\r\n\0]/.test(pool)) throw new Error('Некорректный адрес пула'); }
