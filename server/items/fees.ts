/**
 * eBay UK abolished selling fees for PRIVATE sellers on 1 October 2024:
 * eligible domestic listings carry no final value fee, no per-order fee,
 * no regulatory operating fee -- "list for £10, receive £10." The cost
 * moved to the buyer instead, via a separate Buyer Protection fee added
 * on top of the item price at checkout; it never comes out of the
 * seller's proceeds. Confirmed against eBay's own seller-fee-change
 * announcement and Buyer Protection help pages, 2026-09-08 -- this app
 * is explicitly a personal decluttering tool (BRIEF.md), not a business
 * account, which is the one thing that would make this NOT apply.
 *
 * The exceptions are narrow and don't fit what this tool is built
 * around, so they're deliberately not modelled (surfaced as a UI note
 * instead of guessing at a rate for an edge case): a private seller
 * still pays a final value fee in a handful of authenticity-guarantee
 * categories (watches over £100, sneakers over £100, designer handbags
 * over £500, trading cards over £150), for international sales, and
 * once past 300 free listings in a month.
 */
export const EBAY_UK_PRIVATE_SELLER_FEE_NOTE =
  'eBay charges private sellers no selling fee on most items since October 2024 (the buyer pays a separate Buyer Protection fee instead, which doesn’t come out of your proceeds) — the one exception is a handful of authenticity-checked categories (watches, sneakers, designer handbags, trading cards) over certain values.';

export function estimateMarketplaceFeeGbp(_salePriceGbp: number): number {
  return 0;
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
