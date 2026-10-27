// insurance.types.ts
import { z } from "@nitrostack/core";

export const swarmValuationPropertyAttributesSchema = z.object({
  YearBuilt: z.number().int().positive(),
  LivingArea: z.number().int().positive(),
  type_Dwelling: z.number().int(),
  NumberOfStories: z.number().int().positive(),
  YearRoofUpdated: z.number().int().positive(),
  type_RoofingMaterial: z.number().int(),
  type_Roof: z.number().int(),
  type_Construction: z.number().int(),
  type_Foundation: z.number().int(),
  type_Pool: z.number().int(),
});

/** POST /quotes/recalculate swarmValuation body (HoneyQuote SwarmValuation). */
export const swarmValuationSchema = z.object({
  AddressProfile: z.object({
    PropertyAttributes: swarmValuationPropertyAttributesSchema,
  }),
});

export type SwarmValuationInput = z.infer<typeof swarmValuationSchema>;
export type SwarmValuationPropertyAttributes = z.infer<
  typeof swarmValuationPropertyAttributesSchema
>;

export const SWARM_VALUATION_PROPERTY_PATH = 'AddressProfile.PropertyAttributes';

/** User-provided dwelling types (DwellingTypeId → DwellingTypeDesc). */
export const DWELLING_TYPE_OPTIONS = [
  { DwellingTypeId: 1, DwellingTypeDesc: 'Single Family' },
  { DwellingTypeId: 2, DwellingTypeDesc: 'Duplex' },
  { DwellingTypeId: 15, DwellingTypeDesc: 'Townhouse' },
  { DwellingTypeId: 16, DwellingTypeDesc: 'Rowhouse' },
] as const;

/** User-provided pool types (PoolTypeId → PoolType). */
export const POOL_TYPE_OPTIONS = [
  { PoolTypeId: 1, PoolType: 'In Ground' },
  { PoolTypeId: 2, PoolType: 'Above Ground' },
  { PoolTypeId: 3, PoolType: 'None' },
] as const;

/** User-provided roofing materials (RoofingMaterialId → RoofingMaterial). */
export const ROOFING_MATERIAL_OPTIONS = [
  { RoofingMaterialId: 1, RoofingMaterial: 'Asbestos' },
  { RoofingMaterialId: 2, RoofingMaterial: 'Asphalt shingles' },
  { RoofingMaterialId: 3, RoofingMaterial: 'Composite shingles' },
  { RoofingMaterialId: 4, RoofingMaterial: 'Barrel' },
  { RoofingMaterialId: 5, RoofingMaterial: 'Concrete tile' },
  { RoofingMaterialId: 6, RoofingMaterial: 'Concrete' },
  { RoofingMaterialId: 7, RoofingMaterial: 'Flat-tile' },
  { RoofingMaterialId: 8, RoofingMaterial: 'Metal' },
  { RoofingMaterialId: 9, RoofingMaterial: 'Rolled' },
  { RoofingMaterialId: 10, RoofingMaterial: 'Rubber' },
  { RoofingMaterialId: 11, RoofingMaterial: 'Other' },
  { RoofingMaterialId: 12, RoofingMaterial: 'Clay tile' },
  { RoofingMaterialId: 13, RoofingMaterial: 'Cement tile' },
  { RoofingMaterialId: 14, RoofingMaterial: 'Slate' },
  { RoofingMaterialId: 15, RoofingMaterial: 'Wood shingles' },
  { RoofingMaterialId: 16, RoofingMaterial: 'Wood shakes' },
  { RoofingMaterialId: 17, RoofingMaterial: 'Interlocking shingles' },
  { RoofingMaterialId: 18, RoofingMaterial: 'Copper' },
  { RoofingMaterialId: 19, RoofingMaterial: 'Built-up' },
  { RoofingMaterialId: 20, RoofingMaterial: 'Single-Ply membrane' },
  { RoofingMaterialId: 21, RoofingMaterial: 'Elastomeric roof coating system' },
  { RoofingMaterialId: 22, RoofingMaterial: 'Seamed metal' },
  { RoofingMaterialId: 23, RoofingMaterial: 'Steel' },
  { RoofingMaterialId: 24, RoofingMaterial: 'Architectural shingles' },
  { RoofingMaterialId: 25, RoofingMaterial: 'Light metal' },
] as const;

