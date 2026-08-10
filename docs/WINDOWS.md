# Monero Farm Panel 1.0.0 — Windows

## 1. Чистая установка

1. Установите Node.js 20+.
2. Распакуйте единственный архив `monero-farm-panel.zip`.
3. Запустите `SETUP_WINDOWS.cmd`.
4. Сохраните `PANEL MASTER PASSWORD`.
5. Запустите `START_WINDOWS.cmd`.
6. Откройте `https://localhost:3000`.

## 2. Что делает SETUP_WINDOWS

- создаёт `.env`;
- генерирует master password, AES key и session secret;
- создаёт self-signed PFX certificate через Windows PKI;
- находит реальный npm CLI;
- выполняет `npm install`;
- собирает frontend;
- проверяет состояние Windows OpenSSH Agent.

Скрипт ASCII-only и совместим с Windows PowerShell 5.1 независимо от системной кодовой страницы.

Повторный запуск без `-Force` сохраняет существующий `.env` и сертификат.

## 3. SSH по паролю

Для первого теста можно не использовать ключ вообще:

```text
Авторизация: Пароль
Логин: monitor
SSH-пароль: пароль monitor
sudo password: пароль monitor, если sudo его требует
```

Проверка вне панели:

```powershell
ssh monitor@192.168.1.91
```

## 4. SSH Agent

PowerShell от администратора:

```powershell
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
ssh-add -l
```

Панель использует Windows OpenSSH named pipe:

```text
\\.\pipe\openssh-ssh-agent
```

## 5. После добавления сервера

Панель сама запускает auto-discovery. Если путь или service определились неправильно:

```text
Сервер → Система → Автоопределить
```

Если XMRig API выключен:

```text
Сервер → Система → Исправить автоматически
```

## 6. Терминал

На карточке сервера есть значок `⌨`. Он открывает SSH shell прямо в браузере.

## 7. Если START_WINDOWS остановился

Окно `.cmd` не должно исчезнуть. Оно покажет exit code.

Проверьте:

```text
data\panel-crash.log
```

## 8. Обновление панели во время тестирования

Если вы каждый раз используете чистую установку:

1. остановите `START_WINDOWS.cmd`;
2. удалите старую папку;
3. распакуйте новый `monero-farm-panel.zip`;
4. снова запустите `SETUP_WINDOWS.cmd`.

Если нужно сохранить зарегистрированные серверы, перенесите перед удалением:

```text
data\panel.sqlite3
```

и старый `.env`, иначе зашифрованные SSH credentials из БД не расшифруются новым AES key.
