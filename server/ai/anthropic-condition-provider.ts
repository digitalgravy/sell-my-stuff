import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  conditionAssessmentResultSchema,
  type ConditionAssessmentOutcome,
  type ConditionAssessmentProvider,
} from './condition-provider';
import {
  SUPPORTED_VISION_MEDIA_TYPES,
  UnsupportedPhotoFormatError,
  type PhotoForIdentification,
  type SupportedVisionMediaType,
} from './vision-provider';

const DEFAULT_MODEL = 'claude-sonnet-5';

export const CONDITION_SYSTEM_PROMPT = `You are assessing the cosmetic and functional condition of a used item from photographs, for resale. This is a separate concern from identifying what the item is -- focus only on its condition.

Report:
- overallGrade: one of new_sealed, unused_open_box, excellent, very_good, good, fair, spares_repair, with confidence (0 to 1, calibrated) and evidence (what in the photos supports this grade)
- functionalStatus: only if photographic evidence speaks to it (e.g. a visible error screen, a missing/damaged port) -- omit rather than guess at functionality you cannot see evidence of
- cosmeticWear: visible wear appropriate to the item's actual materials (e.g. scuffs/scratches on a plastic or metal shell, tears or discolouration on fabric, cracks on glass) -- omit if the item looks essentially unmarked
- defects: any visible damage, cracks, dents or malfunctions -- omit if none are visible
- missingParts: any accessories, cables or components visibly absent that would normally come with this item -- omit if you cannot tell

Every field you include needs a confidence and a short factual evidence note. Only include an unresolved detail in openQuestions if it is both undeterminable from the photos and would materially change the condition grade or resale value (e.g. "photos don't show whether it powers on"). Do not invent wear, damage or functionality you cannot see.`;

function isSupportedMediaType(
  mediaType: string,
): mediaType is SupportedVisionMediaType {
  return (SUPPORTED_VISION_MEDIA_TYPES as readonly string[]).includes(
    mediaType,
  );
}

export class AnthropicConditionProvider implements ConditionAssessmentProvider {
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
  ): Promise<ConditionAssessmentOutcome> {
    const usablePhotos = photos.filter((photo) =>
      isSupportedMediaType(photo.mediaType),
    );
    if (usablePhotos.length === 0) {
      throw new UnsupportedPhotoFormatError(
        'None of the supplied photos are in a format the condition provider can inspect (JPEG, PNG, GIF or WebP). HEIC/HEIF photos need conversion before assessment.',
      );
    }

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: CONDITION_SYSTEM_PROMPT,
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
              text: 'Assess the condition of this item for resale.',
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(conditionAssessmentResultSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error(
        'The condition provider response did not match the expected schema',
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

let sharedProvider: AnthropicConditionProvider | undefined;

export function getAnthropicConditionProvider(): AnthropicConditionProvider {
  if (sharedProvider) return sharedProvider;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  sharedProvider = new AnthropicConditionProvider(
    new Anthropic({ apiKey }),
    process.env.ANTHROPIC_CONDITION_MODEL ?? DEFAULT_MODEL,
  );
  return sharedProvider;
}
