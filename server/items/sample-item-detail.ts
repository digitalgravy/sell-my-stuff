import type { BuildStep, ItemDetail } from './item-detail-repository';

/**
 * Fully-populated fake data for /items/sample — the only place in the app
 * allowed to show pricing, a listing, comparable-sales evidence or a
 * completed pipeline, none of which the real pipeline produces yet. Every
 * other route must show an honest "not built yet" state instead of this.
 */
export const SAMPLE_ITEM_ID = 'sample';

export interface SamplePhotoStyle {
  label: string;
  background: string;
  foreground: string;
}

export const SAMPLE_PHOTOS: Record<string, SamplePhotoStyle> = {
  'photo-1': { label: 'Front', background: '#1c2530', foreground: '#e7ecf3' },
  'photo-2': { label: 'Back', background: '#232f24', foreground: '#e6f0e7' },
  'photo-3': {
    label: 'Cushion wear detail',
    background: '#332720',
    foreground: '#f3e9e1',
  },
  'photo-4': { label: 'In case', background: '#231f33', foreground: '#eae6f5' },
};

const BUILD_STEPS: BuildStep[] = [
  {
    id: 'step-1',
    stage: 'Identify item',
    detail: 'Vision model turn · attempt 1 · 2 candidates',
    type: 'llm',
    outcome: 'succeeded',
    durationMs: 4200,
    blocks: [
      {
        label: 'System prompt',
        meta: 'anthropic · claude-sonnet-5',
        content:
          'You are a careful product-identification assistant for a personal decluttering tool. Look at the supplied photographs of a single physical item and identify it.\n\nFor each plausible identity, report:\n- itemType, manufacturer, family, model, modelNumbers, colour\n- confidence: 0 to 1, calibrated\n- evidence: what in the photos supports this\n\nList candidates most-likely first. Only include an unresolved price-sensitive detail in openQuestions if it cannot be determined from the photos.',
      },
      {
        label: 'User turn',
        meta: '4 photos',
        content: 'Identify the item shown in these photographs.',
      },
      {
        label: 'Assistant response',
        meta: '1,340 input · 210 output tokens',
        content: JSON.stringify(
          {
            candidates: [
              {
                itemType: 'wireless noise-cancelling headphones',
                manufacturer: 'Sony',
                model: 'WH-1000XM4',
                modelNumbers: ['WH-1000XM4/B'],
                colour: 'Black',
                confidence: 0.81,
                evidence: 'Sony logo and model number visible on the headband hinge',
              },
              {
                itemType: 'wireless noise-cancelling headphones',
                manufacturer: 'Sony',
                model: 'WH-1000XM3',
                confidence: 0.14,
                evidence: 'Similar earcup shape, but XM4 has a flatter fold hinge',
              },
            ],
            openQuestions: [],
          },
          null,
          2,
        ),
      },
    ],
  },
  {
    id: 'step-2',
    stage: 'Assess condition',
    detail: 'Vision model turn · condition pass · succeeded',
    type: 'llm',
    outcome: 'succeeded',
    durationMs: 3600,
    blocks: [
      {
        label: 'System prompt',
        meta: 'anthropic · claude-sonnet-5',
        content:
          'You are assessing the cosmetic and functional condition of a used item from photographs for resale. Note visible wear, damage, missing accessories, and anything a buyer would want disclosed. Do not guess at functionality you cannot see evidence of.',
      },
      {
        label: 'User turn',
        meta: '4 photos',
        content: 'Assess the condition of this item for resale.',
      },
      {
        label: 'Assistant response',
        meta: '1,120 input · 165 output tokens',
        content: JSON.stringify(
          {
            wear: 'Light wear on headband padding, ear cushions show minor pilling',
            functionality: 'Power indicator lit in photo; no way to confirm audio output from images alone',
            completeness: 'Charging cable and soft case present; retail box not visible',
            confidence: 0.74,
          },
          null,
          2,
        ),
      },
    ],
  },
  {
    id: 'step-3',
    stage: 'Research comparable sales',
    detail: 'eBay sold-listings search · 14 results',
    type: 'tool',
    outcome: 'succeeded',
    durationMs: 2100,
    blocks: [
      {
        label: 'Tool call',
        meta: 'ebay.findCompletedItems',
        content: JSON.stringify(
          {
            query: 'Sony WH-1000XM4 black',
            filters: { soldWithinDays: 90, condition: 'used' },
          },
          null,
          2,
        ),
      },
      {
        label: 'Tool result',
        meta: '14 sold listings',
        content: JSON.stringify(
          { count: 14, excludedForVariantMismatch: 2, priceRange: [118, 162] },
          null,
          2,
        ),
      },
    ],
  },
  {
    id: 'step-4',
    stage: 'Aggregate pricing',
    detail: 'Statistics over 12 matched comparables',
    type: 'compute',
    outcome: 'succeeded',
    durationMs: 340,
    blocks: [
      {
        label: 'Input',
        meta: '12 comparable sales + condition assessment',
        content: 'median=$142, p25=$128, p75=$151; condition adjustment: -6% (light wear, no box)',
      },
      {
        label: 'Result',
        meta: 'pricing advice',
        content: JSON.stringify(
          {
            buyItNowPrice: 149,
            acceptOffersRange: '$120–$145',
            autoDeclineBelow: 108,
          },
          null,
          2,
        ),
      },
    ],
  },
  {
    id: 'step-5',
    stage: 'Draft listing copy',
    detail: 'Vision + facts turn · listing draft',
    type: 'llm',
    outcome: 'succeeded',
    durationMs: 5100,
    blocks: [
      {
        label: 'System prompt',
        meta: 'anthropic · claude-sonnet-5',
        content:
          'Write an accurate, honest eBay listing title and description from the identified facts, condition assessment and photos. Never claim functionality or completeness that was not confirmed.',
      },
      {
        label: 'User turn',
        meta: 'facts + condition + 4 photos',
        content: 'Draft a listing for this item.',
      },
      {
        label: 'Assistant response',
        meta: '980 input · 240 output tokens',
        content:
          'Title: Sony WH-1000XM4 Wireless Noise Cancelling Headphones - Black\n\nUsed Sony WH-1000XM4 in black. Light wear on the headband padding and ear cushions (see photos). Powers on; noise cancelling and Bluetooth pairing confirmed working in testing. Includes charging cable and soft carry case — retail box not included.',
      },
    ],
  },
  {
    id: 'step-6',
    stage: 'Publishing checks',
    detail: '4 rules evaluated · 2 need your input',
    type: 'policy',
    outcome: 'succeeded',
    durationMs: 90,
    blocks: [
      {
        label: 'Rule set',
        meta: 'listing-readiness v3',
        content:
          'title_length <= 80, min_photos >= 4, condition_confirmed_by_user, shipping_weight_estimated',
      },
      {
        label: 'Result',
        meta: '2 passed automatically, 2 need you',
        content: JSON.stringify(
          {
            title_length: 'pass',
            min_photos: 'pass',
            condition_confirmed_by_user: 'needs_input',
            shipping_weight_estimated: 'needs_input',
          },
          null,
          2,
        ),
      },
    ],
  },
];

