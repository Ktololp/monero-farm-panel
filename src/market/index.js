const MARKET_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true';

let ioRef = null;
let timer = null;
let inFlight = null;
let state = {
  symbol: 'XMR',
  currency: 'USD',
  price: null,
  change24h: null,
  source: 'CoinGecko',
  sourceUpdatedAt: null,
  fetchedAt: null,
  error: null
};

export function getMarketState() {
  return { ...state };
}

export function setMarketIO(io) {
  ioRef = io;
}

export async function refreshXmrUsd({ force = false } = {}) {
  if (inFlight) return inFlight;
  if (!force && state.fetchedAt && Date.now() - state.fetchedAt < 45_000) return getMarketState();

  inFlight = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(MARKET_URL, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'Monero-Farm-Panel/1.2'
        }
      });
      if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
      const data = await response.json();
      const monero = data?.monero;
      const price = Number(monero?.usd);
      if (!Number.isFinite(price) || price <= 0) throw new Error('CoinGecko returned an invalid XMR/USD price');

      const change24h = Number(monero?.usd_24h_change);
      const sourceUpdatedAt = Number(monero?.last_updated_at);
      state = {
        symbol: 'XMR',
        currency: 'USD',
        price,
        change24h: Number.isFinite(change24h) ? change24h : null,
        source: 'CoinGecko',
        sourceUpdatedAt: Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt * 1000 : null,
        fetchedAt: Date.now(),
        error: null
      };
    } catch (error) {
      state = {
        ...state,
        fetchedAt: Date.now(),
        error: error?.name === 'AbortError' ? 'Таймаут получения курса XMR/USD' : (error?.message || String(error))
      };
      console.error('[market]', state.error);
    } finally {
      clearTimeout(timeout);
      inFlight = null;
    }
    ioRef?.emit('market:update', getMarketState());
    return getMarketState();
  })();

  return inFlight;
}

export function startMarket() {
  if (timer) return;
  refreshXmrUsd({ force: true }).catch(err => console.error('[market] initial refresh:', err));
  timer = setInterval(() => refreshXmrUsd({ force: true }).catch(err => console.error('[market] refresh:', err)), 60_000);
  timer.unref?.();
}

export function stopMarket() {
  if (timer) clearInterval(timer);
  timer = null;
}
