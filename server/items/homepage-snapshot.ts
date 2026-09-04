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
