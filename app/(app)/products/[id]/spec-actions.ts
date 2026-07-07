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

import { normalizeSizeLabel, roundTo1dp } from "@/lib/spec-grading";
import { requireActionContext } from "@/lib/supabase/action-context";
import type { Json } from "@/types/database.types";
import type {
  GradingProfile,
  ProductSpecRow,
  SectionStatus,
  SpecDemographic,
  SpecFabricType,
  SpecGradeCategory,
  SpecPomSubKind,
  SpecSheetMode,
  SpecSizingSystem,
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

const DEMOGRAPHICS = [
  "youth",
  "mens",
  "womens",
  "custom",
] as const satisfies readonly SpecDemographic[];

const SIZING_SYSTEMS = [
  "alpha",
  "numeric",
] as const satisfies readonly SpecSizingSystem[];

const gradeCategorySchema = z.enum(GRADE_CATEGORIES);
const subKindSchema = z.enum(SUB_KINDS).nullable();
const fabricTypeSchema = z.enum(["knit", "woven"] as const satisfies readonly SpecFabricType[]);
const demographicSchema = z.enum(DEMOGRAPHICS);
const sizingSystemSchema = z.enum(SIZING_SYSTEMS);
// Size labels: alpha ladders, numeric sizes, or free-entry custom labels. The
// cap is generous so an oddly named custom label still fits.
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
 * Recompute the Size Specifications section's status (section_key 'grading')
 * across the product's LIST of Spec Sheets (0037 — a product now holds many):
 * no sheets → not_started; every sheet marked complete → complete; otherwise
 * in_progress. A sheet's own `is_complete` flag (set by "Mark complete", gated
 * on having real data — see setSpecComplete) is the per-sheet truth, so the
 * section rolls those up rather than re-deriving each sheet's completeness here.
 */
async function recomputeSpecSectionStatus(
  supabase: ActionCtx["supabase"],
  productId: string,
  workspaceId: string,
): Promise<void> {
  const { data: sheets } = await supabase
    .from("product_spec_sheets")
    .select("id, is_complete")
    .eq("product_id", productId)
    .eq("workspace_id", workspaceId);

  let status: SectionStatus = "not_started";
  if (sheets && sheets.length > 0) {
    status = sheets.every((s) => s.is_complete) ? "complete" : "in_progress";
  }

  await supabase
    .from("product_sections")
    .update({ status })
    .eq("product_id", productId)
    .eq("section_key", "grading");
}

/**
 * Delete a sheet's stored values whose size label falls OUTSIDE the given
 * allowed set (normalized). Used when the size run shrinks or the sample set
 * changes so orphaned columns can't linger. Fetch-then-delete-by-id keeps the
 * normalized comparison in one place (no injection-prone label filter strings).
 */
async function pruneValuesOutsideLabels(
  supabase: ActionCtx["supabase"],
  sheetId: string,
  allowedLabels: readonly string[],
): Promise<void> {
  const allowed = new Set(allowedLabels.map((l) => normalizeSizeLabel(l)));
  const { data: values } = await supabase
    .from("product_spec_values")
    .select("id, size_label")
    .eq("sheet_id", sheetId);
  const staleIds = (values ?? [])
    .filter((v) => !allowed.has(normalizeSizeLabel(v.size_label)))
    .map((v) => v.id);
  if (staleIds.length === 0) return;
  const { error } = await supabase
    .from("product_spec_values")
    .delete()
    .in("id", staleIds);
  if (error) throw new Error(error.message);
}

/**
 * Dedupe size labels by normalized form, preserving first-seen order and the
 * user's original spelling. Shared by the size-run and sample-size writers so a
 * "XXL" + "2XL" pair can't split a column.
 */
