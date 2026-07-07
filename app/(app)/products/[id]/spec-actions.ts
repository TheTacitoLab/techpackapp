"use server";

/**
 * Server actions for the Size Specifications section: the product's Spec
 * Sheet (create from template / blank, sample values, mode switches, row
 * CRUD) and workspace Grading Profiles (create / edit / delete /
 * duplicate-to-edit from the seeded starters).
 *
 * Every action follows the house pattern: zod-parse inputs →
 * `requireActionContext()` (throw if unauthenticated) → workspace-ownership
 * check (the client-supplied id is never trusted) → mutate → throw on error →
 * `revalidatePath`. RLS (0033) is the real guard; the explicit checks are
 * defence in depth and let actions fail with clean messages.
 *
 * Storage philosophy (0033): in auto mode ONLY the sample column is ever
 * persisted — graded sizes are computed live client-side and re-derived on
 * demand. The one deliberate exception is the auto→manual switch, where the
 * client sends its computed grid as a snapshot to become editable stored
 * cells (with a user confirm). Manual→auto discards every non-sample value.
 *
 * Seeded (global) templates/profiles are read-only by RLS and by the
 * `source = 'workspace'` filters here — duplicateGradingProfile is the
 * supported customisation path, mirroring `duplicateProduct`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  defaultSampleSize,
  normalizeSizeLabel,
  parseSizeRun,
  roundTo1dp,
} from "@/lib/spec-grading";
import { requireActionContext } from "@/lib/supabase/action-context";
import type { Json } from "@/types/database.types";
import type {
  GradingProfile,
  ProductSpecRow,
  SectionStatus,
  SpecFabricType,
  SpecGradeCategory,
  SpecPomSubKind,
  SpecSheetMode,
} from "@/types";

// ---- Shared schema fragments ---------------------------------------------------

const GRADE_CATEGORIES = [
  "primary_girth",
  "secondary_girth",
  "body_length",
  "limb_length",
  "small",
  "fixed",
] as const satisfies readonly SpecGradeCategory[];

const SUB_KINDS = [
  "shoulder",
  "neck",
  "cuff_opening",
  "rise",
  "strap",
  "inseam",
] as const satisfies readonly SpecPomSubKind[];

const gradeCategorySchema = z.enum(GRADE_CATEGORIES);
const subKindSchema = z.enum(SUB_KINDS).nullable();
const fabricTypeSchema = z.enum(["knit", "woven"] as const satisfies readonly SpecFabricType[]);
// Size labels come from parseSizeRun over products.size_range (max 60 chars),
// whose single-label fallback can be the whole string — the cap must match.
const sizeLabelSchema = z.string().trim().min(1).max(60);
/** Measurements are cm to 0.1 — parsed as any finite non-negative number and rounded on write. */
const measurementSchema = z.number().finite().min(0).max(10000);
/**
 * Mode-switch snapshots persist whatever the engine computed — which can dip
 * below zero when a small sample grades down a long run — so the user can
 * correct it in manual mode instead of the switch hard-failing validation.
 */
const snapshotValueSchema = z.number().finite().min(-10000).max(10000);

/**
 * Mirror of the DB sub_kind CHECK (0033): small rows must say which small
 * point they are; fixed rows may only be plain or 'inseam'; nothing else
 * carries a sub-kind.
 */
function isValidSubKind(
  gradeCategory: SpecGradeCategory,
  subKind: SpecPomSubKind | null,
): boolean {
  if (gradeCategory === "small") return subKind !== null && subKind !== "inseam";
  if (gradeCategory === "fixed") return subKind === null || subKind === "inseam";
  return subKind === null;
}

const rowShapeSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(120),
    howToMeasure: z.string().trim().max(300).nullable(),
    gradeCategory: gradeCategorySchema,
    subKind: subKindSchema,
  })
  .refine((row) => isValidSubKind(row.gradeCategory, row.subKind), {
    message: "That grade category and sub-kind combination isn't valid.",
  });

