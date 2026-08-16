#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${MONEROD_CONFIG_PATH:=/etc/monero/monerod.conf}"
: "${TOR_ONION_PORT:=18084}"
: "${TOR_SOCKS_PORT:=9050}"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer currently supports Debian/Ubuntu (apt-get required)" >&2
  exit 3
fi
if [ ! -f "$MONEROD_CONFIG_PATH" ]; then
  echo "monerod config not found: $MONEROD_CONFIG_PATH" >&2
  exit 4
fi

apt-get update
apt-get install -y --no-install-recommends tor ca-certificates curl

TORRC=/etc/tor/torrc
HS_DIR=/var/lib/tor/monerod
BEGIN='# BEGIN MFP MONEROD TOR'
END='# END MFP MONEROD TOR'
TMP_TORRC="$(mktemp)"
awk -v begin="$BEGIN" -v end="$END" '
  $0==begin {skip=1; next}
  $0==end {skip=0; next}
  !skip {print}
' "$TORRC" >"$TMP_TORRC"
cat >>"$TMP_TORRC" <<EOF

$BEGIN
HiddenServiceDir ${HS_DIR}/
HiddenServiceVersion 3
HiddenServicePort ${TOR_ONION_PORT} 127.0.0.1:${TOR_ONION_PORT}
$END
EOF
cp -a "$TORRC" "${TORRC}.mfp-backup-$(date +%Y%m%d%H%M%S)"
install -m 0644 "$TMP_TORRC" "$TORRC"
rm -f "$TMP_TORRC"

systemctl enable tor
systemctl restart tor

HOSTNAME_FILE="${HS_DIR}/hostname"
for _ in $(seq 1 30); do
  [ -s "$HOSTNAME_FILE" ] && break
  sleep 1
done
if [ ! -s "$HOSTNAME_FILE" ]; then
  echo "Tor onion hostname was not created at $HOSTNAME_FILE" >&2
  systemctl --no-pager status tor | head -n 40 >&2 || true
  exit 5
fi
ONION="$(tr -d '\r\n ' < "$HOSTNAME_FILE")"
case "$ONION" in
  *.onion) ;;
  *) echo "Invalid onion hostname: $ONION" >&2; exit 6 ;;
esac

CFG_BEGIN='# BEGIN MFP TOR'
CFG_END='# END MFP TOR'
TMP_CFG="$(mktemp)"
awk -v begin="$CFG_BEGIN" -v end="$CFG_END" '
  $0==begin {skip=1; next}
  $0==end {skip=0; next}
  !skip {print}
' "$MONEROD_CONFIG_PATH" >"$TMP_CFG"
cat >>"$TMP_CFG" <<EOF

$CFG_BEGIN
anonymous-inbound=${ONION}:${TOR_ONION_PORT},127.0.0.1:${TOR_ONION_PORT},100
tx-proxy=tor,127.0.0.1:${TOR_SOCKS_PORT},16,disable_noise
$CFG_END
EOF
cp -a "$MONEROD_CONFIG_PATH" "${MONEROD_CONFIG_PATH}.mfp-tor-backup-$(date +%Y%m%d%H%M%S)"
install -m 0644 "$TMP_CFG" "$MONEROD_CONFIG_PATH"
rm -f "$TMP_CFG"

systemctl restart "$MONEROD_SERVICE_UNIT"
sleep 2
systemctl is-active --quiet tor
systemctl is-active --quiet "$MONEROD_SERVICE_UNIT"

echo "Tor onion configured for monerod P2P: ${ONION}:${TOR_ONION_PORT}"
echo "Monerod RPC was not exposed; it remains configured separately."
