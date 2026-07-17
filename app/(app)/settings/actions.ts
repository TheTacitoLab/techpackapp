"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ANNOTATION_LAYERS,
  type LayerColourOverrides,
  type LayerKey,
} from "@/components/canvas/layers";
import { requireActionContext } from "@/lib/supabase/action-context";
import type { LibraryCategory, LibraryItem } from "@/types";

const HEX = /^#[0-9A-Fa-f]{6}$/;

const labelSchema = z.object({
  name: z.string().trim().min(1, "Enter a label name.").max(30),
  color: z.string().regex(HEX, "Choose a valid hex colour."),
});

// ---- Labels ------------------------------------------------------------------

export async function createLabel(name: string, color: string) {
  const { name: cleanName, color: cleanColor } = labelSchema.parse({
    name,
    color,
  });
  const { supabase, workspaceId } = await requireActionContext();
  const { data, error } = await supabase
    .from("labels")
    .insert({
      workspace_id: workspaceId,
      name: cleanName,
      color: cleanColor,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create label.");

  revalidatePath("/settings");
  revalidatePath("/products");
  revalidatePath("/collections");
  return { id: data.id };
}

export async function updateLabel(id: string, name: string, color: string) {
  const { name: cleanName, color: cleanColor } = labelSchema.parse({
    name,
    color,
  });
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("labels")
    .update({ name: cleanName, color: cleanColor })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/products");
  revalidatePath("/collections");
}

export async function deleteLabel(id: string) {
  const { supabase, workspaceId } = await requireActionContext();
  // product_labels and collection_labels rows cascade-delete via the FKs on labels.
  const { error } = await supabase
    .from("labels")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/products");
  revalidatePath("/collections");
}

// ---- Per-user preferences ------------------------------------------------------

/**
 * Set the current user's "hide the unlock-with-annotations warning" preference
 * (profiles.preferences.hide_unlock_warning). Read-merge-write on the caller's
 * OWN profile row — RLS (`profiles_update_self`) enforces the scoping; other
 * preference keys are preserved.
 */
export async function setHideUnlockWarning(hidden: boolean) {
  const clean = z.boolean().parse(hidden);
  const { supabase, userId } = await requireActionContext();

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .single();
  const raw = profile?.preferences;
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  const { error } = await supabase
    .from("profiles")
    .update({ preferences: { ...base, hide_unlock_warning: clean } })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  // The (app) layout reads the profile for the preferences provider.
  revalidatePath("/", "layout");
}

// ---- Layer marker colours ------------------------------------------------------

// Derived from ANNOTATION_LAYERS so a future layer can never silently be a
// missing key here (the tuple cast is for z.enum, which wants a literal list).
const LAYER_KEYS = ANNOTATION_LAYERS.map((l) => l.key) as [
  LayerKey,
  ...LayerKey[],
];

// Partial on purpose: only overridden layers carry a key; a missing key means
// "built-in default". The map REPLACES the stored one wholesale (tiny, always
// saved together), so resetting a layer is just saving a map without its key.
const layerColoursSchema = z.partialRecord(
  z.enum(LAYER_KEYS),
  z.string().regex(HEX, "Choose a valid hex colour."),
);

/**
 * Replace the workspace's per-layer marker colour overrides. Goes through the
 * `update_layer_colours` SECURITY DEFINER function (scoped to
 * auth_workspace_id(), column-only) because RLS lets only the workspace OWNER
 * update `workspaces` rows directly, while marker colours are a member-level
 * preference — same trust level as labels. Revalidates the whole app: the
 * colours appear on every product's canvas and in Settings.
 */
export async function updateLayerColours(colours: LayerColourOverrides) {
  const clean = layerColoursSchema.parse(colours);
  const { supabase } = await requireActionContext();
  const { error } = await supabase.rpc("update_layer_colours", {
    colours: clean,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}

// ---- Product ↔ label assignment ----------------------------------------------

/** Confirms both the product and the label live in the caller's workspace. */
async function assertOwnership(
  supabase: Awaited<ReturnType<typeof requireActionContext>>["supabase"],
  workspaceId: string,
  productId: string,
  labelId: string,
) {
  const [{ data: product }, { data: label }] = await Promise.all([
    supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("labels")
      .select("id")
      .eq("id", labelId)
      .eq("workspace_id", workspaceId)
      .single(),
  ]);
  if (!product || !label) throw new Error("Not found in your workspace.");
}

export async function addLabelToProduct(productId: string, labelId: string) {
  const { supabase, workspaceId } = await requireActionContext();
  await assertOwnership(supabase, workspaceId, productId, labelId);

  const { error } = await supabase
    .from("product_labels")
    .insert({ product_id: productId, label_id: labelId });
  // Ignore unique-violation: assigning a label twice is a harmless no-op.
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
}

export async function removeLabelFromProduct(
  productId: string,
  labelId: string,
) {
  const { supabase, workspaceId } = await requireActionContext();
  await assertOwnership(supabase, workspaceId, productId, labelId);

  const { error } = await supabase
    .from("product_labels")
    .delete()
    .eq("product_id", productId)
    .eq("label_id", labelId);
  if (error) throw new Error(error.message);

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
}

// ---- Collection ↔ label assignment ---------------------------------------------
// Same vocabulary, same pattern: collections are tagged with the workspace
// `labels` managed in Settings, via `collection_labels` (0042) mirroring
// `product_labels`.

/** Confirms both the collection and the label live in the caller's workspace. */
async function assertCollectionLabelOwnership(
  supabase: Awaited<ReturnType<typeof requireActionContext>>["supabase"],
  workspaceId: string,
  collectionId: string,
  labelId: string,
) {
  const [{ data: collection }, { data: label }] = await Promise.all([
    supabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("labels")
      .select("id")
      .eq("id", labelId)
      .eq("workspace_id", workspaceId)
      .single(),
  ]);
  if (!collection || !label) throw new Error("Not found in your workspace.");
}

export async function addLabelToCollection(
  collectionId: string,
  labelId: string,
) {
  const { supabase, workspaceId } = await requireActionContext();
  await assertCollectionLabelOwnership(
    supabase,
    workspaceId,
    collectionId,
    labelId,
  );

  const { error } = await supabase
    .from("collection_labels")
    .insert({ collection_id: collectionId, label_id: labelId });
  // Ignore unique-violation: assigning a label twice is a harmless no-op.
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath("/collections");
  revalidatePath(`/collections/${collectionId}`);
}

export async function removeLabelFromCollection(
  collectionId: string,
  labelId: string,
) {
  const { supabase, workspaceId } = await requireActionContext();
  await assertCollectionLabelOwnership(
    supabase,
    workspaceId,
    collectionId,
    labelId,
  );

  const { error } = await supabase
    .from("collection_labels")
    .delete()
    .eq("collection_id", collectionId)
    .eq("label_id", labelId);
  if (error) throw new Error(error.message);

  revalidatePath("/collections");
  revalidatePath(`/collections/${collectionId}`);
}

// ---- Master Library ----------------------------------------------------------

const LIBRARY_CATEGORIES = [
  "fabric",
  "trim",
  "fastener",
  "elastic",
  "stitch_type",
  "thread",
  "label_type",
  "embellishment",
  "packaging",
  "interlining",
] as const satisfies readonly LibraryCategory[];

const libraryItemSchema = z.object({
  category: z.enum(LIBRARY_CATEGORIES),
  name: z.string().trim().min(1, "Enter a name.").max(80),
  description: z.string().trim().max(300).optional().default(""),
  // Free-form, category-specific key/values. Kept as a record so each category
  // can carry its own field set without a per-category schema.
  properties: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Create a WORKSPACE library item — the one creation path for both the
 * Settings Master Library form and the annotation editors' inline quick-add
 * (`library-quick-add-form.tsx`). Returns the full inserted row so the inline
 * flow can auto-select the new item immediately, without waiting for the
 * route refresh to deliver the refreshed library.
 */
export async function createLibraryItem(
  category: LibraryCategory,
  name: string,
  description: string,
  properties: Record<string, unknown>,
): Promise<LibraryItem> {
  const parsed = libraryItemSchema.parse({
    category,
    name,
    description,
    properties,
  });
  const { supabase, workspaceId, userId } = await requireActionContext();
  const { data, error } = await supabase
    .from("library_items")
    .insert({
      category: parsed.category,
      source: "workspace",
      workspace_id: workspaceId,
      name: parsed.name,
      description: parsed.description || null,
      properties: parsed.properties as never,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not create library item.");

  revalidatePath("/settings");
  return data;
}

const libraryUpdateSchema = libraryItemSchema.omit({ category: true });

export async function updateLibraryItem(
  id: string,
  name: string,
  description: string,
  properties: Record<string, unknown>,
) {
  const parsed = libraryUpdateSchema.parse({ name, description, properties });
  const { supabase, workspaceId } = await requireActionContext();
  // The `source = 'workspace'` filter plus RLS guarantee global items are
  // untouchable here even if a global id is passed.
  const { error } = await supabase
    .from("library_items")
    .update({
      name: parsed.name,
      description: parsed.description || null,
      properties: parsed.properties as never,
    })
    .eq("id", id)
    .eq("source", "workspace")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function deleteLibraryItem(id: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("library_items")
    .delete()
    .eq("id", id)
    .eq("source", "workspace")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

/**
 * Star or unstar a library item for the active workspace. Both global and
 * workspace items can be starred; the favourite is per-WORKSPACE (a row in
 * `library_favourites`), so the whole team shares one starred set. Verifies
 * the item is actually visible to this workspace (an active global item or
 * one of its own) before writing — RLS scopes the favourites row itself.
 * Starring inserts (duplicate = harmless no-op), unstarring deletes.
 */
export async function toggleFavouriteItem(
  libraryItemId: string,
  favourite: boolean,
) {
  const id = z.string().min(1).parse(libraryItemId);
  const clean = z.boolean().parse(favourite);
  const { supabase, workspaceId } = await requireActionContext();

  const { data: item } = await supabase
    .from("library_items")
    .select("id, source, workspace_id, is_active")
    .eq("id", id)
    .single();
  const visible =
    item &&
    (item.source === "global"
      ? item.is_active
      : item.workspace_id === workspaceId);
  if (!visible) throw new Error("Not found in your library.");

  if (clean) {
    const { error } = await supabase.from("library_favourites").insert({
      workspace_id: workspaceId,
      library_item_id: id,
    });
    // Ignore unique-violation: starring twice is a harmless no-op.
    if (error && error.code !== "23505") throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("library_favourites")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("library_item_id", id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/settings");
}

/**
 * Hide or show a GLOBAL item for the active workspace. Upserts the toggle row on
 * the unique (workspace_id, library_item_id): `hidden = true` removes the global
 * item from the resolved library; `hidden = false` restores it (the row is kept
 * so the choice is explicit and re-runs stay idempotent).
 */
export async function toggleGlobalItem(libraryItemId: string, hidden: boolean) {
  const id = z.string().min(1).parse(libraryItemId);
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("workspace_library_toggles")
    .upsert(
      {
        workspace_id: workspaceId,
        library_item_id: id,
        hidden,
      },
      { onConflict: "workspace_id,library_item_id" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}
