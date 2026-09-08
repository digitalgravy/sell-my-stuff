import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  dimensionsAssessmentResultSchema,
  type DimensionsAssessmentOutcome,
  type DimensionsAssessmentProvider,
  type IdentityContextForDimensions,
} from './dimensions-provider';
import {
  SUPPORTED_VISION_MEDIA_TYPES,
  UnsupportedPhotoFormatError,
  type PhotoForIdentification,
  type SupportedVisionMediaType,
} from './vision-provider';

const DEFAULT_MODEL = 'claude-sonnet-5';

export const DIMENSIONS_SYSTEM_PROMPT = `You are estimating the packed size, weight and fragility of an item from photographs, so it can be packaged correctly for postage. This is a separate concern from identifying or grading the item -- focus only on physical packaging requirements.

You may be told the item's manufacturer/model/family/type if it's already been identified confidently. When you recognise the specific product, use your own real-world knowledge of its typical dimensions and weight rather than guessing from pixels alone -- state that reasoning in the evidence text (e.g. "a Sony WH-1000XM4 folds to roughly 20x18x8cm and weighs about 250g"). When identity is generic, uncertain, or you don't recognise the specific product, estimate visually using any scale reference actually visible in the photos (a hand, a table edge, a power socket, a coin) and say what you used.

Report:
- lengthCm/widthCm/heightCm/weightKg: each with confidence (0 to 1) and evidence -- omit any dimension you have no reasonable basis to estimate rather than inventing a number
- fragility: one of robust, moderate, fragile, very_fragile, with confidence and evidence
- specialHandling: any of anti_static (bare circuit boards/electronics with exposed contacts), fragile_glass (glass or ceramic components), liquid (contains liquid), battery (loose/removable battery), sharp_edges, heavy_awkward (heavy or an awkward shape to box) that visibly apply -- omit the field entirely if none apply

Only include an unresolved detail in openQuestions if it is both undeterminable from the photos and would materially change how this should be packaged (e.g. "no scale reference visible in any photo -- a photo next to something of known size, like a ruler or a coin, would help"). Do not invent a size or weight you have no basis for.`;

function isSupportedMediaType(
  mediaType: string,
): mediaType is SupportedVisionMediaType {
  return (SUPPORTED_VISION_MEDIA_TYPES as readonly string[]).includes(
    mediaType,
  );
}

function describeIdentity(identity?: IdentityContextForDimensions): string {
  if (!identity) return 'The item has not been identified yet.';
  const parts = [identity.manufacturer, identity.family, identity.model, identity.itemType].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0
    ? `The item has been identified as: ${parts.join(' ')}.`
    : 'The item has not been identified yet.';
}

export class AnthropicDimensionsProvider implements DimensionsAssessmentProvider {
  readonly provider = 'anthropic';
  readonly model: string;

  constructor(
    private readonly client: Anthropic,
    model: string = DEFAULT_MODEL,
  ) {
    this.model = model;
  }

  async assess(
    photos: PhotoForIdentification[],
    identity?: IdentityContextForDimensions,
  ): Promise<DimensionsAssessmentOutcome> {
    const usablePhotos = photos.filter((photo) =>
      isSupportedMediaType(photo.mediaType),
    );
    if (usablePhotos.length === 0) {
      throw new UnsupportedPhotoFormatError(
        'None of the supplied photos are in a format the dimensions provider can inspect (JPEG, PNG, GIF or WebP). HEIC/HEIF photos need conversion before assessment.',
      );
    }

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: DIMENSIONS_SYSTEM_PROMPT,
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
              text: `${describeIdentity(identity)} Estimate its packed size, weight and fragility for postage.`,
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(dimensionsAssessmentResultSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error(
        'The dimensions provider response did not match the expected schema',
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

let sharedProvider: AnthropicDimensionsProvider | undefined;

export function getAnthropicDimensionsProvider(): AnthropicDimensionsProvider {
  if (sharedProvider) return sharedProvider;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  sharedProvider = new AnthropicDimensionsProvider(
    new Anthropic({ apiKey }),
    process.env.ANTHROPIC_DIMENSIONS_MODEL ?? DEFAULT_MODEL,
  );
  return sharedProvider;
}
