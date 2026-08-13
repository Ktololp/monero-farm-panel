import { msg } from '@lingui/core/macro';

export default {
  "updates.checkNow": msg({ id: "updates.checkNow", message: "Check now" }),
  "updates.checking": msg({ id: "updates.checking", message: "Checking official releases…" }),
  "updates.confirm": msg({ id: "updates.confirm", message: "Update XMRig sequentially to {version}? Building on each server may take several minutes." }),
  "updates.installed": msg({ id: "updates.installed", message: "Installed" }),
  "updates.lastCheck": msg({ id: "updates.lastCheck", message: "Last check" }),
  "updates.notDetected": msg({ id: "updates.notDetected", message: "not detected" }),
  "updates.rollingHint": msg({ id: "updates.rollingHint", message: "XMRig rolling update builds the official source code for the selected version on each miner, backs up the current binary, and proceeds only after a hashrate health check. If the new version fails to start, the panel attempts to restore the previous binary automatically." }),
  "updates.rollingTo": msg({ id: "updates.rollingTo", message: "Rolling update to {version}" }),
  "updates.selectServers": msg({ id: "updates.selectServers", message: "Select servers" }),
  "updates.server": msg({ id: "updates.server", message: "Server" }),
  "updates.started": msg({ id: "updates.started", message: "Rolling update started" }),
  "updates.status": msg({ id: "updates.status", message: "Status" }),
  "updates.status.current": msg({ id: "updates.status.current", message: "current" }),
  "updates.status.newer": msg({ id: "updates.status.newer", message: "newer than latest" }),
  "updates.status.unknown": msg({ id: "updates.status.unknown", message: "unknown" }),
  "updates.status.update": msg({ id: "updates.status.update", message: "update available" }),
  "updates.subtitle": msg({ id: "updates.subtitle", message: "Official release checks and rolling updates" }),
  "updates.title": msg({ id: "updates.title", message: "Update Center" }),
  "updates.xmrigServers": msg({ id: "updates.xmrigServers", message: "XMRig on servers" }),
};
