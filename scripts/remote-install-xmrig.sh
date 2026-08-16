#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

: "${XMRIG_VERSION:=6.26.0}"
: "${WALLET:?WALLET required}"
: "${POOL_URL:?POOL_URL required}"
: "${POOL_PASS:=x}"
: "${POOL_TLS:=0}"
: "${XMRIG_API_PORT:=60050}"
: "${XMRIG_CONFIG_PATH:=/opt/xmrig/config.json}"
: "${XMRIG_SERVICE_UNIT:=xmrig.service}"

case "$XMRIG_SERVICE_UNIT" in
  *[!A-Za-z0-9_.@-]*|'') echo "Unsafe systemd unit name" >&2; exit 2 ;;
esac

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer currently supports Debian/Ubuntu systems with apt-get." >&2
  exit 3
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required for XMRig autostart." >&2
  exit 4
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64|aarch64|arm64) ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 5 ;;
esac

echo "[1/5] Installing XMRig build/runtime dependencies"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git build-essential cmake pkg-config python3 \
  libuv1-dev libssl-dev libhwloc-dev lm-sensors jq

INSTALLED_VERSION=""
if [ -x /opt/xmrig/xmrig ]; then
  INSTALLED_VERSION="$(/opt/xmrig/xmrig --version 2>/dev/null | head -n 1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
fi

if [ "$INSTALLED_VERSION" = "$XMRIG_VERSION" ]; then
  echo "[2/5] XMRig v${XMRIG_VERSION} already installed; keeping binary"
else
  echo "[2/5] Building official XMRig v${XMRIG_VERSION}"
  rm -rf /tmp/mfp-xmrig-build
  GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch "v${XMRIG_VERSION}" https://github.com/xmrig/xmrig.git /tmp/mfp-xmrig-build
  cmake -S /tmp/mfp-xmrig-build -B /tmp/mfp-xmrig-build/build -DWITH_HWLOC=ON
  cmake --build /tmp/mfp-xmrig-build/build -j"$(nproc)"
  install -d -m 0755 /opt/xmrig
  install -m 0755 /tmp/mfp-xmrig-build/build/xmrig /opt/xmrig/xmrig
fi

echo "[3/5] Checking XMRig configuration"
install -d -m 0755 "$(dirname "$XMRIG_CONFIG_PATH")"
if [ -s "$XMRIG_CONFIG_PATH" ]; then
  echo "Existing config preserved: $XMRIG_CONFIG_PATH"
else
  export WALLET POOL_URL POOL_PASS POOL_TLS XMRIG_API_PORT XMRIG_CONFIG_PATH
  python3 - <<'PY'
import json, os
cfg = {
  "autosave": True,
  "background": False,
  "colors": True,
  "randomx": {
    "init": -1,
    "init-avx2": -1,
    "mode": "auto",
    "1gb-pages": True,
    "rdmsr": True,
    "wrmsr": True,
    "numa": True,
    "scratchpad_prefetch_mode": 1
  },
  "cpu": {
    "enabled": True,
    "huge-pages": True,
    "huge-pages-jit": False,
    "yield": True,
    "asm": True
  },
  "http": {
    "enabled": True,
    "host": "127.0.0.1",
    "port": int(os.environ["XMRIG_API_PORT"]),
    "access-token": None,
    "restricted": True
  },
  "pools": [{
    "url": os.environ["POOL_URL"],
    "user": os.environ["WALLET"],
    "pass": os.environ.get("POOL_PASS", "x"),
    "tls": os.environ.get("POOL_TLS", "0") == "1",
    "keepalive": True,
    "nicehash": False
  }]
}
path = os.environ["XMRIG_CONFIG_PATH"]
with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=4)
    f.write("\n")
os.chmod(path, 0o600)
PY
  echo "Created config: $XMRIG_CONFIG_PATH"
fi

echo "[4/5] Checking systemd service and autostart"
if ! systemctl cat "$XMRIG_SERVICE_UNIT" >/dev/null 2>&1; then
  cat >"/etc/systemd/system/$XMRIG_SERVICE_UNIT" <<UNIT
[Unit]
Description=XMRig RandomX miner managed by Monero Farm Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/xmrig
ExecStart=/opt/xmrig/xmrig --config=${XMRIG_CONFIG_PATH}
Restart=always
RestartSec=10
LimitMEMLOCK=infinity
Nice=5
IOSchedulingClass=idle

[Install]
WantedBy=multi-user.target
UNIT
  echo "Created systemd unit: $XMRIG_SERVICE_UNIT"
else
  echo "Existing systemd unit preserved: $XMRIG_SERVICE_UNIT"
fi

modprobe msr 2>/dev/null || true
printf 'msr\n' >/etc/modules-load.d/monero-farm-panel.conf
systemctl daemon-reload
systemctl enable "$XMRIG_SERVICE_UNIT"
systemctl restart "$XMRIG_SERVICE_UNIT" || systemctl start "$XMRIG_SERVICE_UNIT"

echo "[5/5] Verifying XMRig"
sleep 2
systemctl is-enabled --quiet "$XMRIG_SERVICE_UNIT"
systemctl is-active --quiet "$XMRIG_SERVICE_UNIT"
/opt/xmrig/xmrig --version | head -n 1
systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 20 || true
echo "XMRig installation completed successfully"
