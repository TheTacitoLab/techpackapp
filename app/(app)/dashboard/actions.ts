"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActionContext } from "@/lib/supabase/action-context";
import type { ProductStatus } from "@/types";

const createProductSchema = z.object({
  name: z.string().min(1),
  style_number: z.string().optional(),
  brand_id: z.string().uuid().optional(),
  collection_id: z.string().uuid().optional(),
});

export type CreateProductInput = z.input<typeof createProductSchema>;

export async function createProduct(input: CreateProductInput) {
  const { name, style_number, brand_id, collection_id } =
    createProductSchema.parse(input);

  const { supabase, workspaceId } = await requireActionContext();

  const trimmedStyle = style_number?.trim();
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      workspace_id: workspaceId,
      name,
      style_number: trimmedStyle ? trimmedStyle : null,
      brand_id: brand_id ?? null,
      collection_id: collection_id ?? null,
    })
    .select("id")
    .single();

  if (error || !product) {
    throw new Error(error?.message ?? "Could not create product.");
  }

  const { data: templates, error: templatesError } = await supabase
    .from("section_templates")
    .select("key, default_sort_order")
    .eq("is_default", true);

  if (templatesError) throw new Error(templatesError.message);

  if (templates && templates.length > 0) {
    const rows = templates.map((t) => ({
      product_id: product.id,
      section_key: t.key,
      sort_order: t.default_sort_order,
    }));
    const { error: sectionsError } = await supabase
      .from("product_sections")
      .insert(rows);
    if (sectionsError) throw new Error(sectionsError.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/products");
  return { id: product.id };
}

// ---- Hierarchy CRUD ----------------------------------------------------------

const brandSchema = z.object({ name: z.string().min(1) });
const seasonSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
});
const collectionSchema = z.object({
  name: z.string().min(1),
  brand_id: z.string().uuid(),
  season_id: z.string().uuid().optional(),
});

export async function createBrand(input: z.input<typeof brandSchema>) {
  const { name } = brandSchema.parse(input);
  const { supabase, workspaceId } = await requireActionContext();
  const { data, error } = await supabase
    .from("brands")
    .insert({ workspace_id: workspaceId, name })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create brand.");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  return { id: data.id };
}

export async function renameBrand(id: string, name: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("brands")
    .update({ name })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function deleteBrand(id: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("brands")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function createSeason(input: z.input<typeof seasonSchema>) {
  const { name, year } = seasonSchema.parse(input);
  const { supabase, workspaceId } = await requireActionContext();
  const { data, error } = await supabase
    .from("seasons")
    .insert({ workspace_id: workspaceId, name, year })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create season.");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  return { id: data.id };
}

export async function renameSeason(id: string, name: string, year: number) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("seasons")
    .update({ name, year })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function deleteSeason(id: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("seasons")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function createCollection(
  input: z.input<typeof collectionSchema>,
) {
  const { name, brand_id, season_id } = collectionSchema.parse(input);
  const { supabase, workspaceId } = await requireActionContext();
  const { data, error } = await supabase
    .from("collections")
    .insert({
      workspace_id: workspaceId,
      name,
      brand_id,
      season_id: season_id ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not create collection.");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  return { id: data.id };
}

export async function renameCollection(id: string, name: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("collections")
    .update({ name })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function deleteCollection(id: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

// ---- Product quick-actions ---------------------------------------------------

export async function duplicateProduct(id: string) {
  const { supabase, workspaceId } = await requireActionContext();

  const { data: src, error: fetchErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (fetchErr || !src) throw new Error("Product not found.");

  const { data: copy, error: copyErr } = await supabase
    .from("products")
    .insert({
      workspace_id: src.workspace_id,
      brand_id: src.brand_id,
      collection_id: src.collection_id,
      name: `${src.name} (copy)`,
      style_number: null,
      category: src.category,
      gender: src.gender,
      size_range: src.size_range,
      status: "draft",
    })
    .select("id")
    .single();
  if (copyErr || !copy) throw new Error("Could not duplicate product.");

  const { data: srcSections } = await supabase
    .from("product_sections")
    .select("*")
    .eq("product_id", id);

  if (srcSections && srcSections.length > 0) {
    const rows = srcSections.map((s) => ({
      product_id: copy.id,
      section_key: s.section_key,
      status: s.status,
      sort_order: s.sort_order,
      is_enabled: s.is_enabled,
      data: s.data,
    }));
    await supabase.from("product_sections").insert(rows);
  }

  revalidatePath("/dashboard");
  revalidatePath("/products");
  return { id: copy.id };
}

export async function archiveProduct(id: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("products")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function unarchiveProduct(id: string) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("products")
    .update({ archived_at: null })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

export async function updateProductStatus(id: string, status: ProductStatus) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("products")
    .update({ status })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
}
