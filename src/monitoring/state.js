
const state = new Map();
let ioRef = null;

export function setMonitorIO(io) {
  ioRef = io;
}

export function getLiveState(serverId) {
  return state.get(Number(serverId)) || null;
}

export function getAllLiveStates() {
  return Object.fromEntries(state.entries());
}

export function setLiveState(serverId, live) {
  state.set(Number(serverId), live);
  return live;
}

export function emitServerUpdate(live) {
  ioRef?.emit('server:update', live);
}
