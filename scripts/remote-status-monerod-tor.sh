#!/usr/bin/env bash
set +e

: "${MONEROD_CONFIG_PATH:=}"
: "${TOR_SOCKS_PORT:=9050}"
: "${MONEROD_P2P_PORT:=18080}"

INSTALLED=0
command -v tor >/dev/null 2>&1 && INSTALLED=1
ENABLED=0
systemctl is-enabled --quiet tor >/dev/null 2>&1 && ENABLED=1
ACTIVE=0
systemctl is-active --quiet tor >/dev/null 2>&1 && ACTIVE=1

ONION=""
TORRC=0
MONERO_CONFIG=0
P2P_CONFIGURED=0
P2P_LOOPBACK=0
P2P_WILDCARD=0
P2P_RUNTIME_KNOWN=0
P2P_ROUTED=0
P2P_PORT="$MONEROD_P2P_PORT"

if [ -f /etc/tor/torrc ] && grep -Fq '# BEGIN MFP MONEROD TOR' /etc/tor/torrc; then
  TORRC=1
fi

if [ -n "$MONEROD_CONFIG_PATH" ] && [ -f "$MONEROD_CONFIG_PATH" ]; then
  if grep -Fq '# BEGIN MFP TOR' "$MONEROD_CONFIG_PATH"; then
    MONERO_CONFIG=1
    ONION="$(sed -n 's/^anonymous-inbound=\([^,]*\),.*/\1/p' "$MONEROD_CONFIG_PATH" | head -n 1)"
  fi

  CONFIG_PORT="$(sed -n 's/^[[:space:]]*p2p-bind-port[[:space:]]*=[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' "$MONEROD_CONFIG_PATH" | tail -n 1)"
  [ -n "$CONFIG_PORT" ] && P2P_PORT="$CONFIG_PORT"

  if grep -Fq '# BEGIN MFP TOR P2P' "$MONEROD_CONFIG_PATH" \
    && grep -Eq '^[[:space:]]*proxy[[:space:]]*=[[:space:]]*127[.]0[.]0[.]1:'"${TOR_SOCKS_PORT}"'[[:space:]]*$' "$MONEROD_CONFIG_PATH" \
    && grep -Eq '^[[:space:]]*p2p-bind-ip[[:space:]]*=[[:space:]]*127[.]0[.]0[.]1[[:space:]]*$' "$MONEROD_CONFIG_PATH" \
    && grep -Eq '^[[:space:]]*no-igd[[:space:]]*=[[:space:]]*1[[:space:]]*$' "$MONEROD_CONFIG_PATH" \
    && grep -Eq '^[[:space:]]*hide-my-port[[:space:]]*=[[:space:]]*1[[:space:]]*$' "$MONEROD_CONFIG_PATH"; then
    P2P_CONFIGURED=1
  fi
fi

if [ -z "$ONION" ] && [ -r /var/lib/tor/monerod/hostname ]; then
  ONION="$(tr -d '\r\n ' </var/lib/tor/monerod/hostname)"
fi

if command -v ss >/dev/null 2>&1; then
  P2P_RUNTIME_KNOWN=1
  ss -ltnH 2>/dev/null | awk -v p="$P2P_PORT" '
    $4 == "127.0.0.1:" p { found=1 }
    END { exit !found }
  '
  [ $? -eq 0 ] && P2P_LOOPBACK=1

  ss -ltnH 2>/dev/null | awk -v p="$P2P_PORT" '
    $4 == "0.0.0.0:" p || $4 == "*:" p { found=1 }
    END { exit !found }
  '
  [ $? -eq 0 ] && P2P_WILDCARD=1
elif command -v netstat >/dev/null 2>&1; then
  P2P_RUNTIME_KNOWN=1
  netstat -lnt 2>/dev/null | awk -v p="$P2P_PORT" '
    $4 == "127.0.0.1:" p { found=1 }
    END { exit !found }
  '
  [ $? -eq 0 ] && P2P_LOOPBACK=1

  netstat -lnt 2>/dev/null | awk -v p="$P2P_PORT" '
    $4 == "0.0.0.0:" p || $4 == "*:" p { found=1 }
    END { exit !found }
  '
  [ $? -eq 0 ] && P2P_WILDCARD=1
fi

if [ "$P2P_CONFIGURED" = "1" ]; then
  if [ "$P2P_RUNTIME_KNOWN" = "0" ]; then
    P2P_ROUTED=1
  elif [ "$P2P_LOOPBACK" = "1" ] && [ "$P2P_WILDCARD" = "0" ]; then
    P2P_ROUTED=1
  fi
fi

printf 'MFP_INSTALLED=%s\n' "$INSTALLED"
printf 'MFP_ENABLED=%s\n' "$ENABLED"
printf 'MFP_ACTIVE=%s\n' "$ACTIVE"
printf 'MFP_ONION=%s\n' "$ONION"
printf 'MFP_TORRC=%s\n' "$TORRC"
printf 'MFP_MONERO_CONFIG=%s\n' "$MONERO_CONFIG"
printf 'MFP_P2P_CONFIGURED=%s\n' "$P2P_CONFIGURED"
printf 'MFP_P2P_RUNTIME_KNOWN=%s\n' "$P2P_RUNTIME_KNOWN"
printf 'MFP_P2P_LOOPBACK=%s\n' "$P2P_LOOPBACK"
printf 'MFP_P2P_WILDCARD=%s\n' "$P2P_WILDCARD"
printf 'MFP_P2P_PORT=%s\n' "$P2P_PORT"
printf 'MFP_P2P_ROUTED=%s\n' "$P2P_ROUTED"
exit 0
