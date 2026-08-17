#!/usr/bin/env bash
set -euo pipefail

: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${MONEROD_CONFIG_PATH:=}"
: "${TOR_SOCKS_PORT:=9050}"
: "${TOR_P2P_MODE:=enable}"

case "$TOR_P2P_MODE" in
  enable|disable) ;;
  *) echo "Invalid TOR_P2P_MODE: $TOR_P2P_MODE" >&2; exit 2 ;;
esac

if [ -z "$MONEROD_CONFIG_PATH" ] || [ ! -f "$MONEROD_CONFIG_PATH" ]; then
  echo "monerod config file was not found; configure the Tor onion service first" >&2
  exit 3
fi
if ! systemctl is-active --quiet tor >/dev/null 2>&1; then
  echo "Tor service is not active" >&2
  exit 4
fi
if ! systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1; then
  echo "monerod service is not active" >&2
  exit 5
fi

MONEROD_PID="$(pgrep -xo monerod 2>/dev/null | head -n 1)"
if [ -z "$MONEROD_PID" ]; then
  echo "monerod process not found" >&2
  exit 6
fi

arg_value() {
  local pid="$1" key="$2" want=0 arg
  [ -r "/proc/$pid/cmdline" ] || return 1
  while IFS= read -r arg; do
    if [ "$want" = "1" ]; then printf '%s\n' "$arg"; return 0; fi
    if [ "$arg" = "$key" ]; then want=1; continue; fi
    case "$arg" in "$key"=*) printf '%s\n' "${arg#*=}"; return 0 ;; esac
  done < <(tr '\0' '\n' < "/proc/$pid/cmdline")
  return 1
}

has_arg() {
  local pid="$1" key="$2" arg
  [ -r "/proc/$pid/cmdline" ] || return 1
  while IFS= read -r arg; do
    [ "$arg" = "$key" ] && return 0
    case "$arg" in "$key"=*) return 0 ;; esac
  done < <(tr '\0' '\n' < "/proc/$pid/cmdline")
  return 1
}

# Command-line options override config options. Refuse to claim Tor-only P2P if
# an existing wrapper controls the same settings outside MFP.
if [ "$TOR_P2P_MODE" = "enable" ]; then
  if has_arg "$MONEROD_PID" --proxy || has_arg "$MONEROD_PID" --p2p-bind-ip || has_arg "$MONEROD_PID" --igd || has_arg "$MONEROD_PID" --no-igd || has_arg "$MONEROD_PID" --hide-my-port; then
    echo "monerod command line already controls proxy/P2P bind/IGD/privacy options; MFP will not override those arguments" >&2
    exit 7
  fi
fi

CFG_UID="$(stat -c '%u' "$MONEROD_CONFIG_PATH")"
CFG_GID="$(stat -c '%g' "$MONEROD_CONFIG_PATH")"
CFG_MODE="$(stat -c '%a' "$MONEROD_CONFIG_PATH")"
BEGIN='# BEGIN MFP TOR P2P'
END='# END MFP TOR P2P'
TMP_CFG="$(mktemp)"

awk -v begin="$BEGIN" -v end="$END" '
  $0==begin {skip=1; next}
  $0==end {skip=0; next}
  !skip {print}
' "$MONEROD_CONFIG_PATH" >"$TMP_CFG"

if [ "$TOR_P2P_MODE" = "enable" ]; then
  cat >>"$TMP_CFG" <<EOF

$BEGIN
# Route ordinary monerod network communication through the local Tor SOCKS port.
# Keep normal P2P bound to loopback so the clearnet P2P listener is not exposed.
proxy=127.0.0.1:${TOR_SOCKS_PORT}
p2p-bind-ip=127.0.0.1
no-igd=1
hide-my-port=1
$END
EOF
fi

cp -a "$MONEROD_CONFIG_PATH" "${MONEROD_CONFIG_PATH}.mfp-tor-p2p-backup-$(date +%Y%m%d%H%M%S)"
install -m "$CFG_MODE" "$TMP_CFG" "$MONEROD_CONFIG_PATH"
chown "$CFG_UID:$CFG_GID" "$MONEROD_CONFIG_PATH"
rm -f "$TMP_CFG"

systemctl restart "$MONEROD_SERVICE_UNIT"
for _ in $(seq 1 30); do
  systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1 && break
  sleep 1
done
if ! systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1; then
  echo "monerod did not return after changing Tor P2P mode" >&2
  systemctl --no-pager --full status "$MONEROD_SERVICE_UNIT" | head -n 60 >&2 || true
  exit 8
fi

if [ "$TOR_P2P_MODE" = "enable" ]; then
  echo "Full monerod P2P routing through Tor is enabled."
else
  echo "MFP full-P2P Tor routing block was removed; normal monerod P2P defaults apply again."
fi
