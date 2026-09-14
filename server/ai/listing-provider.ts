import { z } from 'zod';

/**
 * Everything already known about the item that a listing draft should be
 * built from -- no photos, unlike the vision/condition/dimensions
 * providers, since this stage only turns facts already extracted (by
 * those earlier stages) into eBay-ready copy. Every field is optional
 * because drafting can be attempted as soon as identity is confident,
 * before condition/packaging/pricing necessarily exist.
 */
export interface ListingDraftInput {
  identity: {
    itemType?: string;
    manufacturer?: string;
    family?: string;
    model?: string;
    modelNumbers?: string;
    colour?: string;
  };
  condition?: {
    overallGrade?: string;
    functionalStatus?: string;
    cosmeticWear?: string;
    defects?: string;
    missingParts?: string;
  };
  packaging?: {
    fragility?: string;
    specialHandling?: string[];
  };
  pricing?: {
    buyItNowPrice: number;
    likelyAchievedLow: number;
    likelyAchievedHigh: number;
  };
}

// A fixed set of fields, not a freeform record -- Anthropic's structured
// output mode (like other providers' strict JSON schema modes) can't
// reliably populate an arbitrary string-keyed map (confirmed live,
// 2026-09-14: a z.record field came back empty every time even with an
// explicit prompt instruction to fill it), so the common eBay item
// specifics get their own named, optional fields instead.
export const listingItemSpecificsSchema = z.object({
  brand: z.string().optional(),
  model: z.string().optional(),
  colour: z.string().optional(),
  type: z.string().optional(),
});

export type ListingItemSpecifics = z.infer<typeof listingItemSpecificsSchema>;

export const listingDraftResultSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1),
  categoryGuess: z.string().min(1),
  itemSpecifics: listingItemSpecificsSchema.default({}),
  conditionDescription: z.string().min(1),
  dispatchDays: z.number().int().min(1).max(30),
  returnsAccepted: z.boolean(),
  returnsDays: z.number().int().min(0).max(60),
  openQuestions: z.array(z.string().min(1)).default([]),
});

export type ListingDraftResult = z.infer<typeof listingDraftResultSchema>;

export interface ListingDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ListingDraftOutcome {
  result: ListingDraftResult;
  usage: ListingDraftUsage;
}

export interface ListingDraftProvider {
  /** e.g. 'anthropic' — recorded against every run, success or failure. */
  readonly provider: string;
  /** The exact model identifier this instance calls — recorded against every run, success or failure. */
  readonly model: string;
  generate(input: ListingDraftInput): Promise<ListingDraftOutcome>;
}
