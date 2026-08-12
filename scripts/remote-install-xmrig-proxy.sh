#!/usr/bin/env bash
set -euo pipefail

log() { printf '[xmrig-proxy] %s\n' "$*"; }
die() { printf '[xmrig-proxy] ERROR: %s\n' "$*" >&2; exit 1; }

: "${TARGET_USER:?TARGET_USER is required}"
: "${PROXY_VERSION:?PROXY_VERSION is required}"
: "${PROXY_ASSET_URL:?PROXY_ASSET_URL is required}"
: "${PROXY_ASSET_NAME:?PROXY_ASSET_NAME is required}"
: "${PROXY_SHA256:?PROXY_SHA256 is required}"
: "${UPSTREAM_URL:?UPSTREAM_URL is required}"
: "${UPSTREAM_USER:?UPSTREAM_USER is required}"
: "${UPSTREAM_PASS:=x}"
: "${UPSTREAM_TLS:=0}"
: "${BIND_HOST:=0.0.0.0}"
: "${BIND_PORT:=3334}"
: "${API_PORT:=60051}"
: "${API_TOKEN:?API_TOKEN is required}"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ;;
  *) die "Automatic binary installer currently supports Linux x86_64 only (detected: $ARCH)." ;;
esac

if pgrep -x xmrig-proxy >/dev/null 2>&1; then
  log "xmrig-proxy is already running; nothing to install."
  exit 0
fi

for cmd in curl tar sha256sum python3 systemctl; do
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
done
id "$TARGET_USER" >/dev/null 2>&1 || die "Target user does not exist: $TARGET_USER"

INSTALL_DIR=/opt/xmrig-proxy
CONFIG_DIR=/etc/xmrig-proxy
SERVICE_FILE=/etc/systemd/system/xmrig-proxy.service
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "Downloading official XMRig Proxy v$PROXY_VERSION"
curl -fsSL --retry 3 --connect-timeout 15 -o "$TMP/$PROXY_ASSET_NAME" "$PROXY_ASSET_URL"
printf '%s  %s\n' "$PROXY_SHA256" "$TMP/$PROXY_ASSET_NAME" | sha256sum -c -

mkdir -p "$TMP/unpack"
tar -xzf "$TMP/$PROXY_ASSET_NAME" -C "$TMP/unpack"
BIN="$(find "$TMP/unpack" -type f -name xmrig-proxy -perm -u+x | head -n 1)"
[ -n "$BIN" ] || die "xmrig-proxy binary was not found in the release archive"

STAMP="$(date +%Y%m%d-%H%M%S)"
if [ -f "$CONFIG_DIR/config.json" ]; then
  cp -a "$CONFIG_DIR/config.json" "$CONFIG_DIR/config.json.bak-$STAMP"
fi
if [ -f "$SERVICE_FILE" ]; then
  cp -a "$SERVICE_FILE" "$SERVICE_FILE.bak-$STAMP"
fi

install -d -m 0755 "$INSTALL_DIR"
install -m 0755 "$BIN" "$INSTALL_DIR/xmrig-proxy"
install -d -m 0750 "$CONFIG_DIR"

export CONFIG_PATH="$CONFIG_DIR/config.json"
python3 - <<'PY'
import json, os

def as_bool(name):
    return str(os.environ.get(name, "0")).lower() in ("1", "true", "yes", "on")

cfg = {
    "access-log-file": None,
    "access-password": None,
    "algo-ext": True,
    "api": {"id": None, "worker-id": "monero-farm-panel"},
    "http": {
        "enabled": True,
        "host": "127.0.0.1",
        "port": int(os.environ["API_PORT"]),
        "access-token": os.environ["API_TOKEN"],
        "restricted": True
    },
    "background": False,
    "bind": [{
        "host": os.environ["BIND_HOST"],
        "port": int(os.environ["BIND_PORT"]),
        "tls": False
    }],
    "colors": True,
    "custom-diff": 0,
    "custom-diff-stats": False,
    "donate-level": 0,
    "log-file": None,
    "mode": "nicehash",
    "pools": [{
        "algo": None,
        "coin": None,
        "url": os.environ["UPSTREAM_URL"],
        "user": os.environ["UPSTREAM_USER"],
        "pass": os.environ.get("UPSTREAM_PASS", "x"),
        "rig-id": None,
        "keepalive": False,
        "enabled": True,
        "tls": as_bool("UPSTREAM_TLS"),
        "sni": False,
        "tls-fingerprint": None,
        "daemon": False,
        "socks5": None,
        "self-select": None,
        "submit-to-origin": False
    }],
    "retries": 5,
    "retry-pause": 5,
    "reuse-timeout": 0,
    "tls": {
        "enabled": False,
        "protocols": None,
        "cert": None,
        "cert_key": None,
        "ciphers": None,
        "ciphersuites": None,
        "dhparam": None
    },
    "dns": {"ip_version": 0, "ttl": 30},
    "user-agent": "Monero-Farm-Panel",
    "syslog": False,
    "verbose": False,
    "watch": True,
    "workers": True
}

with open(os.environ["CONFIG_PATH"], "w", encoding="utf-8") as f:
    json.dump(cfg, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY

GROUP="$(id -gn "$TARGET_USER")"
chown root:"$GROUP" "$CONFIG_DIR"
chmod 0750 "$CONFIG_DIR"
chown root:"$GROUP" "$CONFIG_DIR/config.json"
chmod 0640 "$CONFIG_DIR/config.json"

cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=XMRig Proxy managed by Monero Farm Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$TARGET_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/xmrig-proxy --config $CONFIG_DIR/config.json
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$SERVICE_FILE"

log "Checking installed binary"
runuser -u "$TARGET_USER" -- "$INSTALL_DIR/xmrig-proxy" --version >/dev/null

systemctl daemon-reload
systemctl enable --now xmrig-proxy.service

log "Waiting for localhost HTTP API"
OK=0
for _ in $(seq 1 20); do
  if curl -fsS -H "Authorization: Bearer $API_TOKEN" "http://127.0.0.1:$API_PORT/1/summary" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 1
done
if [ "$OK" != "1" ]; then
  systemctl status xmrig-proxy.service --no-pager -l || true
  journalctl -u xmrig-proxy.service -n 80 --no-pager || true
  die "Service started but localhost API did not become ready"
fi

log "Installed XMRig Proxy v$PROXY_VERSION"
log "Stratum listen: $BIND_HOST:$BIND_PORT"
log "HTTP API: 127.0.0.1:$API_PORT"
log "Upstream: $UPSTREAM_URL"
log "Existing XMRig configuration was NOT changed"
