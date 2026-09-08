import type { FragilityGrade, SpecialHandlingFlag } from '@/lib/fact-fields';

export interface PackagingMaterial {
  material: string;
  quantity: number;
}

export interface PackagingRecommendation {
  boxSizeTier: string;
  materials: PackagingMaterial[];
}

export interface PackagingFactsInput {
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  weightKg?: number;
  fragility?: FragilityGrade;
  specialHandling?: SpecialHandlingFlag[];
}

/** A small fixed set of standard box sizes, largest dimension first -- picked by whichever tier the item's own three dimensions (in any orientation) all fit inside. */
const BOX_TIERS: { name: string; maxDimsCm: [number, number, number] }[] = [
  { name: 'Small box (up to 25×18×10cm)', maxDimsCm: [25, 18, 10] },
  { name: 'Medium box (up to 35×25×15cm)', maxDimsCm: [35, 25, 15] },
  { name: 'Large box (up to 45×35×20cm)', maxDimsCm: [45, 35, 20] },
];

const UNKNOWN_BOX_TIER = 'Unknown -- dimensions incomplete, check manually';
const OVERSIZED_BOX_TIER = 'Oversized (over 45×35×20cm) -- check manually';

function pickBoxSizeTier(lengthCm?: number, widthCm?: number, heightCm?: number): string {
  if (lengthCm === undefined || widthCm === undefined || heightCm === undefined) {
    return UNKNOWN_BOX_TIER;
  }
  const itemDims = [lengthCm, widthCm, heightCm].sort((a, b) => b - a);
  for (const tier of BOX_TIERS) {
    const tierDims = [...tier.maxDimsCm].sort((a, b) => b - a);
    if (itemDims.every((dim, index) => dim <= tierDims[index]!)) return tier.name;
  }
  return OVERSIZED_BOX_TIER;
}

/** 0 for `robust` -- padding is only added when the item actually needs it, not by default. */
const BUBBLE_WRAP_LAYERS_BY_FRAGILITY: Record<FragilityGrade, number> = {
  robust: 0,
  moderate: 1,
  fragile: 2,
  very_fragile: 2,
};

const SPECIAL_HANDLING_MATERIALS: Record<SpecialHandlingFlag, PackagingMaterial[]> = {
  anti_static: [{ material: 'Anti-static bag', quantity: 1 }],
  fragile_glass: [
    { material: 'Extra bubble wrap', quantity: 1 },
    { material: 'Fragile / handle-with-care stickers', quantity: 2 },
  ],
  liquid: [
    { material: 'Resealable bag', quantity: 1 },
    { material: 'Absorbent padding', quantity: 1 },
  ],
  battery: [{ material: 'Battery-safe tape/packaging', quantity: 1 }],
  sharp_edges: [{ material: 'Cardboard edge protectors', quantity: 4 }],
  heavy_awkward: [
    { material: 'Double-walled box', quantity: 1 },
    { material: 'Extra parcel tape', quantity: 1 },
  ],
};

function mergeMaterials(materials: PackagingMaterial[]): PackagingMaterial[] {
  const byName = new Map<string, number>();
  const order: string[] = [];
  for (const { material, quantity } of materials) {
    if (!byName.has(material)) order.push(material);
    byName.set(material, (byName.get(material) ?? 0) + quantity);
  }
  return order.map((material) => ({ material, quantity: byName.get(material)! }));
}

/**
 * Pure derivation from already-known packaging facts to a recommended box
 * size and materials list -- deliberately inventory-agnostic (stock
 * cross-checking is a separate concern layered on top once inventory
 * exists). Undefined only when there is nothing at all to go on yet (no
 * fragility grade -- the one field the dimensions AI stage always fills in
 * when it runs at all).
 */
export function derivePackagingRecommendation(
  facts: PackagingFactsInput,
): PackagingRecommendation | undefined {
  if (facts.fragility === undefined) return undefined;

  const boxSizeTier = pickBoxSizeTier(facts.lengthCm, facts.widthCm, facts.heightCm);
  const bubbleWrapLayers = BUBBLE_WRAP_LAYERS_BY_FRAGILITY[facts.fragility];

  const materials: PackagingMaterial[] = [
    { material: 'Cardboard box', quantity: 1 },
    { material: 'Parcel tape', quantity: 1 },
    { material: 'Packing paper / void fill', quantity: 1 },
  ];
  if (bubbleWrapLayers > 0) {
    materials.push({ material: 'Bubble wrap (layers)', quantity: bubbleWrapLayers });
  }
  if (facts.fragility === 'very_fragile') {
    materials.push({ material: 'Reinforced corner protectors', quantity: 4 });
  }
  for (const flag of facts.specialHandling ?? []) {
    materials.push(...SPECIAL_HANDLING_MATERIALS[flag]);
  }

  return { boxSizeTier, materials: mergeMaterials(materials) };
}
