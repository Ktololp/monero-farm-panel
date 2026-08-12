
function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function healthLevel(score) {
  if (score >= 90) return 'healthy';
  if (score >= 75) return 'attention';
  if (score >= 50) return 'warning';
  return 'critical';
}

export function scoreLiveState(live, { tempWarn = 80, tempCritical = 90 } = {}) {
  if (!live || live.status === 'offline') {
    return { healthScore: 0, healthLevel: 'critical', healthReasons: ['Сервер недоступен'] };
  }

  let score = 100;
  const reasons = [];
  const penalize = (points, reason) => {
    score -= points;
    if (reason) reasons.push(reason);
  };

  if (live.status === 'degraded') penalize(28, 'Сервер работает частично');
  else if (live.status === 'starting') penalize(5, 'Сервис ещё запускается');

  const xmrig = live.components?.xmrig || live.xmrigStatus;
  if (xmrig === 'inactive' || xmrig === 'unknown') penalize(30, 'XMRig недоступен');
  else if (xmrig === 'starting') penalize(5, 'XMRig запускается');

  const current = Number(live.hash60s);
  const baseline = Number(live.baselineHash);
  if (Number.isFinite(current) && current > 0 && Number.isFinite(baseline) && baseline > 0) {
    const ratio = current / baseline;
    if (ratio < 0.6) penalize(30, 'Хешрейт ниже базовой нормы более чем на 40%');
    else if (ratio < 0.8) penalize(18, 'Хешрейт ниже базовой нормы более чем на 20%');
    else if (ratio < 0.9) penalize(8, 'Хешрейт ниже базовой нормы более чем на 10%');
  }

  const temp = Number(live.tempC);
  if (Number.isFinite(temp)) {
    if (temp >= tempCritical) penalize(28, 'Критическая температура CPU');
    else if (temp >= tempWarn) penalize(12, 'Высокая температура CPU');
  }

  const accepted = Math.max(0, Number(live.accepted) || 0);
  const rejected = Math.max(0, Number(live.rejected) || 0);
  if (accepted + rejected >= 20) {
    const rejectedPct = rejected / (accepted + rejected) * 100;
    if (rejectedPct >= 5) penalize(15, 'Высокая доля rejected shares');
    else if (rejectedPct >= 1) penalize(5, 'Есть rejected shares');
  }

  if (live.network?.dns === false) penalize(5, 'DNS недоступен');
  if (live.network?.internet === false) penalize(5, 'Нет доступа в Интернет');

  const sync = Number(live.monero?.syncPercent);
  if (Number.isFinite(sync) && sync < 99.5) penalize(10, 'monerod не синхронизирован');

  if (live.proxy?.detected && !live.proxy?.available) penalize(8, 'xmrig-proxy найден, но API недоступен');
  if (live.p2poolAnalytics?.dataApiEnabled && !live.p2poolAnalytics?.available) penalize(5, 'P2Pool Data API недоступен');

  const errors = Array.isArray(live.errors) ? live.errors.length : 0;
  if (errors) penalize(Math.min(10, errors * 2), 'Есть свежие ошибки в логах');

  score = clamp(Math.round(score));
  return { healthScore: score, healthLevel: healthLevel(score), healthReasons: reasons.slice(0, 6) };
}
