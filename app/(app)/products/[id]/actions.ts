"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceLibrary } from "@/lib/library";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type {
  IdentitySectionData,
  Product,
  ResolvedLibraryItem,
  Season,
  SectionStatus,
} from "@/types";

import { identityFormSchema, type IdentityFormValues } from "./identity-schema";

/** Empty string → null, for nullable products columns. */
function nullify(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/** Empty string → null, otherwise a parsed numeric (validated by the schema). */
function nullifyNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/**
 * Persist the Identity section: product-level columns onto `products`, the
 * section-specific fields onto the `identity` `product_sections.data`, and a
 * recomputed completion status. Both writes run in parallel after a strict
 * workspace-ownership check — the client-supplied productId is never trusted.
 */
export async function saveIdentitySection(
  productId: string,
  values: IdentityFormValues,
) {
  const data = identityFormSchema.parse(values);

  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();
  const workspaceId = ctx.profile.workspace_id;

  // ---- Workspace guard (confirm the product lives in the caller's workspace)
  // plus a read of the section's current jsonb, fetched in parallel. The
  // existing data is needed so we MERGE rather than overwrite — see below.
  const [{ data: owned }, { data: existingSection }] = await Promise.all([
    supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("workspace_id", workspaceId)
      .single(),
    supabase
      .from("product_sections")
      .select("data")
      .eq("product_id", productId)
      .eq("section_key", "identity")
      .single(),
  ]);
  if (!owned) throw new Error("Not found in your workspace.");

  // ---- Section completion: the five core identity fields decide it. Because a
  // save always writes data, the section is never reset to `not_started` here.
  const mandatory = [
    data.name,
    data.style_number,
    data.category,
    data.gender,
    data.size_range,
  ];
  const status: SectionStatus = mandatory.every((v) => v.trim().length > 0)
    ? "complete"
    : "in_progress";

  const productUpdate: Database["public"]["Tables"]["products"]["Update"] = {
    name: data.name,
    style_number: nullify(data.style_number),
    category: nullify(data.category),
    gender: nullify(data.gender),
    size_range: nullify(data.size_range),
    season_id: data.season_id && data.season_id !== "" ? data.season_id : null,
    designer_name: nullify(data.designer_name),
    designer_email: nullify(data.designer_email),
    factory_name: nullify(data.factory_name),
    factory_country: nullify(data.factory_country),
    sample_due_date: nullify(data.sample_due_date),
    delivery_date: nullify(data.delivery_date),
    wholesale_price: nullifyNumber(data.wholesale_price),
    retail_price: nullifyNumber(data.retail_price),
  };

  const sectionData: IdentitySectionData = {
    product_description: nullify(data.product_description),
    key_features: nullify(data.key_features),
    fit_description: nullify(data.fit_description),
    end_use: nullify(data.end_use),
    fit_type: nullify(data.fit_type),
    internal_notes: nullify(data.internal_notes),
    last_saved: new Date().toISOString(),
  };

  // Merge onto the existing jsonb rather than overwrite it. Legacy keys this
  // form no longer owns — Phase 3c's `main_fabric_id`, `main_fabric_name`,
  // `main_fabric_composition`, `colourways`, `lining_description`, and
  // `construction_method` — are preserved so they survive a save and can be
  // migrated forward by the future Materials & Components / Construction
  // Details sections. The keys this form owns are overlaid on top.
  const existingData =
    (existingSection?.data as Record<string, unknown> | null) ?? {};
  const mergedData = { ...existingData, ...sectionData };

  const [productResult, sectionResult] = await Promise.all([
    supabase.from("products").update(productUpdate).eq("id", productId),
    supabase
      .from("product_sections")
      .update({ data: mergedData as never, status })
      .eq("product_id", productId)
      .eq("section_key", "identity"),
  ]);

  if (productResult.error) throw new Error(productResult.error.message);
  if (sectionResult.error) throw new Error(sectionResult.error.message);

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { success: true };
}

export type IdentitySectionPayload = {
  product: Product;
  sectionData: IdentitySectionData | null;
  fabrics: ResolvedLibraryItem[];
  seasons: Season[];
};

/**
 * Loads everything the Identity form needs to pre-populate: the product row,
 * the `identity` section's saved JSON, the workspace's fabric library, and the
 * workspace seasons. Workspace-scoped throughout.
 */
export async function getIdentitySection(
  productId: string,
): Promise<IdentitySectionPayload | null> {
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();
  const workspaceId = ctx.profile.workspace_id;

  const [{ data: product }, { data: section }, fabrics, { data: seasons }] =
    await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .eq("workspace_id", workspaceId)
        .single(),
      supabase
        .from("product_sections")
        .select("data")
        .eq("product_id", productId)
        .eq("section_key", "identity")
        .single(),
      getWorkspaceLibrary("fabric"),
      supabase
        .from("seasons")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("year", { ascending: false })
        .order("name"),
    ]);

  if (!product) return null;

  return {
    product,
    sectionData: (section?.data as IdentitySectionData | null) ?? null,
    fabrics,
    seasons: seasons ?? [],
  };
}
