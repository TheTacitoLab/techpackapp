/**
 * Size Specifications — client-safe helpers shared by the section UI.
 *
 * The defensive jsonb readers here are the ONLY place a Grading Profile's
 * increment/tolerance blobs are decoded (house rule: one reader per jsonb
 * shape, all-null/empty on malformed input, never inline JSON poking). The
 * plain-language category labels live here so the row editor and the profile
 * form can never drift apart.
 */

import type {
  GradableRow,
  GradingRules,
  IncrementKey,
  IncrementSet,
  ToleranceKey,
  ToleranceSet,
} from "@/lib/spec-grading";
import type {
  GradingProfile,
  ProductSpecRow,
  SpecFabricType,
  SpecGradeCategory,
  SpecPomSubKind,
} from "@/types";
import type { Json } from "@/types/database.types";

// ---- jsonb readers ---------------------------------------------------------------

export const INCREMENT_KEYS: readonly IncrementKey[] = [
  "primary_girth",
  "secondary_girth",
  "body_length",
  "limb_length",
  "small_shoulder",
  "small_neck",
  "small_cuff_opening",
  "small_rise",
  "small_strap",
  "inseam",
];

export const TOLERANCE_KEYS: readonly ToleranceKey[] = [
  "primary_girth",
  "secondary_girth",
  "body_length",
  "limb_length",
  "small",
  "fixed",
];

function readNumericKeys<K extends string>(
  json: Json | null | undefined,
  allowed: readonly K[],
): Partial<Record<K, number>> {
  const result: Partial<Record<K, number>> = {};
  if (!json || typeof json !== "object" || Array.isArray(json)) return result;
  const record = json as Record<string, unknown>;
  for (const key of allowed) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return result;
}

/** Decode an increments blob; unknown/malformed keys drop out (grade 0). */
export function readIncrementSet(json: Json | null | undefined): IncrementSet {
  return readNumericKeys(json, INCREMENT_KEYS);
}

/** Decode a tolerances blob. */
export function readToleranceSet(json: Json | null | undefined): ToleranceSet {
  return readNumericKeys(json, TOLERANCE_KEYS);
}

/** A profile row → the engine's GradingRules. */
export function gradingRulesFromProfile(profile: GradingProfile): GradingRules {
  return {
    baseIncrements: readIncrementSet(profile.base_increments),
    extendedIncrements:
      profile.extended_increments === null
        ? null
        : readIncrementSet(profile.extended_increments),
    breakSizeLabel: profile.break_size_label,
  };
}

/** The tolerance set the sheet's knit/woven toggle selects. */
export function toleranceSetForFabric(
  profile: GradingProfile,
  fabricType: SpecFabricType,
): ToleranceSet {
  return readToleranceSet(
    fabricType === "woven" ? profile.tolerances_woven : profile.tolerances_knit,
  );
}

/** A sheet row → the engine's row shape. */
export function gradableRow(row: ProductSpecRow): GradableRow {
  return {
    id: row.id,
    gradeCategory: row.grade_category,
    subKind: row.sub_kind,
  };
}

// ---- Plain-language category choices ------------------------------------------------

/**
 * The flattened (grade_category, sub_kind) choices behind the row editor's
 * single "How it grades" select — plain language first, jargon in the
 * parenthetical.
 */
export interface CategoryChoice {
  value: string;
  gradeCategory: SpecGradeCategory;
  subKind: SpecPomSubKind | null;
  label: string;
}

export const CATEGORY_CHOICES: readonly CategoryChoice[] = [
  {
    value: "primary_girth",
    gradeCategory: "primary_girth",
    subKind: null,
    label: "Width — main (chest, waist, hip, hem)",
  },
  {
    value: "secondary_girth",
    gradeCategory: "secondary_girth",
    subKind: null,
    label: "Width — secondary (thigh, bicep, armhole, knee)",
  },
  {
    value: "body_length",
    gradeCategory: "body_length",
    subKind: null,
    label: "Length — body (HPS to hem, outseam)",
  },
  {
    value: "limb_length",
    gradeCategory: "limb_length",
    subKind: null,
    label: "Length — sleeve",
  },
  {
    value: "small:shoulder",
    gradeCategory: "small",
    subKind: "shoulder",
    label: "Small point — shoulder",
  },
  {
    value: "small:neck",
    gradeCategory: "small",
    subKind: "neck",
    label: "Small point — neck",
  },
  {
    value: "small:cuff_opening",
    gradeCategory: "small",
    subKind: "cuff_opening",
    label: "Small point — cuff / leg opening",
  },
  {
    value: "small:rise",
    gradeCategory: "small",
    subKind: "rise",
    label: "Small point — rise",
  },
  {
    value: "small:strap",
    gradeCategory: "small",
    subKind: "strap",
    label: "Small point — strap",
  },
  {
    value: "fixed:inseam",
    gradeCategory: "fixed",
    subKind: "inseam",
    label: "Inseam (fixed for adults, grades for youth)",
  },
  {
    value: "fixed",
    gradeCategory: "fixed",
    subKind: null,
    label: "Fixed — same on every size",
  },
];

