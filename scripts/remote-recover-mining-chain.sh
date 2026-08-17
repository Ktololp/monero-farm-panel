#!/usr/bin/env bash
set -euo pipefail

: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${P2POOL_SERVICE_UNIT:=p2pool.service}"
: "${XMRIG_PROXY_SERVICE_UNIT:=xmrig-proxy.service}"
: "${XMRIG_SERVICE_UNIT:=xmrig.service}"
: "${MONEROD_RPC_PORT:=18081}"
: "${XMRIG_CONFIG_PATH:=}"

log() { printf '[mfp-recovery] %s\n' "$*"; }
unit_exists() { systemctl cat "$1" >/dev/null 2>&1; }
wait_active() {
  local unit="$1" seconds="${2:-30}"
  for _ in $(seq 1 "$seconds"); do
    systemctl is-active --quiet "$unit" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
listen_port() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk -v p="$port" '$4 ~ ":" p "$" { found=1 } END { exit !found }'
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk -v p="$port" '$4 ~ ":" p "$" { found=1 } END { exit !found }'
  else
    return 2
  fi
}
process_established_port() {
  local proc="$1" port="$2"
  if command -v ss >/dev/null 2>&1; then
    ss -tnpH state established 2>/dev/null | awk -v p="$port" -v n="$proc" '($4 ~ ":" p "$" || $5 ~ ":" p "$") && index($0,n) { found=1 } END { exit !found }'
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ntp 2>/dev/null | awk -v p="$port" -v n="$proc" '$6 == "ESTABLISHED" && ($4 ~ ":" p "$" || $5 ~ ":" p "$") && index($0,n) { found=1 } END { exit !found }'
  else
    return 2
  fi
}
wait_listener() {
  local port="$1" seconds="${2:-30}"
  for _ in $(seq 1 "$seconds"); do
    if listen_port "$port"; then return 0; else rc=$?; fi
    [ "$rc" = "2" ] && return 2
    sleep 1
  done
  return 1
}
wait_process_established() {
  local proc="$1" port="$2" seconds="${3:-30}"
  for _ in $(seq 1 "$seconds"); do
    if process_established_port "$proc" "$port"; then return 0; else rc=$?; fi
    [ "$rc" = "2" ] && return 2
    sleep 1
  done
  return 1
}

local_pool_port_from_json() {
  local config="$1"
  [ -n "$config" ] && [ -f "$config" ] && command -v python3 >/dev/null 2>&1 || return 0
  python3 - "$config" <<'PY'
import json,sys
try:
    c=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception:
    raise SystemExit(0)
pools=c.get('pools') or []
url=str((pools[0] if pools else {}).get('url') or '').strip()
if ':' not in url:
    raise SystemExit(0)
host,port=url.rsplit(':',1)
host=host.strip('[]').lower()
if host in ('127.0.0.1','localhost','::1') and port.isdigit():
    print(port)
PY
}

# Discover current topology before restarting anything. The proxy can remain
# installed even when XMRig is configured to mine directly to P2Pool, so the
# two local links are verified independently.
PROXY_CONFIG=/etc/xmrig-proxy/config.json
LOCAL_UPSTREAM_PORT="$(local_pool_port_from_json "$PROXY_CONFIG" || true)"
XMRIG_LOCAL_POOL_PORT="$(local_pool_port_from_json "$XMRIG_CONFIG_PATH" || true)"

log "Waiting for monerod RPC on 127.0.0.1:${MONEROD_RPC_PORT}"
RPC_OK=0
for _ in $(seq 1 45); do
  if curl -fsS --max-time 2 \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":"0","method":"get_info"}' \
    "http://127.0.0.1:${MONEROD_RPC_PORT}/json_rpc" >/dev/null 2>&1; then
    RPC_OK=1
    break
  fi
  sleep 1
done
if [ "$RPC_OK" != "1" ]; then
  echo "monerod RPC did not return on 127.0.0.1:${MONEROD_RPC_PORT}; downstream mining services were not restarted" >&2
  exit 20
fi
log "monerod RPC is ready"

