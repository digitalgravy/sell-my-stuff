import {
  createOffer,
  createOrReplaceInventoryItem,
  getCategorySuggestions,
  getFirstBusinessPolicies,
  getFirstMerchantLocationKey,
  publishOffer,
} from '@/server/ebay/ebay-client';
import { getEbayConfig, type EbayEnvironment } from '@/server/ebay/ebay-config';

import type { MarketplacePublisher, PublishListingInput, PublishListingOutcome } from './marketplace-publisher';

/** Our condition grades (lib/fact-fields.ts's CONDITION_GRADES) mapped onto eBay's fixed ConditionEnum. */
const CONDITION_ENUM: Record<string, string> = {
  new_sealed: 'NEW',
  unused_open_box: 'NEW_OTHER',
  excellent: 'USED_EXCELLENT',
  very_good: 'USED_VERY_GOOD',
  good: 'USED_GOOD',
  fair: 'USED_ACCEPTABLE',
  spares_repair: 'FOR_PARTS_OR_NOT_WORKING',
};

export function mapConditionGradeToEbay(grade: string): string | undefined {
  return CONDITION_ENUM[grade];
}

export function buildEbayAspects(
  itemSpecifics: PublishListingInput['itemSpecifics'],
): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};
  if (itemSpecifics.brand) aspects.Brand = [itemSpecifics.brand];
  if (itemSpecifics.model) aspects.Model = [itemSpecifics.model];
  if (itemSpecifics.colour) aspects.Colour = [itemSpecifics.colour];
  if (itemSpecifics.type) aspects.Type = [itemSpecifics.type];
  return aspects;
}

export function buildEbayListingUrl(environment: EbayEnvironment, listingId: string): string {
  const host = environment === 'production' ? 'www.ebay.co.uk' : 'sandbox.ebay.co.uk';
  return `https://${host}/itm/${listingId}`;
}

export class EbayApiPublisher implements MarketplacePublisher {
  readonly marketplace = 'ebay';

  async publish(input: PublishListingInput): Promise<PublishListingOutcome> {
    const condition = mapConditionGradeToEbay(input.conditionGrade);
    if (!condition) {
      return { ok: false, reason: `Unrecognised condition grade "${input.conditionGrade}"` };
    }
    if (input.photoUrls.length === 0) {
      return { ok: false, reason: 'No photos to list' };
    }

    const [suggestions, policies, merchantLocationKey] = await Promise.all([
      getCategorySuggestions(input.title),
      getFirstBusinessPolicies(),
      getFirstMerchantLocationKey(),
    ]);
    const categoryId = suggestions[0]?.categoryId;
    if (!categoryId) {
      return { ok: false, reason: `eBay found no category suggestion for "${input.title}"` };
    }
    if (!policies) {
      return {
        ok: false,
        reason:
          'No eBay Business Policies found -- opt in and set up a fulfillment, payment and return policy via My eBay first.',
      };
    }
    if (!merchantLocationKey) {
      return {
        ok: false,
        reason: 'No eBay inventory location found -- set one up via My eBay/the Account API first.',
      };
    }

    await createOrReplaceInventoryItem({
      sku: input.sku,
      condition,
      conditionDescription: input.conditionDescription,
      title: input.title,
      description: input.description,
      aspects: buildEbayAspects(input.itemSpecifics),
      imageUrls: input.photoUrls,
      quantity: 1,
    });

    const offer = await createOffer({
      sku: input.sku,
      categoryId,
      priceGbp: input.priceGbp,
      fulfillmentPolicyId: policies.fulfillmentPolicyId,
      paymentPolicyId: policies.paymentPolicyId,
      returnPolicyId: policies.returnPolicyId,
      merchantLocationKey,
    });

    // The one call with real, live consequences -- the offer goes on sale
    // on eBay the instant this succeeds. Everything above this line is
    // reversible (draft state on eBay's side); this line is not.
    const published = await publishOffer(offer.offerId);

    return {
      ok: true,
      listingId: published.listingId,
      listingUrl: buildEbayListingUrl(getEbayConfig().environment, published.listingId),
    };
  }
}

let sharedPublisher: EbayApiPublisher | undefined;

export function getEbayApiPublisher(): EbayApiPublisher {
  sharedPublisher ??= new EbayApiPublisher();
  return sharedPublisher;
}
