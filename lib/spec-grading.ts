/**
 * Size Specifications — pure sizing + grading math.
 *
 * Everything the Spec Sheet computes lives here, framework-free and
 * side-effect-free, so the UI (live re-grade on every keystroke), the server
 * actions (mode-switch snapshots) and the unit tests all share ONE
 * implementation (the house "shared math has exactly one implementation"
 * rule — see lib/cover-geometry.ts).
 *
 * Two halves:
 *
 * 1. Size-run parsing — `products.size_range` is free text ("XS–XL",
 *    "UK 6–18", "S, M, L"), so `parseSizeRun` turns it into ordered column
 *    labels: explicit lists label-by-label (comma first so combo sizes like
 *    "S/M, L/XL" survive; all-ladder lists are sorted ascending), alpha
 *    ranges expanded via the adult/youth ladders (with synonyms: XXL ≡ 2XL),
 *    numeric ranges expanded at step 2 when the span is even (UK dress /
 *    waist convention) else step 1. Anything unparseable falls back to a
 *    single one-column label — grading still works, it just has nowhere to
 *    grade to.
 *
 * 2. The grading engine — `gradeSheet` walks OUTWARD from the sample column
 *    in both directions, one size step at a time, adding (upward) or
 *    subtracting (downward) the increment for each row's grade category. A
 *    step uses the profile's EXTENDED increments when its UPPER size sits
 *    at/above the break (resolveBreakIndex: exact label in the run, else the
 *    first run label at/above the break's ladder position — so "3XL–6XL"
 *    grades extended throughout); runs with no ladder relationship to the
 *    break grade base throughout (increments are per step, not per label).
 *    Computed values are rounded to 0.1 cm and NEVER persisted — the stored
 *    sample column plus the profile is the single source of truth.
 *
 * Increment keys are the contract shared with the seeded profile jsonb
 * (supabase/migrations/0035): `small` rows resolve through their sub-kind
 * (small_shoulder, small_neck, …) because the reference gives each small
 * point its own increment; `fixed` rows grade 0 — EXCEPT sub-kind 'inseam',
 * which resolves to the profile's `inseam` key (adults 0, youth 2.5). A key a
 * profile omits grades 0, so e.g. a men's profile with no `small_strap` keeps
 * strap rows flat rather than guessing a number.
 *
 * NOTE: this module must stay dependency-free and avoid runtime-TS syntax
 * (no enums/namespaces) — the tests run it under Node's native type-stripping
 * (`npm test` → `node --test`).
 */

// ---- Types -------------------------------------------------------------------

export type GradeCategory =
  | "primary_girth"
  | "secondary_girth"
  | "body_length"
  | "limb_length"
  | "small"
  | "fixed";

export type SpecSubKind =
  | "shoulder"
  | "neck"
  | "cuff_opening"
  | "rise"
  | "strap"
  | "inseam";

export type IncrementKey =
  | "primary_girth"
  | "secondary_girth"
  | "body_length"
  | "limb_length"
  | "small_shoulder"
  | "small_neck"
  | "small_cuff_opening"
  | "small_rise"
  | "small_strap"
  | "inseam";

export type IncrementSet = Partial<Record<IncrementKey, number>>;

export type ToleranceKey =
  | "primary_girth"
  | "secondary_girth"
  | "body_length"
  | "limb_length"
  | "small"
  | "fixed";

export type ToleranceSet = Partial<Record<ToleranceKey, number>>;

/** The engine's view of a sheet row — id + how it grades. */
export interface GradableRow {
  id: string;
  gradeCategory: GradeCategory;
  subKind: SpecSubKind | null;
}

/** The engine's view of a Grading Profile. */
export interface GradingRules {
  baseIncrements: IncrementSet;
  /**
   * May carry only the keys that differ from base — the engine falls back to
   * base per key. Null = no extended set (youth).
   */
  extendedIncrements: IncrementSet | null;
  /** Size label where extended increments kick in; null = no break (youth). */
  breakSizeLabel: string | null;
}

// ---- Size-run parsing ----------------------------------------------------------

const ADULT_LADDER = [
  "XXS", "XS", "S", "M", "L", "XL",
  "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL",
] as const;

const YOUTH_LADDER = ["YXXS", "YXS", "YS", "YM", "YL", "YXL"] as const;

/** Alternate spellings mapped to the canonical ladder form. */
const SIZE_SYNONYMS: Record<string, string> = {
  "2XS": "XXS",
  "XXL": "2XL",
  "XXXL": "3XL",
  "XXXXL": "4XL",
  "XXXXXL": "5XL",
};

/** Longest run `parseSizeRun` will expand a numeric range to. */
const MAX_RUN_LENGTH = 24;

/**
 * Canonical comparison form of a size label: trimmed, single-spaced,
 * uppercased, synonyms resolved ("xxl" → "2XL"). Used for every label match
 * (sample column, break size) so "XXL" in a product run still hits a "2XL"
 * break.
 */
export function normalizeSizeLabel(label: string): string {
  const upper = label.trim().replace(/\s+/g, " ").toUpperCase();
  return SIZE_SYNONYMS[upper] ?? upper;
}

