#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

: "${TARGET_USER:?TARGET_USER required}"
: "${XMRIG_VERSION:=6.26.0}"
: "${WALLET:?WALLET required (set your Monero wallet in panel settings first)}"
: "${POOL_URL:=127.0.0.1:3333}"
: "${POOL_PASS:=x}"
: "${POOL_TLS:=0}"
: "${XMRIG_API_PORT:=60050}"
: "${INSTALL_P2POOL:=0}"
: "${P2POOL_SIDECHAIN:=mini}"
: "${MONERO_HOST:=127.0.0.1}"
: "${PANEL_PUBLIC_KEY:=}"

echo "[1/6] Installing build/runtime dependencies"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git build-essential cmake pkg-config python3 \
  libuv1-dev libssl-dev libhwloc-dev lm-sensors jq

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64|aarch64|arm64) ;;
  *) echo "Unsupported 32-bit/unknown architecture: $ARCH" >&2; exit 2 ;;
esac

echo "[2/6] Building XMRig v${XMRIG_VERSION}"
rm -rf /tmp/xmrig-build
GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch "v${XMRIG_VERSION}" https://github.com/xmrig/xmrig.git /tmp/xmrig-build
cmake -S /tmp/xmrig-build -B /tmp/xmrig-build/build -DWITH_HWLOC=ON
cmake --build /tmp/xmrig-build/build -j"$(nproc)"
install -d -m 0755 /opt/xmrig
install -m 0755 /tmp/xmrig-build/build/xmrig /opt/xmrig/xmrig

echo "[3/6] Writing XMRig config"
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
with open('/opt/xmrig/config.json', 'w') as f:
    json.dump(cfg, f, indent=4)
    f.write('\n')
os.chmod('/opt/xmrig/config.json', 0o600)
PY

cat >/etc/systemd/system/xmrig.service <<'UNIT'
[Unit]
Description=XMRig RandomX miner managed by Monero Farm Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/xmrig
ExecStart=/opt/xmrig/xmrig --config=/opt/xmrig/config.json
Restart=always
RestartSec=10
LimitMEMLOCK=infinity
Nice=5
IOSchedulingClass=idle

[Install]
WantedBy=multi-user.target
UNIT

modprobe msr 2>/dev/null || true
printf 'msr\n' >/etc/modules-load.d/monero-farm-panel.conf

echo "[4/6] Optional p2pool"
if [ "$INSTALL_P2POOL" = "1" ]; then
  apt-get install -y --no-install-recommends \
    libzmq3-dev libsodium-dev libpgm-dev libnorm-dev libgss-dev \
    libcurl4-openssl-dev libidn2-0-dev
  rm -rf /tmp/p2pool-build
  GIT_TERMINAL_PROMPT=0 git clone --recursive --depth 1 https://github.com/SChernykh/p2pool.git /tmp/p2pool-build
  cmake -S /tmp/p2pool-build -B /tmp/p2pool-build/build
  cmake --build /tmp/p2pool-build/build -j"$(nproc)"
  install -d -m 0755 /opt/p2pool
  install -m 0755 /tmp/p2pool-build/build/p2pool /opt/p2pool/p2pool
  install -d -m 0755 -o "$TARGET_USER" -g "$(id -gn "$TARGET_USER")" /var/lib/p2pool

  SIDECHAIN_ARG=""
  case "$P2POOL_SIDECHAIN" in
    mini) SIDECHAIN_ARG="--mini" ;;
    nano) SIDECHAIN_ARG="--nano" ;;
    main) SIDECHAIN_ARG="" ;;
  esac
  cat >/etc/systemd/system/p2pool.service <<UNIT
[Unit]
Description=Monero P2Pool managed by Monero Farm Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${TARGET_USER}
WorkingDirectory=/var/lib/p2pool
ExecStart=/opt/p2pool/p2pool --host ${MONERO_HOST} --wallet ${WALLET} ${SIDECHAIN_ARG}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
fi

echo "[5/6] Optional panel SSH public key"
if [ -n "$PANEL_PUBLIC_KEY" ]; then
  HOME_DIR="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  if [ -n "$HOME_DIR" ]; then
    install -d -m 0700 -o "$TARGET_USER" -g "$(id -gn "$TARGET_USER")" "$HOME_DIR/.ssh"
    touch "$HOME_DIR/.ssh/authorized_keys"
    grep -qxF "$PANEL_PUBLIC_KEY" "$HOME_DIR/.ssh/authorized_keys" || echo "$PANEL_PUBLIC_KEY" >> "$HOME_DIR/.ssh/authorized_keys"
    chown "$TARGET_USER:$(id -gn "$TARGET_USER")" "$HOME_DIR/.ssh/authorized_keys"
    chmod 0600 "$HOME_DIR/.ssh/authorized_keys"
  fi
fi

echo "[6/6] Enabling services"
systemctl daemon-reload
systemctl enable --now xmrig.service
if [ "$INSTALL_P2POOL" = "1" ]; then systemctl enable --now p2pool.service; fi

systemctl --no-pager --full status xmrig.service | head -n 25 || true
echo "Bootstrap completed successfully"