// ---- Ownership helpers -----------------------------------------------------------

type ActionCtx = Awaited<ReturnType<typeof requireActionContext>>;

/** Confirm a product lives in the caller's workspace, or throw. */
async function assertProductInWorkspace(
  supabase: ActionCtx["supabase"],
  productId: string,
  workspaceId: string,
): Promise<void> {
  const { data } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!data) throw new Error("Not found in your workspace.");
}

/** Fetch a sheet in the caller's workspace (with product id for revalidate), or throw. */
async function getSheetContext(
  supabase: ActionCtx["supabase"],
  sheetId: string,
  workspaceId: string,
) {
  const { data } = await supabase
    .from("product_spec_sheets")
    .select("*")
    .eq("id", sheetId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!data) throw new Error("Not found in your workspace.");
  return data;
}

/**
 * Recompute the Size Specifications section's status (section_key 'grading'):
 * no sheet → not_started; sheet → in_progress; complete once measurements are
 * stored AND (in auto mode) a sample size + Grading Profile are set so every
 * size column has numbers.
 */
async function recomputeSpecSectionStatus(
  supabase: ActionCtx["supabase"],
  productId: string,
  workspaceId: string,
): Promise<void> {
  const { data: sheet } = await supabase
    .from("product_spec_sheets")
    .select("id, mode, sample_size_label, grading_profile_id")
    .eq("product_id", productId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let status: SectionStatus = "not_started";
  if (sheet) {
    const { count } = await supabase
      .from("product_spec_values")
      .select("id", { count: "exact", head: true })
      .eq("sheet_id", sheet.id);
    const hasValues = (count ?? 0) > 0;
    if (sheet.mode === "manual") {
      status = hasValues ? "complete" : "in_progress";
    } else {
      status =
        hasValues && sheet.grading_profile_id && sheet.sample_size_label
          ? "complete"
          : "in_progress";
    }
  }

  await supabase
    .from("product_sections")
    .update({ status })
    .eq("product_id", productId)
    .eq("section_key", "grading");
}

/** Copy a template's POMs into product-owned sheet rows. */
async function copyTemplateRows(
  supabase: ActionCtx["supabase"],
  sheetId: string,
  workspaceId: string,
  templateId: string,
): Promise<void> {
  const { data: poms, error } = await supabase
    .from("spec_template_poms")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order");
  if (error) throw new Error(error.message);

  if (!poms || poms.length === 0) return;

  const { error: insertError } = await supabase.from("product_spec_rows").insert(
    poms.map((pom) => ({
      sheet_id: sheetId,
      workspace_id: workspaceId,
      code: pom.code,
      name: pom.name,
      how_to_measure: pom.how_to_measure,
      grade_category: pom.grade_category,
      sub_kind: pom.sub_kind,
      sort_order: pom.sort_order,
    })),
  );
  if (insertError) throw new Error(insertError.message);
}

/** Fetch a template visible to this workspace (active global or own), or throw. */
async function getVisibleTemplate(
  supabase: ActionCtx["supabase"],
  templateId: string,
  workspaceId: string,
) {
  const { data } = await supabase
    .from("spec_templates")
    .select("id, name")
    .eq("id", templateId)
    .or(
      `and(source.eq.global,is_active.eq.true),and(source.eq.workspace,workspace_id.eq.${workspaceId})`,
    )
    .single();
  if (!data) throw new Error("Spec template not found.");
  return data;
}

// ---- Spec Sheet lifecycle ----------------------------------------------------------

const createSheetSchema = z.object({
  productId: z.uuid(),
  templateId: z.uuid().nullable(),
});

/**
 * Step 1 of the journey — "Choose Spec Template" (or start blank). Creates
 * the product's sheet, copies the template's POMs into product-owned rows and
 * defaults the sample column to the middle of the product's size run.
 */
export async function createSpecSheet(
  productId: string,
  templateId: string | null,
): Promise<{ id: string }> {
  const input = createSheetSchema.parse({ productId, templateId });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: product } = await supabase
    .from("products")
    .select("id, size_range")
    .eq("id", input.productId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!product) throw new Error("Not found in your workspace.");

  const template = input.templateId
    ? await getVisibleTemplate(supabase, input.templateId, workspaceId)
    : null;

  const sampleSize = defaultSampleSize(parseSizeRun(product.size_range));

  const { data: sheet, error } = await supabase
    .from("product_spec_sheets")
    .insert({
      product_id: input.productId,
      workspace_id: workspaceId,
      template_id: template?.id ?? null,
      template_name: template?.name ?? null,
      sample_size_label: sampleSize,
    })
    .select("id")
    .single();
  if (error || !sheet) {
    throw new Error(error?.message ?? "Could not create the spec sheet.");
  }

  if (template) {
    await copyTemplateRows(supabase, sheet.id, workspaceId, template.id);
  }

  await recomputeSpecSectionStatus(supabase, input.productId, workspaceId);
  revalidatePath(`/products/${input.productId}`);
  return { id: sheet.id };
}

