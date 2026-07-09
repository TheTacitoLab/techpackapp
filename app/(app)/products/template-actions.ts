"use server";

/**
 * Product template actions — create templates (blank or by cloning a
 * product), manage them, and create products from them.
 *
 * A template IS a product (`products.is_template = true`, migration 0040):
 * it opens in the full product editor, and both directions of the feature
 * are DEEP copies via `lib/product-copy.ts` — a template and the products
 * made from it never share rows or Storage files, so deleting one can never
 * affect the other.
 *
 * Same action pattern as canvas-actions.ts: zod-parse → requireActionContext
 * → explicit workspace-ownership check → mutate → revalidatePath.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logChange } from "@/lib/change-log";
import {
  FULL_SECTION_MASK,
  copyProductDeep,
  type CopySectionMask,
} from "@/lib/product-copy";
import {
  COMPLETABLE_SECTION_KEYS,
  recomputeSectionStatus,
} from "@/lib/section-status";
import { requireActionContext } from "@/lib/supabase/action-context";

const sectionMaskSchema = z.object({
  productSetup: z.boolean(),
  technicalDrawings: z.boolean(),
  sizeSpecifications: z.boolean(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  sourceProductId: z.uuid().optional(),
  sections: sectionMaskSchema.optional(),
});

export type CreateTemplateInput = z.input<typeof createTemplateSchema>;

/**
 * Create a template: blank (no source — built up in the editor exactly like
 * a product) or a section-masked deep copy of an existing product. Templates
 * keep the source's brand for display scoping but carry no collection —
 * they're usable workspace-wide.
 */
export async function createTemplate(input: CreateTemplateInput) {
  const { name, sourceProductId, sections } =
    createTemplateSchema.parse(input);
  const { supabase, workspaceId, userId } = await requireActionContext();

  // ---- blank template ---------------------------------------------------------
  if (!sourceProductId) {
    const { data: template, error } = await supabase
      .from("products")
      .insert({ workspace_id: workspaceId, name, is_template: true })
      .select("id")
      .single();
    if (error || !template) {
      throw new Error(error?.message ?? "Could not create the template.");
    }

    const { data: sectionTemplates, error: templatesError } = await supabase
      .from("section_templates")
      .select("key, default_sort_order")
      .eq("is_default", true);
    if (templatesError) throw new Error(templatesError.message);

    if (sectionTemplates && sectionTemplates.length > 0) {
      const rows = sectionTemplates.map((t) => ({
        product_id: template.id,
        section_key: t.key,
        sort_order: t.default_sort_order,
      }));
      const { error: sectionsError } = await supabase
        .from("product_sections")
        .insert(rows);
      if (sectionsError) throw new Error(sectionsError.message);
    }

    await logChange(supabase, {
      productId: template.id,
      workspaceId,
      area: "product_setup",
      description: "Template created",
    });

    revalidateTemplateSurfaces();
    return { id: template.id, warnings: [] as string[] };
  }

  // ---- clone an existing product ------------------------------------------------
  const { data: source, error: sourceError } = await supabase
    .from("products")
    .select("id, name, brand_id")
    .eq("id", sourceProductId)
    .eq("workspace_id", workspaceId)
    .single();
  if (sourceError || !source) throw new Error("Product not found.");

  const mask: CopySectionMask = sections ?? FULL_SECTION_MASK;
  const { id, warnings } = await copyProductDeep(supabase, {
    workspaceId,
    userId,
    sourceProductId: source.id,
    targetName: name,
    isTemplate: true,
    brandId: source.brand_id,
    collectionId: null,
    mask,
  });

  for (const key of COMPLETABLE_SECTION_KEYS) {
    await recomputeSectionStatus(supabase, id, workspaceId, key);
  }

  await logChange(supabase, {
    productId: id,
    workspaceId,
    area: "product_setup",
    description: `Template created from '${source.name}'`,
  });

  revalidateTemplateSurfaces();
  return { id, warnings };
}

const createFromTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  collectionId: z.uuid().optional(),
});

export type CreateFromTemplateInput = z.input<typeof createFromTemplateSchema>;

/**
 * Create a live product from a template — always a FULL deep copy (the
 * section mask applies only when saving a product AS a template). The new
 * product gets its own share token (column default), draft status, v1.0,
 * recomputed completion, and a provenance change-log entry. Placement: the
 * chosen collection's brand wins; with no collection the template's brand
 * carries over (templates are workspace-wide for use, decision 4).
 */
export async function createFromTemplate(
  templateId: string,
  input: CreateFromTemplateInput,
) {
  const parsedId = z.uuid().parse(templateId);
  const { name, collectionId } = createFromTemplateSchema.parse(input);
  const { supabase, workspaceId, userId } = await requireActionContext();

  const { data: template, error: templateError } = await supabase
    .from("products")
    .select("id, name, brand_id, is_template")
    .eq("id", parsedId)
    .eq("workspace_id", workspaceId)
    .single();
  if (templateError || !template || !template.is_template) {
    throw new Error("Template not found.");
  }

  let brandId = template.brand_id;
  let targetCollectionId: string | null = null;
  if (collectionId) {
    const { data: collection, error: collectionError } = await supabase
      .from("collections")
      .select("id, brand_id")
      .eq("id", collectionId)
      .eq("workspace_id", workspaceId)
      .single();
    if (collectionError || !collection) throw new Error("Collection not found.");
    brandId = collection.brand_id;
    targetCollectionId = collection.id;
  }

  const { id, warnings } = await copyProductDeep(supabase, {
    workspaceId,
    userId,
    sourceProductId: template.id,
    targetName: name,
    isTemplate: false,
    brandId,
    collectionId: targetCollectionId,
    mask: FULL_SECTION_MASK,
  });

  for (const key of COMPLETABLE_SECTION_KEYS) {
    await recomputeSectionStatus(supabase, id, workspaceId, key);
  }

  await logChange(supabase, {
    productId: id,
    workspaceId,
    area: "product_setup",
    description: `Created from template '${template.name}'`,
  });

  revalidateTemplateSurfaces();
  return { id, warnings };
}

const renameTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
});

export async function renameTemplate(id: string, name: string) {
  const input = renameTemplateSchema.parse({ id, name });
  const { supabase, workspaceId } = await requireActionContext();

  const { error } = await supabase
    .from("products")
    .update({ name: input.name })
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .eq("is_template", true);
  if (error) throw new Error(error.message);

  revalidateTemplateSurfaces();
}

/**
 * Delete a template. Products created from it are untouched — deep copies
 * share nothing with it (decision 5). Child rows cascade with the product
 * row; the template's Storage folder is cleaned up best-effort AFTER the
 * delete (the row is the source of truth; a stale orphan object must never
 * fail the action — same philosophy as deleteAsset).
 */
export async function deleteTemplate(id: string) {
  const input = z.object({ id: z.uuid() }).parse({ id });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: template } = await supabase
    .from("products")
    .select("id")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .eq("is_template", true)
    .single();
  if (!template) throw new Error("Template not found.");

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .eq("is_template", true);
  if (error) throw new Error(error.message);

  const folder = `${workspaceId}/${input.id}`;
  const { data: objects } = await supabase.storage
    .from("product-assets")
    .list(folder);
  if (objects && objects.length > 0) {
    await supabase.storage
      .from("product-assets")
      .remove(objects.map((o) => `${folder}/${o.name}`));
  }

  revalidateTemplateSurfaces();
}

function revalidateTemplateSurfaces() {
  revalidatePath("/settings");
  revalidatePath("/products");
  revalidatePath("/dashboard");
}
