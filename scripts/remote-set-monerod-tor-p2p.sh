#!/usr/bin/env bash
set -euo pipefail

: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${MONEROD_CONFIG_PATH:=}"
: "${TOR_SOCKS_PORT:=9050}"
: "${TOR_P2P_MODE:=enable}"

case "$TOR_P2P_MODE" in enable|disable) ;; *) echo "Invalid TOR_P2P_MODE: $TOR_P2P_MODE" >&2; exit 2 ;; esac

if [ -z "$MONEROD_CONFIG_PATH" ] || [ ! -f "$MONEROD_CONFIG_PATH" ]; then
  echo "monerod config file was not found; configure the Tor onion service first" >&2
  exit 3
fi
if [ "$TOR_P2P_MODE" = "enable" ] && ! systemctl is-active --quiet tor >/dev/null 2>&1; then
  echo "Tor service is not active" >&2
  exit 4
fi
if ! systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1; then
  echo "monerod service is not active" >&2
  exit 5
fi

MONEROD_PID="$(pgrep -xo monerod 2>/dev/null | head -n 1)"
if [ -z "$MONEROD_PID" ]; then echo "monerod process not found" >&2; exit 6; fi

has_arg() {
  local pid="$1" key="$2" arg
  [ -r "/proc/$pid/cmdline" ] || return 1
  while IFS= read -r arg; do
    [ "$arg" = "$key" ] && return 0
    case "$arg" in "$key"=*) return 0 ;; esac
  done < <(tr '\0' '\n' < "/proc/$pid/cmdline")
  return 1
}

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
BACKUP="${MONEROD_CONFIG_PATH}.mfp-tor-p2p-backup-$(date +%Y%m%d%H%M%S)"

awk -v begin="$BEGIN" -v end="$END" '
  $0==begin {skip=1; next}
  $0==end {skip=0; next}
  !skip {print}
' "$MONEROD_CONFIG_PATH" >"$TMP_CFG"

if [ "$TOR_P2P_MODE" = "enable" ]; then
  if grep -Eq '^[[:space:]]*(proxy|p2p-bind-ip|igd|no-igd|hide-my-port)[[:space:]]*=' "$TMP_CFG"; then
    rm -f "$TMP_CFG"
    echo "monerod config already contains custom proxy/P2P bind/IGD/privacy options outside the MFP block; automatic Tor P2P routing was not applied" >&2
    exit 8
  fi
  cat >>"$TMP_CFG" <<EOF

$BEGIN
proxy=127.0.0.1:${TOR_SOCKS_PORT}
p2p-bind-ip=127.0.0.1
no-igd=1
hide-my-port=1
$END
EOF
fi

cp -a "$MONEROD_CONFIG_PATH" "$BACKUP"
install -m "$CFG_MODE" "$TMP_CFG" "$MONEROD_CONFIG_PATH"
chown "$CFG_UID:$CFG_GID" "$MONEROD_CONFIG_PATH"
rm -f "$TMP_CFG"

rollback() {
  echo "Rolling back monerod config to $BACKUP" >&2
  cp -a "$BACKUP" "$MONEROD_CONFIG_PATH" || true
  chown "$CFG_UID:$CFG_GID" "$MONEROD_CONFIG_PATH" || true
  systemctl restart "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1 || true
}

if ! systemctl restart "$MONEROD_SERVICE_UNIT"; then
  rollback
  echo "monerod failed to restart after changing Tor P2P mode" >&2
  exit 9
fi
for _ in $(seq 1 30); do
  systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1 && break
  sleep 1
done
if ! systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1; then
  rollback
  echo "monerod did not return after changing Tor P2P mode" >&2
  exit 10
fi

if [ "$TOR_P2P_MODE" = "enable" ]; then
  NEW_MONEROD_PID="$(pgrep -xo monerod 2>/dev/null | head -n 1)"
  P2P_PORT=""
  [ -n "$NEW_MONEROD_PID" ] && P2P_PORT="$(arg_value "$NEW_MONEROD_PID" --p2p-bind-port 2>/dev/null || true)"
  [ -z "$P2P_PORT" ] && P2P_PORT="$(sed -n 's/^[[:space:]]*p2p-bind-port[[:space:]]*=[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' "$MONEROD_CONFIG_PATH" | tail -n 1)"
  [ -z "$P2P_PORT" ] && P2P_PORT=18080

  RUNTIME_OK=0
  for _ in $(seq 1 30); do
    LOOPBACK=0
    WILDCARD=0
    if command -v ss >/dev/null 2>&1; then
      ss -ltnH 2>/dev/null | awk -v p="$P2P_PORT" '$4 == "127.0.0.1:" p { found=1 } END { exit !found }'
      [ $? -eq 0 ] && LOOPBACK=1
      ss -ltnH 2>/dev/null | awk -v p="$P2P_PORT" '$4 == "0.0.0.0:" p || $4 == "*:" p { found=1 } END { exit !found }'
      [ $? -eq 0 ] && WILDCARD=1
    elif command -v netstat >/dev/null 2>&1; then
      netstat -lnt 2>/dev/null | awk -v p="$P2P_PORT" '$4 == "127.0.0.1:" p { found=1 } END { exit !found }'
      [ $? -eq 0 ] && LOOPBACK=1
      netstat -lnt 2>/dev/null | awk -v p="$P2P_PORT" '$4 == "0.0.0.0:" p || $4 == "*:" p { found=1 } END { exit !found }'
      [ $? -eq 0 ] && WILDCARD=1
    else
      LOOPBACK=1
    fi
    if [ "$LOOPBACK" = "1" ] && [ "$WILDCARD" = "0" ]; then RUNTIME_OK=1; break; fi
    sleep 1
  done

  if [ "$RUNTIME_OK" != "1" ]; then
    rollback
    echo "Tor P2P config was written, but monerod did not switch ordinary P2P exclusively to 127.0.0.1:${P2P_PORT}; previous config was restored" >&2
    exit 11
  fi
  echo "Full monerod P2P routing through Tor is enabled and loopback binding is active on port ${P2P_PORT}."
else
  echo "MFP full-P2P Tor routing block was removed; normal monerod P2P defaults apply again."
fi