/**
 * "Change template" — replaces every row (values cascade away, confirmed in
 * the UI) while keeping the sheet's mode, sample size and profile.
 */
export async function changeSpecTemplate(
  sheetId: string,
  templateId: string | null,
): Promise<void> {
  const input = z
    .object({ sheetId: z.uuid(), templateId: z.uuid().nullable() })
    .parse({ sheetId, templateId });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  const template = input.templateId
    ? await getVisibleTemplate(supabase, input.templateId, workspaceId)
    : null;

  const { error: deleteError } = await supabase
    .from("product_spec_rows")
    .delete()
    .eq("sheet_id", sheet.id);
  if (deleteError) throw new Error(deleteError.message);

  const { error: updateError } = await supabase
    .from("product_spec_sheets")
    .update({
      template_id: template?.id ?? null,
      template_name: template?.name ?? null,
    })
    .eq("id", sheet.id);
  if (updateError) throw new Error(updateError.message);

  if (template) {
    await copyTemplateRows(supabase, sheet.id, workspaceId, template.id);
  }

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

/** Remove the sheet entirely (rows/values cascade) — back to step 1. */
export async function deleteSpecSheet(sheetId: string): Promise<void> {
  const input = z.object({ sheetId: z.uuid() }).parse({ sheetId });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  const { error } = await supabase
    .from("product_spec_sheets")
    .delete()
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

// ---- Sheet settings (sample size, profile, fabric) -----------------------------------

/**
 * Change which size the physical sample is. In auto mode the stored sample
 * values MOVE to the new column (the numbers were measured off the garment —
 * relabelling the sample keeps them), rather than being discarded.
 */
export async function setSpecSampleSize(
  sheetId: string,
  sampleSizeLabel: string,
): Promise<void> {
  const input = z
    .object({ sheetId: z.uuid(), sampleSizeLabel: sizeLabelSchema })
    .parse({ sheetId, sampleSizeLabel });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  if (
    sheet.mode === "auto" &&
    sheet.sample_size_label &&
    sheet.sample_size_label !== input.sampleSizeLabel
  ) {
    // Clear anything already stored at the destination label (stale
    // leftovers), then re-key the sample column onto the new label.
    const { error: clearError } = await supabase
      .from("product_spec_values")
      .delete()
      .eq("sheet_id", sheet.id)
      .eq("size_label", input.sampleSizeLabel);
    if (clearError) throw new Error(clearError.message);

    const { error: rekeyError } = await supabase
      .from("product_spec_values")
      .update({ size_label: input.sampleSizeLabel })
      .eq("sheet_id", sheet.id)
      .eq("size_label", sheet.sample_size_label);
    if (rekeyError) throw new Error(rekeyError.message);
  }

  const { error } = await supabase
    .from("product_spec_sheets")
    .update({ sample_size_label: input.sampleSizeLabel })
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${sheet.product_id}`);
}

/** Step 3 of the journey — apply a Grading Profile (null clears it). */
export async function setSpecGradingProfile(
  sheetId: string,
  profileId: string | null,
): Promise<void> {
  const input = z
    .object({ sheetId: z.uuid(), profileId: z.uuid().nullable() })
    .parse({ sheetId, profileId });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  if (input.profileId) {
    const { data: profile } = await supabase
      .from("grading_profiles")
      .select("id")
      .eq("id", input.profileId)
      .or(
        `and(source.eq.global,is_active.eq.true),and(source.eq.workspace,workspace_id.eq.${workspaceId})`,
      )
      .single();
    if (!profile) throw new Error("Grading profile not found.");
  }

  const { error } = await supabase
    .from("product_spec_sheets")
    .update({ grading_profile_id: input.profileId })
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

/** Knit/woven toggle — picks which of the profile's tolerance sets applies. */
export async function setSpecFabricType(
  sheetId: string,
  fabricType: SpecFabricType,
): Promise<void> {
  const input = z
    .object({ sheetId: z.uuid(), fabricType: fabricTypeSchema })
    .parse({ sheetId, fabricType });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  const { error } = await supabase
    .from("product_spec_sheets")
    .update({ fabric_type: input.fabricType })
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${sheet.product_id}`);
}

// ---- Mode switching -------------------------------------------------------------------

const snapshotEntrySchema = z.object({
  rowId: z.uuid(),
  sizeLabel: sizeLabelSchema,
  value: snapshotValueSchema,
});

/**
 * Auto → Manual: persist the client's computed grid as editable cells (the
 * one place computed values are ever written — the user confirmed the
 * snapshot). Manual → Auto: discard every non-sample value and recompute live
 * from the sample column (also confirmed).
 */
export async function switchSpecSheetMode(
  sheetId: string,
  mode: SpecSheetMode,
  snapshot?: { rowId: string; sizeLabel: string; value: number }[],
): Promise<void> {
  const input = z
    .object({
      sheetId: z.uuid(),
      mode: z.enum(["auto", "manual"] as const satisfies readonly SpecSheetMode[]),
      snapshot: z.array(snapshotEntrySchema).max(5000).optional(),
    })
    .parse({ sheetId, mode, snapshot });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  if (sheet.mode === input.mode) return;

  if (input.mode === "manual") {
    const entries = input.snapshot ?? [];
    if (entries.length > 0) {
      // Only rows that genuinely belong to this sheet may be written.
      const { data: rows } = await supabase
        .from("product_spec_rows")
        .select("id")
        .eq("sheet_id", sheet.id);
      const rowIds = new Set((rows ?? []).map((r) => r.id));
      const valid = entries.filter((entry) => rowIds.has(entry.rowId));

      if (valid.length > 0) {
        const { error } = await supabase.from("product_spec_values").upsert(
          valid.map((entry) => ({
            sheet_id: sheet.id,
            row_id: entry.rowId,
            workspace_id: workspaceId,
            size_label: entry.sizeLabel,
            value: roundTo1dp(entry.value),
          })),
          { onConflict: "row_id,size_label" },
        );
        if (error) throw new Error(error.message);
      }
    }
  } else {
    if (!sheet.sample_size_label) {
      throw new Error("Pick a sample size first.");
    }
    const { error } = await supabase
      .from("product_spec_values")
      .delete()
      .eq("sheet_id", sheet.id)
      .neq("size_label", sheet.sample_size_label);
    if (error) throw new Error(error.message);
  }

  const { error: modeError } = await supabase
    .from("product_spec_sheets")
    .update({ mode: input.mode })
    .eq("id", sheet.id);
  if (modeError) throw new Error(modeError.message);

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

// ---- Cell values ------------------------------------------------------------------------

/**
 * Write one cell (sample column in auto mode; any cell in manual). Null
 * clears the cell. Values round to 0.1 on write, matching the engine.
 */
export async function saveSpecValue(
  rowId: string,
  sizeLabel: string,
  value: number | null,
): Promise<void> {
  const input = z
    .object({
      rowId: z.uuid(),
      sizeLabel: sizeLabelSchema,
      value: measurementSchema.nullable(),
    })
    .parse({ rowId, sizeLabel, value });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: row } = await supabase
    .from("product_spec_rows")
    .select("id, sheet_id")
    .eq("id", input.rowId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!row) throw new Error("Not found in your workspace.");
  const sheet = await getSheetContext(supabase, row.sheet_id, workspaceId);

  // The auto-mode storage invariant: only the sample column is ever
  // persisted. Enforced here (not just by UI gating) so stray non-sample
  // rows can never appear and later be clobbered by a sample re-key or
  // mis-snapshot on a mode switch. Matching is normalized and the stored key
  // is forced to the sheet's canonical sample label, so a casing-variant
  // column label can't fragment the sample column.
  let storedLabel = input.sizeLabel;
  if (sheet.mode === "auto") {
    if (
      !sheet.sample_size_label ||
      normalizeSizeLabel(input.sizeLabel) !==
        normalizeSizeLabel(sheet.sample_size_label)
    ) {
      throw new Error("Only the sample column can be edited in auto-grade mode.");
    }
    storedLabel = sheet.sample_size_label;
  }

  if (input.value === null) {
    const { error } = await supabase
      .from("product_spec_values")
      .delete()
      .eq("row_id", input.rowId)
      .eq("size_label", storedLabel);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("product_spec_values").upsert(
      {
        sheet_id: sheet.id,
        row_id: input.rowId,
        workspace_id: workspaceId,
        size_label: storedLabel,
        value: roundTo1dp(input.value),
      },
      { onConflict: "row_id,size_label" },
    );
    if (error) throw new Error(error.message);
  }

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

// ---- Row CRUD ---------------------------------------------------------------------------

/**
 * Add a custom POM row. The code continues the sheet's POMn sequence
 * (count-then-insert, same accepted V1 tradeoff as annotation codes).
 */
export async function addSpecRow(
  sheetId: string,
  row: {
    name: string;
    howToMeasure: string | null;
    gradeCategory: SpecGradeCategory;
    subKind: SpecPomSubKind | null;
    toleranceOverride: number | null;
  },
): Promise<ProductSpecRow> {
  const input = z
    .object({
      sheetId: z.uuid(),
      row: rowShapeSchema.safeExtend({
        toleranceOverride: z.number().finite().min(0).max(100).nullable(),
      }),
    })
    .parse({ sheetId, row });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  const { data: existing } = await supabase
    .from("product_spec_rows")
    .select("code, sort_order")
    .eq("sheet_id", sheet.id);
  let maxCode = 0;
  let maxSort = 0;
  for (const r of existing ?? []) {
    const match = /^POM(\d+)$/.exec(r.code);
    if (match) maxCode = Math.max(maxCode, Number(match[1]));
    maxSort = Math.max(maxSort, r.sort_order);
  }

  const { data, error } = await supabase
    .from("product_spec_rows")
    .insert({
      sheet_id: sheet.id,
      workspace_id: workspaceId,
      code: `POM${maxCode + 1}`,
      name: input.row.name,
      how_to_measure: input.row.howToMeasure,
      grade_category: input.row.gradeCategory,
      sub_kind: input.row.subKind,
      tolerance_override: input.row.toleranceOverride,
      sort_order: maxSort + 10,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Could not add the measurement.");
  }

  revalidatePath(`/products/${sheet.product_id}`);
  return data;
}

/** Rename/retag a row; tolerance override included (null resets to profile default). */
export async function updateSpecRow(
  rowId: string,
  patch: {
    name: string;
    howToMeasure: string | null;
    gradeCategory: SpecGradeCategory;
    subKind: SpecPomSubKind | null;
    toleranceOverride: number | null;
  },
): Promise<void> {
  const input = z
    .object({
      rowId: z.uuid(),
      patch: rowShapeSchema.safeExtend({
        toleranceOverride: z.number().finite().min(0).max(100).nullable(),
      }),
    })
    .parse({ rowId, patch });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: row } = await supabase
    .from("product_spec_rows")
    .select("id, sheet_id")
    .eq("id", input.rowId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!row) throw new Error("Not found in your workspace.");
  const sheet = await getSheetContext(supabase, row.sheet_id, workspaceId);

  const { error } = await supabase
    .from("product_spec_rows")
    .update({
      name: input.patch.name,
      how_to_measure: input.patch.howToMeasure,
      grade_category: input.patch.gradeCategory,
      sub_kind: input.patch.subKind,
      tolerance_override: input.patch.toleranceOverride,
    })
    .eq("id", input.rowId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${sheet.product_id}`);
}

/** Delete a row (its values cascade). */
export async function deleteSpecRow(rowId: string): Promise<void> {
  const input = z.object({ rowId: z.uuid() }).parse({ rowId });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: row } = await supabase
    .from("product_spec_rows")
    .select("id, sheet_id")
    .eq("id", input.rowId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!row) throw new Error("Not found in your workspace.");
  const sheet = await getSheetContext(supabase, row.sheet_id, workspaceId);

  const { error } = await supabase
    .from("product_spec_rows")
    .delete()
    .eq("id", input.rowId);
  if (error) throw new Error(error.message);

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

/** Persist a drag-reorder as index-based sort_order (0-, 10-, 20-…). */
export async function reorderSpecRows(
  sheetId: string,
  rowIds: string[],
): Promise<void> {
  const input = z
    .object({ sheetId: z.uuid(), rowIds: z.array(z.uuid()).min(1).max(500) })
    .parse({ sheetId, rowIds });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  const results = await Promise.all(
    input.rowIds.map((rowId, index) =>
      supabase
        .from("product_spec_rows")
        .update({ sort_order: index * 10 })
        .eq("id", rowId)
        .eq("sheet_id", sheet.id)
        .eq("workspace_id", workspaceId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  revalidatePath(`/products/${sheet.product_id}`);
}

// ---- Grading Profile CRUD -----------------------------------------------------------------

const INCREMENT_KEYS = [
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
] as const;

const TOLERANCE_KEYS = [
  "primary_girth",
  "secondary_girth",
  "body_length",
  "limb_length",
  "small",
  "fixed",
] as const;

/**
 * Increment/tolerance payloads arrive as loose records and are filtered to
 * the known key contract here (unknown keys dropped, values must be finite
 * ≥ 0) — simpler and safer than an exhaustive record schema.
 */
function pickNumericKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of allowed) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      result[key] = value;
    }
  }
  return result;
}

const profilePayloadSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  description: z.string().trim().max(400).nullable(),
  sizeRunLabels: z.array(sizeLabelSchema).max(30),
  breakSizeLabel: sizeLabelSchema.nullable(),
  baseIncrements: z.record(z.string(), z.unknown()),
  extendedIncrements: z.record(z.string(), z.unknown()).nullable(),
  tolerancesKnit: z.record(z.string(), z.unknown()),
  tolerancesWoven: z.record(z.string(), z.unknown()),
});

type ProfilePayload = z.infer<typeof profilePayloadSchema>;

function profileColumns(payload: ProfilePayload) {
  return {
    name: payload.name,
    description: payload.description,
    size_run_labels: payload.sizeRunLabels,
    break_size_label: payload.breakSizeLabel,
    base_increments: pickNumericKeys(payload.baseIncrements, INCREMENT_KEYS) as unknown as Json,
    extended_increments: (payload.extendedIncrements
      ? pickNumericKeys(payload.extendedIncrements, INCREMENT_KEYS)
      : null) as unknown as Json,
    tolerances_knit: pickNumericKeys(payload.tolerancesKnit, TOLERANCE_KEYS) as unknown as Json,
    tolerances_woven: pickNumericKeys(payload.tolerancesWoven, TOLERANCE_KEYS) as unknown as Json,
  };
}

/**
 * Create a custom workspace Grading Profile ("Create custom" in the profile
 * picker). Returns the full row so the picker can select it immediately.
 */
export async function createGradingProfile(
  productId: string,
  payload: ProfilePayload,
): Promise<GradingProfile> {
  const input = z
    .object({ productId: z.uuid(), payload: profilePayloadSchema })
    .parse({ productId, payload });
  const { supabase, workspaceId, userId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const { data, error } = await supabase
    .from("grading_profiles")
    .insert({
      source: "workspace",
      workspace_id: workspaceId,
      created_by: userId,
      ...profileColumns(input.payload),
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Could not create the grading profile.");
  }

  revalidatePath(`/products/${input.productId}`);
  return data;
}

/**
 * Edit a WORKSPACE profile. The `source = 'workspace'` filter plus RLS
 * guarantee seeded global profiles are untouchable here even if a global id
 * is passed.
 */
export async function updateGradingProfile(
  productId: string,
  profileId: string,
  payload: ProfilePayload,
): Promise<void> {
  const input = z
    .object({
      productId: z.uuid(),
      profileId: z.uuid(),
      payload: profilePayloadSchema,
    })
    .parse({ productId, profileId, payload });
  const { supabase, workspaceId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const { error } = await supabase
    .from("grading_profiles")
    .update(profileColumns(input.payload))
    .eq("id", input.profileId)
    .eq("source", "workspace")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${input.productId}`);
}

/**
 * Delete a WORKSPACE profile. Sheets referencing it fall back to "no
 * profile" (FK on delete set null) — which un-completes their journey, so
 * every affected product's section status is recomputed, not just the
 * current page's.
 */
export async function deleteGradingProfile(
  productId: string,
  profileId: string,
): Promise<void> {
  const input = z
    .object({ productId: z.uuid(), profileId: z.uuid() })
    .parse({ productId, profileId });
  const { supabase, workspaceId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const { data: affected } = await supabase
    .from("product_spec_sheets")
    .select("product_id")
    .eq("workspace_id", workspaceId)
    .eq("grading_profile_id", input.profileId);

  const { error } = await supabase
    .from("grading_profiles")
    .delete()
    .eq("id", input.profileId)
    .eq("source", "workspace")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  for (const sheet of affected ?? []) {
    await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
    revalidatePath(`/products/${sheet.product_id}`);
  }

  revalidatePath(`/products/${input.productId}`);
}

/**
 * Duplicate-to-edit: copy any visible profile (seeded starter or workspace
 * custom) into a workspace-owned row the caller can edit — the supported way
 * to customise the read-only seeded starters. Mirrors `duplicateProduct`.
 */
export async function duplicateGradingProfile(
  productId: string,
  profileId: string,
): Promise<GradingProfile> {
  const input = z
    .object({ productId: z.uuid(), profileId: z.uuid() })
    .parse({ productId, profileId });
  const { supabase, workspaceId, userId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const { data: src } = await supabase
    .from("grading_profiles")
    .select("*")
    .eq("id", input.profileId)
    .or(
      `and(source.eq.global,is_active.eq.true),and(source.eq.workspace,workspace_id.eq.${workspaceId})`,
    )
    .single();
  if (!src) throw new Error("Grading profile not found.");

  const { data: copy, error } = await supabase
    .from("grading_profiles")
    .insert({
      source: "workspace",
      workspace_id: workspaceId,
      name: `${src.name} (copy)`,
      description: src.description,
      size_run_labels: src.size_run_labels,
      break_size_label: src.break_size_label,
      base_increments: src.base_increments,
      extended_increments: src.extended_increments,
      tolerances_knit: src.tolerances_knit,
      tolerances_woven: src.tolerances_woven,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !copy) {
    throw new Error(error?.message ?? "Could not duplicate the grading profile.");
  }

  revalidatePath(`/products/${input.productId}`);
  return copy;
}
