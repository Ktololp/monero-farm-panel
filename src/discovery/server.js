import { db } from '../database/index.js';

export function serverById(id) {
  const row = db.prepare('SELECT * FROM servers WHERE id=?').get(Number(id));
  if (!row) throw new Error('Сервер не найден');
  return row;
}
