#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$ROOT/.env" ]] || { echo "Missing $ROOT/.env" >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
UID_NOW="$(id -u)"; GID_NOW="$(id -g)"; KIOSK="$HOME/.config/autostart/monero-farm-panel.desktop"
sudo install -m 0755 "$ROOT/scripts/mfp" /usr/local/bin/mfp
sudo mkdir -p /etc/monero-farm-panel
printf 'MFP_DIR=%q\nMFP_IMAGE=%q\nMFP_CONTAINER=%q\nMFP_PORT=%q\nMFP_UID=%q\nMFP_GID=%q\nMFP_REPO=%q\nMFP_KIOSK_FILE=%q\n' "$ROOT" 'ghcr.io/ktololp/monero-farm-panel' 'monero-farm-panel' '3000' "$UID_NOW" "$GID_NOW" 'Ktololp/monero-farm-panel' "$KIOSK" | sudo tee /etc/monero-farm-panel/mfp.conf >/dev/null
mkdir -p "$ROOT/backups" "$ROOT/state"
echo 'Installed /usr/local/bin/mfp'
echo "Configured MFP_DIR=$ROOT"
echo 'Try: mfp status'
