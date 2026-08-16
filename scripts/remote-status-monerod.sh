#!/usr/bin/env bash
set +e

: "${TARGET_USER:=}"
: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${MONEROD_RPC_PORT:=18081}"
: "${MONEROD_CONFIG_PATH:=/etc/monero/monerod.conf}"

BIN=""
PROC_PID=""
PROCESS=0
EXEC_START="$(systemctl show -p ExecStart --value "$MONEROD_SERVICE_UNIT" 2>/dev/null)"

proc_args() {
  local pid="$1"
  ps -p "$pid" -o args= 2>/dev/null | head -n 1
}

path_from_args() {
  local target="$1"
  shift
  local word clean
  for word in "$@"; do
    clean="${word#\"}"; clean="${clean%\"}"
    clean="${clean#\'}"; clean="${clean%\'}"
    if [ "$(basename "$clean" 2>/dev/null)" = "$target" ] && [ -x "$clean" ]; then
      printf '%s\n' "$clean"
      return 0
    fi
  done
  return 1
}

find_target_pid() {
  local target="$1" unit="$2" cgroup pid comm
  pid="$(pgrep -xo "$target" 2>/dev/null | head -n 1)"
  if [ -n "$pid" ]; then printf '%s\n' "$pid"; return 0; fi

  cgroup="$(systemctl show -p ControlGroup --value "$unit" 2>/dev/null)"
  if [ -n "$cgroup" ] && [ "$cgroup" != "/" ]; then
    for proc in /proc/[0-9]*; do
      pid="$(basename "$proc")"
      [ -r "/proc/$pid/cgroup" ] || continue
      grep -Fq -- "$cgroup" "/proc/$pid/cgroup" 2>/dev/null || continue
      comm="$(ps -p "$pid" -o comm= 2>/dev/null | tr -d '[:space:]')"
      if [ "$comm" = "$target" ]; then printf '%s\n' "$pid"; return 0; fi
    done
  fi

  ps -eo pid=,comm=,args= 2>/dev/null | awk -v t="$target" '
    $2 != "awk" && $2 != "grep" && $0 !~ /remote-status-monerod/ {
      for (i=3;i<=NF;i++) {
        n=split($i,a,"/");
        gsub(/^[\047\"]|[\047\"]$/,"",a[n]);
        if (a[n]==t) { print $1; exit }
      }
    }'
}

arg_value() {
  local pid="$1" key="$2" want=0 arg text
  if [ -r "/proc/$pid/cmdline" ]; then
    while IFS= read -r arg; do
      if [ "$want" = "1" ]; then printf '%s\n' "$arg"; return 0; fi
      if [ "$arg" = "$key" ]; then want=1; continue; fi
      case "$arg" in
        "$key"=*) printf '%s\n' "${arg#*=}"; return 0 ;;
      esac
    done < <(tr '\0' '\n' < "/proc/$pid/cmdline")
  fi

  text="$(proc_args "$pid")"
  want=0
  for arg in $text; do
    if [ "$want" = "1" ]; then printf '%s\n' "$arg"; return 0; fi
    if [ "$arg" = "$key" ]; then want=1; continue; fi
    case "$arg" in
      "$key"=*) printf '%s\n' "${arg#*=}"; return 0 ;;
    esac
  done
  return 1
}

has_arg() {
  local pid="$1" key="$2" arg
  if [ -r "/proc/$pid/cmdline" ]; then
    while IFS= read -r arg; do [ "$arg" = "$key" ] && return 0; done < <(tr '\0' '\n' < "/proc/$pid/cmdline")
  fi
  for arg in $(proc_args "$pid"); do [ "$arg" = "$key" ] && return 0; done
  return 1
}

config_value() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  sed -n "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*//p" "$file" 2>/dev/null | head -n 1 | sed 's/[[:space:]]*$//'
}

PROC_PID="$(find_target_pid monerod "$MONEROD_SERVICE_UNIT")"
if [ -n "$PROC_PID" ]; then
  PROCESS=1
  EXE="$(readlink -f "/proc/$PROC_PID/exe" 2>/dev/null)"
  if [ "$(basename "$EXE" 2>/dev/null)" = "monerod" ] && [ -x "$EXE" ]; then BIN="$EXE"; fi
  if [ -z "$BIN" ]; then
    ARGS="$(proc_args "$PROC_PID")"
    # shellcheck disable=SC2086
    BIN="$(path_from_args monerod $ARGS)"
  fi
fi

if [ -z "$BIN" ]; then
  STATUS_PATH="$(systemctl status "$MONEROD_SERVICE_UNIT" --no-pager --full 2>/dev/null | awk '
    { for(i=1;i<=NF;i++){ x=$i; gsub(/^[├└─│]+/,"",x); if(x ~ /(^|\/)monerod$/){print x; exit} } }')"
  if [ -n "$STATUS_PATH" ] && [ -x "$STATUS_PATH" ]; then BIN="$STATUS_PATH"; fi
fi