function isLadderLabel(normalized: string): boolean {
  return ladderPosition(normalized) !== null;
}

function ladderPosition(
  normalized: string,
): { ladder: "adult" | "youth"; index: number } | null {
  const adult = (ADULT_LADDER as readonly string[]).indexOf(normalized);
  if (adult !== -1) return { ladder: "adult", index: adult };
  const youth = (YOUTH_LADDER as readonly string[]).indexOf(normalized);
  if (youth !== -1) return { ladder: "youth", index: youth };
  return null;
}

/**
 * Explicit lists arrive in user order; when EVERY label sits on one ladder,
 * sort ascending so "2XL, XL, L" grades the right way round. Mixed or custom
 * lists keep their typed order — we can't know how they rank.
 */
function sortIfLadder(labels: string[]): string[] {
  const positions: { ladder: "adult" | "youth"; index: number }[] = [];
  for (const label of labels) {
    const pos = ladderPosition(normalizeSizeLabel(label));
    if (pos === null) return labels;
    if (positions.length > 0 && pos.ladder !== positions[0].ladder) return labels;
    positions.push(pos);
  }
  return labels
    .map((label, i) => ({ label, index: positions[i].index }))
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.label);
}

/** Ladder labels come back canonical ("xxl" → "2XL"); custom labels as typed. */
function canonicalLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  const normalized = normalizeSizeLabel(trimmed);
  return isLadderLabel(normalized) ? normalized : trimmed;
}

/** Last number in a label ("UK 6" → 6), so prefixed endpoints expand cleanly. */
function trailingNumber(label: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*$/.exec(label.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Range separators: en/em dash, the word "to", a spaced hyphen, or a bare
 * hyphen directly between alphanumerics ("S-2XL", "6-18").
 */
const RANGE_SEPARATOR =
  /\s*(?:–|—|\bto\b)\s*|\s+-\s+|(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])/i;

function expandRange(a: string, b: string): string[] | null {
  const na = normalizeSizeLabel(a);
  const nb = normalizeSizeLabel(b);

  for (const ladder of [ADULT_LADDER, YOUTH_LADDER] as const) {
    const ia = (ladder as readonly string[]).indexOf(na);
    const ib = (ladder as readonly string[]).indexOf(nb);
    if (ia !== -1 && ib !== -1 && ia !== ib) {
      const lo = Math.min(ia, ib);
      const hi = Math.max(ia, ib);
      return ladder.slice(lo, hi + 1);
    }
  }

  const numA = trailingNumber(a);
  const numB = trailingNumber(b);
  if (
    numA !== null && numB !== null &&
    Number.isInteger(numA) && Number.isInteger(numB) &&
    numA !== numB
  ) {
    const lo = Math.min(numA, numB);
    const hi = Math.max(numA, numB);
    // Even span → step 2 (UK dress sizes 6–18, waists 28–36); odd span → 1.
    const step = (hi - lo) % 2 === 0 ? 2 : 1;
    const labels: string[] = [];
    for (let v = lo; v <= hi; v += step) labels.push(String(v));
    if (labels.length >= 2 && labels.length <= MAX_RUN_LENGTH) return labels;
  }

  return null;
}

/**
 * Parse the product's free-text size range into ordered Spec Sheet columns.
 * Returns [] when no sizes are set (the section shows its Product Setup
 * empty state).
 */
export function parseSizeRun(text: string | null | undefined): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];

  // Explicit lists win: "S, M, L" / "3-4, 5-6, 7-8" — labels never
  // range-expanded so age bands survive. Comma lists may contain combo sizes
  // ("S/M, L/XL"), so the slash only separates when no comma is present.
  const listSeparator = raw.includes(",") ? "," : raw.includes("/") ? "/" : null;
  if (listSeparator) {
    const labels = raw
      .split(listSeparator)
      .map(canonicalLabel)
      .filter((label) => label.length > 0);
    return sortIfLadder(dedupeLabels(labels));
  }

  const parts = raw
    .split(RANGE_SEPARATOR)
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
  if (parts.length === 2) {
    const expanded = expandRange(parts[0], parts[1]);
    if (expanded) return dedupeLabels(expanded);
  }

  // Single size or unparseable text: one column, grading has nowhere to go
  // but nothing breaks.
  return [canonicalLabel(raw)];
}

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const key = normalizeSizeLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

/** Index of a label in the run under normalization; -1 if absent. */
export function findSizeIndex(
  sizeRun: readonly string[],
  label: string,
): number {
  const target = normalizeSizeLabel(label);
  return sizeRun.findIndex((l) => normalizeSizeLabel(l) === target);
}

/**
 * Where the extended-increments zone starts in this run. Exact label match
 * first; when the break label isn't in the run but the run carries ladder
 * sizes, the zone starts at the first label at/above the break's ladder
 * position — so a big-and-tall "3XL–6XL" run on a 2XL-break profile grades
 * extended THROUGHOUT instead of silently falling back to base. Runs with no
 * ladder relationship to the break (custom "38–46") return -1 and grade base
 * throughout (increments are per step, not per label).
 */
