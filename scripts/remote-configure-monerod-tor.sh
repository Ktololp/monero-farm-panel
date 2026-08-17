#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

: "${TARGET_USER:=}"
: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${MONEROD_CONFIG_PATH:=}"
: "${TOR_ONION_PORT:=18084}"
: "${TOR_SOCKS_PORT:=9050}"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer currently supports Debian/Ubuntu (apt-get required)" >&2
  exit 3
fi

MONEROD_PID="$(pgrep -xo monerod 2>/dev/null | head -n 1)"
if [ -z "$MONEROD_PID" ]; then
  echo "monerod process not found" >&2
  exit 4
fi

arg_value() {
  local pid="$1" key="$2" want=0 arg
  if [ -r "/proc/$pid/cmdline" ]; then
    while IFS= read -r arg; do
      if [ "$want" = "1" ]; then printf '%s\n' "$arg"; return 0; fi
      if [ "$arg" = "$key" ]; then want=1; continue; fi
      case "$arg" in
        "$key"=*) printf '%s\n' "${arg#*=}"; return 0 ;;
      esac
    done < <(tr '\0' '\n' < "/proc/$pid/cmdline")
  fi
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

# Existing CLI anonymity settings have higher priority than a config file.
# Refuse to silently combine or override a user's existing setup.
if has_arg "$MONEROD_PID" --tx-proxy || has_arg "$MONEROD_PID" --anonymous-inbound; then
  echo "monerod already has Tor/I2P anonymity options on its command line; automatic Tor setup was not applied" >&2
  exit 5
fi

SERVICE_USER="$(systemctl show -p User --value "$MONEROD_SERVICE_UNIT" 2>/dev/null)"
[ -z "$SERVICE_USER" ] && SERVICE_USER="$(ps -p "$MONEROD_PID" -o user= 2>/dev/null | xargs)"
[ -z "$SERVICE_USER" ] && SERVICE_USER="$TARGET_USER"
[ -z "$SERVICE_USER" ] && SERVICE_USER=root
SERVICE_GROUP="$(id -gn "$SERVICE_USER" 2>/dev/null || printf '%s' "$SERVICE_USER")"
SERVICE_HOME="$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f6)"
TARGET_HOME="$(getent passwd "$TARGET_USER" 2>/dev/null | cut -d: -f6)"
PROC_HOME=""
if [ -r "/proc/$MONEROD_PID/environ" ]; then
  PROC_HOME="$(tr '\0' '\n' < "/proc/$MONEROD_PID/environ" | sed -n 's/^HOME=//p' | head -n 1)"
fi
WORK_DIR="$(systemctl show -p WorkingDirectory --value "$MONEROD_SERVICE_UNIT" 2>/dev/null)"
[ -z "$WORK_DIR" ] && WORK_DIR="$(readlink -f "/proc/$MONEROD_PID/cwd" 2>/dev/null || true)"
[ -z "$WORK_DIR" ] && WORK_DIR="${PROC_HOME:-${SERVICE_HOME:-${TARGET_HOME:-/}}}"

resolve_path() {
  local value="$1" home="$2" base="$3"
  case "$value" in
    "~/"*) printf '%s/%s\n' "$home" "${value#~/}" ;;
    /*) printf '%s\n' "$value" ;;
    *) printf '%s/%s\n' "$base" "$value" ;;
  esac
}

# monerod officially looks for bitmonero.conf in its data directory when no
# --config-file is supplied. This lets MFP add Tor to legacy CLI-only nodes
# without rewriting their systemd unit or command-line arguments.
if [ -z "$MONEROD_CONFIG_PATH" ]; then
  EXPLICIT_CONFIG="$(arg_value "$MONEROD_PID" --config-file 2>/dev/null || true)"
  if [ -n "$EXPLICIT_CONFIG" ]; then
    MONEROD_CONFIG_PATH="$(resolve_path "$EXPLICIT_CONFIG" "${PROC_HOME:-$SERVICE_HOME}" "$WORK_DIR")"
  else
    DATA_DIR="$(arg_value "$MONEROD_PID" --data-dir 2>/dev/null || true)"
    if [ -n "$DATA_DIR" ]; then
      DATA_DIR="$(resolve_path "$DATA_DIR" "${PROC_HOME:-$SERVICE_HOME}" "$WORK_DIR")"
    else
      DEFAULT_HOME="${PROC_HOME:-${SERVICE_HOME:-$TARGET_HOME}}"
      if [ -z "$DEFAULT_HOME" ]; then
        echo "Could not determine monerod data directory safely" >&2
        exit 6
      fi
      DATA_DIR="$DEFAULT_HOME/.bitmonero"
    fi
    MONEROD_CONFIG_PATH="$DATA_DIR/bitmonero.conf"
  fi
fi

case "$MONEROD_CONFIG_PATH" in
  /*) ;;
  *) echo "Refusing non-absolute monerod config path: $MONEROD_CONFIG_PATH" >&2; exit 7 ;;
esac

CONFIG_DIR="$(dirname "$MONEROD_CONFIG_PATH")"
CONFIG_CREATED=0
if [ ! -f "$MONEROD_CONFIG_PATH" ]; then
  if [ ! -d "$CONFIG_DIR" ]; then
    install -d -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$CONFIG_DIR"
  fi
  cat >"$MONEROD_CONFIG_PATH" <<'EOF'
# Created by Monero Farm Panel for managed node settings.
# Existing monerod command-line arguments are intentionally left unchanged.
EOF
  chown "$SERVICE_USER:$SERVICE_GROUP" "$MONEROD_CONFIG_PATH"
  chmod 0644 "$MONEROD_CONFIG_PATH"
  CONFIG_CREATED=1
  echo "Created standard monerod config: $MONEROD_CONFIG_PATH"
fi

CFG_UID="$(stat -c '%u' "$MONEROD_CONFIG_PATH")"
CFG_GID="$(stat -c '%g' "$MONEROD_CONFIG_PATH")"
CFG_MODE="$(stat -c '%a' "$MONEROD_CONFIG_PATH")"

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
  exit 8
fi
ONION="$(tr -d '\r\n ' < "$HOSTNAME_FILE")"
case "$ONION" in
  *.onion) ;;
  *) echo "Invalid onion hostname: $ONION" >&2; exit 9 ;;
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
if [ "$CONFIG_CREATED" = "0" ]; then
  cp -a "$MONEROD_CONFIG_PATH" "${MONEROD_CONFIG_PATH}.mfp-tor-backup-$(date +%Y%m%d%H%M%S)"
fi
install -m "$CFG_MODE" "$TMP_CFG" "$MONEROD_CONFIG_PATH"
chown "$CFG_UID:$CFG_GID" "$MONEROD_CONFIG_PATH"
rm -f "$TMP_CFG"

systemctl restart "$MONEROD_SERVICE_UNIT"
sleep 3
systemctl is-active --quiet tor
systemctl is-active --quiet "$MONEROD_SERVICE_UNIT"

echo "Tor onion configured for monerod P2P: ${ONION}:${TOR_ONION_PORT}"
echo "monerod config: ${MONEROD_CONFIG_PATH}"
echo "Monerod RPC was not exposed or modified; its existing bind settings remain separate."
