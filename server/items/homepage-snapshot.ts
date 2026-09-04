import type { HomepageItemFacts, HomepageItemRow } from './homepage-repository';

export interface AttentionItem {
  id: string;
  title: string;
  reason: string;
  updatedAt: string;
}

export interface WorkingItem {
  id: string;
  title: string;
  stage: string;
  updatedAt: string;
}

export interface HomepageSnapshot {
  attention: AttentionItem[];
  working: WorkingItem[];
}

// Only statuses a worker can currently produce (see inspect-images-job.ts)
// get a real stage label; anything else falls back to its raw status so a
// future stage is visible, not silently dropped, until this map is extended.
const WORKING_STAGE_LABEL: Partial<Record<HomepageItemRow['status'], string>> =
  {
    INBOX: 'Queued for identification',
    IDENTIFYING: 'Identifying',
    RESEARCHING: 'Researching recent sales',
  };

const NO_OPEN_QUESTION_REASON = 'Confidence too low to proceed automatically';
const GENERIC_FAILURE_REASON = 'Identification failed';
const MAX_ERROR_REASON_LENGTH = 160;

export function buildHomepageSnapshot(
  rows: HomepageItemRow[],
): HomepageSnapshot {
  const attention: AttentionItem[] = [];
  const working: WorkingItem[] = [];

  for (const row of rows) {
    const title = displayTitle(row.facts);
    const updatedAt = row.updatedAt.toISOString();

    if (row.status === 'NEEDS_INFORMATION') {
      attention.push({
        id: row.id,
        title,
        reason: row.facts.openQuestions[0] ?? NO_OPEN_QUESTION_REASON,
        updatedAt,
      });
    } else if (row.status === 'FAILED') {
      attention.push({
        id: row.id,
        title,
        reason: summarizeError(row.lastError),
        updatedAt,
      });
    } else {
      working.push({
        id: row.id,
        title,
        stage: WORKING_STAGE_LABEL[row.status] ?? row.status,
        updatedAt,
      });
    }
  }

  return { attention, working };
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
