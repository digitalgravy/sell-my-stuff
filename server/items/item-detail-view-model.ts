import { SYSTEM_PROMPT } from '@/server/ai/anthropic-vision-provider';

import { summarizeError } from './homepage-snapshot';
import type { AttentionTask, BuildStep, PhaseInfo } from './item-detail-repository';
import type { ItemStatusValue } from './research-repository';

/**
 * Only "Identified" reflects something real today — the other three phases
 * have no backing job type yet (see PROJECT_STATUS.md). Honesty over
 * completeness: a phase is only "done" when its own evidence (identity
 * facts existing) says so, never inferred from the item's lifecycle status
 * alone, and the unbuilt phases always read "not_started" rather than
 * guessing at progress that doesn't exist.
 */
export function derivePhases(input: {
  status: ItemStatusValue;
  hasIdentityFacts: boolean;
}): PhaseInfo[] {
  const identifiedState = input.hasIdentityFacts
    ? 'done'
    : input.status === 'IDENTIFYING'
      ? 'pending'
      : 'not_started';

  return [
    {
      key: 'identified',
      label: 'Identified',
      detail: input.hasIdentityFacts ? 'Facts recorded' : 'Not yet identified',
      state: identifiedState,
    },
    {
      key: 'assessed',
      label: 'Assessed',
      detail: 'Condition assessment not built yet',
      state: 'not_started',
    },
    {
      key: 'researched',
      label: 'Researched',
      detail: 'Comparable-sales research not built yet',
      state: 'not_started',
    },
    {
      key: 'draft_ready',
      label: 'Draft ready',
      detail: 'Listing drafting not built yet',
      state: 'not_started',
    },
  ];
}

/**
 * Real attention tasks are always "required" today — nothing in the current
 * backend distinguishes a blocking question from a nice-to-have one (see
 * PROJECT_STATUS.md's item-detail-page follow-up). This mirrors
 * homepage-snapshot.ts's NEEDS_INFORMATION/FAILED handling exactly, reshaped
 * as actionable tasks instead of a single summary line.
 */
export function deriveAttention(input: {
  status: ItemStatusValue;
  openQuestions: string[];
  lastError?: string;
  ebaySearchUrl?: string;
  hasEvidence: boolean;
}): AttentionTask[] {
  if (input.status === 'RESEARCHING' && input.ebaySearchUrl && !input.hasEvidence) {
    return [
      {
        id: 'research-ebay',
        title: 'Find comparable sold listings on eBay',
        note: 'There is no automated eBay search -- eBay blocks automated browsers, so this opens a pre-filtered Sold + Completed search for you to capture with the bookmarklet.',
        impact: 'Why it matters: pricing needs real comparable sales before a listing can be drafted.',
        ctaLabel: 'Search eBay',
        href: input.ebaySearchUrl,
        required: true,
      },
    ];
  }

  if (input.status === 'NEEDS_INFORMATION') {
    if (input.openQuestions.length > 0) {
      return input.openQuestions.map((question, index) => ({
        id: `open-question-${index}`,
        title: question,
        note: 'Raised during identification.',
        impact:
          'Why it blocks: research does not start automatically until this is answered.',
        ctaLabel: 'Add evidence',
        required: true,
      }));
    }
    return [
      {
        id: 'low-confidence',
        title: 'Confidence too low to proceed automatically',
        note: 'The identification result was not confident enough to continue unattended.',
        impact:
          'Why it blocks: automatic research only starts once identification clears the confidence threshold.',
        ctaLabel: 'Review facts',
        required: true,
      },
    ];
  }

  if (input.status === 'FAILED') {
    return [
      {
        id: 'failed',
        title: 'Identification failed',
        note: summarizeError(input.lastError).replace(/^Identification failed:\s*/, ''),
        impact: 'Why it blocks: the last attempt did not complete.',
        ctaLabel: 'Retry',
        required: true,
      },
    ];
  }

  return [];
}

