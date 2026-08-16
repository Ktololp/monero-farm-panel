import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { serverById } from './server.js';

const monerodStatusScript = `#!/usr/bin/env bash
set +e
BIN=""
PROC_PID=""
EXEC_START="$(systemctl show -p ExecStart --value "$MONEROD_SERVICE_UNIT" 2>/dev/null)"

find_target_process() {
  local target="$1"
  local unit="$2"
  local cgroup pid exe
  cgroup="$(systemctl show -p ControlGroup --value "$unit" 2>/dev/null)"

  # Some installations use bash/python wrappers as the systemd MainPID.
  # Find the actual monerod executable inside the service cgroup instead.
  if [ -n "$cgroup" ] && [ "$cgroup" != "/" ]; then
    for proc in /proc/[0-9]*; do
      pid="${proc##*/}"
      [ -r "/proc/$pid/cgroup" ] || continue
      grep -Fq -- "$cgroup" "/proc/$pid/cgroup" 2>/dev/null || continue
      exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null)"
      [ "$(basename "$exe" 2>/dev/null)" = "$target" ] || continue
      printf '%s|%s\n' "$pid" "$exe"
      return 0
    done
  fi

  pid="$(pgrep -x "$target" 2>/dev/null | head -n 1)"
  if [ -n "$pid" ]; then
    exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null)"
    if [ "$(basename "$exe" 2>/dev/null)" = "$target" ]; then
      printf '%s|%s\n' "$pid" "$exe"
      return 0
    fi
  fi
  return 1
}

MATCH="$(find_target_process monerod "$MONEROD_SERVICE_UNIT")"
if [ -n "$MATCH" ]; then
  PROC_PID="$(printf '%s' "$MATCH" | cut -d'|' -f1)"
  BIN="$(printf '%s' "$MATCH" | cut -d'|' -f2-)"
fi

# For a stopped service, trust ExecStart only when it points directly to monerod.
# Never report /bin/bash as the Monero binary.
if [ -z "$BIN" ]; then
  EXEC_BIN="$(printf '%s' "$EXEC_START" | sed -n 's/.*path=\\([^ ;}]*\\).*/\\1/p' | head -n 1)"
  if [ -n "$EXEC_BIN" ] && [ -x "$EXEC_BIN" ] && [ "$(basename "$EXEC_BIN")" = "monerod" ]; then BIN="$EXEC_BIN"; fi
fi
if [ -z "$BIN" ] && [ -x /opt/monero/monerod ]; then
  BIN=/opt/monero/monerod
elif [ -z "$BIN" ] && command -v monerod >/dev/null 2>&1; then
  CANDIDATE="$(command -v monerod)"
  [ "$(basename "$CANDIDATE")" = "monerod" ] && BIN="$CANDIDATE"
fi

VERSION=""
if [ -n "$BIN" ] && [ -x "$BIN" ]; then VERSION="$($BIN --version 2>/dev/null | head -n 1)"; fi

# Recover --config-file from the real monerod process, not from a wrapper.
CONFIG_PATH=""
if [ -n "$PROC_PID" ] && [ -r "/proc/$PROC_PID/cmdline" ]; then
  WANT_CONFIG=0
  while IFS= read -r arg; do
    if [ "$WANT_CONFIG" = "1" ]; then
      CONFIG_PATH="$arg"
      break
    fi
    case "$arg" in
      --config-file=*) CONFIG_PATH="$(printf '%s' "$arg" | cut -d= -f2-)"; break ;;
      --config-file) WANT_CONFIG=1 ;;
    esac
  done < <(tr '\\0' '\\n' < "/proc/$PROC_PID/cmdline")
fi
if [ -z "$CONFIG_PATH" ]; then
  CONFIG_PATH="$(printf '%s' "$EXEC_START" | sed -n 's/.*--config-file[= ]\\([^ ;}]*\\).*/\\1/p' | head -n 1)"
fi
if [ -z "$CONFIG_PATH" ]; then
  HOME_DIR="$(getent passwd "$TARGET_USER" 2>/dev/null | cut -d: -f6)"
  for candidate in "$MONEROD_CONFIG_PATH" /etc/monero/monerod.conf /etc/monerod.conf "$HOME_DIR/.bitmonero/bitmonero.conf"; do
    [ -n "$candidate" ] && [ -f "$candidate" ] || continue
    CONFIG_PATH="$candidate"
    break
  done
fi
CONFIG=0
[ -n "$CONFIG_PATH" ] && [ -f "$CONFIG_PATH" ] && CONFIG=1

LOAD_STATE="$(systemctl show -p LoadState --value "$MONEROD_SERVICE_UNIT" 2>/dev/null)"
SERVICE=0
[ "$LOAD_STATE" = "loaded" ] && SERVICE=1
ENABLED=0
systemctl is-enabled --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1 && ENABLED=1
ACTIVE=0
systemctl is-active --quiet "$MONEROD_SERVICE_UNIT" >/dev/null 2>&1 && ACTIVE=1

RPC=0
PRUNED=""
INFO="$(curl -fsS --max-time 3 "http://127.0.0.1:$MONEROD_RPC_PORT/get_info" 2>/dev/null)"
if printf '%s' "$INFO" | grep -q '"status"'; then RPC=1; fi
if printf '%s' "$INFO" | grep -Eq '"pruned"[[:space:]]*:[[:space:]]*true'; then PRUNED=1; fi
if printf '%s' "$INFO" | grep -Eq '"pruned"[[:space:]]*:[[:space:]]*false'; then PRUNED=0; fi

if [ -z "$PRUNED" ] && [ -n "$PROC_PID" ] && [ -r "/proc/$PROC_PID/cmdline" ]; then
  if tr '\\0' '\\n' < "/proc/$PROC_PID/cmdline" | grep -qx -- '--prune-blockchain'; then PRUNED=1; fi
fi
if [ -z "$PRUNED" ] && [ "$CONFIG" = "1" ]; then
  if grep -Eq '^[[:space:]]*prune-blockchain[[:space:]]*=[[:space:]]*(1|true|yes)[[:space:]]*$' "$CONFIG_PATH"; then PRUNED=1; else PRUNED=0; fi
fi

printf 'MFP_BINARY=%s\\n' "$BIN"
printf 'MFP_VERSION=%s\\n' "$VERSION"
printf 'MFP_CONFIG=%s\\n' "$CONFIG"
printf 'MFP_CONFIG_PATH=%s\\n' "$CONFIG_PATH"
printf 'MFP_SERVICE=%s\\n' "$SERVICE"
printf 'MFP_ENABLED=%s\\n' "$ENABLED"
printf 'MFP_ACTIVE=%s\\n' "$ACTIVE"
printf 'MFP_RPC=%s\\n' "$RPC"
printf 'MFP_PRUNED=%s\\n' "$PRUNED"
exit 0
`;

