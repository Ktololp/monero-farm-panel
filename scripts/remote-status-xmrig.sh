#!/usr/bin/env bash
set +e

: "${XMRIG_SERVICE_UNIT:=xmrig.service}"
: "${XMRIG_CONFIG_PATH:=/opt/xmrig/config.json}"

BIN=""
PROC_PID=""
PROCESS=0
CONFIG_PATH="$XMRIG_CONFIG_PATH"

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

arg_value() {
  local pid="$1" key="$2" want=0 arg
  [ -r "/proc/$pid/cmdline" ] || return 1
  while IFS= read -r arg; do
    if [ "$want" = "1" ]; then printf '%s\n' "$arg"; return 0; fi
    if [ "$arg" = "$key" ]; then want=1; continue; fi
    case "$arg" in
      "$key"=*) printf '%s\n' "${arg#*=}"; return 0 ;;
    esac
  done < <(tr '\0' '\n' < "/proc/$pid/cmdline")
  return 1
}

find_target_pid() {
  local target="$1" unit="$2" cgroup pid comm

  # pgrep does not require reading /proc/PID/exe, which may be hidden for a
  # root-owned miner even though the process itself is perfectly healthy.
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

  # Last resort for custom wrappers/process titles: look for an xmrig path in
  # the command line, but explicitly ignore this detector script itself.
  ps -eo pid=,comm=,args= 2>/dev/null | awk -v t="$target" '
    $2 != "awk" && $2 != "grep" && $0 !~ /remote-status-xmrig/ {
      for (i=3;i<=NF;i++) {
        n=split($i,a,"/");
        gsub(/^[\047\"]|[\047\"]$/,"",a[n]);
        if (a[n]==t) { print $1; exit }
      }
    }'
}

PROC_PID="$(find_target_pid xmrig "$XMRIG_SERVICE_UNIT")"
if [ -n "$PROC_PID" ]; then
  PROCESS=1
  EXE="$(readlink -f "/proc/$PROC_PID/exe" 2>/dev/null)"
  if [ "$(basename "$EXE" 2>/dev/null)" = "xmrig" ] && [ -x "$EXE" ]; then
    BIN="$EXE"
  fi

  if [ -z "$BIN" ]; then
    ARGS="$(proc_args "$PROC_PID")"
    # shellcheck disable=SC2086
    BIN="$(path_from_args xmrig $ARGS)"
  fi

  PROC_CONFIG="$(arg_value "$PROC_PID" --config 2>/dev/null)"
  [ -z "$PROC_CONFIG" ] && PROC_CONFIG="$(arg_value "$PROC_PID" -c 2>/dev/null)"
  if [ -n "$PROC_CONFIG" ] && [ -f "$PROC_CONFIG" ]; then CONFIG_PATH="$PROC_CONFIG"; fi
fi

# systemctl status normally shows the child command even when /proc/PID/exe is
# not readable by the SSH user.
if [ -z "$BIN" ]; then
  STATUS_PATH="$(systemctl status "$XMRIG_SERVICE_UNIT" --no-pager --full 2>/dev/null | awk '
    { for(i=1;i<=NF;i++){ x=$i; gsub(/^[├└─│]+/,"",x); if(x ~ /(^|\/)xmrig$/){print x; exit} } }')"
  if [ -n "$STATUS_PATH" ] && [ -x "$STATUS_PATH" ]; then BIN="$STATUS_PATH"; fi
fi

# Recover the executable from a direct ExecStart when there is no wrapper.
if [ -z "$BIN" ]; then
  EXEC_START="$(systemctl show -p ExecStart --value "$XMRIG_SERVICE_UNIT" 2>/dev/null)"
  EXEC_BIN="$(printf '%s' "$EXEC_START" | sed -n 's/.*path=\([^ ;}]*\).*/\1/p' | head -n 1)"
  if [ -n "$EXEC_BIN" ] && [ -x "$EXEC_BIN" ] && [ "$(basename "$EXEC_BIN")" = "xmrig" ]; then BIN="$EXEC_BIN"; fi
fi

if [ -z "$BIN" ] && [ -x /opt/xmrig/xmrig ]; then
  BIN=/opt/xmrig/xmrig
elif [ -z "$BIN" ] && command -v xmrig >/dev/null 2>&1; then
  CANDIDATE="$(command -v xmrig)"
  [ "$(basename "$CANDIDATE")" = "xmrig" ] && BIN="$CANDIDATE"
fi

# A common legacy layout keeps config.json near the build directory. Search a
# small, bounded area instead of the whole disk.
if [ -z "$BIN" ] && [ -n "$CONFIG_PATH" ]; then
  CONFIG_DIR="$(dirname "$CONFIG_PATH")"
  FOUND="$(find "$CONFIG_DIR" "$(dirname "$CONFIG_DIR")" -maxdepth 4 -type f -name xmrig -perm /111 2>/dev/null | head -n 1)"
  [ -n "$FOUND" ] && BIN="$FOUND"
fi

VERSION=""
if [ -n "$BIN" ] && [ -x "$BIN" ]; then VERSION="$($BIN --version 2>/dev/null | head -n 1)"; fi

CONFIG=0
[ -n "$CONFIG_PATH" ] && [ -f "$CONFIG_PATH" ] && CONFIG=1
LOAD_STATE="$(systemctl show -p LoadState --value "$XMRIG_SERVICE_UNIT" 2>/dev/null)"
SERVICE=0
[ "$LOAD_STATE" = "loaded" ] && SERVICE=1
ENABLED=0
systemctl is-enabled --quiet "$XMRIG_SERVICE_UNIT" >/dev/null 2>&1 && ENABLED=1
ACTIVE=0
systemctl is-active --quiet "$XMRIG_SERVICE_UNIT" >/dev/null 2>&1 && ACTIVE=1
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
exit 0
