import { z } from 'zod';

export const SUPPORTED_VISION_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export type SupportedVisionMediaType =
  (typeof SUPPORTED_VISION_MEDIA_TYPES)[number];

export class UnsupportedPhotoFormatError extends Error {}

export interface PhotoForIdentification {
  mediaType: string;
  base64: string;
}

export const identificationCandidateSchema = z.object({
  itemType: z.string().min(1),
  manufacturer: z.string().min(1).optional(),
  family: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  modelNumbers: z.array(z.string().min(1)).optional(),
  colour: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
});

export const identificationResultSchema = z.object({
  candidates: z.array(identificationCandidateSchema).min(1),
  openQuestions: z.array(z.string().min(1)).default([]),
  /**
   * A distinct question from "is the leading candidate confident" -- a
   * generic-but-confident identification (e.g. 97% sure this is "a
   * wireless keyboard", no manufacturer or model) still can't drive a
   * useful eBay search: a search on item type alone surfaces unrelated
   * products, not genuine comparables. Required (not defaulted) so the
   * model always reasons about it explicitly rather than it being an
   * afterthought. See inspect-images-job.ts's needsInformation.
   */
  canSearchEbayConfidently: z.boolean(),
  /** Required when canSearchEbayConfidently is false -- what specific detail would resolve it, folded into identity.open_questions so it surfaces the same way any other open question does. */
  searchReadinessNote: z.string().min(1).optional(),
});

export type IdentificationCandidate = z.infer<
  typeof identificationCandidateSchema
>;
export type IdentificationResult = z.infer<typeof identificationResultSchema>;

export interface IdentificationUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface IdentificationOutcome {
  result: IdentificationResult;
  usage: IdentificationUsage;
}

export interface VisionIdentificationProvider {
  /** e.g. 'anthropic' — recorded against every run, success or failure. */
  readonly provider: string;
  /** The exact model identifier this instance calls — recorded against every run, success or failure. */
  readonly model: string;
  identify(photos: PhotoForIdentification[]): Promise<IdentificationOutcome>;
}
