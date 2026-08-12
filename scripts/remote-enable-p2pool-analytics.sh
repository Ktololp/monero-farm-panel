#!/usr/bin/env bash
set -euo pipefail

log() { printf '[p2pool-api] %s\n' "$*"; }
die() { printf '[p2pool-api] ERROR: %s\n' "$*" >&2; exit 1; }

: "${TARGET_USER:?TARGET_USER is required}"
: "${API_DIR:?API_DIR is required}"

PID="$(pgrep -xo p2pool || true)"
[ -n "$PID" ] || die "p2pool process is not running"
[ -r "/proc/$PID/cmdline" ] || die "cannot read p2pool command line"

mapfile -d '' ARGS <"/proc/$PID/cmdline" || true
[ "${#ARGS[@]}" -gt 0 ] || die "p2pool command line is empty"

CURRENT_DATA=""
HAS_LOCAL=0
for ((i=0; i<${#ARGS[@]}; i++)); do
  a="${ARGS[$i]}"
  case "$a" in
    --data-api=*) CURRENT_DATA="${a#--data-api=}" ;;
    --data-api) [ $((i+1)) -lt ${#ARGS[@]} ] && CURRENT_DATA="${ARGS[$((i+1))]}" ;;
    --local-api|--stratum-api) HAS_LOCAL=1 ;;
  esac
done

if [ -n "$CURRENT_DATA" ]; then
  if [[ "$CURRENT_DATA" = /* ]]; then
    API_DIR="$CURRENT_DATA"
  else
    CWD="$(readlink -f "/proc/$PID/cwd" 2>/dev/null || pwd)"
    API_DIR="$CWD/$CURRENT_DATA"
  fi
fi

GROUP="$(id -gn "$TARGET_USER")"
install -d -o "$TARGET_USER" -g "$GROUP" -m 0750 "$API_DIR"

if [ -n "$CURRENT_DATA" ] && [ "$HAS_LOCAL" = "1" ]; then
  log "P2Pool analytics flags are already enabled"
  printf 'MFP_ALREADY=1\nMFP_P2POOL_API_DIR=%s\n' "$API_DIR"
  exit 0
fi

UNIT="$(sed -nE 's#.*\/([^/]+\.service).*#\1#p' "/proc/$PID/cgroup" | head -n 1 || true)"
[ -n "$UNIT" ] || die "could not determine the systemd service that owns p2pool"
systemctl cat "$UNIT" >/dev/null 2>&1 || die "systemd unit not found: $UNIT"

EXECSTART="$(systemctl show "$UNIT" -p ExecStart --value 2>/dev/null || true)"
SCRIPT="$(printf '%s\n' "$EXECSTART" | grep -oE '/[^ ;{}"]+\.sh' | head -n 1 || true)"
STAMP="$(date +%Y%m%d-%H%M%S)"
MODE=""
BACKUP=""
DROPIN=""

rollback() {
  log "Rolling back P2Pool analytics startup change"
  if [ "$MODE" = "script" ] && [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
    cp -a "$BACKUP" "$SCRIPT"
  elif [ "$MODE" = "dropin" ] && [ -n "$DROPIN" ]; then
    rm -f "$DROPIN"
    rmdir "$(dirname "$DROPIN")" 2>/dev/null || true
    systemctl daemon-reload || true
  fi
  systemctl restart "$UNIT" >/dev/null 2>&1 || true
}

if [ -n "$SCRIPT" ] && [ -f "$SCRIPT" ]; then
  MODE="script"
  BACKUP="$SCRIPT.bak-mfp-p2pool-api-$STAMP"
  cp -a "$SCRIPT" "$BACKUP"
  export MFP_SCRIPT="$SCRIPT" MFP_API_DIR="$API_DIR"
  python3 - <<'PY'
import os, shlex, stat

script = os.environ['MFP_SCRIPT']
api = os.environ['MFP_API_DIR']
st = os.stat(script)
text = open(script, 'r', encoding='utf-8', errors='surrogateescape').read()
lines = text.splitlines(True)
changed = False

# Find the actual p2pool executable token. Do not use a regex here:
# startup scripts commonly contain pgrep/echo lines before the real launch line.
skip_words = ('pgrep', 'grep ', 'grep\t', 'pidof', 'echo ', 'printf ')

for i, line in enumerate(lines):
    stripped = line.lstrip()
    if not stripped or stripped.startswith('#'):
        continue
    if any(word in line for word in skip_words):
        continue
    if 'p2pool' not in line:
        continue

    tokens = line.strip().split()
    launch_token = ''
    for token in tokens:
        clean = token.strip('"\'')
        if clean in ('p2pool', './p2pool') or clean.endswith('/p2pool'):
            launch_token = token
            break

    if not launch_token:
        continue

    has_data = '--data-api' in tokens or any(x.startswith('--data-api=') for x in tokens)
    has_local = '--local-api' in tokens or '--stratum-api' in tokens
    if has_data and has_local:
        changed = True
        break

    pos = line.find(launch_token)
    if pos < 0:
        continue
    end = pos + len(launch_token)

    flags = ''
    if not has_data:
        flags += ' --data-api ' + shlex.quote(api)
    if not has_local:
        flags += ' --local-api'

    lines[i] = line[:end] + flags + line[end:]
    changed = True
    break

if not changed:
    raise SystemExit('Could not safely locate the real p2pool launch command in ' + script)

tmp = script + '.mfp.tmp'
with open(tmp, 'w', encoding='utf-8', errors='surrogateescape') as f:
    f.write(''.join(lines))
os.chmod(tmp, stat.S_IMODE(st.st_mode))
os.chown(tmp, st.st_uid, st.st_gid)
os.replace(tmp, script)
PY

  # Validate the shell script before touching the running mining service.
  if ! bash -n "$SCRIPT"; then
    rollback
    die "startup script became invalid after edit; original file restored"
  fi

  # Verify that the launch command itself, not a pgrep/grep check, contains both flags.
  if ! awk '
    /p2pool/ && $0 !~ /pgrep|grep|pidof|echo|printf/ &&
    $0 ~ /--data-api/ && $0 ~ /--(local-api|stratum-api)/ { ok=1 }
    END { exit ok ? 0 : 1 }
  ' "$SCRIPT"; then
    rollback
    die "analytics flags were not added to the real p2pool launch command"
  fi
else
  MODE="dropin"
  DROPIN="/etc/systemd/system/$UNIT.d/mfp-p2pool-analytics.conf"
  mkdir -p "$(dirname "$DROPIN")"
  export MFP_PID="$PID" MFP_API_DIR="$API_DIR" MFP_DROPIN="$DROPIN"
  python3 - <<'PY'
import os

pid = os.environ['MFP_PID']
api = os.environ['MFP_API_DIR']
dropin = os.environ['MFP_DROPIN']
args = [x.decode(errors='surrogateescape') for x in open('/proc/' + pid + '/cmdline', 'rb').read().split(b'\0') if x]
if not args:
    raise SystemExit('p2pool command line is empty')

has_data = any(a == '--data-api' or a.startswith('--data-api=') for a in args)
has_local = any(a in ('--local-api', '--stratum-api') for a in args)
if not has_data:
    args += ['--data-api', api]
if not has_local:
    args += ['--local-api']

def quote(value):
    value = value.replace('%', '%%').replace('\\', '\\\\').replace('"', '\\"')
    return '"' + value + '"'

content = '[Service]\nExecStart=\nExecStart=' + ' '.join(quote(x) for x in args) + '\n'
with open(dropin, 'w', encoding='utf-8') as f:
    f.write(content)
PY
  systemctl daemon-reload
fi

log "Restarting $UNIT to enable P2Pool analytics"
if ! systemctl restart "$UNIT"; then
  rollback
  die "failed to restart $UNIT; original startup configuration restored"
fi

OK=0
for _ in $(seq 1 180); do
  NEWPID="$(pgrep -xo p2pool || true)"
  if [ -n "$NEWPID" ] && [ -r "/proc/$NEWPID/cmdline" ]; then
    CMD="$(tr '\0' ' ' <"/proc/$NEWPID/cmdline")"
    if printf '%s' "$CMD" | grep -q -- '--data-api' && { printf '%s' "$CMD" | grep -q -- '--local-api' || printf '%s' "$CMD" | grep -q -- '--stratum-api'; }; then
      OK=1
      break
    fi
  fi
  sleep 1
done

if [ "$OK" != "1" ]; then
  rollback
  die "p2pool did not restart with analytics flags; original startup configuration restored"
fi

log "P2Pool analytics enabled"
printf 'MFP_ALREADY=0\nMFP_P2POOL_API_DIR=%s\nMFP_SYSTEMD_UNIT=%s\n' "$API_DIR" "$UNIT"
