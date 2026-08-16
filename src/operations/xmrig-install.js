import fs from 'node:fs';
import path from 'node:path';
import { getSettings, audit } from '../database/index.js';
import { ssh, safeServiceName } from '../ssh/index.js';
import { serverById, validateWallet, validatePool } from './server.js';

const statusScript = `#!/usr/bin/env bash
set +e
BIN=""
PROC_PID=""

find_target_process() {
  local target="$1"
  local unit="$2"
  local cgroup pid exe
  cgroup="$(systemctl show -p ControlGroup --value "$unit" 2>/dev/null)"

  # A service may use /bin/bash as MainPID and keep xmrig as a child.
  # Prefer an exact executable name that belongs to the service cgroup.
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

  # Fallback for unusual unit/cgroup layouts.
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

MATCH="$(find_target_process xmrig "$XMRIG_SERVICE_UNIT")"
if [ -n "$MATCH" ]; then
  PROC_PID="$(printf '%s' "$MATCH" | cut -d'|' -f1)"
  BIN="$(printf '%s' "$MATCH" | cut -d'|' -f2-)"
fi

# If stopped, accept ExecStart only when it actually points to xmrig,
# never a shell/interpreter wrapper.
if [ -z "$BIN" ]; then
  EXEC_START="$(systemctl show -p ExecStart --value "$XMRIG_SERVICE_UNIT" 2>/dev/null)"
  EXEC_BIN="$(printf '%s' "$EXEC_START" | sed -n 's/.*path=\\([^ ;}]*\\).*/\\1/p' | head -n 1)"
  if [ -n "$EXEC_BIN" ] && [ -x "$EXEC_BIN" ] && [ "$(basename "$EXEC_BIN")" = "xmrig" ]; then BIN="$EXEC_BIN"; fi
fi

if [ -z "$BIN" ] && [ -x /opt/xmrig/xmrig ]; then
  BIN=/opt/xmrig/xmrig
elif [ -z "$BIN" ] && command -v xmrig >/dev/null 2>&1; then
  CANDIDATE="$(command -v xmrig)"
  [ "$(basename "$CANDIDATE")" = "xmrig" ] && BIN="$CANDIDATE"
fi

VERSION=""
if [ -n "$BIN" ] && [ -x "$BIN" ]; then VERSION="$($BIN --version 2>/dev/null | head -n 1)"; fi
CONFIG=0
[ -f "$XMRIG_CONFIG_PATH" ] && CONFIG=1
LOAD_STATE="$(systemctl show -p LoadState --value "$XMRIG_SERVICE_UNIT" 2>/dev/null)"
SERVICE=0
[ "$LOAD_STATE" = "loaded" ] && SERVICE=1
ENABLED=0
systemctl is-enabled --quiet "$XMRIG_SERVICE_UNIT" >/dev/null 2>&1 && ENABLED=1
ACTIVE=0
systemctl is-active --quiet "$XMRIG_SERVICE_UNIT" >/dev/null 2>&1 && ACTIVE=1
printf 'MFP_BINARY=%s\\n' "$BIN"
printf 'MFP_VERSION=%s\\n' "$VERSION"
printf 'MFP_CONFIG=%s\\n' "$CONFIG"
printf 'MFP_SERVICE=%s\\n' "$SERVICE"
printf 'MFP_ENABLED=%s\\n' "$ENABLED"
printf 'MFP_ACTIVE=%s\\n' "$ACTIVE"
exit 0
`;

function unitName(server) {
  const raw = safeServiceName(server.xmrig_service || 'xmrig');
  return raw.endsWith('.service') ? raw : `${raw}.service`;
}

function parseStatus(output = '') {
  const values = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = /^MFP_([A-Z]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  const versionMatch = String(values.VERSION || '').match(/(\d+\.\d+\.\d+)/);
  const status = {
    installed: Boolean(values.BINARY),
    binaryPath: values.BINARY || '',
    version: versionMatch?.[1] || '',
    configExists: values.CONFIG === '1',
    serviceInstalled: values.SERVICE === '1',
    enabled: values.ENABLED === '1',
    active: values.ACTIVE === '1'
  };
  status.ready = status.installed && status.configExists && status.serviceInstalled && status.enabled && status.active;
  return status;
}

export async function getXmrigInstallStatus(serverId) {
  const server = serverById(serverId);
  const env = {
    XMRIG_CONFIG_PATH: server.xmrig_config_path || '/opt/xmrig/config.json',
    XMRIG_SERVICE_UNIT: unitName(server)
  };
  const result = await ssh.runScript(server, statusScript, env, { sudo: false, timeoutMs: 15000 });
  if (result.code !== 0) throw new Error(`XMRig status check failed: ${result.stderr.trim() || result.stdout.slice(-1000)}`);
  return { ok: true, xmrig: parseStatus(result.stdout) };
}

export async function installXmrig(serverId, options = {}, { actorIp = '' } = {}) {
  const server = serverById(serverId);
  const before = await getXmrigInstallStatus(serverId);
  if (before.xmrig.ready && !options.force) return { ok: true, alreadyInstalled: true, xmrig: before.xmrig, output: '' };

  const settings = getSettings({ includeSecrets: true });
  validateWallet(settings.wallet);
  validatePool(settings.pool_url);
  const version = String(options.xmrigVersion || settings.xmrig_version || '6.26.0').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Некорректная версия XMRig');

  const script = fs.readFileSync(path.resolve('scripts/remote-install-xmrig.sh'), 'utf8');
  const env = {
    XMRIG_VERSION: version,
    WALLET: settings.wallet,
    POOL_URL: settings.pool_url,
    POOL_PASS: settings.pool_pass || 'x',
    POOL_TLS: String(settings.pool_tls) === '1' ? '1' : '0',
    XMRIG_API_PORT: String(server.xmrig_api_port || 60050),
    XMRIG_CONFIG_PATH: server.xmrig_config_path || '/opt/xmrig/config.json',
    XMRIG_SERVICE_UNIT: unitName(server)
  };

  let result;
  try {
    result = await ssh.runScript(server, script, env, { sudo: true, timeoutMs: 45 * 60 * 1000 });
  } catch (error) {
    audit({ ip: actorIp, serverId: server.id, action: 'install-xmrig', status: 'error', details: error.message });
    throw error;
  }
  audit({ ip: actorIp, serverId: server.id, action: 'install-xmrig', status: result.code === 0 ? 'ok' : 'error', details: { code: result.code, version } });
  if (result.code !== 0) throw new Error(`XMRig installation failed: ${result.stderr.trim() || result.stdout.slice(-2000)}`);

  const after = await getXmrigInstallStatus(serverId);
  if (!after.xmrig.ready) throw new Error('XMRig installation finished, but the service is not fully ready');
  return { ok: true, alreadyInstalled: false, xmrig: after.xmrig, output: result.stdout };
}
