function authLabel(type) {
  return ({ password: 'пароль', key: 'приватный ключ', agent: 'SSH-агент' })[type] || type;
}

/** Turn low-level ssh2/network failures into operator-facing diagnostics. */
export function describeSshError(error, server = {}) {
  const message = error?.message || String(error || 'Неизвестная ошибка SSH');
  const code = error?.code || '';
  if (code === 'ECONNREFUSED') return `SSH-порт ${server.port || 22} отклоняет соединение на ${server.host}. Проверьте sshd и firewall.`;
  if (code === 'ETIMEDOUT' || /timed? out|timeout/i.test(message)) return `Таймаут подключения к ${server.host}:${server.port || 22}. Проверьте IP, порт и доступность узла из компьютера с панелью.`;
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return `Нет маршрута до ${server.host}. Проверьте сеть/VPN и IP-адрес.`;
  if (/All configured authentication methods failed/i.test(message)) {
    return `SSH-сервер доступен, но авторизация (${authLabel(server.auth_type)}) отклонена. Для пароля проверьте логин/пароль и PasswordAuthentication/KbdInteractiveAuthentication в sshd.`;
  }
  if (/Cannot parse privateKey|privateKey|parse key/i.test(message)) return `Не удалось прочитать приватный SSH-ключ. Нужен полный OpenSSH/PEM private key, а не файл .pub. ${message}`;
  if (/agent/i.test(message) && /ENOENT|connect|socket|pipe|not configured/i.test(message)) return `Не удалось подключиться к SSH-agent панели. ${message}`;
  if (/Host key verification failed|host key/i.test(message)) return `SSH host key не совпадает с сохранённым отпечатком. Если сервер переустановлен, сбросьте сохранённый host key в настройках сервера.`;
  return message;
}
