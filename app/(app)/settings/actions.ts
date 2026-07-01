"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { LibraryCategory } from "@/types";

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
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labels")
    .insert({
      workspace_id: ctx.profile.workspace_id,
      name: cleanName,
      color: cleanColor,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create label.");

  revalidatePath("/settings");
  revalidatePath("/products");
  return { id: data.id };
}

export async function updateLabel(id: string, name: string, color: string) {
  const { name: cleanName, color: cleanColor } = labelSchema.parse({
    name,
    color,
  });
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("labels")
    .update({ name: cleanName, color: cleanColor })
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/products");
}

export async function deleteLabel(id: string) {
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  // product_labels rows cascade-delete via the FK on labels.
  const { error } = await supabase
    .from("labels")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/products");
}

// ---- Product ↔ label assignment ----------------------------------------------

/** Confirms both the product and the label live in the caller's workspace. */
async function assertOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  await assertOwnership(supabase, ctx.profile.workspace_id, productId, labelId);

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
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  await assertOwnership(supabase, ctx.profile.workspace_id, productId, labelId);

  const { error } = await supabase
    .from("product_labels")
    .delete()
    .eq("product_id", productId)
    .eq("label_id", labelId);
  if (error) throw new Error(error.message);

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
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
  "print_type",
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

export async function createLibraryItem(
  category: LibraryCategory,
  name: string,
  description: string,
  properties: Record<string, unknown>,
) {
  const parsed = libraryItemSchema.parse({
    category,
    name,
    description,
    properties,
  });
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_items")
    .insert({
      category: parsed.category,
      source: "workspace",
      workspace_id: ctx.profile.workspace_id,
      name: parsed.name,
      description: parsed.description || null,
      properties: parsed.properties as never,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not create library item.");

  revalidatePath("/settings");
  return { id: data.id };
}

const libraryUpdateSchema = libraryItemSchema.omit({ category: true });

export async function updateLibraryItem(
  id: string,
  name: string,
  description: string,
  properties: Record<string, unknown>,
) {
  const parsed = libraryUpdateSchema.parse({ name, description, properties });
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
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
    .eq("workspace_id", ctx.profile.workspace_id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function deleteLibraryItem(id: string) {
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("library_items")
    .delete()
    .eq("id", id)
    .eq("source", "workspace")
    .eq("workspace_id", ctx.profile.workspace_id);
  if (error) throw new Error(error.message);

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
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_library_toggles")
    .upsert(
      {
        workspace_id: ctx.profile.workspace_id,
        library_item_id: id,
        hidden,
      },
      { onConflict: "workspace_id,library_item_id" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}
