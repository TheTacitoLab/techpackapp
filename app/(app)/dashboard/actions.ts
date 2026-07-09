"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { STATUS_LABELS } from "@/components/status-pill";
import { logChange } from "@/lib/change-log";
import { parentAssignmentError } from "@/lib/collection-hierarchy";
import { FULL_SECTION_MASK, copyProductDeep } from "@/lib/product-copy";
import {
  COMPLETABLE_SECTION_KEYS,
  recomputeSectionStatus,
} from "@/lib/section-status";
import { requireActionContext } from "@/lib/supabase/action-context";
import type { ProductStatus } from "@/types";

const createProductSchema = z.object({
  name: z.string().min(1),
  style_number: z.string().optional(),
  brand_id: z.string().uuid().optional(),
  collection_id: z.string().uuid().optional(),
});

export type CreateProductInput = z.input<typeof createProductSchema>;

export async function createProduct(
  input: CreateProductInput,
): Promise<{ id: string | null; error: string | null }> {
  const { name, style_number, brand_id, collection_id } =
    createProductSchema.parse(input);

  const { supabase, workspaceId } = await requireActionContext();

  // A product placed in a collection adopts that collection's brand — the
  // collection is the grouping surface, so the two can never disagree. This
  // also ownership-checks the collection before attaching to it. Stale-choice
  // failures return { error } (thrown action errors are redacted in
  // production and these messages must reach the user verbatim).
  let resolvedBrandId = brand_id ?? null;
  if (collection_id) {
    const { data: collection } = await supabase
      .from("collections")
      .select("id, brand_id")
      .eq("id", collection_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!collection) {
      return { id: null, error: "Collection not found in your workspace." };
    }
    resolvedBrandId = collection.brand_id;
  } else if (resolvedBrandId) {
    // A directly-supplied brand gets the same ownership check the
    // collection path has — never trust a raw client id.
    const { data: brand } = await supabase
      .from("brands")
      .select("id")
      .eq("id", resolvedBrandId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!brand) {
      return { id: null, error: "Brand not found in your workspace." };
    }
  }

  const trimmedStyle = style_number?.trim();
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      workspace_id: workspaceId,
      name,
      style_number: trimmedStyle ? trimmedStyle : null,
      brand_id: resolvedBrandId,
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

  // The product's Change Log opens with its creation, under v1.0.
  await logChange(supabase, {
    productId: product.id,
    workspaceId,
    area: "product_setup",
    description: "Product created",
  });

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
  return { id: product.id, error: null };
}

// ---- Hierarchy CRUD ----------------------------------------------------------

const brandSchema = z.object({ name: z.string().min(1) });
const seasonSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
});
const collectionSchema = z.object({
  name: z.string().min(1),
  // Optional because a sub-collection inherits its parent's brand; top-level
  // collections still require one (enforced in the action, not the schema).
  brand_id: z.string().uuid().optional(),
  season_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
});

export async function createBrand(input: z.input<typeof brandSchema>) {
  const { name } = brandSchema.parse(input);
  const { supabase, workspaceId } = await requireActionContext();
  const { data, error } = await supabase
    .from("brands")
    .insert({ workspace_id: workspaceId, name })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not create brand.");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
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
  revalidatePath("/collections");
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
  revalidatePath("/collections");
}

/**
 * Recover the Storage object path from one of OUR OWN minted signed URLs
 * (`…/storage/v1/object/sign/product-assets/{path}?token=…` — see the brand
 * logo upload in `components/settings/brand-logo-control.tsx` and the asset
 * flow in `components/canvas/asset-upload.ts`). `brands` has no `logo_path`
 * column, so the URL is the only record of where the file lives; parsing it
 * back is safe because we only ever store URLs we minted in this exact shape.
 * Returns null (→ skip cleanup) for anything that doesn't match, including
 * paths outside the caller's workspace prefix — never throws.
 */
function logoPathFromSignedUrl(
  logoUrl: string,
  workspaceId: string,
): string | null {
  try {
    const marker = "/storage/v1/object/sign/product-assets/";
    const pathname = new URL(logoUrl).pathname;
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    const path = decodeURIComponent(pathname.slice(index + marker.length));
    return path.startsWith(`${workspaceId}/`) ? path : null;
  } catch {
    return null;
  }
}

const brandLogoSchema = z.object({
  id: z.string().uuid(),
  logoUrl: z.string().url(),
});