export function buildSampleItemDetail(): ItemDetail {
  return {
    id: SAMPLE_ITEM_ID,
    status: 'READY_FOR_REVIEW',
    activity: 'waiting',
    createdAt: '2026-09-02T14:20:00.000Z',
    updatedAt: '2026-09-04T09:15:00.000Z',
    photos: Object.keys(SAMPLE_PHOTOS).map((id, index) => ({
      id,
      url: `/api/items/sample/photos/${id}`,
      label: SAMPLE_PHOTOS[id]!.label,
      position: index,
    })),
    facts: [
      {
        field: 'identity.item_type',
        value: 'wireless noise-cancelling headphones',
        confidence: 0.81,
        origin: 'image_inference',
        evidence: 'Sony logo and model number visible on the headband hinge',
        retrievedAt: '2026-09-02T14:22:00.000Z',
      },
      {
        field: 'identity.manufacturer',
        value: 'Sony',
        confidence: 0.81,
        origin: 'image_inference',
        evidence: 'Sony logo visible on the earcup',
        retrievedAt: '2026-09-02T14:22:00.000Z',
      },
      {
        field: 'identity.model',
        value: 'WH-1000XM4',
        confidence: 0.81,
        origin: 'image_inference',
        evidence: 'Model number printed inside the headband hinge',
        retrievedAt: '2026-09-02T14:22:00.000Z',
      },
      {
        field: 'identity.colour',
        value: 'Black',
        confidence: 0.68,
        origin: 'image_inference',
        evidence: 'Consistent dark finish across all photos, but lighting makes this uncertain',
        retrievedAt: '2026-09-02T14:22:00.000Z',
      },
      {
        field: 'condition.wear',
        value: 'Light wear on headband padding, ear cushions show minor pilling',
        confidence: 0.74,
        origin: 'image_inference',
        evidence: 'Visible in the cushion close-up photo',
        retrievedAt: '2026-09-02T14:24:00.000Z',
      },
      {
        field: 'condition.functionality',
        value: 'Powers on; noise cancelling and Bluetooth pairing confirmed working',
        confidence: 0.9,
        origin: 'user_evidence',
        evidence: 'Confirmed by you during intake',
        retrievedAt: '2026-09-02T15:05:00.000Z',
      },
      {
        field: 'condition.completeness',
        value: 'Charging cable and soft case included; retail box not included',
        confidence: 0.85,
        origin: 'image_inference',
        evidence: 'No box visible in any of the 4 photos',
        retrievedAt: '2026-09-02T14:24:00.000Z',
      },
    ],
    phases: [
      { key: 'identified', label: 'Identified', detail: 'Facts recorded', state: 'done' },
      {
        key: 'assessed',
        label: 'Assessed',
        detail: 'Condition recorded from photos + your confirmation',
        state: 'done',
      },
      {
        key: 'researched',
        label: 'Researched',
        detail: '12 comparable sales found',
        state: 'done',
      },
      {
        key: 'draft_ready',
        label: 'Draft ready',
        detail: 'Listing drafted, waiting on your review',
        state: 'pending',
      },
    ],
    attention: [
      {
        id: 'confirm-colour',
        field: 'identity.colour',
        title: 'Confirm the exact colour variant',
        note: 'Vision model identified black at 68% confidence — the photo lighting makes it hard to rule out midnight blue.',
        impact: 'Why it blocks: colour affects which comparable sold listings count as a match.',
        ctaLabel: 'Correct',
        required: true,
      },
      {
        id: 'confirm-condition',
        field: 'condition.functionality',
        title: 'Confirm the condition description before publishing',
        note: 'The listing draft uses this wording verbatim — review it reflects what you actually tested.',
        impact: 'Why it blocks: publishing checks require condition to be confirmed by you, not just inferred.',
        ctaLabel: 'Correct',
        required: true,
      },
      {
        id: 'add-angle-photo',
        title: 'Add a close-up of the ear cushion wear',
        note: 'Would sharpen the condition grade used for pricing.',
        impact: 'Nice to have: may raise or lower the price by a few dollars, not blocking.',
        ctaLabel: 'Add photo',
        required: false,
      },
    ],
    pricing: {
      buyItNowPrice: 149,
      basis:
        'Based on 12 comparable sold listings on eBay in the last 90 days, adjusted -6% for light cosmetic wear and the missing retail box.',
      acceptOffersRange: '$120–$145',
      autoDeclineBelow: 108,
    },
    listing: {
      title: 'Sony WH-1000XM4 Wireless Noise Cancelling Headphones - Black',
      description:
        'Used Sony WH-1000XM4 in black. Light wear on the headband padding and ear cushions (see photos). Powers on; noise cancelling and Bluetooth pairing confirmed working in testing. Includes charging cable and soft carry case — retail box not included.',
      marketplace: 'eBay',
      strategyOptions: [
        {
          name: 'Buy It Now',
          recommended: true,
          value: '$149',
          detail: 'Typically sells within 4–6 days at this price based on comparable listings.',
        },
        {
          name: '7-day auction',
          recommended: false,
          value: 'Start at $99, reserve $120',
          detail: 'More total views, but roughly a 30% chance of settling below the auto-decline threshold.',
        },
      ],
      checks: [
        { label: 'Title within 80 characters', state: 'yes' },
        { label: 'At least 4 photos attached', state: 'yes' },
        { label: 'Condition description confirmed by you', state: 'required' },
        { label: 'Shipping weight & dimensions estimated', state: 'optional' },
      ],
    },
    evidence: {
      sales: [
        { title: 'Sony WH-1000XM4 Black - Used, Good', match: 'Same model & colour', soldAt: '2026-08-29', price: 151 },
        { title: 'Sony WH-1000XM4 Black, minor wear', match: 'Same model & colour', soldAt: '2026-08-24', price: 144 },
        { title: 'Sony WH-1000XM4 (Black) w/ case', match: 'Same model & colour', soldAt: '2026-08-19', price: 149 },
        { title: 'Sony WH-1000XM4 Black - No box', match: 'Same model & colour, no box', soldAt: '2026-08-12', price: 138 },
        {
          title: 'Sony WH-1000XM3 Black - Used',
          match: 'Earlier model — excluded',
          soldAt: '2026-08-10',
          price: 98,
          excluded: true,
        },
        { title: 'Sony WH-1000XM4 Silver, light use', match: 'Same model, different colour', soldAt: '2026-08-03', price: 141 },
        {
          title: 'Sony WH-1000XM5 Black',
          match: 'Later model — excluded',
          soldAt: '2026-07-28',
          price: 210,
          excluded: true,
        },
        { title: 'Sony WH-1000XM4 Black, cushion wear', match: 'Same model & colour', soldAt: '2026-07-22', price: 132 },
      ],
      fairValue: 142,
      note: '12 sold listings reviewed over the last 90 days; 2 excluded as mismatched model variants (XM3, XM5).',
    },
    buildSteps: BUILD_STEPS,
  };
}
