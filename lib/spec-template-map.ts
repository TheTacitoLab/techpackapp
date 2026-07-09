/**
 * Pure mapping from a Spec Sheet's product-owned rows to workspace spec
 * template POMs — the exact reverse of `copyTemplateRows` in spec-actions.ts.
 * A spec template is STRUCTURE (code, name, how-to-measure, grade category,
 * sub-kind, order): entered measurement values and per-row tolerance
 * overrides deliberately never copy. Framework-free so `npm test` can load it.
 */

import type { ProductSpecRow, SpecTemplatePom } from "@/types";

/** The row fields a template capture reads — matches the action's select. */
export type SpecRowForTemplate = Pick<
  ProductSpecRow,
  "code" | "name" | "how_to_measure" | "grade_category" | "sub_kind" | "sort_order"
>;

export type SpecTemplatePomInsert = Pick<
  SpecTemplatePom,
  "template_id" | "code" | "name" | "how_to_measure" | "grade_category" | "sub_kind" | "sort_order"
>;

/**
 * `spec_template_poms` carries UNIQUE(template_id, code) — sheet rows are
 * normally unique per sheet (POM1… sequence), but codes are user-editable, so
 * report any duplicates for a clean error instead of a raw DB violation.
 * Comparison is case-insensitive to match how codes read on the sheet.
 */
export function duplicateTemplateCodes(
  rows: readonly SpecRowForTemplate[],
): string[] {
  // key (normalised) → first-seen spelling, so each duplicate reports once,
  // in the spelling the user knows it by.
  const seen = new Map<string, string>();
  const dupes = new Map<string, string>();
  for (const row of rows) {
    const key = row.code.trim().toUpperCase();
    const first = seen.get(key);
    if (first !== undefined) {
      if (!dupes.has(key)) dupes.set(key, first);
    } else {
      seen.set(key, row.code.trim());
    }
  }
  return [...dupes.values()];
}

/**
 * Order rows the way the sheet displays them (sort_order, then numeric-aware
 * code — the same tie-break `resolveSpecTables` uses), then renumber ×10 so
 * the new template starts with the clean spacing the seeded templates use.
 */
export function specRowsToTemplatePoms(
  rows: readonly SpecRowForTemplate[],
  templateId: string,
): SpecTemplatePomInsert[] {
  return [...rows]
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.code.localeCompare(b.code, undefined, { numeric: true }),
    )
    .map((row, index) => ({
      template_id: templateId,
      code: row.code,
      name: row.name,
      how_to_measure: row.how_to_measure,
      grade_category: row.grade_category,
      sub_kind: row.sub_kind,
      sort_order: (index + 1) * 10,
    }));
}
