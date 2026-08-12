/** Shell-safe helpers used by remote commands. */
export function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'"'"'`)}'`;
}

export function safeServiceName(name) {
  const s = String(name || '');
  if (!/^[A-Za-z0-9_.@-]+$/.test(s)) throw new Error('Invalid systemd service name');
  return s;
}
