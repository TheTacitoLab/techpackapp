/**
 * Size Specification sheet resolution — the ONE place a Spec Sheet's stored
 * cells + Grading Profile become the full numeric table (POM rows down, the
 * sheet's size run across, per-row tolerance), shared by the sheet's twin
 * exports: the PDF spec pages (`lib/pdf/render-spec-sheet-page.tsx`) and the
 * Excel workbook (`lib/excel-techpack.ts`). Both MUST show identical numbers,
 * so both consume this resolver rather than re-deriving.
 *
 * Values are the FULLY-RESOLVED sheet: stored cells as entered, every other
 * auto-mode column re-graded live through the same `gradeSheet` engine the UI
 * uses — computed values are never persisted, so exports re-derive them here.
 * Framework-free (no react-pdf / exceljs in this module's graph).
 */

import {
  gradableRow,
  gradingRulesFromProfile,
  storedValuesByRow,
  toleranceSetForFabric,
} from "@/components/spec/spec-data";
import { demographicLabel } from "@/components/spec/spec-demographics";
import {
  findSizeIndex,
  gradeSheet,
  normalizeSizeLabel,
  toleranceForRow,
} from "@/lib/spec-grading";
import type { GradingProfile, ResolvedSpecSheet } from "@/types";

export type SpecTableColumn = {
  label: string;
  /** Physically-measured sample column — marked in both exports. */
  isSample: boolean;
};

export type SpecTableRow = {
  code: string;
  name: string;
  /** Numeric tolerance (±), or null when no profile/override provides one. */
  tolerance: number | null;
  /** Numeric values aligned with `columns`; null = no value for that size. */
  values: (number | null)[];
};

export type ResolvedSpecTable = {
  sheet: ResolvedSpecSheet;
  profile: GradingProfile | null;
  /** The grading anchor (first sample size), when one exists. */
  anchor: string | null;
  /** The sheet's display name, as the section list shows it. */
  displayName: string;
  columns: SpecTableColumn[];
  rows: SpecTableRow[];
};

/**
 * Resolve every Spec Sheet into its full numeric table. Sheets with no size
 * run or no rows have nothing to table and are skipped; a product with no
 * sheets at all yields [].
 */
export function resolveSpecTables(
  sheets: readonly ResolvedSpecSheet[],
  profilesById: ReadonlyMap<string, GradingProfile>,
): ResolvedSpecTable[] {
  const tables: ResolvedSpecTable[] = [];

  for (const sheet of sheets) {
    const sizeRun = sheet.size_run ?? [];
    const rows = [...sheet.rows].sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.code.localeCompare(b.code, undefined, { numeric: true }),
    );
    if (sizeRun.length === 0 || rows.length === 0) continue;

    const stored = storedValuesByRow(sheet.values ?? []);
    const profile = sheet.grading_profile_id
      ? (profilesById.get(sheet.grading_profile_id) ?? null)
      : null;
    const sampleSizes = sheet.sample_sizes ?? [];
    const anchor = sampleSizes[0] ?? sheet.sample_size_label ?? null;

    // Auto sheets re-grade through the SAME engine the on-screen sheet uses —
    // stored sample column(s) + profile are the single source of truth.
    let computed: Record<string, Record<string, number | null>> | null = null;
    if (
      sheet.mode === "auto" &&
      profile &&
      anchor !== null &&
      findSizeIndex(sizeRun, anchor) !== -1
    ) {
      const sampleValues: Record<string, number | null> = {};
      for (const r of rows) {
        sampleValues[r.id] = stored[r.id]?.[normalizeSizeLabel(anchor)] ?? null;
      }
      computed = gradeSheet(
        rows.map(gradableRow),
        anchor,
        sampleValues,
        gradingRulesFromProfile(profile),
        sizeRun,
      );
    }

    const toleranceSet = profile
      ? toleranceSetForFabric(profile, sheet.fabric_type)
      : {};
    const sampleKeys = new Set(sampleSizes.map((s) => normalizeSizeLabel(s)));

    tables.push({
      sheet,
      profile,
      anchor,
      displayName:
        sheet.name ?? sheet.template_name ?? demographicLabel(sheet.demographic),
      columns: sizeRun.map((label) => ({
        label,
        isSample: sampleKeys.has(normalizeSizeLabel(label)),
      })),
      rows: rows.map((row) => ({
        code: row.code,
        name: row.name,
        tolerance: toleranceForRow(
          row.grade_category,
          row.sub_kind,
          row.tolerance_override,
          toleranceSet,
        ),
        values: sizeRun.map(
          (label) =>
            stored[row.id]?.[normalizeSizeLabel(label)] ??
            computed?.[row.id]?.[label] ??
            null,
        ),
      })),
    });
  }

  return tables;
}

/** The caption naming the profile and tolerance basis, so the factory knows
 *  where the graded numbers came from — shared by the PDF and Excel exports. */
export function specSheetCaption(table: ResolvedSpecTable): string {
  const { sheet, profile, anchor } = table;
  const parts: string[] = [];
  if (sheet.mode === "manual") {
    parts.push("Measurements entered manually");
  } else if (profile) {
    parts.push(
      anchor
        ? `Graded from the ${anchor} sample with the “${profile.name}” profile`
        : `Graded with the “${profile.name}” profile`,
    );
    if (profile.break_size_label) {
      parts.push(`size break at ${profile.break_size_label}`);
    }
  } else {
    parts.push("No grading profile applied — sample column(s) only");
  }
  parts.push(`${sheet.fabric_type === "woven" ? "woven" : "knit"} tolerances`);
  parts.push(`values in ${sheet.unit || "cm"}`);
  return parts.join(" · ");
}
