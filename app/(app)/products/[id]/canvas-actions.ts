"use server";

/**
 * Canvas server actions — Phase 4a data layer for the three sections that share
 * one canvas system (Design & Colourways, Measurements & Fit, Construction
 * Details).
 *
 * ── FILE-UPLOAD PATTERN (important) ──────────────────────────────────────────
 * The binary image upload does NOT pass through a server action: server actions
 * have a ~4 MB request-body limit that breaks real image uploads. Instead the
 * BROWSER uploads the file straight to Supabase Storage using the browser
 * Supabase client (bucket `product-assets`, object key
 * `{workspace_id}/{product_id}/{timestamp}_{filename}`). Once that resolves, the
 * client calls `uploadAssetMetadata` with the resulting path + URL to record the
 * `product_assets` row. Everything else here is small JSON and goes through these
 * actions normally.
 *
 * Every action follows the house pattern: zod-parse inputs →
 * `requireActionContext()` (throw if unauthenticated) → workspace-ownership
 * check (the client-supplied id is never trusted) → mutate → throw on error →
 * `revalidatePath`. RLS (0014) is the real guard; the explicit checks are
 * defence in depth and let actions fail with clean messages.
 *
 * `requireActionContext()` (not `getCurrentUser()`) is the auth preamble here
 * deliberately: these actions only ever scope queries by `workspaceId` (never
 * read the full workspace row), so the lean 2-round-trip helper is a strict
 * win over the 3-round-trip one pages use for rendering.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActionContext } from "@/lib/supabase/action-context";
import type { Json } from "@/types/database.types";
import {
  LAYER_PREFIX,
  MAX_ANNOTATIONS_PER_PAGE,
  PAGE_ANNOTATION_LIMIT_MESSAGE,
  RETIRED_LAYER_TYPES,
  TEMPLATE_SLOT_COUNT,
  type CanvasColourway,
  type CanvasLayerType,
  type CanvasTemplate,
  type ColourwayAnnotationData,
} from "@/types";

// ---- Shared input fragments -------------------------------------------------
// `layer_type` is validated against the keys of LAYER_PREFIX so the zod enum
// and the reference-code prefixes can never drift apart — minus the retired
// types (hardware/elastic, absorbed into `trim` + `data.trim_kind` in 0023),
// which still exist in the DB enum but must not gain new pins.
const LAYER_TYPES = (Object.keys(LAYER_PREFIX) as CanvasLayerType[]).filter(
  (t) => !RETIRED_LAYER_TYPES.includes(t),
) as [CanvasLayerType, ...CanvasLayerType[]];
const layerTypeSchema = z.enum(LAYER_TYPES);
const pinTypeSchema = z.enum(["point", "line"]);
const templateSchema = z.enum(["single", "split", "triple", "quad"]);
const dataSchema = z.record(z.string(), z.unknown());
const fraction = z.number().min(0).max(1); // 0.0–1.0 slot-relative coordinate
const idSchema = z.object({ id: z.uuid() });

// Slot count per template — the shared source of truth (single=1, split=2,
// triple=3, quad=4), imported so page creation and the layout never drift.
const SLOT_COUNT = TEMPLATE_SLOT_COUNT;

// ---- Internal helpers (NOT exported — keeps the action surface minimal) ------

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

/**
 * Resolve a slot to its product, verifying the page is in the caller's
 * workspace. Slots carry no workspace_id of their own — they inherit it via the
 * parent page (matching the RLS in 0014). Single round-trip via PostgREST's
 * embedded-resource filter (same pattern as the reference-code count query),
 * replacing the old slot-id -> page-id sequence.
 */
async function getSlotContext(
  supabase: ActionCtx["supabase"],
  slotId: string,
  workspaceId: string,
): Promise<{ productId: string; pageId: string }> {
  // The generated Database type has no FK `Relationships` metadata for these
  // tables (confirmed against types/database.types.ts — every table lists
  // `Relationships: []`), so postgrest-js can't infer the embedded shape and
  // types it as a SelectQueryError even though the join is valid at the DB
  // level (FK confirmed in supabase/migrations/0013_canvas_schema.sql:
  // canvas_slots.page_id -> canvas_pages.id). overrideTypes corrects the
  // inferred shape without touching runtime behaviour. `page_id` is a plain
  // column on canvas_slots (no join needed) — carried out for the per-page
  // annotation-cap count.
  const { data } = await supabase
    .from("canvas_slots")
    .select("id, page_id, canvas_pages!inner(product_id, workspace_id)")
    .eq("id", slotId)
    .eq("canvas_pages.workspace_id", workspaceId)
    .single()
    .overrideTypes<
      {
        id: string;
        page_id: string;
        canvas_pages: { product_id: string; workspace_id: string };
      },
      { merge: false }
    >();
  if (!data) throw new Error("Not found in your workspace.");

  return { productId: data.canvas_pages.product_id, pageId: data.page_id };
}