/** User-provided roof types (RoofTypeId → RoofType). */
export const ROOF_TYPE_OPTIONS = [
  { RoofTypeId: 1, RoofType: 'Flat' },
  { RoofTypeId: 2, RoofType: 'Hip' },
  { RoofTypeId: 3, RoofType: 'Gable' },
  { RoofTypeId: 4, RoofType: 'Other' },
] as const;

/** User-provided foundation types (FoundationTypeId → FoundationType). */
export const FOUNDATION_TYPE_OPTIONS = [
  { FoundationTypeId: 1, FoundationType: 'Slab' },
  { FoundationTypeId: 2, FoundationType: 'Basement' },
  { FoundationTypeId: 3, FoundationType: 'Crawl Space' },
  { FoundationTypeId: 4, FoundationType: 'Open' },
  { FoundationTypeId: 5, FoundationType: 'Partial Basement' },
  { FoundationTypeId: 6, FoundationType: 'Piers' },
  { FoundationTypeId: 7, FoundationType: 'Posts' },
  { FoundationTypeId: 8, FoundationType: 'Stilts - Masonry' },
] as const;

const formatOptionList = <T extends Record<string, string | number>>(
  options: readonly T[],
  idKey: keyof T,
  labelKey: keyof T,
) =>
  options
    .map((o) => `${o[idKey]}=${o[labelKey]}`)
    .join(', ');

const dwellingTypeLabel = `type_Dwelling (${formatOptionList(DWELLING_TYPE_OPTIONS, 'DwellingTypeId', 'DwellingTypeDesc')})`;
const poolTypeLabel = `type_Pool (${formatOptionList(POOL_TYPE_OPTIONS, 'PoolTypeId', 'PoolType')})`;
const roofingMaterialLabel = `type_RoofingMaterial (${formatOptionList(ROOFING_MATERIAL_OPTIONS, 'RoofingMaterialId', 'RoofingMaterial')})`;
const roofTypeLabel = `type_Roof (${formatOptionList(ROOF_TYPE_OPTIONS, 'RoofTypeId', 'RoofType')})`;
const foundationTypeLabel = `type_Foundation (${formatOptionList(FOUNDATION_TYPE_OPTIONS, 'FoundationTypeId', 'FoundationType')})`;

type PropertyFieldDef<K extends keyof SwarmValuationPropertyAttributes> = {
  key: K;
  label: string;
  example?: SwarmValuationPropertyAttributes[K];
};

type AllPropertyFieldDefs = {
  [K in keyof SwarmValuationPropertyAttributes]: PropertyFieldDef<K>;
}[keyof SwarmValuationPropertyAttributes];

export const SWARM_VALUATION_FIELDS: AllPropertyFieldDefs[] = [
  { key: 'YearBuilt',           label: 'Year built',             example: 1998 },
  { key: 'LivingArea',          label: 'Living area (sq ft)',     example: 2000 },
  { key: 'type_Dwelling',       label: dwellingTypeLabel,         example: 1 },
  { key: 'NumberOfStories',     label: 'Number of stories',       example: 2 },
  { key: 'YearRoofUpdated',     label: 'Roof update year',        example: 2000 },
  { key: 'type_RoofingMaterial', label: roofingMaterialLabel,       example: 2 },
  { key: 'type_Roof',           label: roofTypeLabel,               example: 3 },
  { key: 'type_Construction',   label: 'Construction type',       example: 2 },
  { key: 'type_Foundation',       label: foundationTypeLabel,       example: 3 },
  { key: 'type_Pool',           label: poolTypeLabel,             example: 1 },
];

export type SwarmValuationPropertyAttributesKey =
  keyof SwarmValuationPropertyAttributes;

