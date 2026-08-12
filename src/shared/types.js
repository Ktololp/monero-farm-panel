/**
 * Shared JSDoc contracts. They are documentation + IDE hints, not runtime dependencies.
 * @typedef {'online'|'starting'|'offline'|'degraded'|'unknown'} ServerHealth
 * @typedef {{height?:number,targetHeight?:number,syncPercent?:number,synchronized?:boolean}} MonerodState
 * @typedef {{xmrig?:string,p2pool?:string,monerod?:string}} ComponentState
 * @typedef {{serverId:number,status:ServerHealth,hash10s?:number,hash60s?:number,hash15m?:number,tempC?:number,components?:ComponentState,monero?:MonerodState}} ServerLiveState
 */
export {};
