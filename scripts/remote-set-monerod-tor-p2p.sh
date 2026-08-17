#!/usr/bin/env bash
set -euo pipefail

: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${MONEROD_CONFIG_PATH:=}"
: "${MONEROD_RPC_PORT:=18081}"
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

find_monerod_pid() {
  local cgroup pid chosen=""
  cgroup="$(systemctl show -p ControlGroup --value "$MONEROD_SERVICE_UNIT" 2>/dev/null || true)"
  if [ -n "$cgroup" ] && [ "$cgroup" != "/" ]; then
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      [ -r "/proc/$pid/cgroup" ] || continue
      if grep -Fq -- "$cgroup" "/proc/$pid/cgroup" 2>/dev/null; then chosen="$pid"; fi
    done < <(pgrep -x monerod 2>/dev/null | sort -n || true)
  fi
  if [ -n "$chosen" ]; then
    printf '%s\n' "$chosen"
    return 0
  fi
  pgrep -x monerod 2>/dev/null | sort -n | tail -n 1
}

wait_fresh_monerod() {
  local old_pid="$1" seconds="${2:-75}" pid
  for _ in $(seq 1 "$seconds"); do
    pid="$(find_monerod_pid 2>/dev/null || true)"
    if [ -n "$pid" ] && [ "$pid" != "$old_pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      printf '%s\n' "$pid"
      return 0
    fi
    sleep 1
  done
  return 1
}

monerod_rpc_ready() {
  command -v curl >/dev/null 2>&1 || return 1
  curl -fsS --max-time 3 \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":"0","method":"get_info"}' \
    "http://127.0.0.1:${MONEROD_RPC_PORT}/json_rpc" 2>/dev/null \
    | grep -Eq '"result"[[:space:]]*:'
}

wait_monerod_rpc() {
  local seconds="${1:-60}"
  for _ in $(seq 1 "$seconds"); do
    monerod_rpc_ready && return 0
    sleep 1
  done
  return 1
}

MONEROD_PID="$(find_monerod_pid 2>/dev/null || true)"
if [ -z "$MONEROD_PID" ]; then echo "monerod process not found" >&2; exit 6; fi
OLD_MONEROD_PID="$MONEROD_PID"

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

capture_priority_peers() {
  command -v curl >/dev/null 2>&1 || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  curl -fsS --max-time 5 \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":"0","method":"get_connections"}' \
    "http://127.0.0.1:${MONEROD_RPC_PORT}/json_rpc" \
  | python3 -c 'import ipaddress,json,sys
try:
    result=(json.load(sys.stdin).get("result") or {})
    rows=result.get("connections") or []
except Exception:
    raise SystemExit(0)
seen=[]
for c in rows:
    if c.get("incoming") is True:
        continue
    try:
        if int(c.get("address_type") or 0) != 1:
            continue
    except Exception:
        continue
    host=str(c.get("host") or "").strip()
    port=str(c.get("port") or "").strip()
    if not host:
        address=str(c.get("address") or "").strip()
        if address.count(":") == 1:
            host,port=address.rsplit(":",1)
            host=host.strip()
            port=port.strip()
    try:
        ip=ipaddress.ip_address(host)
    except Exception:
        continue
    if ip.version != 4 or not ip.is_global:
        continue
    if not port.isdigit() or not (1 <= int(port) <= 65535):
        continue
    value=f"{host}:{port}"
    if value in seen:
        continue
    seen.append(value)
    if len(seen) >= 8:
        break
sys.stdout.write("\n".join(seen))'
}

if [ "$TOR_P2P_MODE" = "enable" ]; then
  if has_arg "$MONEROD_PID" --proxy || has_arg "$MONEROD_PID" --p2p-bind-ip || has_arg "$MONEROD_PID" --igd || has_arg "$MONEROD_PID" --no-igd || has_arg "$MONEROD_PID" --hide-my-port || has_arg "$MONEROD_PID" --p2p-use-ipv6 || has_arg "$MONEROD_PID" --p2p-bind-ipv6-address; then
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
ORPHAN_CLEANED=0
PRIORITY_COUNT=0

awk -v begin="$BEGIN" -v end="$END" '
  $0==begin {skip=1; next}
  $0==end {skip=0; next}
  !skip {print}
' "$MONEROD_CONFIG_PATH" >"$TMP_CFG"

if [ "$TOR_P2P_MODE" = "enable" ]; then
  if grep -Eq '^[[:space:]]*(proxy|p2p-bind-ip|igd|no-igd|hide-my-port|p2p-use-ipv6|p2p-bind-ipv6-address)[[:space:]]*=' "$TMP_CFG"; then
    rm -f "$TMP_CFG"
    echo "monerod config already contains custom proxy/P2P bind/IGD/privacy options outside the MFP block; automatic Tor P2P routing was not applied" >&2
    exit 8
  fi

  PRIORITY_PEERS="$(capture_priority_peers || true)"
  if [ -n "$PRIORITY_PEERS" ]; then
    PRIORITY_COUNT="$(printf '%s\n' "$PRIORITY_PEERS" | sed '/^[[:space:]]*$/d' | wc -l | tr -d '[:space:]')"
  fi
  : "${PRIORITY_COUNT:=0}"
  if [ "$PRIORITY_COUNT" -lt 1 ]; then
    rm -f "$TMP_CFG"
    echo "Tor P2P experiment was not started because no current public outbound IPv4 monerod peers could be captured for proxy bootstrap. Working config was not changed." >&2
    exit 12
  fi

  {
    printf '\n%s\n' "$BEGIN"
    printf 'proxy=127.0.0.1:%s\n' "$TOR_SOCKS_PORT"
    printf 'p2p-bind-ip=127.0.0.1\n'
    printf 'no-igd=1\n'
    printf 'hide-my-port=1\n'
    while IFS= read -r peer; do
      [ -n "$peer" ] && printf 'add-priority-node=%s\n' "$peer"
    done <<< "$PRIORITY_PEERS"
    printf '%s\n' "$END"
  } >>"$TMP_CFG"
else
  shopt -s nullglob
  OLD_BACKUPS=("${MONEROD_CONFIG_PATH}".mfp-tor-p2p-backup-*)
  shopt -u nullglob
  if [ "${#OLD_BACKUPS[@]}" -gt 0 ] \
    && grep -Eq '^[[:space:]]*proxy[[:space:]]*=[[:space:]]*127[.]0[.]0[.]1:'"${TOR_SOCKS_PORT}"'[[:space:]]*$' "$TMP_CFG" \
    && grep -Eq '^[[:space:]]*p2p-bind-ip[[:space:]]*=[[:space:]]*127[.]0[.]0[.]1[[:space:]]*$' "$TMP_CFG" \
    && grep -Eq '^[[:space:]]*no-igd[[:space:]]*=[[:space:]]*1[[:space:]]*$' "$TMP_CFG" \
    && grep -Eq '^[[:space:]]*hide-my-port[[:space:]]*=[[:space:]]*1[[:space:]]*$' "$TMP_CFG"; then
    CLEAN_CFG="$(mktemp)"
    awk -v socks="$TOR_SOCKS_PORT" '
      /^[[:space:]]*p2p-bind-ip[[:space:]]*=[[:space:]]*127[.]0[.]0[.]1[[:space:]]*$/ {next}
      /^[[:space:]]*no-igd[[:space:]]*=[[:space:]]*1[[:space:]]*$/ {next}
      /^[[:space:]]*hide-my-port[[:space:]]*=[[:space:]]*1[[:space:]]*$/ {next}
      {
        line=$0
        if (line ~ /^[[:space:]]*proxy[[:space:]]*=/) {
          value=line
          sub(/^[[:space:]]*proxy[[:space:]]*=[[:space:]]*/, "", value)
          gsub(/[[:space:]]+$/, "", value)
          if (value == "127.0.0.1:" socks) next
        }
        print
      }
    ' "$TMP_CFG" >"$CLEAN_CFG"
    mv "$CLEAN_CFG" "$TMP_CFG"
    ORPHAN_CLEANED=1
  fi
fi

if cmp -s "$MONEROD_CONFIG_PATH" "$TMP_CFG"; then
  rm -f "$TMP_CFG"
  printf 'MFP_CHANGED=0\n'
  printf 'MFP_ORPHAN_CLEANED=0\n'
  printf 'MFP_PRIORITY_PEERS=0\n'
  echo "No managed or proven orphaned MFP full-P2P Tor settings remain; service restart skipped."
  exit 0
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

NEW_MONEROD_PID="$(wait_fresh_monerod "$OLD_MONEROD_PID" 75 2>/dev/null || true)"
if [ -z "$NEW_MONEROD_PID" ]; then
  rollback
  echo "monerod service restarted, but a fresh monerod process was not observed within 75s; previous config was restored" >&2
  exit 10
fi

if ! wait_monerod_rpc 60; then
  rollback
  echo "fresh monerod PID ${NEW_MONEROD_PID} started, but RPC 127.0.0.1:${MONEROD_RPC_PORT} did not become ready; previous config was restored" >&2
  exit 13
fi

printf 'MFP_CHANGED=1\n'
printf 'MFP_ORPHAN_CLEANED=%s\n' "$ORPHAN_CLEANED"
printf 'MFP_PRIORITY_PEERS=%s\n' "$PRIORITY_COUNT"
printf 'MFP_MONEROD_PID=%s\n' "$NEW_MONEROD_PID"

listener_addresses() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk -v p="$port" '$4 ~ ":" p "$" {print $4}'
    return 0
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk -v p="$port" '$4 ~ ":" p "$" {print $4}'
    return 0
  fi
  return 2
}

