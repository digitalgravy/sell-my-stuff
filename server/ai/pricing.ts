/**
 * Approximate Anthropic API cost, computed from real token counts rather
 * than estimated -- deterministic maths per BRIEF.md, not something an LLM
 * call reports about itself. Rates are USD per million tokens, checked
 * against https://claude.com/pricing on 2026-09-07; update this table if
 * pricing changes, rather than trusting a stale number silently.
 */
const RATES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-haiku-4.5': { input: 1, output: 5 },
};

/** Undefined for an unrecognised model -- never guess a rate. */
export function estimateCostUsd(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | undefined {
  const rate = RATES_USD_PER_MTOK[model];
  if (!rate) return undefined;
  return (
    ((inputTokens ?? 0) / 1_000_000) * rate.input +
    ((outputTokens ?? 0) / 1_000_000) * rate.output
  );
}

// Static approximation, not a live exchange rate -- Anthropic bills in USD
// and this app prices everything else in GBP. AI cost per item is small
// (single-digit pence), so a fixed rate is an honest-enough approximation
// for netting it against an estimated sale price; revisit if it ever needs
// to be exact (e.g. a real accounting export).
const APPROX_USD_TO_GBP = 0.79;

export function usdToGbp(usd: number): number {
  return usd * APPROX_USD_TO_GBP;
}
