#!/usr/bin/env bash
set -euo pipefail

: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${P2POOL_SERVICE_UNIT:=p2pool.service}"
: "${XMRIG_PROXY_SERVICE_UNIT:=xmrig-proxy.service}"
: "${XMRIG_SERVICE_UNIT:=xmrig.service}"
: "${MONEROD_RPC_PORT:=18081}"
: "${P2POOL_LOG_PATH:=/var/log/p2pool.log}"
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
process_pid() { pgrep -xo "$1" 2>/dev/null | head -n 1; }
wait_process() {
  local name="$1" seconds="${2:-75}"
  for _ in $(seq 1 "$seconds"); do
    [ -n "$(process_pid "$name")" ] && return 0
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
wait_listener_with_process() {
  local port="$1" proc="$2" seconds="${3:-120}"
  local rc=1
  for _ in $(seq 1 "$seconds"); do
    if listen_port "$port"; then return 0; else rc=$?; fi
    [ "$rc" = "2" ] && return 2
    [ -z "$(process_pid "$proc")" ] && return 3
    sleep 1
  done
  return 1
}
wait_process_established() {
  local proc="$1" port="$2" seconds="${3:-45}"
  local rc=1
  for _ in $(seq 1 "$seconds"); do
    if process_established_port "$proc" "$port"; then return 0; else rc=$?; fi
    [ "$rc" = "2" ] && return 2
    [ -z "$(process_pid "$proc")" ] && return 3
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

p2pool_runtime_info() {
  local pid="$1"
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - "$pid" <<'PY'
import os,sys
pid=sys.argv[1]
try:
    args=[x.decode(errors='ignore') for x in open(f'/proc/{pid}/cmdline','rb').read().split(b'\0') if x]
except Exception:
    raise SystemExit(1)
try: cwd=os.readlink(f'/proc/{pid}/cwd')
except Exception: cwd=''
def arg(name):
    for i,a in enumerate(args):
        if a==name and i+1<len(args): return args[i+1]
        if a.startswith(name+'='): return a.split('=',1)[1]
    return ''
def clean(v):
    v=str(v or '').strip()
    if len(v)>=2 and v[0]==v[-1] and v[0] in ('"',"'"): v=v[1:-1]
    return v
params=clean(arg('--params-file'))
if params and not os.path.isabs(params) and cwd: params=os.path.join(cwd,params)
conf={}
if params and os.path.isfile(params):
    try:
        for raw in open(params,encoding='utf-8',errors='ignore'):
            line=raw.split('#',1)[0].strip()
            if '=' not in line: continue
            k,v=line.split('=',1); conf[k.strip().lower()]=clean(v)
    except Exception: pass
def val(cli,key,default=''):
    return clean(arg(cli)) or clean(conf.get(key,'')) or default
stratum=val('--stratum','stratum','0.0.0.0:3333')
zmq=val('--zmq-port','zmq-port','18083')
rpc=val('--rpc-port','rpc-port','18081')
host=val('--host','host','127.0.0.1')
ports=[]
for endpoint in stratum.split(','):
    endpoint=endpoint.strip()
    if ':' not in endpoint: continue
    p=endpoint.rsplit(':',1)[1]
    if p.isdigit() and p not in ports: ports.append(p)
print('P2POOL_PID='+pid)
print('P2POOL_STRATUM='+stratum)
print('P2POOL_STRATUM_PORTS='+','.join(ports))
print('P2POOL_ZMQ_PORT='+zmq)
print('P2POOL_RPC_PORT='+rpc)
print('P2POOL_MONEROD_HOST='+host)
print('P2POOL_PARAMS_FILE='+params)
PY
}

diag_p2pool() {
  echo "---- P2Pool diagnostics ----"
  systemctl --no-pager --full status "$P2POOL_SERVICE_UNIT" 2>&1 | head -n 80 || true
  if [ -n "$P2POOL_LOG_PATH" ] && [ -f "$P2POOL_LOG_PATH" ]; then
    echo "---- $P2POOL_LOG_PATH (tail) ----"
    tail -n 80 "$P2POOL_LOG_PATH" 2>&1 || true
  else
    echo "---- journalctl $P2POOL_SERVICE_UNIT (tail) ----"
    journalctl -u "$P2POOL_SERVICE_UNIT" -n 80 --no-pager 2>&1 || true
  fi
  echo "---- listeners ----"
  if command -v ss >/dev/null 2>&1; then ss -ltnp 2>&1 | head -n 120 || true; fi
}

PROXY_CONFIG=/etc/xmrig-proxy/config.json
LOCAL_UPSTREAM_PORT="$(local_pool_port_from_json "$PROXY_CONFIG" || true)"
XMRIG_LOCAL_POOL_PORT="$(local_pool_port_from_json "$XMRIG_CONFIG_PATH" || true)"

log "Waiting for monerod RPC on 127.0.0.1:${MONEROD_RPC_PORT}"
RPC_OK=0
for _ in $(seq 1 60); do
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
P2POOL_ZMQ_READY=0
if unit_exists "$P2POOL_SERVICE_UNIT" || [ -n "$(process_pid p2pool || true)" ]; then
  if unit_exists "$P2POOL_SERVICE_UNIT" && [ "$P2POOL_SERVICE_UNIT" != "$MONEROD_SERVICE_UNIT" ]; then
    log "Restarting dedicated P2Pool unit $P2POOL_SERVICE_UNIT"
    systemctl reset-failed "$P2POOL_SERVICE_UNIT" >/dev/null 2>&1 || true
    systemctl restart "$P2POOL_SERVICE_UNIT"
    P2POOL_RESTARTED=1
  else
    log "P2Pool uses the monerod/shared wrapper; not restarting that wrapper a second time"
  fi

  if ! wait_process p2pool 75; then
    diag_p2pool
    echo "P2Pool service is present, but the real p2pool process did not start." >&2
    exit 21
  fi
  P2POOL_PID="$(process_pid p2pool || true)"
  INFO="$(p2pool_runtime_info "$P2POOL_PID" 2>/dev/null || true)"
  P2POOL_STRATUM=''; P2POOL_STRATUM_PORTS=''; P2POOL_ZMQ_PORT=''; P2POOL_MONEROD_HOST=''; P2POOL_PARAMS_FILE=''
  while IFS='=' read -r key value; do
    case "$key" in
      P2POOL_STRATUM) P2POOL_STRATUM="$value" ;;
      P2POOL_STRATUM_PORTS) P2POOL_STRATUM_PORTS="$value" ;;
      P2POOL_ZMQ_PORT) P2POOL_ZMQ_PORT="$value" ;;
      P2POOL_MONEROD_HOST) P2POOL_MONEROD_HOST="$value" ;;
      P2POOL_PARAMS_FILE) P2POOL_PARAMS_FILE="$value" ;;
    esac
  done <<< "$INFO"
  : "${P2POOL_STRATUM:=0.0.0.0:3333}"
  : "${P2POOL_STRATUM_PORTS:=3333}"
  : "${P2POOL_ZMQ_PORT:=18083}"
  : "${P2POOL_MONEROD_HOST:=127.0.0.1}"
  log "Detected P2Pool PID $P2POOL_PID, Stratum $P2POOL_STRATUM, monerod ZMQ $P2POOL_MONEROD_HOST:$P2POOL_ZMQ_PORT"
  [ -z "$P2POOL_PARAMS_FILE" ] || log "P2Pool params file: $P2POOL_PARAMS_FILE"

  if [ "$P2POOL_MONEROD_HOST" = "127.0.0.1" ] || [ "$P2POOL_MONEROD_HOST" = "localhost" ] || [ "$P2POOL_MONEROD_HOST" = "::1" ]; then
    if listen_port "$P2POOL_ZMQ_PORT"; then
      P2POOL_ZMQ_READY=1
    else
      rc=$?
      if [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping monerod ZMQ listener verification"
      else
        diag_p2pool
        echo "monerod RPC is ready, but local ZMQ port ${P2POOL_ZMQ_PORT} required by P2Pool is not listening." >&2
        exit 27
      fi
    fi
  fi

  IFS=',' read -r -a STRATUM_PORTS <<< "$P2POOL_STRATUM_PORTS"
  [ "${#STRATUM_PORTS[@]}" -gt 0 ] || STRATUM_PORTS=(3333)
  for port in "${STRATUM_PORTS[@]}"; do
    [ -n "$port" ] || continue
    log "Waiting for real P2Pool Stratum listener on port $port"
    if wait_listener_with_process "$port" p2pool 120; then
      P2POOL_STRATUM_READY=1
    else
      rc=$?
      diag_p2pool
      if [ "$rc" = "3" ]; then
        echo "The real p2pool process exited before opening Stratum port ${port}." >&2
      elif [ "$rc" = "2" ]; then
        echo "Cannot verify P2Pool Stratum because neither ss nor netstat is available." >&2
      else
        echo "The real p2pool process is running, but its configured Stratum port ${port} (${P2POOL_STRATUM}) is not listening." >&2
      fi
      exit 24
    fi
  done

  port_matches_p2pool() {
    local wanted="$1" p
    [ -z "$wanted" ] && return 0
    for p in "${STRATUM_PORTS[@]}"; do [ "$wanted" = "$p" ] && return 0; done
    return 1
  }
  if [ -n "$LOCAL_UPSTREAM_PORT" ] && ! port_matches_p2pool "$LOCAL_UPSTREAM_PORT"; then
    diag_p2pool
    echo "XMRig Proxy expects local upstream port ${LOCAL_UPSTREAM_PORT}, but running P2Pool listens on ${P2POOL_STRATUM_PORTS}." >&2
    exit 28
  fi
  if [ -n "$XMRIG_LOCAL_POOL_PORT" ] && [ "$XMRIG_LOCAL_POOL_PORT" != "3334" ] && ! port_matches_p2pool "$XMRIG_LOCAL_POOL_PORT"; then
    diag_p2pool
    echo "XMRig expects local pool port ${XMRIG_LOCAL_POOL_PORT}, but running P2Pool listens on ${P2POOL_STRATUM_PORTS}." >&2
    exit 29
  fi
fi

PROXY_RESTARTED=0
PROXY_UPSTREAM_READY=0
if unit_exists "$XMRIG_PROXY_SERVICE_UNIT"; then
  log "Restarting $XMRIG_PROXY_SERVICE_UNIT"
  systemctl restart "$XMRIG_PROXY_SERVICE_UNIT"
  wait_active "$XMRIG_PROXY_SERVICE_UNIT" 30 || {
    systemctl --no-pager --full status "$XMRIG_PROXY_SERVICE_UNIT" | head -n 60 || true
    echo "$XMRIG_PROXY_SERVICE_UNIT did not become active" >&2
    exit 22
  }
  PROXY_RESTARTED=1
  if [ -n "$LOCAL_UPSTREAM_PORT" ]; then
    log "Waiting for XMRig Proxy upstream TCP connection to local port $LOCAL_UPSTREAM_PORT"
    if wait_process_established xmrig-proxy "$LOCAL_UPSTREAM_PORT" 45; then
      PROXY_UPSTREAM_READY=1
    else
      rc=$?
      systemctl --no-pager --full status "$XMRIG_PROXY_SERVICE_UNIT" | head -n 80 || true
      if [ "$rc" = "3" ]; then
        echo "XMRig Proxy exited while reconnecting to local upstream port ${LOCAL_UPSTREAM_PORT}." >&2
      elif [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping proxy upstream TCP verification"
      else
        echo "XMRig Proxy is active but did not establish its local upstream connection to port ${LOCAL_UPSTREAM_PORT}." >&2
      fi
      [ "$rc" = "2" ] || exit 25
    fi
  fi
fi

XMRIG_RESTARTED=0
XMRIG_POOL_LINK_READY=0
if unit_exists "$XMRIG_SERVICE_UNIT"; then
  log "Restarting $XMRIG_SERVICE_UNIT"
  systemctl restart "$XMRIG_SERVICE_UNIT"
  wait_active "$XMRIG_SERVICE_UNIT" 30 || {
    systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 60 || true
    echo "$XMRIG_SERVICE_UNIT did not become active" >&2
    exit 23
  }
  XMRIG_RESTARTED=1
  if [ -n "$XMRIG_LOCAL_POOL_PORT" ]; then
    log "Waiting for XMRig TCP connection to its configured local pool port $XMRIG_LOCAL_POOL_PORT"
    if wait_process_established xmrig "$XMRIG_LOCAL_POOL_PORT" 45; then
      XMRIG_POOL_LINK_READY=1
    else
      rc=$?
      systemctl --no-pager --full status "$XMRIG_SERVICE_UNIT" | head -n 80 || true
      if [ "$rc" = "3" ]; then
        echo "XMRig exited while reconnecting to its configured local pool port ${XMRIG_LOCAL_POOL_PORT}." >&2
      elif [ "$rc" = "2" ]; then
        log "ss/netstat unavailable; skipping XMRig pool-link verification"
      else
        echo "XMRig is active but did not reconnect to its configured local pool port ${XMRIG_LOCAL_POOL_PORT}." >&2
      fi
      [ "$rc" = "2" ] || exit 26
    fi
  fi
fi

printf 'MFP_RPC_READY=1\n'
printf 'MFP_P2POOL_RESTARTED=%s\n' "$P2POOL_RESTARTED"
printf 'MFP_P2POOL_STRATUM_READY=%s\n' "$P2POOL_STRATUM_READY"
printf 'MFP_P2POOL_ZMQ_READY=%s\n' "$P2POOL_ZMQ_READY"
printf 'MFP_PROXY_RESTARTED=%s\n' "$PROXY_RESTARTED"
printf 'MFP_PROXY_UPSTREAM_READY=%s\n' "$PROXY_UPSTREAM_READY"
printf 'MFP_XMRIG_RESTARTED=%s\n' "$XMRIG_RESTARTED"
printf 'MFP_XMRIG_POOL_LINK_READY=%s\n' "$XMRIG_POOL_LINK_READY"
log "Mining dependency chain recovery completed"
