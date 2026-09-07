import { z } from 'zod';

import type { PhotoForIdentification } from './vision-provider';

/**
 * BRIEF.md's "Condition model" grade ladder (new/sealed through
 * spares/repair) -- the headline value shown to the user, backed by its own
 * confidence/evidence like every other field here rather than asserted
 * outright.
 */
export const CONDITION_GRADES = [
  'new_sealed',
  'unused_open_box',
  'excellent',
  'very_good',
  'good',
  'fair',
  'spares_repair',
] as const;

export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const conditionFieldSchema = z.object({
  value: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

export const conditionGradeFieldSchema = z.object({
  grade: z.enum(CONDITION_GRADES),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

/**
 * functionalStatus/cosmeticWear/defects/missingParts are each optional, not
 * a fixed per-category checklist (a HomePod has no screen, a keyboard has no
 * battery) -- the model reports whatever is visible and evidenced from the
 * photos, per BRIEF.md's "material-specific damage" framing (scuffs on a
 * plastic shell vs. tears in a fabric mesh grille go in the same
 * cosmeticWear field, described in its own evidence text).
 */
export const conditionAssessmentResultSchema = z.object({
  overallGrade: conditionGradeFieldSchema,
  functionalStatus: conditionFieldSchema.optional(),
  cosmeticWear: conditionFieldSchema.optional(),
  defects: conditionFieldSchema.optional(),
  missingParts: conditionFieldSchema.optional(),
  openQuestions: z.array(z.string().min(1)).default([]),
});

export type ConditionField = z.infer<typeof conditionFieldSchema>;
export type ConditionGradeField = z.infer<typeof conditionGradeFieldSchema>;
export type ConditionAssessmentResult = z.infer<typeof conditionAssessmentResultSchema>;

export interface ConditionAssessmentUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ConditionAssessmentOutcome {
  result: ConditionAssessmentResult;
  usage: ConditionAssessmentUsage;
}

export interface ConditionAssessmentProvider {
  /** e.g. 'anthropic' — recorded against every run, success or failure. */
  readonly provider: string;
  /** The exact model identifier this instance calls — recorded against every run, success or failure. */
  readonly model: string;
  assess(photos: PhotoForIdentification[]): Promise<ConditionAssessmentOutcome>;
}