/**
 * Enforce the per-page annotation cap (authoritative, defence-in-depth beyond
 * the client's friendly counter): count annotations across ALL slots of the
 * page — every layer_type and both pin types — and reject a new one at the
 * cap. Deleting a pin frees a slot again immediately; editing/moving never
 * routes through here. Pages already over the cap (legacy data) are tolerated —
 * this only blocks ADDING beyond it.
 */
async function assertPageUnderAnnotationCap(
  supabase: ActionCtx["supabase"],
  pageId: string,
  workspaceId: string,
): Promise<void> {
  const { count } = await supabase
    .from("canvas_annotations")
    .select("id, canvas_slots!inner(page_id)", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("canvas_slots.page_id", pageId);
  if ((count ?? 0) >= MAX_ANNOTATIONS_PER_PAGE) {
    throw new Error(PAGE_ANNOTATION_LIMIT_MESSAGE);
  }
}

// ============================================================================
// Assets
// ============================================================================

const uploadAssetSchema = z.object({
  productId: z.uuid(),
  filePath: z.string().trim().min(1),
  fileUrl: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

/**
 * Record a `product_assets` row AFTER the client has uploaded the binary to
 * Storage (see the file-upload note at the top of this file).
 */
export async function uploadAssetMetadata(
  productId: string,
  filePath: string,
  fileUrl: string,
  name: string,
  width: number | null,
  height: number | null,
): Promise<{ id: string }> {
  const input = uploadAssetSchema.parse({
    productId,
    filePath,
    fileUrl,
    name,
    width,
    height,
  });
  const { supabase, workspaceId, userId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const { data, error } = await supabase
    .from("product_assets")
    .insert({
      product_id: input.productId,
      workspace_id: workspaceId,
      name: input.name,
      file_path: input.filePath,
      file_url: input.fileUrl,
      width: input.width,
      height: input.height,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save asset.");

  revalidatePath(`/products/${input.productId}`);
  return { id: data.id };
}

const renameAssetSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
});

export async function renameAsset(id: string, name: string): Promise<void> {
  const input = renameAssetSchema.parse({ id, name });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: asset } = await supabase
    .from("product_assets")
    .select("id, product_id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!asset) throw new Error("Not found in your workspace.");

  const { error } = await supabase
    .from("product_assets")
    .update({ name: input.name })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${asset.product_id}`);
}

/**
 * Delete an asset from `product_assets` AND from Storage. Slots referencing it
 * have asset_id set null by the FK (ON DELETE SET NULL), so deletion never
 * blocks — but if the asset fills any LOCKED slot we return a warning so the UI
 * can confirm before the user loses framing/annotations tied to that image.
 */
export async function deleteAsset(id: string): Promise<{ warning?: string }> {
  const input = idSchema.parse({ id });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: asset } = await supabase
    .from("product_assets")
    .select("id, product_id, file_path")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!asset) throw new Error("Not found in your workspace.");

  const { count: lockedCount } = await supabase
    .from("canvas_slots")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", input.id)
    .eq("is_locked", true);

  const { error } = await supabase
    .from("product_assets")
    .delete()
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  // Storage cleanup is best-effort: the DB row (the source of truth) is already
  // gone, so a stale object must not fail the action.
  await supabase.storage.from("product-assets").remove([asset.file_path]);

  revalidatePath(`/products/${asset.product_id}`);
  return (lockedCount ?? 0) > 0
    ? { warning: "This asset is used in locked slots." }
    : {};
}

const setHeroSchema = z.object({
  productId: z.uuid(),
  assetId: z.uuid().nullable(),
});

/**
 * Choose the product's hero image — the exported PDF's cover picture. One per
 * product by construction (`products.hero_asset_id`, migration 0032): setting
 * a new hero replaces the previous one in the same single-column update;
 * `assetId: null` clears it (the cover then falls back to the first filled
 * slot's image). The asset must belong to THIS product — a hero from another
 * product's library is rejected even within the same workspace.
 */
export async function setProductHeroAsset(
  productId: string,
  assetId: string | null,
): Promise<void> {
  const input = setHeroSchema.parse({ productId, assetId });
  const { supabase, workspaceId } = await requireActionContext();

  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  if (input.assetId !== null) {
    const { data: asset } = await supabase
      .from("product_assets")
      .select("id")
      .eq("id", input.assetId)
      .eq("product_id", input.productId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!asset) throw new Error("Not found in your workspace.");
  }

  const { error } = await supabase
    .from("products")
    .update({ hero_asset_id: input.assetId })
    .eq("id", input.productId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${input.productId}`);
}

// ============================================================================
// Pages
// ============================================================================

const createPageSchema = z.object({
  productId: z.uuid(),
  template: templateSchema,
});

/**
 * Create a canvas page and its empty slots in one go (single=1, split=2,
 * quad=4; slot_index 0…n-1). The page is appended after the current last page.
 */
export async function createCanvasPage(
  productId: string,
  template: CanvasTemplate,
): Promise<{ id: string }> {
  const input = createPageSchema.parse({ productId, template });
  const { supabase, workspaceId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const { data: last } = await supabase
    .from("canvas_pages")
    .select("sort_order")
    .eq("product_id", input.productId)
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = last && last.length > 0 ? last[0].sort_order + 1 : 0;

  const { data: page, error } = await supabase
    .from("canvas_pages")
    .insert({
      product_id: input.productId,
      workspace_id: workspaceId,
      template: input.template,
      sort_order: nextSort,
    })
    .select("id")
    .single();
  if (error || !page) throw new Error(error?.message ?? "Failed to create page.");

  const slots = Array.from({ length: SLOT_COUNT[input.template] }, (_, i) => ({
    page_id: page.id,
    slot_index: i,
  }));
  const { error: slotError } = await supabase.from("canvas_slots").insert(slots);
  if (slotError) throw new Error(slotError.message);

  revalidatePath(`/products/${input.productId}`);
  return { id: page.id };
}

/**
 * Duplicate a canvas page onto a fresh annotation surface: same template, the
 * label suffixed " (copy)", the page notes carried over (context travels with
 * the drawing), and every slot cloned with its asset + framing + fit mode +
 * lock state + frozen lock dimensions. Deliberately copies NO annotations —
 * the whole point is the same garment, ready to be annotated anew. Appended
 * after the product's last page. Returns the new page id.
 */
export async function duplicateCanvasPage(
  pageId: string,
): Promise<{ id: string }> {
  const input = z.object({ pageId: z.uuid() }).parse({ pageId });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: page } = await supabase
    .from("canvas_pages")
    .select("id, product_id, template, label, notes")
    .eq("id", input.pageId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!page) throw new Error("Not found in your workspace.");

  const { data: slots, error: slotsError } = await supabase
    .from("canvas_slots")
    .select(
      "slot_index, asset_id, crop_x, crop_y, zoom, fit_mode, is_locked, lock_width, lock_height",
    )
    .eq("page_id", input.pageId)
    .order("slot_index", { ascending: true });
  if (slotsError) throw new Error(slotsError.message);

  const { data: last } = await supabase
    .from("canvas_pages")
    .select("sort_order")
    .eq("product_id", page.product_id)
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = last && last.length > 0 ? last[0].sort_order + 1 : 0;

  // A named page becomes "{name} (copy)" (clamped to the rename limit); an
  // unnamed page stays null so the copy shows its own "Page N" default rather
  // than freezing a positional number into a label.
  const copyLabel = page.label ? `${page.label} (copy)`.slice(0, 60) : null;

  const { data: newPage, error } = await supabase
    .from("canvas_pages")
    .insert({
      product_id: page.product_id,
      workspace_id: workspaceId,
      template: page.template,
      label: copyLabel,
      notes: page.notes,
      sort_order: nextSort,
    })
    .select("id")
    .single();
  if (error || !newPage) {
    throw new Error(error?.message ?? "Failed to duplicate page.");
  }

  if (slots && slots.length > 0) {
    const { error: insertError } = await supabase.from("canvas_slots").insert(
      slots.map((slot) => ({
        page_id: newPage.id,
        slot_index: slot.slot_index,
        asset_id: slot.asset_id,
        crop_x: slot.crop_x,
        crop_y: slot.crop_y,
        zoom: slot.zoom,
        fit_mode: slot.fit_mode,
        is_locked: slot.is_locked,
        lock_width: slot.lock_width,
        lock_height: slot.lock_height,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath(`/products/${page.product_id}`);
  return { id: newPage.id };
}

export async function deleteCanvasPage(id: string): Promise<void> {
  const input = idSchema.parse({ id });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: page } = await supabase
    .from("canvas_pages")
    .select("id, product_id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!page) throw new Error("Not found in your workspace.");

  // Cascades to canvas_slots → canvas_annotations.
  const { error } = await supabase
    .from("canvas_pages")
    .delete()
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${page.product_id}`);
}

const renamePageSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().max(60),
});

/** Rename a canvas page. An empty label clears back to the "Page N" default. */
export async function renameCanvasPage(
  id: string,
  label: string,
): Promise<void> {
  const input = renamePageSchema.parse({ id, label });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: page } = await supabase
    .from("canvas_pages")
    .select("id, product_id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!page) throw new Error("Not found in your workspace.");

  const { error } = await supabase
    .from("canvas_pages")
    .update({ label: input.label.length > 0 ? input.label : null })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${page.product_id}`);
}

const updatePageNotesSchema = z.object({
  pageId: z.uuid(),
  notes: z.string().trim().max(2000),
});

/**
 * Save a canvas page's notes — rendered in the PDF export's "PAGE NOTES" box
 * on every layer-page of that canvas page. Empty text clears back to null
 * (the ruled box on the PDF renders either way).
 */
export async function updateCanvasPageNotes(
  pageId: string,
  notes: string,
): Promise<void> {
  const input = updatePageNotesSchema.parse({ pageId, notes });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: page } = await supabase
    .from("canvas_pages")
    .select("id, product_id")
    .eq("id", input.pageId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!page) throw new Error("Not found in your workspace.");

  const { error } = await supabase
    .from("canvas_pages")
    .update({ notes: input.notes.length > 0 ? input.notes : null })
    .eq("id", input.pageId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${page.product_id}`);
}

const reorderSchema = z.object({
  productId: z.uuid(),
  orderedIds: z.array(z.uuid()),
});

/**
 * Persist a new page order. Each page's sort_order becomes its index in
 * `orderedIds`; updates are scoped to the product + workspace so a foreign id
 * in the array silently affects nothing.
 */
export async function reorderCanvasPages(
  productId: string,
  orderedIds: string[],
): Promise<void> {
  const input = reorderSchema.parse({ productId, orderedIds });
  const { supabase, workspaceId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const results = await Promise.all(
    input.orderedIds.map((pageId, index) =>
      supabase
        .from("canvas_pages")
        .update({ sort_order: index })
        .eq("id", pageId)
        .eq("product_id", input.productId)
        .eq("workspace_id", workspaceId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  revalidatePath(`/products/${input.productId}`);
}

// ============================================================================
// Slots
// ============================================================================

const fillSlotSchema = z.object({ slotId: z.uuid(), assetId: z.uuid() });

/** Drop an asset into a slot, resetting framing and unlocking it. */
export async function fillSlot(slotId: string, assetId: string): Promise<void> {
  const input = fillSlotSchema.parse({ slotId, assetId });
  const { supabase, workspaceId } = await requireActionContext();
  const { productId } = await getSlotContext(supabase, input.slotId, workspaceId);

  const { data: asset } = await supabase
    .from("product_assets")
    .select("id")
    .eq("id", input.assetId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!asset) throw new Error("Asset not found in your workspace.");

  // Fresh placements default to FIT — for garment work, seeing the whole
  // image (letterboxed, never chopped) is the right starting point. Existing
  // slots are untouched: the column default is 'fill', so nothing already
  // framed shifts by even a pixel. Lock dims clear with the lock itself —
  // they describe the previous image's frozen framing, not this one.
  const { error } = await supabase
    .from("canvas_slots")
    .update({
      asset_id: input.assetId,
      crop_x: 0,
      crop_y: 0,
      zoom: 1,
      fit_mode: "fit",
      is_locked: false,
      lock_width: null,
      lock_height: null,
    })
    .eq("id", input.slotId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

const updateSlotNameSchema = z.object({
  slotId: z.uuid(),
  name: z.string().trim().max(60),
});

/**
 * Rename a slot ("Front", "Back neck"). Shown as the slot's box label on the
 * PDF and the callout column's per-slot group header. An empty name clears
 * back to null (falls back to the asset name, then "Slot N").
 */
export async function updateSlotName(
  slotId: string,
  name: string,
): Promise<void> {
  const input = updateSlotNameSchema.parse({ slotId, name });
  const { supabase, workspaceId } = await requireActionContext();
  const { productId } = await getSlotContext(supabase, input.slotId, workspaceId);

  const { error } = await supabase
    .from("canvas_slots")
    .update({ name: input.name.length > 0 ? input.name : null })
    .eq("id", input.slotId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

const framingSchema = z.object({
  slotId: z.uuid(),
  cropX: z.number(),
  cropY: z.number(),
  zoom: z.number().positive(),
  fitMode: z.enum(["fill", "fit"]),
});

/** Persist pan/zoom/fit while framing. Called debounced (~400ms) from the client. */
export async function updateSlotFraming(
  slotId: string,
  cropX: number,
  cropY: number,
  zoom: number,
  fitMode: "fill" | "fit",
): Promise<void> {
  const input = framingSchema.parse({ slotId, cropX, cropY, zoom, fitMode });
  const { supabase, workspaceId } = await requireActionContext();
  const { productId } = await getSlotContext(supabase, input.slotId, workspaceId);

  const { error } = await supabase
    .from("canvas_slots")
    .update({
      crop_x: input.cropX,
      crop_y: input.cropY,
      zoom: input.zoom,
      fit_mode: input.fitMode,
    })
    .eq("id", input.slotId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

const lockSlotSchema = z.object({
  slotId: z.uuid(),
  lockWidth: z.number().positive(),
  lockHeight: z.number().positive(),
});

/**
 * Lock a slot for annotating, capturing its CURRENT local rendered size (px)
 * as the frozen design-space box. The framing pan (`crop_x/crop_y`) was
 * authored in exactly this coordinate space, and every annotation fraction
 * will be laid out in it too — the locked renderer draws image + pins inside
 * a fixed `lock_width × lock_height` box and uniformly scales the whole box
 * to the live container, so the two can never drift apart on resize.
 */
export async function lockSlot(
  slotId: string,
  lockWidth: number,
  lockHeight: number,
): Promise<void> {
  const input = lockSlotSchema.parse({ slotId, lockWidth, lockHeight });
  const { supabase, workspaceId } = await requireActionContext();
  const { productId } = await getSlotContext(supabase, input.slotId, workspaceId);

  const { error } = await supabase
    .from("canvas_slots")
    .update({
      is_locked: true,
      lock_width: input.lockWidth,
      lock_height: input.lockHeight,
    })
    .eq("id", input.slotId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

/**
 * Unlocks a slot to re-frame; existing annotations are NOT deleted. The lock
 * dimensions are cleared — they are only meaningful for the framing frozen at
 * lock time, and re-locking captures a fresh pair.
 */
export async function unlockSlot(slotId: string): Promise<void> {
  const { slotId: id } = z.object({ slotId: z.uuid() }).parse({ slotId });
  const { supabase, workspaceId } = await requireActionContext();
  const { productId } = await getSlotContext(supabase, id, workspaceId);

  const { error } = await supabase
    .from("canvas_slots")
    .update({ is_locked: false, lock_width: null, lock_height: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

// ============================================================================
// Annotations
// ============================================================================

const createAnnotationSchema = z.object({
  slotId: z.uuid(),
  layerType: layerTypeSchema,
  x: fraction,
  y: fraction,
  pinType: pinTypeSchema,
  endX: fraction.nullable().optional(),
  endY: fraction.nullable().optional(),
  data: dataSchema.optional(),
});

/**
 * Place a pin and auto-assign its `reference_code`. The code is the layer prefix
 * (F/T/H/…) plus the next number for that layer across EVERY slot on EVERY page
 * of the product, so codes are globally unique per product (F1, F2, T1…) and
 * line up with the BOM. The count+1 scheme is intentionally simple and not
 * concurrency-safe; two simultaneous same-layer creates could collide, which is
 * acceptable for V1 (a later phase can move this into a DB sequence/trigger).
 */
export async function createAnnotation(
  slotId: string,
  layerType: string,
  x: number,
  y: number,
  pinType: "point" | "line",
  endX?: number | null,
  endY?: number | null,
  data?: Record<string, unknown>,
): Promise<{ id: string; referenceCode: string }> {
  console.time("[createAnnotation] TOTAL");
  const input = createAnnotationSchema.parse({
    slotId,
    layerType,
    x,
    y,
    pinType,
    endX,
    endY,
    data,
  });

  // 2 round-trips: auth.getUser() + single-column profiles query.
  console.time("[createAnnotation] requireActionContext (auth + profile)");
  const { supabase, workspaceId, userId } = await requireActionContext();
  console.timeEnd("[createAnnotation] requireActionContext (auth + profile)");

  // 1 round-trip: collapsed slot->page embedded-filter query.
  console.time("[createAnnotation] getSlotContext (slot+page, 1 query)");
  const { productId, pageId } = await getSlotContext(
    supabase,
    input.slotId,
    workspaceId,
  );
  console.timeEnd("[createAnnotation] getSlotContext (slot+page, 1 query)");

  // Authoritative per-page cap — before allocating a code or inserting.
  await assertPageUnderAnnotationCap(supabase, pageId, workspaceId);

  // Single round-trip: join canvas_annotations -> canvas_slots -> canvas_pages
  // via PostgREST's embedded-resource filter syntax and count matches scoped to
  // this product, replacing the old page-ids -> slot-ids -> count sequence.
  console.time("[createAnnotation] reference-code count query");
  const { count } = await supabase
    .from("canvas_annotations")
    .select("id, canvas_slots!inner(canvas_pages!inner(product_id))", {
      count: "exact",
      head: true,
    })
    .eq("workspace_id", workspaceId)
    .eq("layer_type", input.layerType)
    .eq("canvas_slots.canvas_pages.product_id", productId);
  console.timeEnd("[createAnnotation] reference-code count query");
  const referenceCode = `${LAYER_PREFIX[input.layerType]}${(count ?? 0) + 1}`;

  console.time("[createAnnotation] insert query");
  const { data: row, error } = await supabase
    .from("canvas_annotations")
    .insert({
      slot_id: input.slotId,
      workspace_id: workspaceId,
      layer_type: input.layerType,
      reference_code: referenceCode,
      x: input.x,
      y: input.y,
      pin_type: input.pinType,
      end_x: input.endX ?? null,
      end_y: input.endY ?? null,
      data: (input.data ?? {}) as unknown as Json,
      created_by: userId,
    })
    .select("id")
    .single();
  console.timeEnd("[createAnnotation] insert query");
  if (error || !row) {
    console.timeEnd("[createAnnotation] TOTAL");
    throw new Error(error?.message ?? "Failed to create annotation.");
  }

  revalidatePath(`/products/${productId}`);
  console.timeEnd("[createAnnotation] TOTAL");
  // Best case: 2 (auth + profile) + 1 (slot+page) + 1 (reference-code count)
  // + 1 (insert) = 5 round-trips, down from up to 7 before this fix.
  console.log(
    "[createAnnotation] round-trips: 2 (requireActionContext) + 1 (getSlotContext) + 1 (count) + 1 (insert) = 5",
  );
  return { id: row.id, referenceCode };
}

const updateAnnotationSchema = z.object({ id: z.uuid(), data: dataSchema });

/**
 * Edit a pin's `data` payload. Merged onto the existing jsonb (same philosophy
 * as the identity section): keys the caller omits survive; explicit nulls clear.
 */
export async function updateAnnotation(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const input = updateAnnotationSchema.parse({ id, data });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: annotation } = await supabase
    .from("canvas_annotations")
    .select("id, slot_id, data")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!annotation) throw new Error("Not found in your workspace.");

  const { productId } = await getSlotContext(
    supabase,
    annotation.slot_id,
    workspaceId,
  );

  const existing = (annotation.data as Record<string, unknown> | null) ?? {};
  const merged = { ...existing, ...input.data };

  const { error } = await supabase
    .from("canvas_annotations")
    .update({ data: merged as unknown as Json })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

const moveAnnotationSchema = z.object({
  id: z.uuid(),
  x: fraction,
  y: fraction,
  endX: fraction.nullable().optional(),
  endY: fraction.nullable().optional(),
});

/** Reposition a pin (point: x/y; line: x/y start + end_x/end_y end). */
export async function moveAnnotation(
  id: string,
  x: number,
  y: number,
  endX?: number | null,
  endY?: number | null,
): Promise<void> {
  const input = moveAnnotationSchema.parse({ id, x, y, endX, endY });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: annotation } = await supabase
    .from("canvas_annotations")
    .select("id, slot_id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!annotation) throw new Error("Not found in your workspace.");

  const { productId } = await getSlotContext(
    supabase,
    annotation.slot_id,
    workspaceId,
  );

  const { error } = await supabase
    .from("canvas_annotations")
    .update({
      x: input.x,
      y: input.y,
      end_x: input.endX ?? null,
      end_y: input.endY ?? null,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

// Badge offsets are slot-relative fractions like x/y, but signed: the badge is
// normally ABOVE the tip (negative y) and can sit either side of it (±x). null
// on either resets that axis to the default position directly above the tip.
const offsetFraction = z.number().min(-1).max(1);
const updateLabelOffsetSchema = z.object({
  id: z.uuid(),
  offsetX: offsetFraction.nullable(),
  offsetY: offsetFraction.nullable(),
});

/**
 * Move only a pin's reference-code BADGE relative to its tip — a pure
 * rendering/geometry concern, kept separate from `updateAnnotation`'s business
 * `data`. `null`/`null` resets the badge to its default position above the tip.
 */
export async function updateLabelOffset(
  id: string,
  offsetX: number | null,
  offsetY: number | null,
): Promise<void> {
  const input = updateLabelOffsetSchema.parse({ id, offsetX, offsetY });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: annotation } = await supabase
    .from("canvas_annotations")
    .select("id, slot_id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!annotation) throw new Error("Not found in your workspace.");

  const { productId } = await getSlotContext(
    supabase,
    annotation.slot_id,
    workspaceId,
  );

  const { error } = await supabase
    .from("canvas_annotations")
    .update({ label_offset_x: input.offsetX, label_offset_y: input.offsetY })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const input = idSchema.parse({ id });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: annotation } = await supabase
    .from("canvas_annotations")
    .select("id, slot_id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!annotation) throw new Error("Not found in your workspace.");

  const { productId } = await getSlotContext(
    supabase,
    annotation.slot_id,
    workspaceId,
  );

  const { error } = await supabase
    .from("canvas_annotations")
    .delete()
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

// ============================================================================
// Colourways
// ============================================================================
//
// Colourways are the ONE layer that doesn't use the shared LAYER_PREFIX +
// product-wide counter. A product owns multiple named colourways, each with a
// stable `sequence_number`; a colourway pin's reference code is two-level —
// `C{sequence_number}.{n}` where n counts pins WITHIN that colourway. This is a
// deliberately separate code path from `createAnnotation`; do not fold them
// together. Colourway assignment is fixed at creation (immutable), so there is
// intentionally no action to change a pin's `colourway_id` — only rename the
// colourway (which never touches sequence_number or any reference code).

const colourwayDataSchema = z.object({
  colour_name: z.string().nullable(),
  hex: z.string().nullable(),
  pantone: z.string().nullable(),
  notes: z.string().nullable(),
});

const createColourwaySchema = z.object({
  productId: z.uuid(),
  name: z.string().trim().max(60).optional(),
});

/**
 * Create a new named colourway for a product. `sequence_number` is the count of
 * existing colourways + 1 (stable forever), and the name defaults to
 * "Colourway N" when omitted. Returns the full row so the client can drop it
 * straight into its optimistic colourway list.
 */
export async function createColourway(
  productId: string,
  name?: string,
): Promise<CanvasColourway> {
  const input = createColourwaySchema.parse({ productId, name });
  const { supabase, workspaceId } = await requireActionContext();
  await assertProductInWorkspace(supabase, input.productId, workspaceId);

  const { count } = await supabase
    .from("canvas_colourways")
    .select("id", { count: "exact", head: true })
    .eq("product_id", input.productId)
    .eq("workspace_id", workspaceId);

  const sequenceNumber = (count ?? 0) + 1;
  const finalName = input.name && input.name.length > 0 ? input.name : `Colourway ${sequenceNumber}`;

  const { data: row, error } = await supabase
    .from("canvas_colourways")
    .insert({
      product_id: input.productId,
      workspace_id: workspaceId,
      name: finalName,
      sequence_number: sequenceNumber,
    })
    .select("*")
    .single();
  if (error || !row) {
    throw new Error(error?.message ?? "Failed to create colourway.");
  }

  revalidatePath(`/products/${input.productId}`);
  return row;
}

const renameColourwaySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
});

/**
 * Rename a colourway. Renaming ONLY — `sequence_number` and every pin's
 * reference code are deliberately untouched (renaming "Colourway 1" to "Navy"
 * doesn't renumber anything).
 */
export async function renameColourway(id: string, name: string): Promise<void> {
  const input = renameColourwaySchema.parse({ id, name });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: colourway } = await supabase
    .from("canvas_colourways")
    .select("id, product_id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!colourway) throw new Error("Not found in your workspace.");

  const { error } = await supabase
    .from("canvas_colourways")
    .update({ name: input.name })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${colourway.product_id}`);
}

const createColourwayAnnotationSchema = z.object({
  slotId: z.uuid(),
  x: fraction,
  y: fraction,
  colourwayId: z.uuid().nullable(),
  data: colourwayDataSchema,
});

/**
 * Place a colourway pin with a two-level reference code. Separate from
 * `createAnnotation` on purpose (see the section header). `colourwayId` null
 * means "use the product's most-recent colourway, or auto-create Colourway 1 if
 * none exists yet" — so the first colour pin on a product is zero-extra-steps.
 * Returns the resolved colourway row so the client can add it to local state
 * whether it was pre-existing or just auto-created.
 */
export async function createColourwayAnnotation(
  slotId: string,
  x: number,
  y: number,
  colourwayId: string | null,
  data: ColourwayAnnotationData,
): Promise<{ id: string; referenceCode: string; colourway: CanvasColourway }> {
  const input = createColourwayAnnotationSchema.parse({
    slotId,
    x,
    y,
    colourwayId,
    data,
  });
  const { supabase, workspaceId, userId } = await requireActionContext();
  const { productId, pageId } = await getSlotContext(
    supabase,
    input.slotId,
    workspaceId,
  );

  // Authoritative per-page cap — before resolving/auto-creating a colourway so
  // a blocked pin never leaves a stray "Colourway 1" behind.
  await assertPageUnderAnnotationCap(supabase, pageId, workspaceId);

  // Resolve the target colourway (explicit → most-recent → auto-create).
  let colourway: CanvasColourway;
  if (input.colourwayId) {
    const { data: found } = await supabase
      .from("canvas_colourways")
      .select("*")
      .eq("id", input.colourwayId)
      .eq("product_id", productId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!found) throw new Error("Colourway not found in your workspace.");
    colourway = found;
  } else {
    const { data: recent } = await supabase
      .from("canvas_colourways")
      .select("*")
      .eq("product_id", productId)
      .eq("workspace_id", workspaceId)
      .order("sequence_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) {
      colourway = recent;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("canvas_colourways")
        .insert({
          product_id: productId,
          workspace_id: workspaceId,
          name: "Colourway 1",
          sequence_number: 1,
        })
        .select("*")
        .single();
      if (createErr || !created) {
        throw new Error(createErr?.message ?? "Failed to create colourway.");
      }
      colourway = created;
    }
  }

  // Two-level code: count pins already in THIS colourway (colourway_id already
  // scopes to one product, so no product join is needed — workspace_id guards).
  const { count } = await supabase
    .from("canvas_annotations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("colourway_id", colourway.id);
  const referenceCode = `C${colourway.sequence_number}.${(count ?? 0) + 1}`;

  const { data: row, error } = await supabase
    .from("canvas_annotations")
    .insert({
      slot_id: input.slotId,
      workspace_id: workspaceId,
      layer_type: "colourway",
      colourway_id: colourway.id,
      reference_code: referenceCode,
      x: input.x,
      y: input.y,
      pin_type: "point",
      data: input.data as unknown as Json,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !row) {
    throw new Error(error?.message ?? "Failed to create colourway pin.");
  }

  revalidatePath(`/products/${productId}`);
  return { id: row.id, referenceCode, colourway };
}
