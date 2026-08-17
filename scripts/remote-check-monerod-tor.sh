#!/usr/bin/env bash
set +e

: "${TOR_ONION_TARGET:=}"
: "${TOR_SOCKS_PORT:=9050}"

REACHABLE=0
DETAIL=""

if [ -z "$TOR_ONION_TARGET" ]; then
  printf 'MFP_REACHABLE=0\n'
  printf 'MFP_DETAIL=no onion address\n'
  exit 0
fi

HOST="${TOR_ONION_TARGET%:*}"
PORT="${TOR_ONION_TARGET##*:}"
if [ "$HOST" = "$TOR_ONION_TARGET" ]; then PORT=18084; fi

case "$HOST" in *.onion) ;; *) printf 'MFP_REACHABLE=0\nMFP_DETAIL=invalid onion hostname\n'; exit 0 ;; esac
case "$PORT" in ''|*[!0-9]*) printf 'MFP_REACHABLE=0\nMFP_DETAIL=invalid onion port\n'; exit 0 ;; esac

if ! command -v curl >/dev/null 2>&1; then
  printf 'MFP_REACHABLE=0\nMFP_DETAIL=curl is not installed\n'
  exit 0
fi
if ! systemctl is-active --quiet tor >/dev/null 2>&1; then
  printf 'MFP_REACHABLE=0\nMFP_DETAIL=Tor service is not active\n'
  exit 0
fi

LOCAL_LISTENER=0
if command -v ss >/dev/null 2>&1; then
  ss -ltnH 2>/dev/null | awk -v p="$PORT" '$4 == "127.0.0.1:" p { found=1 } END { exit !found }'
  [ $? -eq 0 ] && LOCAL_LISTENER=1
elif command -v netstat >/dev/null 2>&1; then
  netstat -lnt 2>/dev/null | awk -v p="$PORT" '$4 == "127.0.0.1:" p { found=1 } END { exit !found }'
  [ $? -eq 0 ] && LOCAL_LISTENER=1
fi
if [ "$LOCAL_LISTENER" = "0" ]; then
  printf 'MFP_REACHABLE=0\n'
  printf 'MFP_DETAIL=monerod is not listening on local anonymous P2P port %s\n' "$PORT"
  printf 'MFP_LOCAL_LISTENER=0\n'
  exit 0
fi

LOG="$(mktemp)"
START="$(date +%s)"
curl --silent --show-error --verbose \
  --socks5-hostname "127.0.0.1:${TOR_SOCKS_PORT}" \
  --connect-timeout 30 --max-time 35 \
  "telnet://${HOST}:${PORT}" </dev/null >/dev/null 2>"$LOG" &
CURL_PID=$!

# A successful SOCKS grant is enough for this test. Do not keep the telnet
# session open until curl's max-time after Tor already reached monerod.
for _ in $(seq 1 150); do
  if grep -Fq 'SOCKS5 request granted' "$LOG"; then
    REACHABLE=1
    DETAIL="Tor SOCKS5 stream reached onion P2P"
    kill "$CURL_PID" >/dev/null 2>&1 || true
    break
  fi
  if ! kill -0 "$CURL_PID" >/dev/null 2>&1; then break; fi
  sleep 0.2
done

if kill -0 "$CURL_PID" >/dev/null 2>&1; then
  kill "$CURL_PID" >/dev/null 2>&1 || true
fi
wait "$CURL_PID" >/dev/null 2>&1
RC=$?
END="$(date +%s)"

if [ "$REACHABLE" = "0" ]; then
  DETAIL="$(grep -E 'SOCKS|Could not resolve|Failed to connect|Connection refused|timed out|Timeout' "$LOG" | tail -n 1 | sed 's/^\* //;s/^curl: ([0-9][0-9]*) //')"
  [ -z "$DETAIL" ] && DETAIL="Tor connection failed (curl ${RC})"
fi
rm -f "$LOG"

printf 'MFP_REACHABLE=%s\n' "$REACHABLE"
printf 'MFP_LOCAL_LISTENER=1\n'
printf 'MFP_SECONDS=%s\n' "$((END-START))"
printf 'MFP_DETAIL=%s\n' "$DETAIL"
exit 0