if [ -z "$BIN" ]; then
  EXEC_BIN="$(printf '%s' "$EXEC_START" | sed -n 's/.*path=\([^ ;}]*\).*/\1/p' | head -n 1)"
  if [ -n "$EXEC_BIN" ] && [ -x "$EXEC_BIN" ] && [ "$(basename "$EXEC_BIN")" = "monerod" ]; then BIN="$EXEC_BIN"; fi
fi
if [ -z "$BIN" ] && [ -x /opt/monero/monerod ]; then
  BIN=/opt/monero/monerod
elif [ -z "$BIN" ] && command -v monerod >/dev/null 2>&1; then
  CANDIDATE="$(command -v monerod)"
  [ "$(basename "$CANDIDATE")" = "monerod" ] && BIN="$CANDIDATE"
fi

VERSION=""
if [ -n "$BIN" ] && [ -x "$BIN" ]; then VERSION="$($BIN --version 2>/dev/null | head -n 1)"; fi

# Locate the configuration from the real daemon first. Legacy MFP installs may
# keep bitmonero.conf beside the working directory/data directory rather than
# under /etc/monero.
CONFIG_PATH=""
if [ -n "$PROC_PID" ]; then CONFIG_PATH="$(arg_value "$PROC_PID" --config-file 2>/dev/null)"; fi
if [ -z "$CONFIG_PATH" ]; then
  CONFIG_PATH="$(printf '%s' "$EXEC_START" | sed -n 's/.*--config-file[= ]\([^ ;}]*\).*/\1/p' | head -n 1)"
fi

SERVICE_USER="$(systemctl show -p User --value "$MONEROD_SERVICE_UNIT" 2>/dev/null)"
[ -z "$SERVICE_USER" ] && [ -n "$PROC_PID" ] && SERVICE_USER="$(ps -p "$PROC_PID" -o user= 2>/dev/null | xargs)"
[ -z "$SERVICE_USER" ] && SERVICE_USER="$TARGET_USER"
SERVICE_HOME="$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f6)"
TARGET_HOME="$(getent passwd "$TARGET_USER" 2>/dev/null | cut -d: -f6)"
PROC_CWD=""
[ -n "$PROC_PID" ] && PROC_CWD="$(readlink -f "/proc/$PROC_PID/cwd" 2>/dev/null)"
DATA_DIR=""
[ -n "$PROC_PID" ] && DATA_DIR="$(arg_value "$PROC_PID" --data-dir 2>/dev/null)"
BIN_DIR=""
[ -n "$BIN" ] && BIN_DIR="$(dirname "$BIN")"

if [ -z "$CONFIG_PATH" ]; then
  for candidate in \
    "$MONEROD_CONFIG_PATH" \
    /etc/monero/monerod.conf \
    /etc/monerod.conf \
    "$DATA_DIR/bitmonero.conf" \
    "$DATA_DIR/monerod.conf" \
    "$PROC_CWD/bitmonero.conf" \
    "$PROC_CWD/monerod.conf" \
    "$BIN_DIR/bitmonero.conf" \
    "$BIN_DIR/monerod.conf" \
    "$SERVICE_HOME/.bitmonero/bitmonero.conf" \
    "$TARGET_HOME/.bitmonero/bitmonero.conf"; do
    [ -n "$candidate" ] && [ -f "$candidate" ] || continue
    CONFIG_PATH="$candidate"
    break
  done
fi

if [ -z "$CONFIG_PATH" ] && [ -n "$BIN_DIR" ]; then
  SEARCH_ROOT="$(dirname "$BIN_DIR")"
  FOUND="$(find "$BIN_DIR" "$SEARCH_ROOT" -maxdepth 3 -type f \( -name bitmonero.conf -o -name monerod.conf \) 2>/dev/null | head -n 1)"
  [ -n "$FOUND" ] && CONFIG_PATH="$FOUND"
fi

CONFIG=0
[ -n "$CONFIG_PATH" ] && [ -f "$CONFIG_PATH" ] && CONFIG=1

# Discover the real RPC bind settings. Do not assume 127.0.0.1:18081 when a
# legacy service uses a custom port or binds to the server LAN address.
RPC_PORT=""
RPC_RESTRICTED_PORT=""
RPC_IP=""
RPC_RESTRICTED_IP=""
RPC_LOGIN=""
if [ -n "$PROC_PID" ]; then
  RPC_PORT="$(arg_value "$PROC_PID" --rpc-bind-port 2>/dev/null)"
  RPC_RESTRICTED_PORT="$(arg_value "$PROC_PID" --rpc-restricted-bind-port 2>/dev/null)"
  RPC_IP="$(arg_value "$PROC_PID" --rpc-bind-ip 2>/dev/null)"
  RPC_RESTRICTED_IP="$(arg_value "$PROC_PID" --rpc-restricted-bind-ip 2>/dev/null)"
  RPC_LOGIN="$(arg_value "$PROC_PID" --rpc-login 2>/dev/null)"
