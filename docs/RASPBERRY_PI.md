# Raspberry Pi

Рекомендуется Raspberry Pi с **64-bit Raspberry Pi OS / Ubuntu ARM64** и как минимум 2 GB RAM.

Панель сама не майнит Monero: Raspberry Pi используется как центральная управляющая нода, поэтому требования умеренные.

## Рекомендуемый вариант — Docker

```bash
cp .env.example .env
./scripts/generate-secrets.sh
docker compose up -d --build
```

## Нативный Node.js

Установите Node.js 20+, `build-essential`, `python3` и `openssl`, затем:

```bash
npm install
npm run build:web
npm start
```

## Хранилище

SQLite и история метрик находятся в `data/`. На SD-карте разумно ограничить retention истории или использовать SSD, если ферма большая и панель работает постоянно.