export function resolveBreakIndex(
  sizeRun: readonly string[],
  breakSizeLabel: string,
): number {
  const exact = findSizeIndex(sizeRun, breakSizeLabel);
  if (exact !== -1) return exact;
  const breakPos = ladderPosition(normalizeSizeLabel(breakSizeLabel));
  if (breakPos === null) return -1;
  for (let i = 0; i < sizeRun.length; i++) {
    const pos = ladderPosition(normalizeSizeLabel(sizeRun[i]));
    if (pos !== null && pos.ladder === breakPos.ladder && pos.index >= breakPos.index) {
      return i;
    }
  }
  return -1;
}

/** The default sample column: the middle of the run (lower-middle when even). */
export function defaultSampleSize(sizeRun: readonly string[]): string | null {
  if (sizeRun.length === 0) return null;
  return sizeRun[Math.floor((sizeRun.length - 1) / 2)];
}

// ---- The grading engine ----------------------------------------------------------

/**
 * Which increment key a row grades by. Null means the row never moves
 * (plain fixed, or a small/fixed row missing its sub-kind).
 */
export function incrementKeyForRow(
  gradeCategory: GradeCategory,
  subKind: SpecSubKind | null,
): IncrementKey | null {
  if (gradeCategory === "small") {
    if (subKind && subKind !== "inseam") {
      return `small_${subKind}` as IncrementKey;
    }
    return null;
  }
  if (gradeCategory === "fixed") {
    return subKind === "inseam" ? "inseam" : null;
  }
  return gradeCategory;
}

/**
 * Which tolerance key a row reads from the profile's knit/woven set. Inseam
 * rows take the limb-length tolerance (an inseam is a leg length, whether or
 * not it grades); every small sub-kind shares the single small-points value.
 */
export function toleranceKeyForRow(
  gradeCategory: GradeCategory,
  subKind: SpecSubKind | null,
): ToleranceKey {
  if (subKind === "inseam") return "limb_length";
  if (gradeCategory === "small") return "small";
  return gradeCategory;
}

/**
 * A row's effective ± tolerance: per-row override first, then the profile's
 * category default; null when neither exists.
 */
export function toleranceForRow(
  gradeCategory: GradeCategory,
  subKind: SpecSubKind | null,
  toleranceOverride: number | null,
  tolerances: ToleranceSet,
): number | null {
  if (toleranceOverride !== null) return toleranceOverride;
  return tolerances[toleranceKeyForRow(gradeCategory, subKind)] ?? null;
}

/** Grade values to 0.1 cm. */
export function roundTo1dp(value: number): number {
  return Math.round(value * 10) / 10;
}

function stepIncrement(
  row: GradableRow,
  upperIndex: number,
  breakIndex: number,
  rules: GradingRules,
): number {
  const key = incrementKeyForRow(row.gradeCategory, row.subKind);
  if (!key) return 0;
  const useExtended =
    breakIndex >= 0 &&
    upperIndex >= breakIndex &&
    rules.extendedIncrements !== null;
  if (useExtended) {
    return (
      rules.extendedIncrements?.[key] ?? rules.baseIncrements[key] ?? 0
    );
  }
  return rules.baseIncrements[key] ?? 0;
}

/**
 * Grade a whole sheet: for every row, compute a value for every size in the
 * product's run from that row's sample value.
 *
 * Returns `{ [rowId]: { [sizeLabel]: value | null } }`. A row with no sample
 * value (or a sample size missing from the run) comes back all-null — the UI
 * renders those cells empty rather than guessing.
 *
 * Rounding happens per displayed cell; the walk itself accumulates unrounded
 * so a long run can't drift from repeated rounding.
 */
export function gradeSheet(
  rows: readonly GradableRow[],
  sampleSizeLabel: string,
  sampleValues: Readonly<Record<string, number | null | undefined>>,
  rules: GradingRules,
  sizeRun: readonly string[],
): Record<string, Record<string, number | null>> {
  const sampleIndex = findSizeIndex(sizeRun, sampleSizeLabel);
  const breakIndex =
    rules.breakSizeLabel === null
      ? -1
      : resolveBreakIndex(sizeRun, rules.breakSizeLabel);

  const result: Record<string, Record<string, number | null>> = {};

  for (const row of rows) {
    const values: Record<string, number | null> = {};
    for (const label of sizeRun) values[label] = null;

    const sample = sampleValues[row.id];
    if (
      sampleIndex !== -1 &&
      typeof sample === "number" &&
      Number.isFinite(sample)
    ) {
      values[sizeRun[sampleIndex]] = roundTo1dp(sample);

      let acc = sample;
      for (let i = sampleIndex + 1; i < sizeRun.length; i++) {
        acc += stepIncrement(row, i, breakIndex, rules);
        values[sizeRun[i]] = roundTo1dp(acc);
      }

      acc = sample;
      for (let i = sampleIndex - 1; i >= 0; i--) {
        // The step between i and i+1 — its UPPER size decides base/extended.
        acc -= stepIncrement(row, i + 1, breakIndex, rules);
        values[sizeRun[i]] = roundTo1dp(acc);
      }
    }

    result[row.id] = values;
  }

  return result;
}
