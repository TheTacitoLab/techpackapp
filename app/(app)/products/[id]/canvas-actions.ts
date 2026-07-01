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
 * Every action follows the house pattern from `actions.ts`: zod-parse inputs →
 * `getCurrentUser()` (throw if null) → `createClient()` → workspace-ownership
 * check (the client-supplied id is never trusted) → mutate → throw on error →
 * `revalidatePath`. RLS (0014) is the real guard; the explicit checks are
 * defence in depth and let actions fail with clean messages.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
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

type ActionCtx = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workspaceId: string;
  userId: string;
};

/** House auth preamble: getCurrentUser() (throw if null) + a server client. */
async function requireCtx(): Promise<ActionCtx> {
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");
  const supabase = await createClient();
  return { supabase, workspaceId: ctx.profile.workspace_id, userId: ctx.user.id };
}

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
 * Resolve a slot to its page + product, verifying the page is in the caller's
 * workspace. Slots carry no workspace_id of their own — they inherit it via the
 * parent page (matching the RLS in 0014).
 */
async function getSlotContext(
  supabase: ActionCtx["supabase"],
  slotId: string,
  workspaceId: string,
): Promise<{ pageId: string; productId: string }> {
  const { data: slot } = await supabase
    .from("canvas_slots")
    .select("page_id")
    .eq("id", slotId)
    .single();
  if (!slot) throw new Error("Slot not found in your workspace.");

  const { data: page } = await supabase
    .from("canvas_pages")
    .select("id, product_id")
    .eq("id", slot.page_id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!page) throw new Error("Not found in your workspace.");

  return { pageId: page.id, productId: page.product_id };
}

/**
 * Every slot id across every page of a product — the universe the per-product
 * reference-code counter ranges over (and a handy primitive for future
 * product-wide canvas queries). Two cheap round-trips: page ids, then slot ids.
 */
async function getProductSlotIds(
  supabase: ActionCtx["supabase"],
  productId: string,
  workspaceId: string,
): Promise<string[]> {
  const { data: pages } = await supabase
    .from("canvas_pages")
    .select("id")
    .eq("product_id", productId)
    .eq("workspace_id", workspaceId);

  const pageIds = (pages ?? []).map((p) => p.id);
  if (pageIds.length === 0) return [];

  const { data: slots } = await supabase
    .from("canvas_slots")
    .select("id")
    .in("page_id", pageIds);

  return (slots ?? []).map((s) => s.id);
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
  const { supabase, workspaceId, userId } = await requireCtx();
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
  const { supabase, workspaceId } = await requireCtx();

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
  const { supabase, workspaceId } = await requireCtx();

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
  const { supabase, workspaceId } = await requireCtx();
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
  const { supabase, workspaceId } = await requireCtx();

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
  const { supabase, workspaceId } = await requireCtx();
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
  const { supabase, workspaceId } = await requireCtx();
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
  const { supabase, workspaceId } = await requireCtx();
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
  const { supabase, workspaceId } = await requireCtx();
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
  const { supabase, workspaceId, userId } = await requireCtx();
  const { productId } = await getSlotContext(supabase, input.slotId, workspaceId);

  const slotIds = await getProductSlotIds(supabase, productId, workspaceId);
  const { count } = await supabase
    .from("canvas_annotations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("layer_type", input.layerType)
    .in("slot_id", slotIds.length > 0 ? slotIds : [input.slotId]);
  const referenceCode = `${LAYER_PREFIX[input.layerType]}${(count ?? 0) + 1}`;

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
  if (error || !row) {
    throw new Error(error?.message ?? "Failed to create annotation.");
  }

  revalidatePath(`/products/${productId}`);
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
  const { supabase, workspaceId } = await requireCtx();

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
  const { supabase, workspaceId } = await requireCtx();

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
  const { supabase, workspaceId } = await requireCtx();

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
