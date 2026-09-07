import type { ComparableSale, PricingAdvice } from './item-detail-repository';

// BRIEF.md's "Valuation engine": deterministic maths over evidence, never
// an LLM guess. Every number here traces to a real comparable sale price;
// nothing is invented.

const RECENT_WINDOW_DAYS = 90;
const MIN_RECENT_SAMPLES = 5;
const MIN_SAMPLES_FOR_OUTLIER_TRIM = 4;
const MIN_TRIMMED_SAMPLES = 3;

export function computeValuation(
  sales: ComparableSale[],
  now: Date = new Date(),
): PricingAdvice | undefined {
  const included = sales.filter((sale) => !sale.excluded);
  if (included.length === 0) return undefined;

  // Prefer a tighter, more current picture when there's enough recent data;
  // otherwise fall back to everything rather than starving the estimate.
  const recent = included.filter((sale) => daysSince(sale.soldAt, now) <= RECENT_WINDOW_DAYS);
  const usedRecentWindow = recent.length >= MIN_RECENT_SAMPLES;
  const pool = usedRecentWindow ? recent : included;

  const prices = trimOutliers(pool.map((sale) => sale.price));
  const sorted = [...prices].sort((a, b) => a - b);

  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);

  const buyItNowPrice = roundToNinetyNine(q3 * 1.03);
  const quickSalePrice = Math.round(q1);
  const acceptOffersLow = Math.round(median);
  const acceptOffersHigh = Math.round(buyItNowPrice * 0.95);
  const autoDeclineBelow = Math.round(quickSalePrice * 0.9);

  const spread = median > 0 ? (q3 - q1) / median : 0;
  let confidence: PricingAdvice['confidence'] =
    sorted.length >= 8 ? 'high' : sorted.length >= 3 ? 'medium' : 'low';
  if (confidence === 'high' && spread > 0.5) confidence = 'medium';
  if (confidence === 'medium' && spread > 0.8) confidence = 'low';

  return {
    likelyAchievedLow: Math.round(q1),
    likelyAchievedHigh: Math.round(q3),
    buyItNowPrice,
    acceptOffersLow,
    acceptOffersHigh,
    quickSalePrice,
    autoDeclineBelow,
    confidence,
    evidenceCount: sorted.length,
    evidenceWindowDays: usedRecentWindow ? RECENT_WINDOW_DAYS : undefined,
  };
}

function daysSince(soldAt: string, now: Date): number {
  return (now.getTime() - new Date(soldAt).getTime()) / (1000 * 60 * 60 * 24);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base]! : sorted[base]! + rest * (next - sorted[base]!);
}

/** IQR-based outlier trim -- only when there's enough data for it to be meaningful, and never below a minimum usable sample. */
function trimOutliers(prices: number[]): number[] {
  if (prices.length < MIN_SAMPLES_FOR_OUTLIER_TRIM) return prices;
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  const trimmed = prices.filter((price) => price >= low && price <= high);
  return trimmed.length >= MIN_TRIMMED_SAMPLES ? trimmed : prices;
}

/** Psychological ".99" pricing, rounded down from the input (e.g. 180.25 -> 179.99, matching BRIEF.md's own example: an achieved-high of £175 with a 3% margin becomes "Recommended BIN £179.99"). */
function roundToNinetyNine(value: number): number {
  return Math.max(0.99, Math.floor(value) - 0.01);
}