export function categoryChoiceValue(
  gradeCategory: SpecGradeCategory,
  subKind: SpecPomSubKind | null,
): string {
  return subKind ? `${gradeCategory}:${subKind}` : gradeCategory;
}

export function findCategoryChoice(value: string): CategoryChoice | null {
  return CATEGORY_CHOICES.find((choice) => choice.value === value) ?? null;
}

/** Compact per-row tag shown in the sheet's "Grades as" column tooltip. */
export function categoryShortLabel(
  gradeCategory: SpecGradeCategory,
  subKind: SpecPomSubKind | null,
): string {
  if (subKind === "inseam") return "Inseam";
  switch (gradeCategory) {
    case "primary_girth":
      return "Main width";
    case "secondary_girth":
      return "Secondary width";
    case "body_length":
      return "Body length";
    case "limb_length":
      return "Sleeve length";
    case "small":
      switch (subKind) {
        case "shoulder":
          return "Shoulder";
        case "neck":
          return "Neck";
        case "cuff_opening":
          return "Cuff / opening";
        case "rise":
          return "Rise";
        case "strap":
          return "Strap";
        default:
          return "Small point";
      }
    case "fixed":
      return "Fixed";
  }
}

// ---- Profile form field metadata -----------------------------------------------------

/**
 * Field list for the custom-profile form, with the Men's starter values as
 * placeholders (the reference's "industry-typical defaults").
 */
export const INCREMENT_FIELDS: readonly {
  key: IncrementKey;
  label: string;
  placeholder: string;
}[] = [
  { key: "primary_girth", label: "Width — main (chest, waist, hip, hem)", placeholder: "2.5" },
  { key: "secondary_girth", label: "Width — secondary (thigh, bicep, armhole)", placeholder: "1.2" },
  { key: "body_length", label: "Length — body", placeholder: "1.5" },
  { key: "limb_length", label: "Length — sleeve", placeholder: "1.2" },
  { key: "small_shoulder", label: "Shoulder", placeholder: "1.2" },
  { key: "small_neck", label: "Neck", placeholder: "0.6" },
  { key: "small_cuff_opening", label: "Cuff / leg opening", placeholder: "0.6" },
  { key: "small_rise", label: "Rise", placeholder: "1.0" },
  { key: "small_strap", label: "Strap", placeholder: "0.3" },
  { key: "inseam", label: "Inseam (0 = doesn't grade)", placeholder: "0" },
];

export const TOLERANCE_FIELDS: readonly {
  key: ToleranceKey;
  label: string;
  placeholderKnit: string;
  placeholderWoven: string;
}[] = [
  { key: "primary_girth", label: "Width — main", placeholderKnit: "1.2", placeholderWoven: "0.6" },
  { key: "secondary_girth", label: "Width — secondary", placeholderKnit: "1.0", placeholderWoven: "0.6" },
  { key: "body_length", label: "Length — body", placeholderKnit: "1.0", placeholderWoven: "1.0" },
  { key: "limb_length", label: "Length — sleeve / inseam", placeholderKnit: "1.0", placeholderWoven: "1.0" },
  { key: "small", label: "Small points", placeholderKnit: "0.5", placeholderWoven: "0.5" },
  { key: "fixed", label: "Fixed points", placeholderKnit: "0.5", placeholderWoven: "0.5" },
];

// ---- Formatting ----------------------------------------------------------------------

/** Spec values render to one decimal ("52" → "52.0"). */
export function formatSpecValue(value: number): string {
  return value.toFixed(1);
}

/** Parse a cell input string; null = empty/invalid (clears the cell). */
export function parseSpecValueInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