fi
if [ "$CONFIG" = "1" ]; then
  [ -z "$RPC_PORT" ] && RPC_PORT="$(config_value "$CONFIG_PATH" rpc-bind-port)"
  [ -z "$RPC_RESTRICTED_PORT" ] && RPC_RESTRICTED_PORT="$(config_value "$CONFIG_PATH" rpc-restricted-bind-port)"
  [ -z "$RPC_IP" ] && RPC_IP="$(config_value "$CONFIG_PATH" rpc-bind-ip)"
  [ -z "$RPC_RESTRICTED_IP" ] && RPC_RESTRICTED_IP="$(config_value "$CONFIG_PATH" rpc-restricted-bind-ip)"
  [ -z "$RPC_LOGIN" ] && RPC_LOGIN="$(config_value "$CONFIG_PATH" rpc-login)"
fi
[ -z "$RPC_PORT" ] && RPC_PORT="$MONEROD_RPC_PORT"
[ -z "$RPC_IP" ] && RPC_IP="127.0.0.1"

RPC_AUTH=0
[ -n "$RPC_LOGIN" ] && RPC_AUTH=1
RPC_PRIVATE=0
case "$RPC_IP" in 127.*|localhost|::1) RPC_PRIVATE=1 ;; esac
case "$RPC_RESTRICTED_IP" in 127.*|localhost|::1) RPC_PRIVATE=1 ;; esac

normalize_host() {
  case "$1" in
    ""|0.0.0.0|::|"[::]") printf '127.0.0.1\n' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

RPC=0
RPC_ENDPOINT=""
INFO=""
try_rpc() {
  local host="$1" port="$2" response
  [ -n "$host" ] && [ -n "$port" ] || return 1
  host="$(normalize_host "$host")"
  case "$port" in *[!0-9]*|"") return 1 ;; esac
  response="$(curl -sS --max-time 3 -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":"0","method":"get_info"}' \
    "http://$host:$port/json_rpc" 2>/dev/null)"
  if printf '%s' "$response" | grep -Eq '"(height|status|result)"'; then
    RPC=1
    RPC_ENDPOINT="$host:$port"
    INFO="$response"
    return 0
  fi
  return 1
}

# Prefer an explicitly configured restricted endpoint, then the normal one,
# then the panel's stored/default port on loopback.
if [ -n "$RPC_RESTRICTED_PORT" ]; then try_rpc "${RPC_RESTRICTED_IP:-$RPC_IP}" "$RPC_RESTRICTED_PORT" || true; fi
if [ "$RPC" = "0" ]; then try_rpc "$RPC_IP" "$RPC_PORT" || true; fi
if [ "$RPC" = "0" ] && [ "$RPC_PORT" != "$MONEROD_RPC_PORT" ]; then try_rpc 127.0.0.1 "$MONEROD_RPC_PORT" || true; fi
if [ "$RPC" = "0" ]; then
  RPC_ENDPOINT="$(normalize_host "${RPC_RESTRICTED_IP:-$RPC_IP}"):${RPC_RESTRICTED_PORT:-$RPC_PORT}"
fi

PRUNED=""
if printf '%s' "$INFO" | grep -Eq '"pruned"[[:space:]]*:[[:space:]]*true'; then PRUNED=1; fi
if printf '%s' "$INFO" | grep -Eq '"pruned"[[:space:]]*:[[:space:]]*false'; then PRUNED=0; fi
if [ -z "$PRUNED" ] && [ -n "$PROC_PID" ] && has_arg "$PROC_PID" --prune-blockchain; then PRUNED=1; fi
if [ -z "$PRUNED" ] && [ "$CONFIG" = "1" ]; then
  PRUNE_VALUE="$(config_value "$CONFIG_PATH" prune-blockchain)"
  case "$PRUNE_VALUE" in 1|true|yes) PRUNED=1 ;; 0|false|no) PRUNED=0 ;; esac
fi

LOAD_STATE="$(systemctl show -p LoadState --value "$MONEROD_SERVICE_UNIT" 2>/dev/null)"
SERVICE=0
[ "$LOAD_STATE" = "loaded" ] && SERVICE=1
ENABLED=0
systemctl is-enabled --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1 && ENABLED=1
ACTIVE=0
systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1 && ACTIVE=1
[ "$ACTIVE" = "1" ] && PROCESS=1

printf 'MFP_BINARY=%s\n' "$BIN"
printf 'MFP_PROCESS=%s\n' "$PROCESS"
printf 'MFP_PID=%s\n' "$PROC_PID"
printf 'MFP_VERSION=%s\n' "$VERSION"
printf 'MFP_CONFIG=%s\n' "$CONFIG"
printf 'MFP_CONFIG_PATH=%s\n' "$CONFIG_PATH"
printf 'MFP_SERVICE=%s\n' "$SERVICE"
printf 'MFP_ENABLED=%s\n' "$ENABLED"
printf 'MFP_ACTIVE=%s\n' "$ACTIVE"
printf 'MFP_RPC=%s\n' "$RPC"
printf 'MFP_RPC_ENDPOINT=%s\n' "$RPC_ENDPOINT"
printf 'MFP_RPC_PRIVATE=%s\n' "$RPC_PRIVATE"
printf 'MFP_RPC_AUTH=%s\n' "$RPC_AUTH"
printf 'MFP_PRUNED=%s\n' "$PRUNED"
exit 0