function dedupeSizeLabels(labels: readonly string[]): string[] {
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
 * Step 1 of the journey — "Choose Spec Template" (or start blank), creating
 * ANOTHER Spec Sheet for the product (0037 — a product holds a list of them).
 * Copies the template's POMs into product-owned rows. The sheet is
 * self-contained: its size run, demographic and sample sizes are chosen later
 * in the flow (steps 2–3), NOT inherited from the product — so it starts with
 * an empty run. `name` seeds from the template so the section list has
 * something to show before the demographic is picked.
 */
export async function createSpecSheet(
  productId: string,
  templateId: string | null,
): Promise<{ id: string }> {
  const input = createSheetSchema.parse({ productId, templateId });
  const { supabase, workspaceId } = await requireActionContext();

  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const template = input.templateId
    ? await getVisibleTemplate(supabase, input.templateId, workspaceId)
    : null;

  const { data: sheet, error } = await supabase
    .from("product_spec_sheets")
    .insert({
      product_id: input.productId,
      workspace_id: workspaceId,
      template_id: template?.id ?? null,
      template_name: template?.name ?? null,
      name: template?.name ?? null,
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

// ---- Step 2/3: size run + sample sizes ---------------------------------------

const setSizeRunSchema = z.object({
  sheetId: z.uuid(),
  demographic: demographicSchema,
  sizingSystem: sizingSystemSchema,
  sizeRun: z.array(sizeLabelSchema).max(40),
});

/**
 * Step 2 — "Choose the size range". Stores the sheet's demographic, sizing
 * system and the ticked size run. The run is deduped by normalized label so a
 * casing/synonym variant can't create two columns for one size. Sample sizes
 * are pruned to those still in the run, and any stored values for now-absent
 * columns are dropped so removing a size can't strand orphan cells.
 */
export async function setSpecSizeRun(
  sheetId: string,
  input: {
    demographic: SpecDemographic;
    sizingSystem: SpecSizingSystem;
    sizeRun: string[];
  },
): Promise<void> {
  const parsed = setSizeRunSchema.parse({ sheetId, ...input });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, parsed.sheetId, workspaceId);

  const sizeRun = dedupeSizeLabels(parsed.sizeRun);
  const runKeys = new Set(sizeRun.map((l) => normalizeSizeLabel(l)));
  const nextSamples = (sheet.sample_sizes ?? []).filter((s) =>
    runKeys.has(normalizeSizeLabel(s)),
  );

  const { error } = await supabase
    .from("product_spec_sheets")
    .update({
      demographic: parsed.demographic,
      sizing_system: parsed.sizingSystem,
      size_run: sizeRun,
      sample_sizes: nextSamples,
      sample_size_label: nextSamples[0] ?? null,
      // Changing the columns re-opens the sheet — re-confirm to complete again.
      is_complete: false,
    })
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  await pruneValuesOutsideLabels(supabase, sheet.id, sizeRun);
  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

const setSampleSizesSchema = z.object({
  sheetId: z.uuid(),
  sampleSizes: z.array(sizeLabelSchema).min(0).max(2),
});

/**
 * Step 3 — "Select the sample size(s)". One or two sizes physically sampled,
 * both a subset of the run; the FIRST is the grading anchor (mirrored into
 * `sample_size_label`, which the engine and the auto-mode storage invariant
 * read). In auto mode a pure single→single relabel MOVES the measured column
 * to its new label (the numbers were taken off the garment — relabelling keeps
 * them); any other change prunes stored values down to the new sample set (auto
 * mode only ever stores sample columns).
 */
export async function setSpecSampleSizes(
  sheetId: string,
  sampleSizes: string[],
): Promise<void> {
  const parsed = setSampleSizesSchema.parse({ sheetId, sampleSizes });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, parsed.sheetId, workspaceId);

  const runKeys = new Set((sheet.size_run ?? []).map((l) => normalizeSizeLabel(l)));
  const next = dedupeSizeLabels(parsed.sampleSizes).filter((s) =>
    runKeys.has(normalizeSizeLabel(s)),
  );
  const prev = sheet.sample_sizes ?? [];

  if (sheet.mode === "auto") {
    const singleRelabel =
      prev.length === 1 &&
      next.length === 1 &&
      normalizeSizeLabel(prev[0]) !== normalizeSizeLabel(next[0]);
    if (singleRelabel) {
      // Clear anything already at the destination, then re-key the measured
      // column onto the new label.
      const { error: clearError } = await supabase
        .from("product_spec_values")
        .delete()
        .eq("sheet_id", sheet.id)
        .eq("size_label", next[0]);
      if (clearError) throw new Error(clearError.message);
      const { error: rekeyError } = await supabase
        .from("product_spec_values")
        .update({ size_label: next[0] })
        .eq("sheet_id", sheet.id)
        .eq("size_label", prev[0]);
      if (rekeyError) throw new Error(rekeyError.message);
    } else {
      await pruneValuesOutsideLabels(supabase, sheet.id, next);
    }
  }

  const { error } = await supabase
    .from("product_spec_sheets")
    .update({
      sample_sizes: next,
      sample_size_label: next[0] ?? null,
      is_complete: false,
    })
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

// ---- Sheet name + completion -------------------------------------------------

/** Rename a sheet (the label shown in the section's Spec Sheet list). */
export async function renameSpecSheet(
  sheetId: string,
  name: string,
): Promise<void> {
  const input = z
    .object({ sheetId: z.uuid(), name: z.string().trim().min(1).max(80) })
    .parse({ sheetId, name });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  const { error } = await supabase
    .from("product_spec_sheets")
    .update({ name: input.name })
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${sheet.product_id}`);
}

/**
 * Step 7 — "Mark complete" (or re-open). Marking complete is gated on the sheet
 * actually being finished: a size run, at least one stored measurement, and
 * either manual mode or (auto) a sample anchor + a Grading Profile so every
 * column has numbers. Un-completing is always allowed.
 */
export async function setSpecComplete(
  sheetId: string,
  isComplete: boolean,
): Promise<void> {
  const input = z
    .object({ sheetId: z.uuid(), isComplete: z.boolean() })
    .parse({ sheetId, isComplete });
  const { supabase, workspaceId } = await requireActionContext();
  const sheet = await getSheetContext(supabase, input.sheetId, workspaceId);

  if (input.isComplete) {
    const { count } = await supabase
      .from("product_spec_values")
      .select("id", { count: "exact", head: true })
      .eq("sheet_id", sheet.id);
    const hasValues = (count ?? 0) > 0;
    const hasRun = (sheet.size_run ?? []).length > 0;
    const gradingReady =
      sheet.mode === "manual" ||
      (!!sheet.sample_size_label && !!sheet.grading_profile_id);
    if (!hasRun || !hasValues || !gradingReady) {
      throw new Error("Finish the sheet before marking it complete.");
    }
  }

  const { error } = await supabase
    .from("product_spec_sheets")
    .update({ is_complete: input.isComplete })
    .eq("id", sheet.id);
  if (error) throw new Error(error.message);

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
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
      // A fresh set of measurement rows re-opens the sheet.
      is_complete: false,
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

// ---- Sheet settings (profile, fabric) ------------------------------------------------

/** Step 5 of the journey — apply a Grading Profile (null clears it). */
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
    const sampleSizes = sheet.sample_sizes ?? [];
    if (sampleSizes.length === 0) {
      throw new Error("Pick a sample size first.");
    }
    // Discard every non-sample value; the sample column(s) are re-graded live.
    await pruneValuesOutsideLabels(supabase, sheet.id, sampleSizes);
  }

  const { error: modeError } = await supabase
    .from("product_spec_sheets")
    .update({ mode: input.mode, is_complete: false })
    .eq("id", sheet.id);
  if (modeError) throw new Error(modeError.message);

  await recomputeSpecSectionStatus(supabase, sheet.product_id, workspaceId);
  revalidatePath(`/products/${sheet.product_id}`);
}

// ---- Cell values ------------------------------------------------------------------------

/**
 * Write one cell (a sample column in auto mode; any cell in manual). Null
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

  // The auto-mode storage invariant: only the SAMPLE column(s) are ever
  // persisted (1–2 of them since 0037). Enforced here (not just by UI gating)
  // so stray non-sample rows can never appear and later be clobbered by a
  // sample re-key or mis-snapshot on a mode switch. Matching is normalized and
  // the stored key is forced to the sheet's canonical sample label, so a
  // casing-variant column label can't fragment a sample column.
  let storedLabel = input.sizeLabel;
  if (sheet.mode === "auto") {
    const canonical = (sheet.sample_sizes ?? []).find(
      (s) => normalizeSizeLabel(s) === normalizeSizeLabel(input.sizeLabel),
    );
    if (!canonical) {
      throw new Error(
        "Only the sample column(s) can be edited in auto-grade mode.",
      );
    }
    storedLabel = canonical;
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
    .select("id, product_id")
    .eq("workspace_id", workspaceId)
    .eq("grading_profile_id", input.profileId);

  const { error } = await supabase
    .from("grading_profiles")
    .delete()
    .eq("id", input.profileId)
    .eq("source", "workspace")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  // The FK set-null leaves those auto sheets ungradeable, so re-open them
  // (drop is_complete) before rolling the affected sections' status back up.
  const affectedIds = (affected ?? []).map((s) => s.id);
  if (affectedIds.length > 0) {
    await supabase
      .from("product_spec_sheets")
      .update({ is_complete: false })
      .in("id", affectedIds);
  }

  const affectedProducts = new Set((affected ?? []).map((s) => s.product_id));
  for (const affectedProductId of affectedProducts) {
    await recomputeSpecSectionStatus(supabase, affectedProductId, workspaceId);
    revalidatePath(`/products/${affectedProductId}`);
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
