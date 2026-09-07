import type { HomepageItemFacts, HomepageItemRow } from './homepage-repository';

/**
 * What the item is actually doing right now, derived from real job state —
 * never asserted from the lifecycle status alone. "paused" is the honest
 * catch-all: mid-pipeline, not failed, but nothing is queued or running for
 * it (today: only RESEARCHING, since no research job exists yet — but this
 * derivation needs no update when that changes, or if anything else ever
 * stalls the same way).
 */
export type ActivityState = 'working' | 'waiting' | 'paused' | 'errored';

export interface AttentionItem {
  id: string;
  title: string;
  reason: string;
  updatedAt: string;
  /** Only present for FAILED items — NEEDS_INFORMATION is correctly blocked on the user, not "paused". */
  activity?: ActivityState;
}

export interface WorkingItem {
  id: string;
  title: string;
  stage: string;
  updatedAt: string;
  activity: ActivityState;
}

// Only statuses a worker can currently produce (see inspect-images-job.ts)
// get a real stage label; anything else falls back to its raw status so a
// future stage is visible, not silently dropped, until this map is extended.
//
// RESEARCHING now does have a real job behind it (research_comparable_sales
// builds the eBay search link), but that job is near-instant and its
// *result* routes straight to the `attention` list above once ready ("go
// search eBay") rather than staying here — this label only ever shows
// while genuinely nothing is queued/running/actionable for the item, e.g.
// between identification finishing and the research job being picked up,
// or after the eBay search has already been captured (hasEvidence true).
const WORKING_STAGE_LABEL: Partial<Record<HomepageItemRow['status'], string>> =
  {
    INBOX: 'Queued for identification',
    IDENTIFYING: 'Identifying',
    RESEARCHING: 'Identified — research not yet available',
  };

const NO_OPEN_QUESTION_REASON = 'Confidence too low to proceed automatically';
const GENERIC_FAILURE_REASON = 'Identification failed';
const MAX_ERROR_REASON_LENGTH = 160;

export interface HomepageStats {
  /** Evidence exists and nothing required is outstanding, but not yet live. */
  ready: number;
  /** Active (non-terminal) and not ready -- still has something outstanding. */
  inProgress: number;
  /** Status LIVE -- currently at auction/listed. */
  live: number;
  /** Status SOLD or COMPLETE. */
  cleared: number;
  /** Sum of a real recorded sale price -- always 0 today, shown regardless (unlike the counts above, never hidden at 0). */
  realisedTotal: number;
  /** Sum of the computed Buy-It-Now price across every active, not-yet-live item that has one -- shown regardless of value. */
  estimatedValueTotal: number;
}

export interface HomepageSnapshot {
  attention: AttentionItem[];
  working: WorkingItem[];
  stats: HomepageStats;
}

/**
 * Same "is this item ready" condition as deriveAttention's blocking checks
 * (item-detail-view-model.ts) -- duplicated rather than imported to avoid a
 * circular import between the two modules (that one already imports
 * summarizeError from here). Keep the two in sync by hand.
 */
function isReady(row: HomepageItemRow): boolean {
  if (!row.hasEvidence) return false;
  if (row.status === 'NEEDS_INFORMATION' || row.status === 'FAILED') return false;
  if (row.status === 'RESEARCHING') return row.hasEvidence;
  return true;
}

