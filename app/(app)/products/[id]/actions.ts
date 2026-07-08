"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { describeChangedFields, logChange } from "@/lib/change-log";
import { getWorkspaceLibrary } from "@/lib/library";
import {
  nextProductVersion,
  productVersionLabel,
  type VersionBumpKind,
} from "@/lib/product-version";
import {
  COMPLETABLE_SECTION_KEYS,
  computeAutoSectionStatus,
  type CompletableSectionKey,
} from "@/lib/section-status";
import { requireActionContext } from "@/lib/supabase/action-context";
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
  // existing data is needed so we MERGE rather than overwrite — see below —
  // and the existing product row so the Change Log entry can name exactly
  // which fields this save actually altered.
  const [{ data: owned }, { data: existingSection, error: sectionReadError }] =
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
    ]);
  if (!owned) throw new Error("Not found in your workspace.");
  // Fail loudly on a failed section read: proceeding would silently bypass
  // the completed_manually guard below AND merge onto an empty object,
  // erasing the legacy jsonb keys the merge exists to preserve.
  if (sectionReadError) throw new Error(sectionReadError.message);

  // ---- Section completion: the five core identity fields decide it. Because a
  // save always writes data, the section is never reset to `not_started` here.
  // A MANUAL "Mark complete" is durable (0038): the status write below is
  // conditioned on `completed_manually = false`, so this derived status can
  // never demote a manually-completed section — only an explicit un-mark does.
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

  // The data write is unconditional; the status write re-states the durable-
  // completion guard ON the update so a "Mark complete" landing after the
  // read above can never be demoted by this save (the row already holds
  // status='complete' then, so the zero-row match is exactly right).
  const [productResult, sectionDataResult] = await Promise.all([
    supabase.from("products").update(productUpdate).eq("id", productId),
    supabase
      .from("product_sections")
      .update({ data: mergedData as never })
      .eq("product_id", productId)
      .eq("section_key", "identity"),
  ]);

  if (productResult.error) throw new Error(productResult.error.message);
  if (sectionDataResult.error) {
    throw new Error(sectionDataResult.error.message);
  }

  const sectionStatusResult = await supabase
    .from("product_sections")
    .update({ status })
    .eq("product_id", productId)
    .eq("section_key", "identity")
    .eq("completed_manually", false);
  if (sectionStatusResult.error) {
    throw new Error(sectionStatusResult.error.message);
  }

  // ---- Change Log: one readable entry naming the fields this save changed.
  // A save that changed nothing (a re-submit) logs nothing.
  const PRODUCT_FIELD_LABELS: [keyof typeof productUpdate, string][] = [
    ["name", "Name"],
    ["style_number", "Style Number"],
    ["category", "Category"],
    ["gender", "Gender"],
    ["size_range", "Size Range"],
    ["season_id", "Season"],
    ["designer_name", "Designer Name"],
    ["designer_email", "Designer Email"],
    ["factory_name", "Factory Name"],
    ["factory_country", "Factory Country"],
    ["sample_due_date", "Sample Due Date"],
    ["delivery_date", "Delivery Date"],
    ["wholesale_price", "Wholesale Price"],
    ["retail_price", "Retail Price"],
  ];
  const SECTION_FIELD_LABELS: [keyof IdentitySectionData, string][] = [
    ["product_description", "Description"],
    ["key_features", "Key Features"],
    ["fit_description", "Fit Description"],
    ["end_use", "End Use"],
    ["fit_type", "Fit Type"],
    // internal_notes is deliberately absent — internal-only, meta not spec.
  ];
  const changed: string[] = [];
  for (const [key, label] of PRODUCT_FIELD_LABELS) {
    if ((owned[key] ?? null) !== (productUpdate[key] ?? null)) {
      changed.push(label);
    }
  }
  for (const [key, label] of SECTION_FIELD_LABELS) {
    if ((existingData[key] ?? null) !== (sectionData[key] ?? null)) {
      changed.push(label);
    }
  }
  if (changed.length > 0) {
    await logChange(supabase, {
      productId,
      workspaceId,
      area: "product_setup",
      description: `Product Setup updated ${describeChangedFields(changed)}`,
    });
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { success: true };
}

// ---- Section completion (durable manual tick) ---------------------------------

const sectionCompletionSchema = z.object({
  productId: z.uuid(),
  sectionKey: z.enum(COMPLETABLE_SECTION_KEYS),
  complete: z.boolean(),
});

