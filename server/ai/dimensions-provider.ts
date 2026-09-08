import { z } from 'zod';

import { FRAGILITY_GRADES, SPECIAL_HANDLING_FLAGS } from '@/lib/fact-fields';

export { FRAGILITY_GRADES, SPECIAL_HANDLING_FLAGS } from '@/lib/fact-fields';
export type { FragilityGrade, SpecialHandlingFlag } from '@/lib/fact-fields';

import type { PhotoForIdentification } from './vision-provider';

export const dimensionFieldSchema = z.object({
  value: z.number().positive(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

export const fragilityFieldSchema = z.object({
  grade: z.enum(FRAGILITY_GRADES),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

export const specialHandlingFieldSchema = z.object({
  flags: z.array(z.enum(SPECIAL_HANDLING_FLAGS)).default([]),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

/**
 * lengthCm/widthCm/heightCm/weightKg are each optional -- a photo set that
 * gives no usable scale reference at all should surface an open question
 * ("need a photo next to something of known size") rather than force a
 * guess, same reasoning as condition-provider.ts's optional fields.
 */
export const dimensionsAssessmentResultSchema = z.object({
  lengthCm: dimensionFieldSchema.optional(),
  widthCm: dimensionFieldSchema.optional(),
  heightCm: dimensionFieldSchema.optional(),
  weightKg: dimensionFieldSchema.optional(),
  fragility: fragilityFieldSchema,
  specialHandling: specialHandlingFieldSchema.optional(),
  openQuestions: z.array(z.string().min(1)).default([]),
});

export type DimensionField = z.infer<typeof dimensionFieldSchema>;
export type FragilityField = z.infer<typeof fragilityFieldSchema>;
export type SpecialHandlingField = z.infer<typeof specialHandlingFieldSchema>;
export type DimensionsAssessmentResult = z.infer<typeof dimensionsAssessmentResultSchema>;

export interface DimensionsAssessmentUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface DimensionsAssessmentOutcome {
  result: DimensionsAssessmentResult;
  usage: DimensionsAssessmentUsage;
}

/** Whatever's already known about the item's identity, so the model can reason from real product knowledge instead of guessing from pixels alone -- all optional since identification may still be generic or uncertain. */
export interface IdentityContextForDimensions {
  manufacturer?: string;
  family?: string;
  model?: string;
  itemType?: string;
}

export interface DimensionsAssessmentProvider {
  /** e.g. 'anthropic' — recorded against every run, success or failure. */
  readonly provider: string;
  /** The exact model identifier this instance calls — recorded against every run, success or failure. */
  readonly model: string;
  assess(
    photos: PhotoForIdentification[],
    identity?: IdentityContextForDimensions,
  ): Promise<DimensionsAssessmentOutcome>;
}
