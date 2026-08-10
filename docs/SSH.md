# SSH

Панель поддерживает три способа авторизации.

## Пароль

Самый простой способ для первого теста. Приватный ключ не требуется.

## Private key

На Windows типичные файлы:

```text
C:\Users\<user>\.ssh\id_ed25519
C:\Users\<user>\.ssh\id_rsa
```

Выбирайте **private key без `.pub`**.

На Linux обычно:

```text
~/.ssh/id_ed25519
~/.ssh/id_rsa
```

## SSH-agent

Windows OpenSSH Agent:

```powershell
Get-Service ssh-agent
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
ssh-add -l
```

Linux:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
ssh-add -l
```

## Host key pinning

При первом успешном соединении панель запоминает fingerprint SSH host key. Если ключ неожиданно поменяется, соединение блокируется до явной проверки оператором. Это защищает от незаметной подмены SSH-сервера.
