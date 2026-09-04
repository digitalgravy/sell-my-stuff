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
});

export type IdentificationCandidate = z.infer<
  typeof identificationCandidateSchema
>;
export type IdentificationResult = z.infer<typeof identificationResultSchema>;

export interface VisionIdentificationProvider {
  identify(photos: PhotoForIdentification[]): Promise<IdentificationResult>;
}