/**
 * The banner's "Mark complete" control. Completing is a deliberate human
 * declaration — no content gating, and DURABLE: `completed_manually` makes
 * every automatic recompute stand down until the user un-marks the section
 * here (which re-derives the automatic status, so an auto-completable section
 * whose rule still holds simply stays complete). Returns the status the
 * section actually landed on so the client can phrase its feedback honestly.
 * Deliberately NOT logged to the Change Log — completion marks are workflow
 * meta, not specification.
 */
export async function setSectionCompletion(
  productId: string,
  sectionKey: CompletableSectionKey,
  complete: boolean,
): Promise<{ status: SectionStatus }> {
  const input = sectionCompletionSchema.parse({
    productId,
    sectionKey,
    complete,
  });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: owned } = await supabase
    .from("products")
    .select("id")
    .eq("id", input.productId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!owned) throw new Error("Not found in your workspace.");

  let landed: SectionStatus;
  if (input.complete) {
    landed = "complete";
    const { error } = await supabase
      .from("product_sections")
      .update({ status: "complete", completed_manually: true })
      .eq("product_id", input.productId)
      .eq("section_key", input.sectionKey);
    if (error) throw new Error(error.message);
  } else {
    // Un-mark, then land on the section's automatic status (content-aware —
    // a BOM full of rows re-opens to in_progress, an empty one to
    // not_started). A failed derivation falls back to in_progress rather
    // than leaving a stale green tick.
    const auto = await computeAutoSectionStatus(
      supabase,
      input.productId,
      workspaceId,
      input.sectionKey,
    );
    landed = auto ?? "in_progress";
    const { error } = await supabase
      .from("product_sections")
      .update({
        status: landed,
        completed_manually: false,
      })
      .eq("product_id", input.productId)
      .eq("section_key", input.sectionKey);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/products/${input.productId}`);
  // The list/dashboard progress bars read the same stored statuses.
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { status: landed };
}

// ---- Versioning (manual bump) --------------------------------------------------

const bumpVersionSchema = z.object({
  productId: z.uuid(),
  kind: z.enum([
    "minor",
    "major",
  ] as const satisfies readonly VersionBumpKind[]),
  note: z.string().trim().max(500).nullable(),
});

/**
 * "New version" — the manual promotion the user performs when sending the
 * factory an updated pack: v1.0 → v1.1 (minor, the default) or → v2.0
 * (major). The change log keeps recording continuously; entries from here on
 * stamp the NEW version while the previous version's entries stay grouped
 * under it. The optional note ("what changed in this version") rides on the
 * bump's own log entry and becomes the version's header in the Change Log.
 * No snapshot/restore/diff — deliberately just the durable number + the log.
 */
export async function bumpProductVersion(
  productId: string,
  kind: VersionBumpKind,
  note: string | null,
): Promise<{ label: string }> {
  const input = bumpVersionSchema.parse({ productId, kind, note });
  const { supabase, workspaceId } = await requireActionContext();

  const { data: product } = await supabase
    .from("products")
    .select("id, version_major, version_minor")
    .eq("id", input.productId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!product) throw new Error("Not found in your workspace.");

  const next = nextProductVersion(
    product.version_major,
    product.version_minor,
    input.kind,
  );
  const { error } = await supabase
    .from("products")
    .update({ version_major: next.major, version_minor: next.minor })
    .eq("id", input.productId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  // The bump entry is inserted DIRECTLY (not via the swallow-errors logChange
  // helper): it is the sole carrier of the user's note and of the version
  // group's header in the Change Log, so a failure must surface rather than
  // silently discard user input. Written after the update so it stamps the
  // NEW version and heads that version's group.
  const label = productVersionLabel(next.major, next.minor);
  const previous = productVersionLabel(
    product.version_major,
    product.version_minor,
  );
  const { error: logError } = await supabase.from("product_change_log").insert({
    product_id: input.productId,
    workspace_id: workspaceId,
    version: label,
    area: "version",
    description: `Version ${label} created`,
    data: { note: input.note, previous },
  });
  if (logError) {
    revalidatePath(`/products/${input.productId}`);
    throw new Error(
      `Version ${label} was created, but its note could not be recorded.`,
    );
  }

  revalidatePath(`/products/${input.productId}`);
  return { label };
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
