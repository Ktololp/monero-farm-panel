import { config } from '../config/index.js';
import { decryptSecret } from '../security/crypto.js';

export function secret(value) {
  return value ? decryptSecret(value) : '';
}

/** Build the ssh2 connect configuration without logging credentials. */
export function serverAuthConfig(server) {
  const cfg = {
    host: server.host,
    port: Number(server.port || 22),
    username: server.username,
    readyTimeout: 12_000,
    keepaliveInterval: 15_000,
    keepaliveCountMax: 3,
    hostHash: 'sha256'
  };

  if (server.auth_type === 'agent') {
    if (!config.sshAuthSock) throw new Error('SSH_AUTH_SOCK не настроен на центральной панели');
    cfg.agent = config.sshAuthSock;
  } else if (server.auth_type === 'password') {
    const password = secret(server.password_enc);
    if (!password) throw new Error('Для авторизации по паролю укажите SSH-пароль');
    cfg.password = password;
    cfg.tryKeyboard = true;
  } else if (server.auth_type === 'key') {
    const privateKey = secret(server.private_key_enc);
    if (!privateKey) throw new Error('Для авторизации по ключу укажите приватный SSH-ключ');
    cfg.privateKey = privateKey;
    const passphrase = secret(server.private_key_passphrase_enc);
    if (passphrase) cfg.passphrase = passphrase;
  } else {
    throw new Error(`Unsupported SSH auth type: ${server.auth_type}`);
  }
  return cfg;
}

/** Ubuntu/OpenSSH+PAM can expose password auth as keyboard-interactive. */
export function attachKeyboardInteractive(client, server) {
  if (server.auth_type !== 'password') return;
  const password = secret(server.password_enc);
  client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
    finish(prompts.map(() => password));
  });
}
