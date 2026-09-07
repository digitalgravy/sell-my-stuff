import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  answerResolutionResultSchema,
  type AnswerResolutionOutcome,
  type AnswerResolutionProvider,
  type FactAnswerInput,
} from './answer-resolution-provider';

const DEFAULT_MODEL = 'claude-sonnet-5';

export const ANSWER_RESOLUTION_SYSTEM_PROMPT = `You are turning a person's own plain-language answers to clarifying questions into clean, confident fact values for a resale catalogue. Each item below is one question that was raised, and the person's own answer -- some are about one specific fact that was too uncertain to record automatically (field/currentValue/evidence given), others are free-standing open questions with no single fact behind them at all (field/currentValue/evidence absent) -- e.g. "is this a special edition variant?" isn't any one existing field.

For every item:
- If it names a field: decide that fact's new value in the same style as its current value (a short phrase, not a full sentence) -- based on what the person actually said -- and a confidence, usually high (0.9-1) since this is direct testimony from the item's own owner, not an inference from a photo. Only give a lower confidence if the answer is itself vague, contradictory, or doesn't actually resolve the question -- in that case keep the value close to the current one rather than inventing detail the answer doesn't support.
- If it has no field: read the answer and decide what fact(s) it actually establishes, if any -- output each as its own entry in facts (using a clear, short new field name in the same dot-namespaced style as the fields you do see, e.g. "identity.variant" or "condition.accessories") with a confidence the same way as above. If the answer genuinely doesn't resolve the question (evasive, "not sure", doesn't address what was asked), don't invent a fact for it.
- Whether or not it produced a new fact, include the question's exact original text in resolvedQuestions if the person's answer actually addressed it -- leave it out if the answer didn't really resolve the question, so it can be asked again.

Never fabricate specifics (model numbers, exact wear descriptions) the person's answer didn't actually give you.`;

export class AnthropicAnswerResolutionProvider implements AnswerResolutionProvider {
  readonly provider = 'anthropic';
  readonly model: string;

  constructor(
    private readonly client: Anthropic,
    model: string = DEFAULT_MODEL,
  ) {
    this.model = model;
  }

  async resolve(answers: FactAnswerInput[]): Promise<AnswerResolutionOutcome> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: ANSWER_RESOLUTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            answers.map((answer, index) => ({
              index,
              field: answer.field,
              currentValue: answer.currentValue,
              evidence: answer.evidence,
              question: answer.question,
              answer: answer.answer,
            })),
            null,
            2,
          ),
        },
      ],
      output_config: {
        format: zodOutputFormat(answerResolutionResultSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error(
        'The answer-resolution provider response did not match the expected schema',
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

let sharedProvider: AnthropicAnswerResolutionProvider | undefined;

export function getAnthropicAnswerResolutionProvider(): AnthropicAnswerResolutionProvider {
  if (sharedProvider) return sharedProvider;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  sharedProvider = new AnthropicAnswerResolutionProvider(
    new Anthropic({ apiKey }),
    process.env.ANTHROPIC_ANSWER_RESOLUTION_MODEL ?? DEFAULT_MODEL,
  );
  return sharedProvider;
}
