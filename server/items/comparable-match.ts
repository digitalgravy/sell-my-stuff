import type {
  ComparableMatchProvider,
  IdentityFactsForMatching,
} from '@/server/ai/comparable-match-provider';

import type { ComparableSale } from './item-detail-repository';

/**
 * Import-time match classification -- per BRIEF.md's "LLMs interpret
 * evidence; deterministic code performs the maths", this is the one place
 * an LLM judges whether a scraped listing is actually the same real-world
 * item, before anything downstream (fair value, the valuation engine)
 * treats it as evidence. A listing the classifier excludes keeps its
 * reason, shown in the UI; a listing it doesn't recognise (a schema
 * mismatch) passes through untouched rather than being silently dropped.
 */
export async function classifyComparableSales(
  identity: IdentityFactsForMatching,
  sales: ComparableSale[],
  provider: ComparableMatchProvider,
): Promise<ComparableSale[]> {
  if (sales.length === 0) return sales;

  const { result } = await provider.classify(
    identity,
    sales.map((sale) => ({ title: sale.title, match: sale.match })),
  );

  return sales.map((sale, index) => {
    const verdict = result.listings.find((listing) => listing.index === index);
    if (!verdict || verdict.isMatch) return sale;
    return { ...sale, excluded: true, excludedReason: verdict.reason };
  });
}

function readFactString(facts: { field: string; value: string }[], field: string): string | undefined {
  const raw = facts.find((fact) => fact.field === field)?.value;
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readFactStringArray(
  facts: { field: string; value: string }[],
  field: string,
): string[] | undefined {
  const raw = facts.find((fact) => fact.field === field)?.value;
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : undefined;
  } catch {
    return undefined;
  }
}

export function buildIdentityFactsForMatching(
  facts: { field: string; value: string }[],
): IdentityFactsForMatching {
  return {
    itemType: readFactString(facts, 'identity.item_type'),
    manufacturer: readFactString(facts, 'identity.manufacturer'),
    family: readFactString(facts, 'identity.family'),
    model: readFactString(facts, 'identity.model'),
    modelNumbers: readFactStringArray(facts, 'identity.model_numbers'),
    colour: readFactString(facts, 'identity.colour'),
  };
}
