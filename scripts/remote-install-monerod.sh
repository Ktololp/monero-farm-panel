#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

: "${MONEROD_MODE:=pruned}"
: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${MONEROD_RPC_PORT:=18081}"
: "${MONEROD_CONFIG_PATH:=/etc/monero/monerod.conf}"
: "${MONEROD_BINARY_PATH:=}"

BINARYFATE_FINGERPRINT='81AC591FE9C4B65C5806AFC3F0AF4D462A0BDF92'
BINARYFATE_KEY_URL='https://raw.githubusercontent.com/monero-project/monero/master/utils/gpg_keys/binaryfate.asc'

case "$MONEROD_MODE" in
  full|pruned) ;;
  *) echo "Unsupported MONEROD_MODE: $MONEROD_MODE" >&2; exit 2 ;;
esac

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer currently supports Debian/Ubuntu (apt-get required)" >&2
  exit 3
fi

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl bzip2 tar gnupg

BIN="$MONEROD_BINARY_PATH"
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
  if [ -x /opt/monero/monerod ]; then
    BIN=/opt/monero/monerod
  elif command -v monerod >/dev/null 2>&1; then
    BIN="$(command -v monerod)"
  fi
fi

if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64) ARCHIVE_RE='^monero-linux-x64-v.*[.]tar[.]bz2$' ;;
    aarch64|arm64) ARCHIVE_RE='^monero-linux-armv8-v.*[.]tar[.]bz2$' ;;
    *) echo "Unsupported architecture for official Monero CLI binary: $ARCH" >&2; exit 4 ;;
  esac

  TMP_HASHES=/tmp/monero-hashes.txt
  TMP_KEY=/tmp/monero-binaryfate.asc
  GNUPGHOME="$(mktemp -d /tmp/mfp-monero-gpg.XXXXXX)"
  chmod 0700 "$GNUPGHOME"
  trap 'rm -rf "$GNUPGHOME" "$TMP_KEY"' EXIT
  rm -f "$TMP_HASHES" "$TMP_KEY"

  curl -fL --retry 3 --connect-timeout 20 "https://www.getmonero.org/downloads/hashes.txt" -o "$TMP_HASHES"
  curl -fL --retry 3 --connect-timeout 20 "$BINARYFATE_KEY_URL" -o "$TMP_KEY"
  gpg --batch --homedir "$GNUPGHOME" --import "$TMP_KEY" >/dev/null 2>&1
  IMPORTED_FINGERPRINT="$(gpg --batch --homedir "$GNUPGHOME" --with-colons --fingerprint | awk -F: '$1=="fpr" {print $10; exit}')"
  if [ "$IMPORTED_FINGERPRINT" != "$BINARYFATE_FINGERPRINT" ]; then
    echo "Monero release signing key fingerprint mismatch" >&2
    echo "Expected: $BINARYFATE_FINGERPRINT" >&2
    echo "Actual:   ${IMPORTED_FINGERPRINT:-missing}" >&2
    exit 5
  fi
  if ! gpg --batch --homedir "$GNUPGHOME" --verify "$TMP_HASHES" >/dev/null 2>&1; then
    echo "Monero hashes.txt PGP signature verification failed" >&2
    exit 6
  fi

  HASH_LINE="$(awk -v re="$ARCHIVE_RE" '
    $2 ~ re {print $1 " " $2; exit}
    $1 ~ re {gsub(/,/, "", $1); gsub(/,/, "", $2); print $2 " " $1; exit}
  ' "$TMP_HASHES")"
  EXPECTED="${HASH_LINE%% *}"
  ARCHIVE_NAME="${HASH_LINE#* }"
  if [ -z "$HASH_LINE" ] || [ -z "$EXPECTED" ] || [ -z "$ARCHIVE_NAME" ] || [ "$ARCHIVE_NAME" = "$HASH_LINE" ]; then
    echo "Could not find the current official Monero archive in verified hashes.txt for architecture $ARCH" >&2
    exit 7
  fi

  DOWNLOAD_URL="https://downloads.getmonero.org/cli/${ARCHIVE_NAME}"
  TMP_ARCHIVE="/tmp/$ARCHIVE_NAME"
  rm -f "$TMP_ARCHIVE"
  rm -rf /tmp/mfp-monero-extract

  echo "Downloading verified official Monero CLI: $ARCHIVE_NAME"
  curl -fL --retry 3 --connect-timeout 20 "$DOWNLOAD_URL" -o "$TMP_ARCHIVE"
  ACTUAL="$(sha256sum "$TMP_ARCHIVE" | awk '{print $1}')"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Monero archive SHA256 mismatch" >&2
    echo "Expected: $EXPECTED" >&2
    echo "Actual:   $ACTUAL" >&2
    exit 8
  fi

  mkdir -p /tmp/mfp-monero-extract
  tar -xjf "$TMP_ARCHIVE" -C /tmp/mfp-monero-extract
  ROOT="$(find /tmp/mfp-monero-extract -mindepth 1 -maxdepth 1 -type d -name 'monero-*' | head -n 1)"
  [ -n "$ROOT" ] || { echo "Extracted Monero directory not found" >&2; exit 9; }
  install -d -m 0755 /opt/monero
  for file in "$ROOT"/monero*; do
    [ -f "$file" ] && [ -x "$file" ] || continue
    install -m 0755 "$file" "/opt/monero/$(basename "$file")"
  done
  BIN=/opt/monero/monerod
  rm -rf "$GNUPGHOME" "$TMP_KEY"
  trap - EXIT
