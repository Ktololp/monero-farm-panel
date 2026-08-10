# Публикация Monero Farm Panel на GitHub

Этот проект уже подготовлен как GitHub-ready репозиторий.

## 1. Создайте публичный репозиторий

Рекомендуемое имя:

```text
monero-farm-panel
```

Описание:

```text
Self-hosted web dashboard for monitoring and managing Monero / XMRig RandomX mining farms via SSH. XMRig, p2pool, monerod, Docker, Windows, Linux & Raspberry Pi.
```

Topics:

```text
monero xmrig p2pool randomx mining mining-dashboard mining-farm nodejs ssh raspberry-pi docker self-hosted
```

## 2. Загрузите исходники через Git

В папке проекта:

```bash
git init
git add .
git commit -m "Initial public release v1.0.0"
git branch -M main
git remote add origin https://github.com/<USERNAME>/monero-farm-panel.git
git push -u origin main
```

Или через GitHub CLI:

```bash
gh repo create monero-farm-panel --public --source=. --remote=origin --push
```

## 3. Настройки репозитория

Рекомендуется включить:

- Issues;
- Discussions (по желанию);
- Private vulnerability reporting;
- Actions;
- branch protection для `main` после первого успешного CI.

## 4. Первый Release v1.0.0

Workflow `release.yml` настроен на git tags `v*`.

```bash
git tag v1.0.0
git push origin v1.0.0
```

После push GitHub Actions:

1. проверит проект;
2. упакует чистый ZIP исходников;
3. создаст GitHub Release;
4. приложит SHA-256;
5. соберёт `linux/amd64` + `linux/arm64` Docker image;
6. опубликует image в GitHub Container Registry.

После первой публикации откройте страницу Package → Package settings и убедитесь, что container package имеет **Public** visibility. GitHub создаёт новый package приватным по умолчанию; публичный image можно скачивать без авторизации.

## 5. Social preview и screenshots

После публикации сделайте 3–4 скриншота без паролей, реальных приватных IP и чувствительных hostname:

- Dashboard;
- страница сервера;
- Topology;
- SSH terminal без секретных команд.

Загрузите лучший скриншот в `Settings → General → Social preview`.

## 6. Не загружайте секреты

Перед первым push проверьте:

```bash
git status
git grep -n "PANEL_ENCRYPTION_KEY" || true
git grep -n "PRIVATE KEY" || true
```

`.env`, runtime SQLite, certificates и keys уже исключены `.gitignore`.
