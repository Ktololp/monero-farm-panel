#!/usr/bin/env bash
set -euo pipefail

: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${P2POOL_SERVICE_UNIT:=p2pool.service}"
: "${XMRIG_PROXY_SERVICE_UNIT:=xmrig-proxy.service}"
: "${XMRIG_SERVICE_UNIT:=xmrig.service}"
: "${MONEROD_RPC_PORT:=18081}"

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
established_port() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tnH state established 2>/dev/null | awk -v p="$port" '$4 ~ ":" p "$" || $5 ~ ":" p "$" { found=1 } END { exit !found }'
  elif command -v netstat >/dev/null 2>&1; then
    netstat -nt 2>/dev/null | awk -v p="$port" '$6 == "ESTABLISHED" && ($4 ~ ":" p "$" || $5 ~ ":" p "$") { found=1 } END { exit !found }'
  else
    return 2
  fi
}
wait_listener() {
  local port="$1" seconds="${2:-30}"
  for _ in $(seq 1 "$seconds"); do
    listen_port "$port" && return 0
    [ $? -eq 2 ] && return 2
    sleep 1
  done
  return 1
}
wait_established() {
  local port="$1" seconds="${2:-30}"
  for _ in $(seq 1 "$seconds"); do
    established_port "$port" && return 0
    [ $? -eq 2 ] && return 2
    sleep 1
  done
  return 1
}

# Discover the proxy's current local topology before restarting anything. This
# lets recovery verify the actual P2Pool -> Proxy -> XMRig data path instead of
# trusting systemd active states.
PROXY_CONFIG=/etc/xmrig-proxy/config.json
LOCAL_UPSTREAM_PORT=""
PROXY_BIND_PORT=""
if [ -f "$PROXY_CONFIG" ] && command -v python3 >/dev/null 2>&1; then
  readarray -t PROXY_INFO < <(python3 - "$PROXY_CONFIG" <<'PY'
import json,sys
try:
    c=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception:
    c={}
pools=c.get('pools') or []
url=str((pools[0] if pools else {}).get('url') or '').strip()
binds=c.get('bind') or []
bind_port=''
if binds and isinstance(binds[0],dict):
    bind_port=str(binds[0].get('port') or '')
local_upstream=''
if ':' in url:
    host,port=url.rsplit(':',1)
    host=host.strip('[]').lower()
    if host in ('127.0.0.1','localhost','::1') and port.isdigit():
        local_upstream=port
print(local_upstream)
print(bind_port if bind_port.isdigit() else '')
PY
  )
  LOCAL_UPSTREAM_PORT="${PROXY_INFO[0]:-}"
  PROXY_BIND_PORT="${PROXY_INFO[1]:-}"
fi

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
  if [ -n "$LOCAL_UPSTREAM_PORT" ]; then
    log "Waiting for local P2Pool/Proxy upstream listener on port $LOCAL_UPSTREAM_PORT"
    if wait_listener "$LOCAL_UPSTREAM_PORT" 30; then
      P2POOL_STRATUM_READY=1
    else
      rc=$?
      if [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping local upstream listener verification"
      else
        echo "P2Pool is active but the local XMRig Proxy upstream port ${LOCAL_UPSTREAM_PORT} is not listening" >&2
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
    if wait_established "$LOCAL_UPSTREAM_PORT" 30; then
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
XMRIG_PROXY_LINK_READY=0
if unit_exists "$XMRIG_SERVICE_UNIT"; then
  log "Restarting $XMRIG_SERVICE_UNIT"
  systemctl restart "$XMRIG_SERVICE_UNIT"
  wait_active "$XMRIG_SERVICE_UNIT" 20 || {
    systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 60 >&2 || true
    echo "$XMRIG_SERVICE_UNIT did not become active" >&2
    exit 23
  }
  XMRIG_RESTARTED=1
  if [ -n "$PROXY_BIND_PORT" ] && [ "$PROXY_RESTARTED" = "1" ]; then
    log "Waiting for miner TCP connection on XMRig Proxy port $PROXY_BIND_PORT"
    if wait_established "$PROXY_BIND_PORT" 30; then
      XMRIG_PROXY_LINK_READY=1
    else
      rc=$?
      if [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping miner-to-proxy TCP verification"
      else
        systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 60 >&2 || true
        echo "XMRig is active but no established miner connection appeared on XMRig Proxy port ${PROXY_BIND_PORT}" >&2
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
printf 'MFP_XMRIG_PROXY_LINK_READY=%s\n' "$XMRIG_PROXY_LINK_READY"
log "Mining dependency chain restart completed"
