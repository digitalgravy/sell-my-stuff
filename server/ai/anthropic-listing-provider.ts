import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  listingDraftResultSchema,
  type ListingDraftInput,
  type ListingDraftOutcome,
  type ListingDraftProvider,
} from './listing-provider';

const DEFAULT_MODEL = 'claude-sonnet-5';

export const LISTING_DRAFT_SYSTEM_PROMPT = `You are drafting an eBay listing (UK, private seller, used goods) from facts already established about an item -- identification, condition assessment and (where available) pricing research. You are not looking at photos; work only from the facts given.

Report:
- title: up to 80 characters, eBay-style (manufacturer, model, key distinguishing detail), no promotional filler ("L@@K", "MUST SEE")
- description: a factual, plain-English write-up for a buyer -- what it is, what's included, its actual condition (drawing on conditionDescription below), anything a buyer would want to know before bidding
- categoryGuess: your best guess at the eBay category this item belongs in (a short readable name, e.g. "Consumer Electronics > Headphones"), not a numeric ID
- itemSpecifics: brand/model/colour/type -- fill in whichever of these the identity facts below already give you (copy them straight across), and leave the rest out; never invent one you don't have
- conditionDescription: 1-3 sentences, factual, describing the item's actual condition for a listing -- must be consistent with (never more favourable than) the condition facts given
- dispatchDays: how many days after payment you'd commit to dispatching (a plain used item ships fast, normally 1-2; only go higher if fragility/special handling genuinely warrants more preparation time)
- returnsAccepted / returnsDays: a reasonable UK private-seller default (accepting 30-day returns is normal and reduces buyer hesitation) unless something about the item's condition or facts suggests otherwise
- openQuestions: only genuinely unresolved details that would change the listing (e.g. no confirmed working status found in the facts) -- do not pad this list

Never fabricate or upgrade a claim beyond what the facts actually support. In particular, never claim "perfect condition", "barely used", "smoke-free home" or "fully tested" unless a condition fact actually establishes it -- if functional status is unknown, say so plainly rather than implying it works. Disclose every defect or missing part given to you; do not soften or omit them.`;

function formatIdentity(identity: ListingDraftInput['identity']): string {
  const lines = Object.entries(identity)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `- ${key}: ${value}`);
  return lines.length > 0 ? lines.join('\n') : '(no identity facts recorded)';
}

function formatCondition(condition: ListingDraftInput['condition']): string {
  if (!condition) return '(no condition assessment recorded)';
  const lines = Object.entries(condition)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `- ${key}: ${value}`);
  return lines.length > 0 ? lines.join('\n') : '(no condition assessment recorded)';
}

function formatPackaging(packaging: ListingDraftInput['packaging']): string {
  if (!packaging) return '(no packaging/fragility assessment recorded)';
  const lines: string[] = [];
  if (packaging.fragility) lines.push(`- fragility: ${packaging.fragility}`);
  if (packaging.specialHandling && packaging.specialHandling.length > 0) {
    lines.push(`- specialHandling: ${packaging.specialHandling.join(', ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : '(no packaging/fragility assessment recorded)';
}

function formatPricing(pricing: ListingDraftInput['pricing']): string {
  if (!pricing) return '(no comparable-sales pricing yet)';
  return [
    `- buyItNowPrice: £${pricing.buyItNowPrice.toFixed(2)}`,
    `- likelyAchievedRange: £${pricing.likelyAchievedLow.toFixed(2)}-£${pricing.likelyAchievedHigh.toFixed(2)}`,
  ].join('\n');
}

export class AnthropicListingProvider implements ListingDraftProvider {
  readonly provider = 'anthropic';
  readonly model: string;

  constructor(
    private readonly client: Anthropic,
    model: string = DEFAULT_MODEL,
  ) {
    this.model = model;
  }

  async generate(input: ListingDraftInput): Promise<ListingDraftOutcome> {
    const prompt = [
      'Identity:',
      formatIdentity(input.identity),
      '',
      'Condition:',
      formatCondition(input.condition),
      '',
      'Packaging:',
      formatPackaging(input.packaging),
      '',
      'Pricing:',
      formatPricing(input.pricing),
    ].join('\n');

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: LISTING_DRAFT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      output_config: {
        format: zodOutputFormat(listingDraftResultSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error(
        'The listing-draft provider response did not match the expected schema',
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

let sharedProvider: AnthropicListingProvider | undefined;

export function getAnthropicListingProvider(): AnthropicListingProvider {
  if (sharedProvider) return sharedProvider;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  sharedProvider = new AnthropicListingProvider(
    new Anthropic({ apiKey }),
    process.env.ANTHROPIC_LISTING_MODEL ?? DEFAULT_MODEL,
  );
  return sharedProvider;
}
