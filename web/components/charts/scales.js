/**
 * Chart scale helpers.
 *
 * The goal is visual honesty: tiny changes must not fill the whole chart,
 * while real degradation/temperature changes must remain easy to notice.
 * These functions contain no Chart.js dependency and are unit-testable.
 */

function finiteValues(values) {
  return (values || []).map(Number).filter(Number.isFinite);
}

function niceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / power;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * power;
}

function buildScale(values, {
  minimumSpan,
  paddingFraction = 0.1,
  tickCount = 5,
  hardMin = null,
  hardMax = null,
  fixedStep = null
}) {
  const points = finiteValues(values);
  if (!points.length) return {};

  let low = Math.min(...points);
  let high = Math.max(...points);
  const observedSpan = Math.max(0, high - low);
  const targetSpan = Math.max(observedSpan * (1 + paddingFraction * 2), minimumSpan || 0);
  const center = (low + high) / 2;

  low = center - targetSpan / 2;
  high = center + targetSpan / 2;

  if (Number.isFinite(hardMin) && low < hardMin) {
    high += hardMin - low;
    low = hardMin;
  }
  if (Number.isFinite(hardMax) && high > hardMax) {
    low -= high - hardMax;
    high = hardMax;
    if (Number.isFinite(hardMin)) low = Math.max(hardMin, low);
  }

  const rawStep = (high - low) / Math.max(2, tickCount - 1);
  const stepSize = fixedStep || niceStep(rawStep);
  let min = Math.floor(low / stepSize) * stepSize;
  let max = Math.ceil(high / stepSize) * stepSize;

  if (Number.isFinite(hardMin)) min = Math.max(hardMin, min);
  if (Number.isFinite(hardMax)) max = Math.min(hardMax, max);
  if (!(max > min)) max = min + stepSize;

  return { min, max, stepSize };
}

/**
 * Temperature scale.
 * At least a 20 C visual window prevents 47.7 -> 48.0 C from looking dramatic.
 * Tick marks are always 5 C apart for predictable reading.
 */
export function temperatureScale(values) {
  return buildScale(values, {
    minimumSpan: 20,
    paddingFraction: 0.12,
    tickCount: 5,
    hardMin: 0,
    fixedStep: 5
  });
}

/**
 * Hashrate scale.
 * Keep at least a 15% window around the current/baseline reference. This makes
 * normal RandomX jitter look small, but an actual 10-20% degradation obvious.
 */
export function hashrateScale(values, reference = null) {
  const points = finiteValues(values);
  const fallbackReference = points.length ? Math.max(...points.map(Math.abs)) : 0;
  const ref = Number.isFinite(Number(reference)) && Number(reference) > 0
    ? Number(reference)
    : fallbackReference;
  return buildScale(points, {
    minimumSpan: Math.max(ref * 0.15, 1_000),
    paddingFraction: 0.1,
    tickCount: 5,
    hardMin: 0
  });
}

/** Fixed percentage scale for metrics such as CPU usage and Huge Pages usage. */
export function percentageScale() {
  return { min: 0, max: 100, stepSize: 20 };
}

/** Latency starts at zero; only the upper boundary is adaptive. */
export function latencyScale(values) {
  const points = finiteValues(values);
  if (!points.length) return { min: 0 };
  const high = Math.max(...points, 1);
  const stepSize = niceStep(Math.max(high * 1.25, 10) / 5);
  return { min: 0, max: Math.ceil((high * 1.25) / stepSize) * stepSize, stepSize };
}

export const __test = { niceStep, buildScale };