fi

if ! id monero >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/monero --create-home --shell /usr/sbin/nologin monero
fi
install -d -m 0755 -o monero -g monero /var/lib/monero /var/lib/monero/bitmonero
install -d -m 0755 -o monero -g monero /var/log/monero
install -d -m 0755 /etc/monero

if [ -e "$MONEROD_CONFIG_PATH" ] && ! grep -q '^# Managed by Monero Farm Panel$' "$MONEROD_CONFIG_PATH"; then
  echo "Existing unmanaged monerod config preserved: $MONEROD_CONFIG_PATH"
else
  if [ -e "$MONEROD_CONFIG_PATH" ]; then
    cp -a "$MONEROD_CONFIG_PATH" "${MONEROD_CONFIG_PATH}.mfp-backup-$(date +%Y%m%d%H%M%S)"
  fi
  cat >"$MONEROD_CONFIG_PATH" <<EOF
# Managed by Monero Farm Panel
data-dir=/var/lib/monero/bitmonero
log-file=/var/log/monero/monero.log
log-level=0
check-updates=disabled
enable-dns-blocklist=1
p2p-bind-ip=0.0.0.0
p2p-bind-port=18080
rpc-bind-ip=127.0.0.1
rpc-bind-port=${MONEROD_RPC_PORT}
zmq-rpc-bind-ip=127.0.0.1
zmq-rpc-bind-port=18083
EOF
  if [ "$MONEROD_MODE" = "pruned" ]; then
    cat >>"$MONEROD_CONFIG_PATH" <<'EOF'
prune-blockchain=1
sync-pruned-blocks=1
EOF
  fi
  chmod 0644 "$MONEROD_CONFIG_PATH"
fi

LOAD_STATE="$(systemctl show -p LoadState --value "$MONEROD_SERVICE_UNIT" 2>/dev/null || true)"
if [ "$LOAD_STATE" != "loaded" ]; then
  cat >"/etc/systemd/system/$MONEROD_SERVICE_UNIT" <<EOF
[Unit]
Description=Monero daemon managed by Monero Farm Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=monero
Group=monero
ExecStart=${BIN} --config-file=${MONEROD_CONFIG_PATH} --non-interactive
Restart=on-failure
RestartSec=10
LimitNOFILE=65536
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF
fi

systemctl daemon-reload
systemctl enable "$MONEROD_SERVICE_UNIT"
if systemctl is-active --quiet "$MONEROD_SERVICE_UNIT"; then
  systemctl restart "$MONEROD_SERVICE_UNIT"
else
  systemctl start "$MONEROD_SERVICE_UNIT"
fi

sleep 2
systemctl --no-pager --full status "$MONEROD_SERVICE_UNIT" | head -n 30 || true
echo "Monerod setup completed: mode=$MONEROD_MODE binary=$BIN config=$MONEROD_CONFIG_PATH"
