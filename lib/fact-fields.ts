/**
 * Which item_facts fields are a closed set of options rather than free
 * text, and what those options are -- shared between server/ai/
 * condition-provider.ts (the source of truth for what the model is allowed
 * to return) and the facts-editing UI (so changing one of these fields
 * offers a picker instead of a text box). Lives here, not in
 * server/ai/condition-provider.ts, so a client component can import it
 * without pulling in server-only AI-provider code.
 */
export const CONDITION_GRADES = [
  'new_sealed',
  'unused_open_box',
  'excellent',
  'very_good',
  'good',
  'fair',
  'spares_repair',
] as const;

export type ConditionGrade = (typeof CONDITION_GRADES)[number];

/** How much care the item needs in packaging -- see server/ai/dimensions-provider.ts. */
export const FRAGILITY_GRADES = ['robust', 'moderate', 'fragile', 'very_fragile'] as const;

export type FragilityGrade = (typeof FRAGILITY_GRADES)[number];

/**
 * Closed set of packaging concerns the dimensions/packaging AI stage can
 * flag -- each maps to a specific extra material in
 * server/items/packaging.ts's recommendation logic.
 */
export const SPECIAL_HANDLING_FLAGS = [
  'anti_static',
  'fragile_glass',
  'liquid',
  'battery',
  'sharp_edges',
  'heavy_awkward',
] as const;

export type SpecialHandlingFlag = (typeof SPECIAL_HANDLING_FLAGS)[number];

export interface EnumFactFieldOption {
  value: string;
  label: string;
}

export interface EnumFactField {
  type: 'enum';
  options: EnumFactFieldOption[];
}

const CONDITION_GRADE_LABEL: Record<ConditionGrade, string> = {
  new_sealed: 'New / sealed',
  unused_open_box: 'Unused / open box',
  excellent: 'Excellent',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
  spares_repair: 'Spares / repair',
};

const FRAGILITY_GRADE_LABEL: Record<FragilityGrade, string> = {
  robust: 'Robust',
  moderate: 'Moderate care',
  fragile: 'Fragile',
  very_fragile: 'Very fragile',
};

const ENUM_FACT_FIELDS: Record<string, EnumFactField> = {
  'condition.overall_grade': {
    type: 'enum',
    options: CONDITION_GRADES.map((grade) => ({ value: grade, label: CONDITION_GRADE_LABEL[grade] })),
  },
  'packaging.fragility': {
    type: 'enum',
    options: FRAGILITY_GRADES.map((grade) => ({ value: grade, label: FRAGILITY_GRADE_LABEL[grade] })),
  },
};

export function getEnumFactField(field: string): EnumFactField | undefined {
  return ENUM_FACT_FIELDS[field];
}