const torStatusScript = `#!/usr/bin/env bash
set +e
INSTALLED=0
command -v tor >/dev/null 2>&1 && INSTALLED=1
ENABLED=0
systemctl is-enabled --quiet tor >/dev/null 2>&1 && ENABLED=1
ACTIVE=0
systemctl is-active --quiet tor >/dev/null 2>&1 && ACTIVE=1
ONION=""
TORRC=0
if [ -f /etc/tor/torrc ] && grep -q '^# BEGIN MFP MONEROD TOR$' /etc/tor/torrc; then TORRC=1; fi
MONERO_CONFIG=0
if [ -n "$MONEROD_CONFIG_PATH" ] && [ -f "$MONEROD_CONFIG_PATH" ] && grep -q '^# BEGIN MFP TOR$' "$MONEROD_CONFIG_PATH"; then
  MONERO_CONFIG=1
  ONION="$(sed -n 's/^anonymous-inbound=\\([^,]*\\),.*/\\1/p' "$MONEROD_CONFIG_PATH" | head -n 1)"
fi
if [ -z "$ONION" ] && [ -r /var/lib/tor/monerod/hostname ]; then ONION="$(tr -d '\\r\\n ' </var/lib/tor/monerod/hostname)"; fi
printf 'MFP_INSTALLED=%s\\n' "$INSTALLED"
printf 'MFP_ENABLED=%s\\n' "$ENABLED"
printf 'MFP_ACTIVE=%s\\n' "$ACTIVE"
printf 'MFP_ONION=%s\\n' "$ONION"
printf 'MFP_TORRC=%s\\n' "$TORRC"
printf 'MFP_MONERO_CONFIG=%s\\n' "$MONERO_CONFIG"
exit 0
`;

