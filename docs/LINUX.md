# Установка на Linux

## Требования

- 64-bit Linux;
- Node.js 20+;
- npm;
- build toolchain для `better-sqlite3`;
- сеть до управляемых Linux-серверов по SSH.

Для Ubuntu/Debian обычно достаточно:

```bash
sudo apt update
sudo apt install -y build-essential python3 openssl
```

Установите Node.js 20+ удобным для вашей системы способом.

## Установка

```bash
git clone https://github.com/Ktololp/monero-farm-panel.git
cd monero-farm-panel
cp .env.example .env
./scripts/generate-secrets.sh
npm install
npm run build:web
npm start
```

Панель будет доступна на `https://IP_ПАНЕЛИ:3000`.

## SSH-agent

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
export SSH_AUTH_SOCK
npm start
```

Для постоянного production-запуска рекомендуется systemd или Docker Compose.

## Обновление

Перед обновлением сохраните:

```text
.env
data/
certs/   # если используете собственный сертификат
```

Затем обновите исходники, выполните `npm install`, `npm run build:web` и перезапустите панель.

## Обновление через mfp

Для Docker-host можно установить host-side updater: `./scripts/install-mfp.sh`. После этого стабильные релизы обновляются командой `mfp update`; доступны также `mfp backup`, `mfp rollback`, `mfp status` и `mfp logs`. Подробнее: `docs/UPDATER.md`.
