import { z } from 'zod';

/**
 * Either a specific low-confidence fact plus the user's answer to a
 * question about it (field/currentValue/evidence all present), or a
 * free-standing open question with no single fact behind it at all (e.g.
 * "is this a special edition variant?" isn't any one existing field) --
 * field/currentValue/evidence are all absent in that case, and the model's
 * job is to figure out which fact(s), if any, the answer actually touches.
 */
export interface FactAnswerInput {
  field?: string;
  currentValue?: string;
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
  /** May include fields that weren't part of the input at all -- an open question's answer can reveal a fact (e.g. a variant name) nothing had asked about directly. */
  facts: z.array(resolvedFactSchema),
  /**
   * The exact `question` text (verbatim, from the input) of every
   * free-standing open question this batch actually resolved -- removed
   * from item_facts' open_questions list so it stops being asked again.
   * A question left out here (answer was vague, didn't actually address
   * it) stays on the list.
   */
  resolvedQuestions: z.array(z.string().min(1)).default([]),
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
