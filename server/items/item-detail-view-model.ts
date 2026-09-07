import { MATCH_SYSTEM_PROMPT } from '@/server/ai/anthropic-comparable-match-provider';
import { SYSTEM_PROMPT } from '@/server/ai/anthropic-vision-provider';
import { estimateCostUsd } from '@/server/ai/pricing';

import { summarizeError } from './homepage-snapshot';
import type { AttentionTask, BuildStep, PhaseInfo } from './item-detail-repository';
import type { ItemStatusValue } from './research-repository';

/**
 * "Identified" and "Researched" reflect something real; "Assessed" and
 * "Draft ready" still have no backing job type (see PROJECT_STATUS.md).
 * Honesty over completeness: a phase is only "done" when its own evidence
 * (identity facts existing, comparable sales imported) says so, never
 * inferred from the item's lifecycle status alone, and the unbuilt phases
 * always read "not_started" rather than guessing at progress that doesn't
 * exist.
 */
export function derivePhases(input: {
  status: ItemStatusValue;
  hasIdentityFacts: boolean;
  hasEvidence: boolean;
}): PhaseInfo[] {
  const identifiedState = input.hasIdentityFacts
    ? 'done'
    : input.status === 'IDENTIFYING'
      ? 'pending'
      : 'not_started';

  const researchedState = input.hasEvidence
    ? 'done'
    : input.status === 'RESEARCHING'
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
      detail: input.hasEvidence
        ? 'Comparable sales imported'
        : researchedState === 'pending'
          ? 'Ready to search eBay'
          : 'Not yet researched',
      state: researchedState,
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
  if (input.status === 'RESEARCHING' && !input.hasEvidence) {
    if (input.ebaySearchUrl) {
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
    // No search link has ever been generated for this item -- either the
    // research job hasn't been picked up yet, or (real case: items
    // identified before this job type existed) it was never queued at
    // all. Same fix either way: (re)run it.
    return [
      {
        id: 'research-not-started',
        title: 'Comparable-sales research has not run yet',
        note: 'Once run, this prepares a pre-filtered eBay search link for you to capture yourself -- eBay blocks automated browsers, so there is no way to skip that step.',
        impact: 'Why it matters: pricing needs real comparable sales before a listing can be drafted.',
        ctaLabel: 'Prepare eBay search',
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
  /** Absent (pending) between the row being written and a response coming back. */
  outcome?: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  response?: unknown;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

function costMeta(model: string, inputTokens?: number, outputTokens?: number): string {
  const tokenPart = `${inputTokens ?? 0} input · ${outputTokens ?? 0} output tokens`;
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens);
  return costUsd === undefined ? tokenPart : `${tokenPart} · ~$${costUsd.toFixed(3)}`;
}

/**
 * Every real identification_runs row becomes exactly one build step —
 * there is only one stage today (see PROJECT_STATUS.md's technical debt:
 * no second job type exists yet). The system prompt shown is the real,
 * exported SYSTEM_PROMPT constant the run actually used, not a paraphrase.
 * A row with no outcome yet is a real in-flight request, shown as pending
 * rather than waiting silently for it to resolve.
 */
export function buildStepsFromRuns(
  runs: RunForBuildStep[],
  photoCount: number,
): BuildStep[] {
  return runs.map((run) => {
    const candidateCount = countCandidates(run.response);
    const detail =
      run.outcome === 'succeeded'
        ? `Vision model turn · attempt ${run.attempt} · ${candidateCount} candidate${candidateCount === 1 ? '' : 's'}`
        : run.outcome === 'failed'
          ? `Vision model turn · attempt ${run.attempt} · failed`
          : `Vision model turn · attempt ${run.attempt} · submitted, waiting for a response`;
    return {
      id: run.id,
      stage: 'Identify item',
      detail,
      type: 'llm',
      outcome: run.outcome ?? 'pending',
      durationMs:
        run.outcome === undefined || !run.completedAt
          ? 0
          : Math.max(
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
        ...(run.outcome === 'succeeded'
          ? [
              {
                label: 'Assistant response',
                meta: costMeta(run.model, run.inputTokens, run.outputTokens),
                content: JSON.stringify(run.response, null, 2),
              },
            ]
          : run.outcome === 'failed'
            ? [{ label: 'Error', content: run.errorMessage ?? 'Unknown error' }]
            : [{ label: 'Waiting', content: 'No response from Anthropic yet.' }]),
      ],
    };
  });
}

export interface MatchRunForBuildStep {
  id: string;
  provider: string;
  model: string;
  listingCount: number;
  outcome?: 'succeeded' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

/**
 * Every real match_classification_runs row becomes exactly one build step,
 * the same pending/resolved shape as buildStepsFromRuns -- one call judges
 * every imported listing at once (see server/items/comparable-match.ts),
 * so one row is one build step regardless of how many listings it covered.
 */
export function buildStepsFromMatchRuns(runs: MatchRunForBuildStep[]): BuildStep[] {
  return runs.map((run) => {
    const detail =
      run.outcome === 'succeeded'
        ? `Match classification · ${run.listingCount} listing${run.listingCount === 1 ? '' : 's'} checked`
        : run.outcome === 'failed'
          ? `Match classification · ${run.listingCount} listing${run.listingCount === 1 ? '' : 's'} · failed`
          : `Match classification · ${run.listingCount} listing${run.listingCount === 1 ? '' : 's'} · submitted, waiting for a response`;
    return {
      id: run.id,
      stage: 'Check evidence matches',
      detail,
      type: 'llm',
      outcome: run.outcome ?? 'pending',
      durationMs:
        run.outcome === undefined || !run.completedAt
          ? 0
          : Math.max(
              0,
              new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
            ),
      blocks: [
        {
          label: 'System prompt',
          meta: `${run.provider} · ${run.model}`,
          content: MATCH_SYSTEM_PROMPT,
        },
        ...(run.outcome === 'succeeded'
          ? [
              {
                label: 'Assistant response',
                meta: costMeta(run.model, run.inputTokens, run.outputTokens),
                content: `Classified ${run.listingCount} listing${run.listingCount === 1 ? '' : 's'}.`,
              },
            ]
          : run.outcome === 'failed'
            ? [{ label: 'Error', content: run.errorMessage ?? 'Unknown error' }]
            : [{ label: 'Waiting', content: 'No response from Anthropic yet.' }]),
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
