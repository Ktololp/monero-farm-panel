#!/usr/bin/env bash
set +e

: "${TOR_ONION_TARGET:=}"

READY=0
LOCAL_LISTENER=0
TORRC_OK=0
DETAIL=""

if [ -z "$TOR_ONION_TARGET" ]; then
  printf 'MFP_REACHABLE=0\nMFP_LOCAL_LISTENER=0\nMFP_EXTERNAL_VERIFIED=0\nMFP_DETAIL=no onion address\n'
  exit 0
fi

HOST="${TOR_ONION_TARGET%:*}"
PORT="${TOR_ONION_TARGET##*:}"
if [ "$HOST" = "$TOR_ONION_TARGET" ]; then PORT=18084; fi
case "$HOST" in *.onion) ;; *) printf 'MFP_REACHABLE=0\nMFP_LOCAL_LISTENER=0\nMFP_EXTERNAL_VERIFIED=0\nMFP_DETAIL=invalid onion hostname\n'; exit 0 ;; esac
case "$PORT" in ''|*[!0-9]*) printf 'MFP_REACHABLE=0\nMFP_LOCAL_LISTENER=0\nMFP_EXTERNAL_VERIFIED=0\nMFP_DETAIL=invalid onion port\n'; exit 0 ;; esac

if ! systemctl is-active --quiet tor >/dev/null 2>&1; then
  printf 'MFP_REACHABLE=0\nMFP_LOCAL_LISTENER=0\nMFP_EXTERNAL_VERIFIED=0\nMFP_DETAIL=Tor service is not active\n'
  exit 0
fi

if [ -f /etc/tor/torrc ] \
  && grep -Fq '# BEGIN MFP MONEROD TOR' /etc/tor/torrc \
  && grep -Eq '^[[:space:]]*HiddenServicePort[[:space:]]+'"${PORT}"'[[:space:]]+127[.]0[.]0[.]1:'"${PORT}"'[[:space:]]*$' /etc/tor/torrc; then
  TORRC_OK=1
fi

if command -v ss >/dev/null 2>&1; then
  ss -ltnH 2>/dev/null | awk -v p="$PORT" '$4 == "127.0.0.1:" p { found=1 } END { exit !found }'
  [ $? -eq 0 ] && LOCAL_LISTENER=1
elif command -v netstat >/dev/null 2>&1; then
  netstat -lnt 2>/dev/null | awk -v p="$PORT" '$4 == "127.0.0.1:" p { found=1 } END { exit !found }'
  [ $? -eq 0 ] && LOCAL_LISTENER=1
fi

if [ "$TORRC_OK" = "1" ] && [ "$LOCAL_LISTENER" = "1" ]; then
  READY=1
  DETAIL="Local Tor onion pipeline is ready; external reachability is not verified from the same host"
elif [ "$TORRC_OK" != "1" ]; then
  DETAIL="Tor hidden-service mapping is missing from torrc"
else
  DETAIL="monerod is not listening on local anonymous P2P port ${PORT}"
fi

printf 'MFP_REACHABLE=%s\n' "$READY"
printf 'MFP_LOCAL_LISTENER=%s\n' "$LOCAL_LISTENER"
printf 'MFP_TORRC_OK=%s\n' "$TORRC_OK"
printf 'MFP_EXTERNAL_VERIFIED=0\n'
printf 'MFP_SECONDS=0\n'
printf 'MFP_DETAIL=%s\n' "$DETAIL"
exit 0
