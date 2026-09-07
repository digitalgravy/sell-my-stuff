'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { getEnumFactField } from '@/lib/fact-fields';
import type { ItemDetailFact } from '@/server/items/item-detail-repository';

import { formatFactValue, humanizeField } from './format';

/**
 * Better-than-generic phrasing for the fields most likely to be
 * low-confidence in practice -- falls back to a plain "Can you confirm..."
 * for anything else (including identity fields, which rarely land here
 * since they gate research at a much higher confidence bar than condition
 * does -- see inspect-images-job.ts).
 */
const QUESTION_TEMPLATE: Record<string, (fact: ItemDetailFact) => string> = {
  'condition.overall_grade': () => 'What condition would you actually say this item is in?',
  'condition.functional_status': () => 'Does the item actually work as expected?',
  'condition.cosmetic_wear': () => 'How would you describe its cosmetic condition -- any scuffs, scratches or marks?',
  'condition.missing_parts': () => 'Are all the original parts and accessories included, or is anything missing?',
  'condition.defects': () => 'Are there any defects or damage worth mentioning?',
};

function questionForFact(fact: ItemDetailFact): string {
  const template = QUESTION_TEMPLATE[fact.field];
  if (template) return template(fact);
  return `Can you confirm: ${humanizeField(fact.field).toLowerCase()}?`;
}

export interface FactAnswerSubmission {
  field: string;
  question: string;
  answer: string;
}

export function ResolveFactsDialog({
  open,
  onOpenChange,
  facts,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facts: ItemDetailFact[];
  onSubmit: (answers: FactAnswerSubmission[]) => void;
  submitting: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const questions = useMemo(
    () => facts.map((fact) => ({ fact, question: questionForFact(fact) })),
    [facts],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setAnswers({});
    onOpenChange(nextOpen);
  };

  const handleSubmit = () => {
    const submissions: FactAnswerSubmission[] = questions
      .map(({ fact, question }) => ({
        field: fact.field,
        question,
        answer: (answers[fact.field] ?? '').trim(),
      }))
      .filter((submission) => submission.answer.length > 0);
    if (submissions.length === 0) return;
    onSubmit(submissions);
  };

  const answeredCount = Object.values(answers).filter((value) => value.trim().length > 0).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {facts.length} thing{facts.length === 1 ? '' : 's'} to confirm
          </DialogTitle>
          <DialogDescription>
            Answer in your own words -- your answers are sent together to turn into clean,
            confident facts. Leave anything you&rsquo;re not sure about blank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {questions.map(({ fact, question }) => {
            const enumField = getEnumFactField(fact.field);
            return (
              <div key={fact.field} className="space-y-2">
                <p className="text-sm font-medium">{question}</p>
                <p className="text-xs text-muted-foreground">
                  Currently recorded as &ldquo;{formatFactValue(fact.value)}&rdquo;
                  {fact.evidence ? ` -- ${fact.evidence}` : ''} (
                  {Math.round(fact.confidence * 100)}% confidence)
                </p>
                {enumField ? (
                  <RadioGroup
                    value={answers[fact.field] ?? ''}
                    onValueChange={(value) =>
                      setAnswers((current) => ({ ...current, [fact.field]: value ?? '' }))
                    }
                  >
                    {enumField.options.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2.5 text-sm"
                      >
                        <RadioGroupItem value={option.value} />
                        {option.label}
                      </label>
                    ))}
                  </RadioGroup>
                ) : (
                  <Textarea
                    rows={2}
                    placeholder="Your answer"
                    value={answers[fact.field] ?? ''}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [fact.field]: event.target.value }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={answeredCount === 0 || submitting}>
            {submitting ? 'Submitting…' : `Submit ${answeredCount} answer${answeredCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
