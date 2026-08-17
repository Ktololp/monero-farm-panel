#!/usr/bin/env bash
set -euo pipefail

: "${XMRIG_API_PORT:=60050}"
: "${XMRIG_API_TOKEN:=}"
: "${HEALTH_WAIT_SECONDS:=90}"

if ! command -v curl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "curl and python3 are required for mining health validation" >&2
  exit 2
fi

summary() {
  local -a args
  args=(-fsS --max-time 4)
  if [ -n "$XMRIG_API_TOKEN" ]; then
    args+=(-H "Authorization: Bearer $XMRIG_API_TOKEN")
  fi
  curl "${args[@]}" "http://127.0.0.1:${XMRIG_API_PORT}/2/summary"
}

LAST_HASH=0
LAST_ACCEPTED=0
for _ in $(seq 1 "$HEALTH_WAIT_SECONDS"); do
  JSON="$(summary 2>/dev/null || true)"
  if [ -n "$JSON" ]; then
    VALUES="$(printf '%s' "$JSON" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: raise SystemExit(1)
r=(d.get("hashrate") or {}).get("total") or []
h=0.0
for i in (1,0,2):
    if i < len(r) and isinstance(r[i],(int,float)) and r[i] > 0:
        h=float(r[i]); break
accepted=(d.get("connection") or {}).get("accepted")
if accepted is None: accepted=(d.get("results") or {}).get("shares_good",0)
print(f"{h}|{int(accepted or 0)}")' 2>/dev/null || true)"
    if [ -n "$VALUES" ]; then
      IFS='|' read -r LAST_HASH LAST_ACCEPTED <<< "$VALUES"
      if python3 - "$LAST_HASH" <<'PY'
import sys
raise SystemExit(0 if float(sys.argv[1] or 0) > 1 else 1)
PY
      then
        printf 'MFP_XMRIG_HASH_HS=%s\n' "$LAST_HASH"
        printf 'MFP_XMRIG_ACCEPTED=%s\n' "$LAST_ACCEPTED"
        echo "XMRig API confirms active hashing after Tor P2P experiment."
        exit 0
      fi
    fi
  fi
  sleep 1
done

echo "XMRig API stayed reachable but did not report active hashing within ${HEALTH_WAIT_SECONDS}s (last hash=${LAST_HASH} H/s, accepted=${LAST_ACCEPTED})." >&2
exit 40