function unitName(server) {
  const raw = safeServiceName(server.monerod_service || 'monerod');
  return raw.endsWith('.service') ? raw : `${raw}.service`;
}

function parsePairs(output = '') {
  const values = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = /^MFP_([A-Z_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function parseMonerodStatus(output = '') {
  const values = parsePairs(output);
  const versionMatch = String(values.VERSION || '').match(/v?(\d+\.\d+\.\d+(?:\.\d+)?)/);
  const pruned = values.PRUNED === '1' ? true : values.PRUNED === '0' ? false : null;
  const status = {
    installed: Boolean(values.BINARY),
    binaryPath: values.BINARY || '',
    version: versionMatch?.[1] || '',
    configExists: values.CONFIG === '1',
    configPath: values.CONFIG_PATH || '',
    serviceInstalled: values.SERVICE === '1',
    enabled: values.ENABLED === '1',
    active: values.ACTIVE === '1',
    rpcAvailable: values.RPC === '1',
    pruned,
    mode: pruned === true ? 'pruned' : pruned === false ? 'full' : 'unknown'
  };
  status.operational = status.installed && status.serviceInstalled && status.active && status.rpcAvailable;
  status.ready = status.operational && status.enabled;
  status.torConfigurable = status.operational && status.configExists && Boolean(status.configPath);
  return status;
}

function parseTorStatus(output = '') {
  const values = parsePairs(output);
  const status = {
    installed: values.INSTALLED === '1',
    enabled: values.ENABLED === '1',
    active: values.ACTIVE === '1',
    onion: values.ONION || '',
    torrcConfigured: values.TORRC === '1',
    monerodConfigured: values.MONERO_CONFIG === '1'
  };
  status.ready = status.installed && status.enabled && status.active && Boolean(status.onion) && status.torrcConfigured && status.monerodConfigured;
  return status;
}

export async function getMonerodInstallStatus(serverId) {
  const server = serverById(serverId);
  const env = {
    TARGET_USER: server.username,
    MONEROD_SERVICE_UNIT: unitName(server),
    MONEROD_RPC_PORT: String(server.monerod_rpc_port || 18081),
    MONEROD_CONFIG_PATH: '/etc/monero/monerod.conf'
  };
  const result = await ssh.runScript(server, monerodStatusScript, env, { sudo: false, timeoutMs: 15000 });
  if (result.code !== 0) throw new Error(`monerod status check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  return { ok: true, monerod: parseMonerodStatus(result.stdout) };
}

export async function getMonerodTorStatus(serverId, monerodStatus = null) {
  const server = serverById(serverId);
  const monerod = monerodStatus || (await getMonerodInstallStatus(serverId)).monerod;
  const env = { MONEROD_CONFIG_PATH: monerod.configPath || '/etc/monero/monerod.conf' };
  const result = await ssh.runScript(server, torStatusScript, env, { sudo: false, timeoutMs: 15000 });
  if (result.code !== 0) throw new Error(`Tor status check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  return { ok: true, tor: parseTorStatus(result.stdout) };
}

export async function installMonerod(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const mode = String(options.mode || 'pruned').trim();
  if (!['pruned', 'full'].includes(mode)) throw new Error('Invalid monerod mode');

  const before = await getMonerodInstallStatus(serverId);
  if (before.monerod.operational) {
    if (before.monerod.mode !== 'unknown' && before.monerod.mode !== mode) {
      throw new Error(`monerod is already configured as ${before.monerod.mode}; changing node type after initial sync is intentionally not automatic`);
    }
    return { ok: true, alreadyInstalled: true, monerod: before.monerod, output: '' };
  }

  const script = fs.readFileSync(path.resolve('scripts/remote-install-monerod.sh'), 'utf8');
  const env = {
    MONEROD_MODE: mode,
    MONEROD_SERVICE_UNIT: unitName(server),
    MONEROD_RPC_PORT: String(server.monerod_rpc_port || 18081),
    MONEROD_CONFIG_PATH: before.monerod.configPath || '/etc/monero/monerod.conf',
    MONEROD_BINARY_PATH: before.monerod.binaryPath || ''
  };

  let result;
  try {
    result = await ssh.runScript(server, script, env, { sudo: true, timeoutMs: 45 * 60 * 1000 });
  } catch (error) {
    audit({ ip: actorIp, serverId: server.id, action: 'install-monerod', status: 'error', details: error.message });
    throw error;
  }
  audit({ ip: actorIp, serverId: server.id, action: 'install-monerod', status: result.code === 0 ? 'ok' : 'error', details: { code: result.code, mode } });
  if (result.code !== 0) throw new Error(`monerod installation failed: ${result.stderr.trim() || result.stdout.slice(-2500)}`);

  const after = await getMonerodInstallStatus(serverId);
  if (!after.monerod.operational) throw new Error('monerod installation finished, but the daemon is not operational');
  if (after.monerod.mode !== 'unknown' && after.monerod.mode !== mode) throw new Error(`monerod started, but existing config kept node mode ${after.monerod.mode}`);
  return { ok: true, alreadyInstalled: false, monerod: after.monerod, output: result.stdout };
}

export async function configureMonerodTor(serverId, _options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const monerod = (await getMonerodInstallStatus(serverId)).monerod;
  if (!monerod.operational) throw new Error('monerod must be running and its local RPC must be reachable before Tor setup');
  if (!monerod.torConfigurable) throw new Error('monerod is running, but its config file could not be located safely; Tor setup was not applied');
  const before = await getMonerodTorStatus(serverId, monerod);
  if (before.tor.ready) return { ok: true, alreadyConfigured: true, tor: before.tor, output: '' };

  const script = fs.readFileSync(path.resolve('scripts/remote-configure-monerod-tor.sh'), 'utf8');
  const env = {
    MONEROD_SERVICE_UNIT: unitName(server),
    MONEROD_CONFIG_PATH: monerod.configPath,
    TOR_ONION_PORT: '18084',
    TOR_SOCKS_PORT: '9050'
  };

  let result;
  try {
    result = await ssh.runScript(server, script, env, { sudo: true, timeoutMs: 20 * 60 * 1000 });
  } catch (error) {
    audit({ ip: actorIp, serverId: server.id, action: 'configure-monerod-tor', status: 'error', details: error.message });
    throw error;
  }
  audit({ ip: actorIp, serverId: server.id, action: 'configure-monerod-tor', status: result.code === 0 ? 'ok' : 'error', details: { code: result.code } });
  if (result.code !== 0) throw new Error(`Tor setup failed: ${result.stderr.trim() || result.stdout.slice(-2500)}`);

  const after = await getMonerodTorStatus(serverId, (await getMonerodInstallStatus(serverId)).monerod);
  if (!after.tor.ready) throw new Error('Tor setup finished, but onion service is not fully ready');
  return { ok: true, alreadyConfigured: false, tor: after.tor, output: result.stdout };
}
