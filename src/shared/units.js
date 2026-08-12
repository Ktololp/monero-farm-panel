export function formatHashrate(value){const n=Number(value);if(!Number.isFinite(n))return '—';return n>=1e6?`${(n/1e6).toFixed(2)} MH/s`:`${(n/1e3).toFixed(2)} kH/s`;}
export function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
