/**
 * A single, documented approximate eBay UK final-value-fee rate -- there is
 * no fee-rate API integration (BRIEF.md's "Fees and estimated net
 * proceeds" asks to "retrieve current fee rules dynamically where
 * practical", but no such source exists here yet). This is a flat
 * approximation of eBay UK's most-common-category final value fee,
 * deliberately not itemising eBay's real per-category tiers or its small
 * fixed per-order fee -- same "clearly labelled estimate, not a precise
 * figure" precedent as the USD->GBP conversion in server/ai/pricing.ts.
 * Revisit if eBay's published rate changes materially.
 */
export const EBAY_UK_APPROX_FINAL_VALUE_FEE_RATE = 0.12;

export function estimateMarketplaceFeeGbp(salePriceGbp: number): number {
  return Math.round(salePriceGbp * EBAY_UK_APPROX_FINAL_VALUE_FEE_RATE * 100) / 100;
}

export interface ProceedsBreakdown {
  saleProceeds: number;
  aiResearchCostGbp: number;
  marketplaceFeeGbp: number;
  estimatedNet: number;
}

/** Sale proceeds − marketplace fee − AI research cost = estimated net, per BRIEF.md's "Fees and estimated net proceeds" shape. */
export function computeProceedsBreakdown(
  salePriceGbp: number,
  aiResearchCostGbp: number,
): ProceedsBreakdown {
  const marketplaceFeeGbp = estimateMarketplaceFeeGbp(salePriceGbp);
  return {
    saleProceeds: salePriceGbp,
    aiResearchCostGbp,
    marketplaceFeeGbp,
    estimatedNet: Math.round((salePriceGbp - marketplaceFeeGbp - aiResearchCostGbp) * 100) / 100,
  };
}
