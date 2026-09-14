import type { ListingCheck, ListingStrategyOption, PricingAdvice } from './item-detail-repository';

const MIN_PHOTOS_RECOMMENDED = 4;

export interface ListingStrategyInput {
  pricing?: PricingAdvice;
}

/**
 * Pure derivation of the Buy It Now vs. auction choice from pricing advice
 * already computed elsewhere (computeValuation) -- never invents its own
 * numbers, only presents the ones pricing already established. Undefined
 * until pricing exists, since there is nothing to base a strategy on yet.
 */
export function deriveListingStrategyOptions(
  input: ListingStrategyInput,
): ListingStrategyOption[] | undefined {
  const { pricing } = input;
  if (!pricing) return undefined;

  return [
    {
      name: 'Buy It Now',
      recommended: pricing.confidence !== 'low',
      value: `£${pricing.buyItNowPrice.toFixed(2)}`,
      detail: `Estimated fair value from ${pricing.evidenceCount} comparable sale${pricing.evidenceCount === 1 ? '' : 's'}.`,
    },
    {
      name: '7-day auction',
      recommended: pricing.confidence === 'low',
      value: `Start at £${pricing.quickSalePrice.toFixed(2)}, auto-decline below £${pricing.autoDeclineBelow.toFixed(2)}`,
      detail: 'More total views, but less certainty over the final price than a fixed Buy It Now.',
    },
  ];
}

export interface ListingChecksInput {
  title?: string;
  photoCount: number;
  conditionDescriptionConfirmed: boolean;
  hasWeightEstimate: boolean;
}

/**
 * Pure derivation of the pre-listing checklist -- each check reflects
 * something real and already known (title length, photo count, whether the
 * owner has confirmed the AI-drafted condition description, whether a
 * weight estimate exists for postage), never a placeholder.
 */
export function deriveListingChecks(input: ListingChecksInput): ListingCheck[] {
  const titleOk = !!input.title && input.title.length > 0 && input.title.length <= 80;
  return [
    {
      label: 'Title within 80 characters',
      state: titleOk ? 'yes' : 'required',
    },
    {
      label: `At least ${MIN_PHOTOS_RECOMMENDED} photos attached`,
      state: input.photoCount >= MIN_PHOTOS_RECOMMENDED ? 'yes' : 'required',
    },
    {
      label: 'Condition description confirmed by you',
      state: input.conditionDescriptionConfirmed ? 'yes' : 'required',
    },
    {
      label: 'Shipping weight & dimensions estimated',
      state: input.hasWeightEstimate ? 'yes' : 'optional',
    },
  ];
}

/** Server-side re-check before actually publishing -- never trust the client's own read of these checks for the one action with real, live consequences. */
export function listingHasOutstandingRequiredChecks(checks: ListingCheck[]): boolean {
  return checks.some((check) => check.state === 'required');
}