export interface RunForBuildStep {
  id: string;
  attempt: number;
  provider: string;
  model: string;
  outcome: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Every real identification_runs row becomes exactly one build step —
 * there is only one stage today (see PROJECT_STATUS.md's technical debt:
 * no second job type exists yet). The system prompt shown is the real,
 * exported SYSTEM_PROMPT constant the run actually used, not a paraphrase.
 */
export function buildStepsFromRuns(
  runs: RunForBuildStep[],
  photoCount: number,
): BuildStep[] {
  return runs.map((run) => {
    const candidateCount = countCandidates(run.response);
    return {
      id: run.id,
      stage: 'Identify item',
      detail:
        run.outcome === 'succeeded'
          ? `Vision model turn · attempt ${run.attempt} · ${candidateCount} candidate${candidateCount === 1 ? '' : 's'}`
          : `Vision model turn · attempt ${run.attempt} · failed`,
      type: 'llm',
      outcome: run.outcome,
      durationMs: Math.max(
        0,
        new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
      ),
      blocks: [
        {
          label: 'System prompt',
          meta: `${run.provider} · ${run.model}`,
          content: SYSTEM_PROMPT,
        },
        {
          label: 'User turn',
          meta: `${photoCount} photo${photoCount === 1 ? '' : 's'}`,
          content: 'Identify the item shown in these photographs.',
        },
        run.outcome === 'succeeded'
          ? {
              label: 'Assistant response',
              meta: `${run.inputTokens ?? 0} input · ${run.outputTokens ?? 0} output tokens`,
              content: JSON.stringify(run.response, null, 2),
            }
          : {
              label: 'Error',
              content: run.errorMessage ?? 'Unknown error',
            },
      ],
    };
  });
}

export interface ImportForBuildStep {
  captureId: string;
  sourceUrl: string | null;
  pageTitle: string | null;
  importedCount: number;
  importedAt: string;
}

/**
 * One build step per comparable-sales import onto this item. Undoable
 * (the `undo` field), unlike identification runs -- importing is a single
 * reversible write (delete the rows it added, re-open the capture), while
 * a vision-model turn has nothing sensible to revert.
 */
export function buildStepsFromImports(imports: ImportForBuildStep[]): BuildStep[] {
  return imports.map((imp) => ({
    id: `import:${imp.captureId}`,
    stage: 'Import comparable sales',
    detail: `Imported ${imp.importedCount} comparable sale${imp.importedCount === 1 ? '' : 's'} from a captured eBay page`,
    type: 'tool',
    outcome: 'succeeded',
    durationMs: 0,
    blocks: [
      {
        label: imp.pageTitle ?? 'Captured eBay page',
        meta: imp.sourceUrl ?? undefined,
        content: imp.sourceUrl ?? 'No source URL was recorded for this capture.',
      },
    ],
    undo: { endpoint: `research/captures/${imp.captureId}/import` },
  }));
}

export interface CorrectionForBuildStep {
  id: string;
  field: string;
  previousValue: string | null;
  newValue: string;
  correctedAt: string;
}

/**
 * One build step per active (not-yet-undone) fact correction -- a human
 * override recorded the same way an import is, and reversible the same
 * way: undo restores the exact previous value rather than guessing.
 */
export function buildStepsFromCorrections(corrections: CorrectionForBuildStep[]): BuildStep[] {
  return corrections.map((correction) => ({
    id: `correction:${correction.id}`,
    stage: 'Correct a fact',
    detail: `Corrected ${correction.field}`,
    type: 'policy',
    outcome: 'succeeded',
    durationMs: 0,
    blocks: [
      {
        label: correction.field,
        content: `${correction.previousValue ?? '(no prior value)'} → ${correction.newValue}`,
      },
    ],
    undo: { endpoint: `facts/correct/${correction.id}` },
  }));
}

export interface ResearchJobForBuildStep {
  id: string;
  state: string;
  lastError: string | null;
  searchUrl?: string;
}

/**
 * One build step per terminal research_comparable_sales attempt -- QUEUED
 * and RUNNING are deliberately invisible here, matching identification
 * runs: a row only becomes a step once there's something to report.
 */
export function buildStepsFromResearchJobs(jobsForStep: ResearchJobForBuildStep[]): BuildStep[] {
  return jobsForStep
    .filter((job) => job.state === 'SUCCEEDED' || job.state === 'FAILED')
    .map((job) => ({
      id: `research:${job.id}`,
      stage: 'Prepare eBay search',
      detail:
        job.state === 'SUCCEEDED'
          ? 'Built a pre-filtered eBay Sold + Completed search link from the identified facts'
          : 'Could not build a search link',
      type: 'compute',
      outcome: job.state === 'SUCCEEDED' ? 'succeeded' : 'failed',
      durationMs: 0,
      blocks:
        job.state === 'SUCCEEDED' && job.searchUrl
          ? [{ label: 'eBay search', content: job.searchUrl }]
          : [{ label: 'Error', content: job.lastError ?? 'Unknown error' }],
    }));
}

function countCandidates(response: unknown): number {
  if (
    response !== null &&
    typeof response === 'object' &&
    'candidates' in response &&
    Array.isArray((response as { candidates: unknown }).candidates)
  ) {
    return (response as { candidates: unknown[] }).candidates.length;
  }
  return 0;
}