/**
 * Point a brand at its freshly-uploaded logo. The binary went browser-direct
 * to the existing `product-assets` bucket (same pattern and RLS as product
 * assets — the workspace id is the first path segment); this action only
 * persists the signed URL onto `brands.logo_url`. A previously-set logo's
 * object is removed best-effort AFTER the row update — the row is the source
 * of truth, so a stale orphan object must never fail the action.
 */
export async function updateBrandLogo(id: string, logoUrl: string) {
  const input = brandLogoSchema.parse({ id, logoUrl });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, logo_url")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!brand) throw new Error("Not found in your workspace.");

  const { error } = await supabase
    .from("brands")
    .update({ logo_url: input.logoUrl })
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  if (brand.logo_url && brand.logo_url !== input.logoUrl) {
    const oldPath = logoPathFromSignedUrl(brand.logo_url, workspaceId);
    if (oldPath) {
      await supabase.storage.from("product-assets").remove([oldPath]);
    }
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/products");
}

/**
 * Clear a brand's logo (and best-effort delete the stored file, same
 * philosophy as `deleteAsset`: DB first, storage cleanup must never fail it).
 */
export async function removeBrandLogo(id: string) {
  const input = z.object({ id: z.string().uuid() }).parse({ id });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, logo_url")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!brand) throw new Error("Not found in your workspace.");

  const { error } = await supabase
    .from("brands")
    .update({ logo_url: null })
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  if (brand.logo_url) {
    const oldPath = logoPathFromSignedUrl(brand.logo_url, workspaceId);
    if (oldPath) {
      await supabase.storage.from("product-assets").remove([oldPath]);
    }
  }

  revalidatePath("/settings");
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
  if (error || !data)
    throw new Error(error?.message ?? "Could not create season.");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
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

type ParentRow = { id: string; parent_id: string | null; brand_id: string };

/**
 * Fetch the requested parent collection (workspace-scoped) and validate the
 * assignment with the shared pure rule. Returns the parent row on success so
 * callers can inherit its brand; validation failures come back as friendly
 * error strings (NOT throws — thrown action errors are redacted in
 * production, and these must reach the user verbatim).
 */
async function resolveParentAssignment(
  supabase: Awaited<ReturnType<typeof requireActionContext>>["supabase"],
  workspaceId: string,
  collectionId: string | null,
  parentId: string | null,
): Promise<{ parent: ParentRow | null; error: string | null }> {
  // The two lookups are independent — one round trip, not two.
  const [parentResult, childCountResult] = await Promise.all([
    parentId
      ? supabase
          .from("collections")
          .select("id, parent_id, brand_id")
          .eq("id", parentId)
          .eq("workspace_id", workspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    parentId && collectionId
      ? supabase
          .from("collections")
          .select("id", { count: "exact", head: true })
          .eq("parent_id", collectionId)
          .eq("workspace_id", workspaceId)
      : Promise.resolve({ count: 0 }),
  ]);

  const parent: ParentRow | null = parentResult.data ?? null;
  const error = parentAssignmentError({
    collectionId,
    parentId,
    parent,
    childCount: childCountResult.count ?? 0,
  });
  return { parent: error ? null : parent, error };
}

export async function createCollection(
  input: z.input<typeof collectionSchema>,
): Promise<{ id: string | null; error: string | null }> {
  const { name, brand_id, season_id, parent_id } =
    collectionSchema.parse(input);
  const { supabase, workspaceId } = await requireActionContext();

  const resolved = await resolveParentAssignment(
    supabase,
    workspaceId,
    null,
    parent_id ?? null,
  );
  if (resolved.error) return { id: null, error: resolved.error };

  // Sub-collections inherit their parent's brand; top-level ones pick their own.
  const resolvedBrandId = resolved.parent?.brand_id ?? brand_id;
  if (!resolvedBrandId) {
    return { id: null, error: "Choose a brand for a top-level collection." };
  }

  const { data, error } = await supabase
    .from("collections")
    .insert({
      workspace_id: workspaceId,
      name,
      brand_id: resolvedBrandId,
      season_id: season_id ?? null,
      parent_id: parent_id ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not create collection.");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
  return { id: data.id, error: null };
}

const updateCollectionSchema = z.object({
  name: z.string().min(1),
  // null = top-level (promoting a sub back up).
  parent_id: z.string().uuid().nullable(),
});

/**
 * Rename and/or re-parent a collection. Moving under a parent adopts the
 * parent's brand (sub-collections always share their parent's brand);
 * promoting to top-level keeps the current brand.
 */
export async function updateCollection(
  id: string,
  input: z.input<typeof updateCollectionSchema>,
): Promise<{ error: string | null }> {
  const { name, parent_id } = updateCollectionSchema.parse(input);
  const { supabase, workspaceId } = await requireActionContext();

  const { data: current } = await supabase
    .from("collections")
    .select("id, brand_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!current) throw new Error("Collection not found in your workspace.");

  const resolved = await resolveParentAssignment(
    supabase,
    workspaceId,
    id,
    parent_id,
  );
  if (resolved.error) return { error: resolved.error };

  const nextBrandId = resolved.parent?.brand_id ?? current.brand_id;
  const { error } = await supabase
    .from("collections")
    .update({
      name,
      parent_id,
      brand_id: nextBrandId,
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  // Products follow their collection's brand ("the two can never disagree" —
  // see createProduct). A moved collection can't have children (guarded
  // above), so only its direct products need re-branding.
  if (nextBrandId !== current.brand_id) {
    const { error: productsError } = await supabase
      .from("products")
      .update({ brand_id: nextBrandId })
      .eq("collection_id", id)
      .eq("workspace_id", workspaceId);
    if (productsError) throw new Error(productsError.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
  revalidatePath(`/collections/${id}`);
  return { error: null };
}

export async function deleteCollection(
  id: string,
): Promise<{ error: string | null }> {
  const { supabase, workspaceId } = await requireActionContext();

  // Deleting a parent while sub-collections exist is blocked (the DB FK
  // backstops this) — the user has to move or delete the subs first.
  // Products in the collection keep the existing behaviour: they become
  // unassigned via the FK's ON DELETE SET NULL.
  const { count } = await supabase
    .from("collections")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id)
    .eq("workspace_id", workspaceId);
  if ((count ?? 0) > 0) {
    return {
      error:
        "This collection still has sub-collections. Move or delete them first.",
    };
  }

  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
  return { error: null };
}

// ---- Product quick-actions ---------------------------------------------------

/**
 * Duplicate = a FULL deep copy via the shared engine (`copyProductDeep`) — the
 * same one the template flows use, so there is exactly one copy semantics in
 * the codebase. The clone carries identity fields, assets (with Storage
 * binaries), canvas pages/pins/colourways and spec sheets; name is prefixed,
 * style number cleared, status draft, and completion re-derived from the
 * copy's actual content (the engine never copies statuses). Stays in the
 * source's collection.
 */
export async function duplicateProduct(id: string) {
  const { supabase, workspaceId, userId } = await requireActionContext();

  const { data: src, error: fetchErr } = await supabase
    .from("products")
    .select("id, name, brand_id, collection_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (fetchErr || !src) throw new Error("Product not found.");

  const { id: copyId, warnings } = await copyProductDeep(supabase, {
    workspaceId,
    userId,
    sourceProductId: src.id,
    targetName: `Copy of ${src.name}`,
    isTemplate: false,
    brandId: src.brand_id,
    collectionId: src.collection_id,
    mask: FULL_SECTION_MASK,
  });

  // The engine deliberately leaves status derivation and provenance to the
  // caller (see lib/product-copy.ts) — recompute from the copy's real content.
  for (const key of COMPLETABLE_SECTION_KEYS) {
    await recomputeSectionStatus(supabase, copyId, workspaceId, key);
  }

  // The copy starts its own history (at v1.0) — the source's log stays with
  // the source; only the provenance is recorded here.
  await logChange(supabase, {
    productId: copyId,
    workspaceId,
    area: "product_setup",
    description: `Product created as a copy of '${src.name}'`,
  });

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
  return { id: copyId, warnings };
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
  revalidatePath("/archive");
  revalidatePath("/collections");
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
  revalidatePath("/archive");
  revalidatePath("/collections");
}

export async function updateProductStatus(id: string, status: ProductStatus) {
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("products")
    .update({ status })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  // The status prints on the tech pack cover, so its change is spec-visible.
  await logChange(supabase, {
    productId: id,
    workspaceId,
    area: "product_setup",
    description: `Status changed to ${STATUS_LABELS[status]}`,
  });

  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/collections");
  revalidatePath(`/products/${id}`);
}