P2POOL_RESTARTED=0
P2POOL_STRATUM_READY=0
if unit_exists "$P2POOL_SERVICE_UNIT"; then
  log "Restarting $P2POOL_SERVICE_UNIT"
  systemctl restart "$P2POOL_SERVICE_UNIT"
  wait_active "$P2POOL_SERVICE_UNIT" 30 || {
    systemctl --no-pager --full status "$P2POOL_SERVICE_UNIT" | head -n 60 >&2 || true
    echo "$P2POOL_SERVICE_UNIT did not become active" >&2
    exit 21
  }
  P2POOL_RESTARTED=1

  # If either XMRig Proxy or XMRig directly uses a local pool port, P2Pool must
  # reopen that listener before downstream services are restarted.
  EXPECTED_P2POOL_PORT="$LOCAL_UPSTREAM_PORT"
  [ -z "$EXPECTED_P2POOL_PORT" ] && EXPECTED_P2POOL_PORT="$XMRIG_LOCAL_POOL_PORT"
  if [ -n "$EXPECTED_P2POOL_PORT" ] && [ "$EXPECTED_P2POOL_PORT" != "3334" ]; then
    log "Waiting for local P2Pool Stratum listener on port $EXPECTED_P2POOL_PORT"
    if wait_listener "$EXPECTED_P2POOL_PORT" 30; then
      P2POOL_STRATUM_READY=1
    else
      rc=$?
      if [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping P2Pool listener verification"
      else
        echo "P2Pool is active but the expected local Stratum port ${EXPECTED_P2POOL_PORT} is not listening" >&2
        exit 24
      fi
    fi
  else
    sleep 5
  fi
fi

PROXY_RESTARTED=0
PROXY_UPSTREAM_READY=0
if unit_exists "$XMRIG_PROXY_SERVICE_UNIT"; then
  log "Restarting $XMRIG_PROXY_SERVICE_UNIT"
  systemctl restart "$XMRIG_PROXY_SERVICE_UNIT"
  wait_active "$XMRIG_PROXY_SERVICE_UNIT" 20 || {
    systemctl --no-pager --full status "$XMRIG_PROXY_SERVICE_UNIT" | head -n 60 >&2 || true
    echo "$XMRIG_PROXY_SERVICE_UNIT did not become active" >&2
    exit 22
  }
  PROXY_RESTARTED=1
  if [ -n "$LOCAL_UPSTREAM_PORT" ]; then
    log "Waiting for XMRig Proxy upstream TCP connection to local port $LOCAL_UPSTREAM_PORT"
    if wait_process_established xmrig-proxy "$LOCAL_UPSTREAM_PORT" 30; then
      PROXY_UPSTREAM_READY=1
    else
      rc=$?
      if [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping proxy upstream TCP verification"
      else
        systemctl --no-pager --full status "$XMRIG_PROXY_SERVICE_UNIT" | head -n 60 >&2 || true
        echo "XMRig Proxy is active but did not establish its local upstream connection to port ${LOCAL_UPSTREAM_PORT}" >&2
        exit 25
      fi
    fi
  else
    sleep 3
  fi
fi

XMRIG_RESTARTED=0
XMRIG_POOL_LINK_READY=0
if unit_exists "$XMRIG_SERVICE_UNIT"; then
  log "Restarting $XMRIG_SERVICE_UNIT"
  systemctl restart "$XMRIG_SERVICE_UNIT"
  wait_active "$XMRIG_SERVICE_UNIT" 20 || {
    systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 60 >&2 || true
    echo "$XMRIG_SERVICE_UNIT did not become active" >&2
    exit 23
  }
  XMRIG_RESTARTED=1
  if [ -n "$XMRIG_LOCAL_POOL_PORT" ]; then
    log "Waiting for XMRig TCP connection to its configured local pool port $XMRIG_LOCAL_POOL_PORT"
    if wait_process_established xmrig "$XMRIG_LOCAL_POOL_PORT" 30; then
      XMRIG_POOL_LINK_READY=1
    else
      rc=$?
      if [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping XMRig pool-link verification"
      else
        systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 60 >&2 || true
        echo "XMRig is active but did not reconnect to its configured local pool port ${XMRIG_LOCAL_POOL_PORT}" >&2
        exit 26
      fi
    fi
  fi
fi

printf 'MFP_RPC_READY=1\n'
printf 'MFP_P2POOL_RESTARTED=%s\n' "$P2POOL_RESTARTED"
printf 'MFP_P2POOL_STRATUM_READY=%s\n' "$P2POOL_STRATUM_READY"
printf 'MFP_PROXY_RESTARTED=%s\n' "$PROXY_RESTARTED"
printf 'MFP_PROXY_UPSTREAM_READY=%s\n' "$PROXY_UPSTREAM_READY"
printf 'MFP_XMRIG_RESTARTED=%s\n' "$XMRIG_RESTARTED"
printf 'MFP_XMRIG_POOL_LINK_READY=%s\n' "$XMRIG_POOL_LINK_READY"
log "Mining dependency chain restart completed"
