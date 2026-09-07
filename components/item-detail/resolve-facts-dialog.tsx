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
  /** Absent for a free-standing open question with no single fact behind it. */
  field?: string;
  question: string;
  answer: string;
}

export interface OpenQuestionForDialog {
  source: 'identity' | 'condition';
  text: string;
}

interface Row {
  key: string;
  field?: string;
  question: string;
  meta: string;
}

export function ResolveFactsDialog({
  open,
  onOpenChange,
  facts,
  openQuestions,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Low-confidence facts -- each tied to one specific field. */
  facts: ItemDetailFact[];
  /** Free-standing open questions with no single fact behind them (identity.open_questions/condition.open_questions). */
  openQuestions: OpenQuestionForDialog[];
  onSubmit: (answers: FactAnswerSubmission[]) => void;
  submitting: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const rows = useMemo((): Row[] => [
    ...facts.map((fact): Row => ({
      key: `field:${fact.field}`,
      field: fact.field,
      question: questionForFact(fact),
      meta: `Currently recorded as "${formatFactValue(fact.value)}"${fact.evidence ? ` -- ${fact.evidence}` : ''} (${Math.round(fact.confidence * 100)}% confidence)`,
    })),
    ...openQuestions.map((oq, index): Row => ({
      key: `question:${index}`,
      field: undefined,
      question: oq.text,
      meta: oq.source === 'identity' ? 'Raised during identification.' : 'Raised during condition assessment.',
    })),
  ], [facts, openQuestions]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setAnswers({});
    onOpenChange(nextOpen);
  };

  const handleSubmit = () => {
    const submissions: FactAnswerSubmission[] = rows
      .map((row) => ({
        field: row.field,
        question: row.question,
        answer: (answers[row.key] ?? '').trim(),
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
            {rows.length} thing{rows.length === 1 ? '' : 's'} to confirm
          </DialogTitle>
          <DialogDescription>
            Answer in your own words -- your answers are sent together to turn into clean,
            confident facts. Leave anything you&rsquo;re not sure about blank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {rows.map((row) => {
            const enumField = row.field ? getEnumFactField(row.field) : undefined;
            return (
              <div key={row.key} className="space-y-2">
                <p className="text-sm font-medium">{row.question}</p>
                <p className="text-xs text-muted-foreground">{row.meta}</p>
                {enumField ? (
                  <RadioGroup
                    value={answers[row.key] ?? ''}
                    onValueChange={(value) =>
                      setAnswers((current) => ({ ...current, [row.key]: value ?? '' }))
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
                    value={answers[row.key] ?? ''}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [row.key]: event.target.value }))
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
