export function toService(v, fallback) {
  const s = String(v || '').replace(/\.service$/, '').trim();
  return /^[A-Za-z0-9_.@-]+$/.test(s) ? s : fallback;
}

export function toPort(v, fallback) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : fallback;
}
