import { z } from 'zod';

export interface CandidateListing {
  title: string;
  /** The condition/format text scraped alongside the title (e.g. "Pre-owned", "Brand new"). */
  match: string;
}

/** Only the identity facts that matter for judging whether a listing is the same real-world item -- not confidence/evidence/etc. */
export interface IdentityFactsForMatching {
  itemType?: string;
  manufacturer?: string;
  family?: string;
  model?: string;
  modelNumbers?: string[];
  colour?: string;
}

export const listingMatchSchema = z.object({
  index: z.number().int().min(0),
  isMatch: z.boolean(),
  reason: z.string().min(1),
});

export const matchClassificationResultSchema = z.object({
  listings: z.array(listingMatchSchema),
});

export type ListingMatch = z.infer<typeof listingMatchSchema>;
export type MatchClassificationResult = z.infer<typeof matchClassificationResultSchema>;

export interface MatchClassificationOutcome {
  result: MatchClassificationResult;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ComparableMatchProvider {
  readonly provider: string;
  readonly model: string;
  classify(
    identity: IdentityFactsForMatching,
    listings: CandidateListing[],
  ): Promise<MatchClassificationOutcome>;
}
