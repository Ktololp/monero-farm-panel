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
if unit_exists "$P2POOL_SERVICE_UNIT"; then
  log "Restarting $P2POOL_SERVICE_UNIT"
  systemctl restart "$P2POOL_SERVICE_UNIT"
  wait_active "$P2POOL_SERVICE_UNIT" 30 || {
    systemctl --no-pager --full status "$P2POOL_SERVICE_UNIT" | head -n 60 >&2 || true
    echo "$P2POOL_SERVICE_UNIT did not become active" >&2
    exit 21
  }
  P2POOL_RESTARTED=1
  # Give P2Pool time to reconnect to monerod and reopen Stratum before the
  # proxy/miner reconnect storm starts.
  sleep 5
fi

PROXY_RESTARTED=0
if unit_exists "$XMRIG_PROXY_SERVICE_UNIT"; then
  log "Restarting $XMRIG_PROXY_SERVICE_UNIT"
  systemctl restart "$XMRIG_PROXY_SERVICE_UNIT"
  wait_active "$XMRIG_PROXY_SERVICE_UNIT" 20 || {
    systemctl --no-pager --full status "$XMRIG_PROXY_SERVICE_UNIT" | head -n 60 >&2 || true
    echo "$XMRIG_PROXY_SERVICE_UNIT did not become active" >&2
    exit 22
  }
  PROXY_RESTARTED=1
  sleep 3
fi

XMRIG_RESTARTED=0
if unit_exists "$XMRIG_SERVICE_UNIT"; then
  log "Restarting $XMRIG_SERVICE_UNIT"
  systemctl restart "$XMRIG_SERVICE_UNIT"
  wait_active "$XMRIG_SERVICE_UNIT" 20 || {
    systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 60 >&2 || true
    echo "$XMRIG_SERVICE_UNIT did not become active" >&2
    exit 23
  }
  XMRIG_RESTARTED=1
fi

printf 'MFP_RPC_READY=1\n'
printf 'MFP_P2POOL_RESTARTED=%s\n' "$P2POOL_RESTARTED"
printf 'MFP_PROXY_RESTARTED=%s\n' "$PROXY_RESTARTED"
printf 'MFP_XMRIG_RESTARTED=%s\n' "$XMRIG_RESTARTED"
log "Mining dependency chain restart completed"
