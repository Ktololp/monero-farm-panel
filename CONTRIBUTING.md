# Участие в разработке

Спасибо за интерес к Monero Farm Panel.

## Перед началом

1. Для бага сначала проверьте, что проблема воспроизводится на последней версии.
2. Не публикуйте в Issues пароли, private keys, `.env`, токены Telegram или другие секреты.
3. Для уязвимостей используйте процесс из `SECURITY.md`.

## Разработка

Требуется Node.js 20+.

```bash
npm install
npm run check
npm run build:web
```

Для локального запуска:

```bash
cp .env.example .env
./scripts/generate-secrets.sh
npm start
```

На Windows используйте `SETUP_WINDOWS.cmd` и `START_WINDOWS.cmd`.

## Pull Request

- Делайте PR небольшим и посвящённым одной задаче.
- Опишите проблему и способ её решения.
- Если меняется UI, приложите скриншот.
- Если меняется SSH/remote execution, отдельно опишите влияние на безопасность.
- Не добавляйте реальные credentials, IP-адреса частной инфраструктуры или wallets как mining defaults.
- Убедитесь, что `npm run check` и `npm run build:web` проходят.

## Стиль

Проект сознательно остаётся лёгким: vanilla JS на frontend и небольшой Node.js backend. Новая зависимость должна давать ощутимую пользу и не усложнять Raspberry Pi / Windows deployment без необходимости.

## Source-structure rule

Read `AGENTS.md` and `docs/DEVELOPER_GUIDE.md` before changing architecture. Prefer explicit subsystem boundaries and small focused files over minimizing file count. New business logic should not be added to application wiring or a universal frontend file when it has a natural domain home.
