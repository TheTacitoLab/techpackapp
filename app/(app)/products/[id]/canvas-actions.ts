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
import { LAYER_PREFIX, type CanvasLayerType } from "@/types";

// ---- Shared input fragments -------------------------------------------------
// `layer_type` is validated against the canonical 12 keys of LAYER_PREFIX so the
// zod enum and the reference-code prefixes can never drift apart.
const LAYER_TYPES = Object.keys(LAYER_PREFIX) as [
  CanvasLayerType,
  ...CanvasLayerType[],
];
const layerTypeSchema = z.enum(LAYER_TYPES);
const pinTypeSchema = z.enum(["point", "line"]);
const templateSchema = z.enum(["single", "split", "quad"]);
const dataSchema = z.record(z.string(), z.unknown());
const fraction = z.number().min(0).max(1); // 0.0–1.0 slot-relative coordinate
const idSchema = z.object({ id: z.uuid() });

const SLOT_COUNT: Record<z.infer<typeof templateSchema>, number> = {
  single: 1,
  split: 2,
  quad: 4,
};

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
): Promise<{ productId: string }> {
  // The generated Database type has no FK `Relationships` metadata for these
  // tables (confirmed against types/database.types.ts — every table lists
  // `Relationships: []`), so postgrest-js can't infer the embedded shape and
  // types it as a SelectQueryError even though the join is valid at the DB
  // level (FK confirmed in supabase/migrations/0013_canvas_schema.sql:
  // canvas_slots.page_id -> canvas_pages.id). overrideTypes corrects the
  // inferred shape without touching runtime behaviour.
  const { data } = await supabase
    .from("canvas_slots")
    .select("id, canvas_pages!inner(product_id, workspace_id)")
    .eq("id", slotId)
    .eq("canvas_pages.workspace_id", workspaceId)
    .single()
    .overrideTypes<
      { id: string; canvas_pages: { product_id: string; workspace_id: string } },
      { merge: false }
    >();
  if (!data) throw new Error("Not found in your workspace.");

  return { productId: data.canvas_pages.product_id };
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
  template: "single" | "split" | "quad",
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

  const { error } = await supabase
    .from("canvas_slots")
    .update({ asset_id: input.assetId, crop_x: 0, crop_y: 0, zoom: 1, is_locked: false })
    .eq("id", input.slotId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

const framingSchema = z.object({
  slotId: z.uuid(),
  cropX: z.number(),
  cropY: z.number(),
  zoom: z.number().positive(),
});

/** Persist pan/zoom while framing. Called debounced (~400ms) from the client. */
export async function updateSlotFraming(
  slotId: string,
  cropX: number,
  cropY: number,
  zoom: number,
): Promise<void> {
  const input = framingSchema.parse({ slotId, cropX, cropY, zoom });
  const { supabase, workspaceId } = await requireActionContext();
  const { productId } = await getSlotContext(supabase, input.slotId, workspaceId);

  const { error } = await supabase
    .from("canvas_slots")
    .update({ crop_x: input.cropX, crop_y: input.cropY, zoom: input.zoom })
    .eq("id", input.slotId);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

/** Lock/unlock shared by the two exported actions below. */
async function setSlotLock(slotId: string, locked: boolean): Promise<void> {
  const { slotId: id } = z.object({ slotId: z.uuid() }).parse({ slotId });
  const { supabase, workspaceId } = await requireActionContext();
  const { productId } = await getSlotContext(supabase, id, workspaceId);

  const { error } = await supabase
    .from("canvas_slots")
    .update({ is_locked: locked })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/products/${productId}`);
}

export async function lockSlot(slotId: string): Promise<void> {
  await setSlotLock(slotId, true);
}

/** Unlocks a slot to re-frame; existing annotations are NOT deleted. */
export async function unlockSlot(slotId: string): Promise<void> {
  await setSlotLock(slotId, false);
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
  const { productId } = await getSlotContext(supabase, input.slotId, workspaceId);
  console.timeEnd("[createAnnotation] getSlotContext (slot+page, 1 query)");

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
