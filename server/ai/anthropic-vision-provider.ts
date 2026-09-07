import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  identificationResultSchema,
  SUPPORTED_VISION_MEDIA_TYPES,
  UnsupportedPhotoFormatError,
  type IdentificationOutcome,
  type PhotoForIdentification,
  type SupportedVisionMediaType,
  type VisionIdentificationProvider,
} from './vision-provider';

const DEFAULT_MODEL = 'claude-sonnet-5';

export const SYSTEM_PROMPT = `You are a careful product-identification assistant for a personal decluttering tool. Look at the supplied photographs of a single physical item and identify it.

For each plausible identity, report:
- itemType: a short category description (e.g. "wireless keyboard")
- manufacturer, family, model when legible or confidently inferable
- modelNumbers: any model/part numbers visible in the photos
- colour when visibly distinct
- confidence: 0 to 1, calibrated (do not overstate certainty)
- evidence: a short factual note on what in the photos supports this (a visible label, logo, distinctive shape, etc.)
- ebaySearchTerms: 1-3 realistic eBay search queries for this candidate, most specific first, phrased the way a real eBay listing title would actually read -- not a mechanical "manufacturer + family + model" concatenation. Drop marketing/series names that a seller's listing title likely wouldn't repeat verbatim (a "family" like "MEG (Unify series)" is worse in a search box than just the model name), and progressively broaden across the list (e.g. ["MSI MEG B550 UNIFY-X", "MSI B550 UNIFY-X", "MSI MEG B550"]) so a later term still finds it if the most specific one turns up nothing.

List candidates most-likely first. Only include an unresolved price-sensitive detail (such as storage capacity, RAM or a variant that materially changes value) in openQuestions if it cannot be determined from the photos and would matter for pricing. Do not invent specifications you cannot see or confidently infer.

Also assess canSearchEbayConfidently: given everything you can see, is there enough specific information (typically a manufacturer plus a model or a genuinely distinctive family/item type) to search eBay's sold listings and reliably find this exact item, rather than a flood of unrelated similar-looking products? Being confident about a generic category alone (e.g. "definitely a wireless keyboard", with no manufacturer or model visible) is usually NOT enough -- set this to false in that case, and in searchReadinessNote say exactly what would resolve it (a clearer photo of a label, the underside, a visible model number). Only set it true when you'd expect an eBay search on what you know to actually surface the right item.`;

function isSupportedMediaType(
  mediaType: string,
): mediaType is SupportedVisionMediaType {
  return (SUPPORTED_VISION_MEDIA_TYPES as readonly string[]).includes(
    mediaType,
  );
}

export class AnthropicVisionProvider implements VisionIdentificationProvider {
  readonly provider = 'anthropic';
  readonly model: string;

  constructor(
    private readonly client: Anthropic,
    model: string = DEFAULT_MODEL,
  ) {
    this.model = model;
  }

  async identify(
    photos: PhotoForIdentification[],
  ): Promise<IdentificationOutcome> {
    const usablePhotos = photos.filter((photo) =>
      isSupportedMediaType(photo.mediaType),
    );
    if (usablePhotos.length === 0) {
      throw new UnsupportedPhotoFormatError(
        'None of the supplied photos are in a format the vision provider can inspect (JPEG, PNG, GIF or WebP). HEIC/HEIF photos need conversion before identification.',
      );
    }

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...usablePhotos.map(
              (photo): Anthropic.ImageBlockParam => ({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: photo.mediaType as SupportedVisionMediaType,
                  data: photo.base64,
                },
              }),
            ),
            {
              type: 'text',
              text: 'Identify the item shown in these photographs.',
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(identificationResultSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error(
        'The vision provider response did not match the expected identification schema',
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

let sharedProvider: AnthropicVisionProvider | undefined;

export function getAnthropicVisionProvider(): AnthropicVisionProvider {
  if (sharedProvider) return sharedProvider;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  sharedProvider = new AnthropicVisionProvider(
    new Anthropic({ apiKey }),
    process.env.ANTHROPIC_VISION_MODEL ?? DEFAULT_MODEL,
  );
  return sharedProvider;
}
