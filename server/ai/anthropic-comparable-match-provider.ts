import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  matchClassificationResultSchema,
  type CandidateListing,
  type ComparableMatchProvider,
  type IdentityFactsForMatching,
  type MatchClassificationOutcome,
} from './comparable-match-provider';

const DEFAULT_MODEL = 'claude-sonnet-5';

export const MATCH_SYSTEM_PROMPT = `You are helping decide which eBay sold-listing titles are genuine comparable sales of a specific identified item, for pricing research. LLMs interpret evidence here; the actual pricing maths happens elsewhere in deterministic code -- your only job is judging whether each listing is the same real-world item in a comparable condition.

A listing is a match only if it is that item itself being sold on its own, in a condition genuinely comparable to the identified item's own condition (given as conditionGrade, when known). It is NOT a match if it is:
- a bundle that includes the item plus other unrelated things
- an accessory, spare part, or replacement component for the item, rather than the item itself
- labels, cartridges, cases, cables or other consumables/accessories associated with the item but not the item
- a clearly different model or variant, when the model can be determined from the title
- packaging, box, or manual only, with no actual item
- explicitly faulty, broken, not working, for parts, or spares/repair, when the identified item's own conditionGrade is anything better than spares_repair -- a working item and a faulty one are not comparable sales of each other, regardless of how similar the listing otherwise is
- explicitly described as new/sealed or mint, when the identified item's own conditionGrade is fair or spares_repair -- the reverse mismatch, an unrealistically good comparable for a poor-condition item

When the identified item's conditionGrade is itself fair or spares_repair, do NOT reject faulty/for-parts/spares-repair listings on condition grounds -- those are exactly the right comparables for a poor-condition item. When conditionGrade is unknown, judge condition only where a listing's title makes an explicit, unambiguous condition claim (e.g. "FAULTY", "for parts") -- don't guess at condition from a title that says nothing about it.

When the model or variant genuinely cannot be determined from the title alone, judge on item type and manufacturer instead of requiring certainty the title doesn't offer -- do not reject a listing just because it lacks a level of detail an eBay seller wouldn't normally include.

For every listing given, in the order given, decide isMatch and give a short factual reason (what in the title supports the decision) -- when rejecting for a condition mismatch, say so explicitly.`;

export class AnthropicComparableMatchProvider implements ComparableMatchProvider {
  readonly provider = 'anthropic';
  readonly model: string;

  constructor(
    private readonly client: Anthropic,
    model: string = DEFAULT_MODEL,
  ) {
    this.model = model;
  }

  async classify(
    identity: IdentityFactsForMatching,
    listings: CandidateListing[],
  ): Promise<MatchClassificationOutcome> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8192,
      system: MATCH_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Identified item:\n${JSON.stringify(identity, null, 2)}\n\nListings:\n${JSON.stringify(
            listings.map((listing, index) => ({
              index,
              title: listing.title,
              condition: listing.match,
            })),
            null,
            2,
          )}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(matchClassificationResultSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error(
        'The match classifier response did not match the expected schema',
      );
    }
    return {
      result: response.parsed_output,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

let sharedProvider: AnthropicComparableMatchProvider | undefined;

export function getAnthropicComparableMatchProvider(): AnthropicComparableMatchProvider {
  if (sharedProvider) return sharedProvider;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  sharedProvider = new AnthropicComparableMatchProvider(
    new Anthropic({ apiKey }),
    process.env.ANTHROPIC_MATCH_MODEL ?? DEFAULT_MODEL,
  );
  return sharedProvider;
}