classify_bind() {
  local port="$1" addresses addr loopback=0 unsafe=0
  addresses="$(listener_addresses "$port")" || return 2
  if [ -z "$addresses" ]; then
    printf 'closed\n'
    return 0
  fi
  while IFS= read -r addr; do
    [ -n "$addr" ] || continue
    case "$addr" in
      "127.0.0.1:${port}"|"[::1]:${port}"|"::1:${port}") loopback=1 ;;
      *) unsafe=1 ;;
    esac
  done <<< "$addresses"
  if [ "$unsafe" = "1" ]; then printf 'unsafe\n'; return 0; fi
  if [ "$loopback" = "1" ]; then printf 'loopback\n'; return 0; fi
  printf 'closed\n'
}

if [ "$TOR_P2P_MODE" = "enable" ]; then
  P2P_PORT="$(arg_value "$NEW_MONEROD_PID" --p2p-bind-port 2>/dev/null || true)"
  [ -z "$P2P_PORT" ] && P2P_PORT="$(sed -n 's/^[[:space:]]*p2p-bind-port[[:space:]]*=[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' "$MONEROD_CONFIG_PATH" | tail -n 1)"
  [ -z "$P2P_PORT" ] && P2P_PORT=18080

  BIND_STATE="unknown"
  CLOSED_STABLE=0
  for _ in $(seq 1 60); do
    BIND_STATE="$(classify_bind "$P2P_PORT" 2>/dev/null || printf 'unknown')"
    case "$BIND_STATE" in
      loopback) break ;;
      closed)
        CLOSED_STABLE=$((CLOSED_STABLE + 1))
        if [ "$CLOSED_STABLE" -ge 5 ]; then break; fi
        ;;
      unsafe) CLOSED_STABLE=0 ;;
      *) CLOSED_STABLE=0 ;;
    esac
    sleep 1
  done

  LISTENER_SUMMARY="$(listener_addresses "$P2P_PORT" 2>/dev/null | paste -sd ',' - || true)"
  [ -n "$LISTENER_SUMMARY" ] || LISTENER_SUMMARY='none'
  printf 'MFP_P2P_BIND_STATE=%s\n' "$BIND_STATE"
  printf 'MFP_P2P_LISTENERS=%s\n' "$LISTENER_SUMMARY"

  if [ "$BIND_STATE" = "unsafe" ] || [ "$BIND_STATE" = "unknown" ]; then
    rollback
    echo "Tor P2P config was written, but fresh monerod PID ${NEW_MONEROD_PID} did not prove a private P2P bind on port ${P2P_PORT} (state=${BIND_STATE}, listeners=${LISTENER_SUMMARY}); previous config was restored" >&2
    exit 11
  fi

  if [ "$BIND_STATE" = "closed" ]; then
    echo "Full monerod P2P routing through Tor is enabled; RPC is ready and no clearnet listener exists on port ${P2P_PORT}. Recovery will verify outbound Tor synchronization."
  else
    echo "Full monerod P2P routing through Tor is enabled on loopback port ${P2P_PORT} with ${PRIORITY_COUNT} captured IPv4 bootstrap peer(s)."
  fi
else
  if [ "$ORPHAN_CLEANED" = "1" ]; then
    echo "Removed proven orphaned MFP full-P2P Tor options and restarted the monerod service chain once."
  else
    echo "MFP full-P2P Tor routing block was removed; normal monerod P2P defaults apply again."
  fi
fi