export function buildHomepageSnapshot(
  rows: HomepageItemRow[],
  outcomeCounts: {
    live: number;
    cleared: number;
    realisedTotal: number;
    estimatedValueTotal: number;
  } = { live: 0, cleared: 0, realisedTotal: 0, estimatedValueTotal: 0 },
): HomepageSnapshot {
  const attention: AttentionItem[] = [];
  const working: WorkingItem[] = [];
  let ready = 0;
  let inProgress = 0;

  for (const row of rows) {
    const title = displayTitle(row.facts);
    const updatedAt = row.updatedAt.toISOString();

    if (isReady(row)) {
      ready += 1;
    } else {
      inProgress += 1;
    }

    if (row.status === 'NEEDS_INFORMATION') {
      attention.push({
        id: row.id,
        title,
        reason: row.facts.openQuestions[0] ?? NO_OPEN_QUESTION_REASON,
        updatedAt,
      });
    } else if (row.status === 'RESEARCHING' && !row.hasEvidence) {
      attention.push({
        id: row.id,
        title,
        // Deliberately doesn't say "ready to search eBay yourself" -- a
        // search URL existing here just means a research attempt has run
        // at least once; the automated tiers (a real browser, tried
        // first) may still be actively fetching or classifying listings
        // for this exact item, not waiting on the user at all. See
        // item-detail-view-model.ts's derivePhases for the fuller,
        // per-item-accurate version of this same state.
        reason: row.facts.ebaySearchUrl
          ? 'Comparable-sales research in progress'
          : 'Comparable-sales research has not run yet',
        updatedAt,
      });
    } else if (row.status === 'FAILED') {
      attention.push({
        id: row.id,
        title,
        reason: summarizeError(row.lastError),
        updatedAt,
        activity: 'errored',
      });
    } else {
      working.push({
        id: row.id,
        title,
        // A RESEARCHING item only reaches this branch (not the attention
        // branch above) once it has evidence -- the static label would
        // otherwise still claim "research not yet available" for an item
        // that's actually ready.
        stage:
          row.status === 'RESEARCHING' && row.hasEvidence
            ? 'Researched — ready to list'
            : (WORKING_STAGE_LABEL[row.status] ?? row.status),
        updatedAt,
        activity: deriveActivityState(row),
      });
    }
  }

  return {
    attention,
    working,
    stats: {
      ready,
      inProgress,
      live: outcomeCounts.live,
      cleared: outcomeCounts.cleared,
      realisedTotal: outcomeCounts.realisedTotal,
      estimatedValueTotal: outcomeCounts.estimatedValueTotal,
    },
  };
}

export function deriveActivityState(row: {
  status: HomepageItemRow['status'];
  jobState?: HomepageItemRow['jobState'];
}): ActivityState {
  if (row.status === 'FAILED') return 'errored';
  if (row.jobState === 'RUNNING') return 'working';
  if (row.jobState === 'QUEUED') return 'waiting';
  return 'paused';
}

function displayTitle(facts: HomepageItemFacts): string {
  if (facts.manufacturer && facts.model)
    return `${facts.manufacturer} ${facts.model}`;
  if (facts.manufacturer && facts.itemType)
    return `${facts.manufacturer} ${facts.itemType}`;
  return facts.model ?? facts.itemType ?? 'Unidentified item';
}

/**
 * Turns a raw job error (often a provider SDK's "<status> <json body>"
 * string, e.g. Anthropic's `400 {"error":{"message":"..."}}`) into a short,
 * factual reason a non-technical reader can act on, rather than showing raw
 * JSON. Falls back to the raw text, then a generic label, if it can't parse.
 */
export function summarizeError(rawError: string | undefined): string {
  if (!rawError) return GENERIC_FAILURE_REASON;

  const jsonStart = rawError.indexOf('{');
  const message =
    jsonStart === -1 ? undefined : extractErrorMessage(rawError.slice(jsonStart));

  return truncate(`${GENERIC_FAILURE_REASON}: ${message ?? rawError}`);
}

function extractErrorMessage(jsonText: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
      const inner = (parsed as { error?: unknown }).error;
      if (inner !== null && typeof inner === 'object' && 'message' in inner) {
        const message = (inner as { message?: unknown }).message;
        if (typeof message === 'string') return message;
      }
    }
  } catch {
    // Not parseable JSON — the caller falls back to the raw error text.
  }
  return undefined;
}

function truncate(text: string): string {
  return text.length > MAX_ERROR_REASON_LENGTH
    ? `${text.slice(0, MAX_ERROR_REASON_LENGTH - 1)}…`
    : text;
}
