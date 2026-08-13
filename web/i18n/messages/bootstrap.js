import { msg } from '@lingui/core/macro';

export default {
  "bootstrap.completed": msg({ id: "bootstrap.completed", message: "Bootstrap completed" }),
  "bootstrap.description": msg({ id: "bootstrap.description", message: "Installs dependencies, builds XMRig, creates a systemd service and enables the localhost API. Use it for a new Ubuntu server; for an existing miner, Auto Fix is usually enough." }),
  "bootstrap.done": msg({ id: "bootstrap.done", message: "Done" }),
  "bootstrap.installP2pool": msg({ id: "bootstrap.installP2pool", message: "Also install p2pool" }),
  "bootstrap.running": msg({ id: "bootstrap.running", message: "Installation in progress…" }),
  "bootstrap.start": msg({ id: "bootstrap.start", message: "Start" }),
};