export type PropertyFieldOption = {
  id: number;
  label: string;
};

export type UserFacingPropertyQuestion = {
  key: SwarmValuationPropertyAttributesKey;
  label: string;
  example?: number;
  options?: PropertyFieldOption[];
};

const PROPERTY_FIELD_SHORT_LABELS: Record<
  SwarmValuationPropertyAttributesKey,
  string
> = {
  YearBuilt: 'Year built',
  LivingArea: 'Living area (sq ft)',
  type_Dwelling: 'Dwelling type',
  NumberOfStories: 'Number of stories',
  YearRoofUpdated: 'Roof update year',
  type_RoofingMaterial: 'Roofing material',
  type_Roof: 'Roof type',
  type_Construction: 'Construction type',
  type_Foundation: 'Foundation type',
  type_Pool: 'Pool',
};

const PROPERTY_FIELD_OPTIONS: Partial<
  Record<SwarmValuationPropertyAttributesKey, readonly PropertyFieldOption[]>
> = {
  type_Dwelling: DWELLING_TYPE_OPTIONS.map((o) => ({
    id: o.DwellingTypeId,
    label: o.DwellingTypeDesc,
  })),
  type_Pool: POOL_TYPE_OPTIONS.map((o) => ({
    id: o.PoolTypeId,
    label: o.PoolType,
  })),
  type_RoofingMaterial: ROOFING_MATERIAL_OPTIONS.map((o) => ({
    id: o.RoofingMaterialId,
    label: o.RoofingMaterial,
  })),
  type_Roof: ROOF_TYPE_OPTIONS.map((o) => ({
    id: o.RoofTypeId,
    label: o.RoofType,
  })),
  type_Foundation: FOUNDATION_TYPE_OPTIONS.map((o) => ({
    id: o.FoundationTypeId,
    label: o.FoundationType,
  })),
};

export const USER_FACING_PROPERTY_QUESTIONS: UserFacingPropertyQuestion[] =
  SWARM_VALUATION_FIELDS.map(({ key, example }) => {
    const options = PROPERTY_FIELD_OPTIONS[key];

    return {
      key,
      label: PROPERTY_FIELD_SHORT_LABELS[key],
      ...(options ? { options: [...options] } : {}),
      ...(example !== undefined ? { example } : {}),
    };
  });

/** True when swarmValuation has API metadata beyond AddressProfile (from createQuote). */
export function isCompleteSwarmValuation(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.GoogleAddressDetails != null &&
    (record.ValuationId != null || record.ValuationAmount != null)
  );
}

/** Prefer a complete candidate; fall back to server cache from fetch_quote. */
export function resolveSwarmValuationBase(
  cached: unknown | undefined,
  candidate: unknown | undefined,
): unknown {
  if (isCompleteSwarmValuation(candidate)) {
    return candidate;
  }

  if (isCompleteSwarmValuation(cached)) {
    return cached;
  }

  return candidate ?? cached;
}

/**
 * PATCH createQuote swarmValuation with homeowner answers.
 * Sends the full SwarmValuation object to recalculate; only PropertyAttributes keys
 * from propertyAttributes are overwritten.
 */
export function mergeSwarmValuationPropertyAttributes(
  baseSwarmValuation: unknown,
  propertyAttributes: SwarmValuationPropertyAttributes,
): Record<string, unknown> {
  const merged: Record<string, unknown> =
    baseSwarmValuation && typeof baseSwarmValuation === 'object'
      ? structuredClone(baseSwarmValuation as Record<string, unknown>)
      : {};

  const profile =
    merged.AddressProfile && typeof merged.AddressProfile === 'object'
      ? (merged.AddressProfile as Record<string, unknown>)
      : (merged.AddressProfile = {});

  const existingAttributes =
    profile.PropertyAttributes &&
    typeof profile.PropertyAttributes === 'object'
      ? (profile.PropertyAttributes as Record<string, unknown>)
      : {};

  profile.PropertyAttributes = {
    ...existingAttributes,
    ...propertyAttributes,
  };

  return merged;
}
