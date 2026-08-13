import { msg } from '@lingui/core/macro';

export default {
  "operations.applySelected": msg({ id: "operations.applySelected", message: "Apply to selected" }),
  "operations.doneErrors": msg({ id: "operations.doneErrors", message: "Done, errors: {count}" }),
  "operations.profileApplied": msg({ id: "operations.profileApplied", message: "Profile applied" }),
  "operations.profiles": msg({ id: "operations.profiles", message: "Performance profiles" }),
  "operations.profilesHint": msg({ id: "operations.profilesHint", message: "The profile is applied to selected servers with a config.json backup and restart." }),
  "operations.restartConfirm": msg({ id: "operations.restartConfirm", message: "Start sequential restart of the selected servers?" }),
  "operations.restartHint": msg({ id: "operations.restartHint", message: "Restarts the selected XMRig/mining service sequentially and waits for the grace period to finish and hashrate to return." }),
  "operations.restartStarted": msg({ id: "operations.restartStarted", message: "Rolling restart started" }),
  "operations.rollingHint": msg({ id: "operations.rollingHint", message: "Rolling operations run strictly one server at a time: the next server starts only after the previous one is back online." }),
  "operations.selectAtLeastOne": msg({ id: "operations.selectAtLeastOne", message: "Select at least one server" }),
  "operations.selectServers": msg({ id: "operations.selectServers", message: "Server selection" }),
  "operations.selectServersError": msg({ id: "operations.selectServersError", message: "Select servers" }),
  "operations.startRestart": msg({ id: "operations.startRestart", message: "Start rolling restart" }),
  "operations.subtitle": msg({ id: "operations.subtitle", message: "Safe fleet actions and performance profiles" }),
  "operations.title": msg({ id: "operations.title", message: "Operations" }),
};
