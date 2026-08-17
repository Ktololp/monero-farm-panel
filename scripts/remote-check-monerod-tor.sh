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
if [ "$HOST" = "$TOR_ONION_TARGET" ]; then
  PORT=18084
fi

case "$HOST" in
  *.onion) ;;
  *)
    printf 'MFP_REACHABLE=0\n'
    printf 'MFP_DETAIL=invalid onion hostname\n'
    exit 0
    ;;
esac
case "$PORT" in
  ''|*[!0-9]*)
    printf 'MFP_REACHABLE=0\n'
    printf 'MFP_DETAIL=invalid onion port\n'
    exit 0
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  printf 'MFP_REACHABLE=0\n'
  printf 'MFP_DETAIL=curl is not installed\n'
  exit 0
fi
if ! systemctl is-active --quiet tor >/dev/null 2>&1; then
  printf 'MFP_REACHABLE=0\n'
  printf 'MFP_DETAIL=Tor service is not active\n'
  exit 0
fi

LOG="$(mktemp)"
START="$(date +%s)"
curl --silent --show-error --verbose \
  --socks5-hostname "127.0.0.1:${TOR_SOCKS_PORT}" \
  --connect-timeout 20 --max-time 12 \
  "telnet://${HOST}:${PORT}" </dev/null >/dev/null 2>"$LOG"
RC=$?
END="$(date +%s)"

# curl's telnet handler can time out after a successful P2P TCP handshake because
# monerod is not an HTTP service. The SOCKS5 grant is the important signal: Tor
# resolved the onion name and established the stream to the hidden service.
if grep -Fq 'SOCKS5 request granted' "$LOG"; then
  REACHABLE=1
  DETAIL="Tor SOCKS5 stream reached onion P2P"
else
  DETAIL="$(grep -E 'SOCKS|Could not resolve|Failed to connect|Connection refused|timed out|Timeout' "$LOG" | tail -n 1 | sed 's/^\* //;s/^curl: ([0-9][0-9]*) //')"
  [ -z "$DETAIL" ] && DETAIL="Tor connection failed (curl ${RC})"
fi
rm -f "$LOG"

printf 'MFP_REACHABLE=%s\n' "$REACHABLE"
printf 'MFP_SECONDS=%s\n' "$((END-START))"
printf 'MFP_DETAIL=%s\n' "$DETAIL"
exit 0
