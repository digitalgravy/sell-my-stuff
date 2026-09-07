import { z } from 'zod';

/** One low-confidence fact plus the user's own plain-language answer to a question about it. */
export interface FactAnswerInput {
  field: string;
  currentValue: string;
  evidence?: string;
  question: string;
  answer: string;
}

export const resolvedFactSchema = z.object({
  field: z.string().min(1),
  value: z.string().min(1),
  /** Usually high (0.9+) -- this is direct testimony from the item's owner, not an inference from a photo. Lower only if the answer itself is vague or doesn't actually resolve the question. */
  confidence: z.number().min(0).max(1),
});

export const answerResolutionResultSchema = z.object({
  facts: z.array(resolvedFactSchema),
});

export type ResolvedFact = z.infer<typeof resolvedFactSchema>;
export type AnswerResolutionResult = z.infer<typeof answerResolutionResultSchema>;

export interface AnswerResolutionUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AnswerResolutionOutcome {
  result: AnswerResolutionResult;
  usage: AnswerResolutionUsage;
}

export interface AnswerResolutionProvider {
  readonly provider: string;
  readonly model: string;
  /** Every outstanding answer for an item goes in one call -- see anthropic-answer-resolution-provider.ts's system prompt. */
  resolve(answers: FactAnswerInput[]): Promise<AnswerResolutionOutcome>;
}
