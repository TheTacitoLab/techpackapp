/**
 * Section completion — the ONE place a section's automatic status is derived
 * and written back to `product_sections.status`.
 *
 * Two kinds of completion coexist (migration 0038):
 *
 *   - MANUAL — the user pressed "Mark complete" on the section banner
 *     (`completed_manually = true`). Durable by design: edits never demote it;
 *     only an explicit un-mark clears it (which re-derives the automatic
 *     status below).
 *   - AUTOMATIC — for sections whose completeness is objectively
 *     determinable, recomputed after the mutations that can change it:
 *       identity — the five core identity fields all filled (existing rule,
 *                  applied at save time in `saveIdentitySection`);
 *       assets   — at least one uploaded asset and EVERY asset in use
 *                  (placed in a canvas slot, or the product's hero image);
 *       grading  — every Spec Sheet marked complete (existing rule).
 *     technical_details / bom / documents are deliberately manual-only
 *     (completeness is subjective there); their automatic status is just a
 *     content-aware not_started / in_progress used when un-marking.
 *
 * `recomputeSectionStatus` is the write path the server actions call; it
 * skips demotion while `completed_manually` is set, so the manual tick
 * survives every recompute.
 */

import type { createClient } from "@/lib/supabase/server";
import type { SectionStatus } from "@/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The section keys a user can mark complete. The Change Log section is
 * deliberately absent — it is a record, not a task, and never counts toward
 * "X of N sections complete".
 */
export const COMPLETABLE_SECTION_KEYS = [
  "identity",
  "assets",
  "technical_details",
  "bom",
  "grading",
  "documents",
] as const;

export type CompletableSectionKey = (typeof COMPLETABLE_SECTION_KEYS)[number];

/**
 * Derive a section's AUTOMATIC status from its content. Returns null when a
 * read fails — the caller then leaves the stored status untouched rather
 * than resetting it on a transient error (same philosophy as the original
 * `recomputeSpecSectionStatus`).
 */
export async function computeAutoSectionStatus(
  supabase: ServerClient,
  productId: string,
  workspaceId: string,
  sectionKey: CompletableSectionKey,
): Promise<SectionStatus | null> {
  switch (sectionKey) {
    case "identity": {
      // The five core identity fields decide completeness (the same rule
      // saveIdentitySection applies to its submitted values, re-derived from
      // the stored row for un-marking). `last_saved` in the section jsonb
      // distinguishes "never touched" from "started". maybeSingle keeps a
      // genuinely absent section row (→ not_started) distinct from a failed
      // read (→ null, leave the stored status alone).
      const [{ data: product, error }, { data: section, error: sectionError }] =
        await Promise.all([
          supabase
            .from("products")
            .select("name, style_number, category, gender, size_range")
            .eq("id", productId)
            .eq("workspace_id", workspaceId)
            .single(),
          supabase
            .from("product_sections")
            .select("data")
            .eq("product_id", productId)
            .eq("section_key", "identity")
            .maybeSingle(),
        ]);
      if (error || !product || sectionError) return null;
      const mandatory = [
        product.name,
        product.style_number,
        product.category,
        product.gender,
        product.size_range,
      ];
      if (mandatory.every((v) => (v ?? "").trim().length > 0)) {
        return "complete";
      }
      const data = (section?.data ?? {}) as Record<string, unknown>;
      return data.last_saved ? "in_progress" : "not_started";
    }

    case "assets": {
      // Complete when every uploaded asset is IN USE: placed in at least one
      // canvas slot, or serving as the product's hero/cover image.
      const [assetsResult, slotsResult, productResult] = await Promise.all([
        supabase
          .from("product_assets")
          .select("id")
          .eq("product_id", productId)
          .eq("workspace_id", workspaceId),
        supabase
          .from("canvas_slots")
          .select("asset_id, canvas_pages!inner(product_id)")
          .eq("canvas_pages.product_id", productId)
          .not("asset_id", "is", null)
          .overrideTypes<{ asset_id: string }[], { merge: false }>(),
        supabase
          .from("products")
          .select("hero_asset_id")
          .eq("id", productId)
          .eq("workspace_id", workspaceId)
          .single(),
      ]);
      if (assetsResult.error || slotsResult.error || productResult.error) {
        return null;
      }
      const assets = assetsResult.data ?? [];
      if (assets.length === 0) return "not_started";
      const used = new Set((slotsResult.data ?? []).map((s) => s.asset_id));
      const hero = productResult.data?.hero_asset_id ?? null;
      return assets.every((a) => used.has(a.id) || a.id === hero)
        ? "complete"
        : "in_progress";
    }

    case "grading": {
      // Every Spec Sheet marked complete → complete (the 0037 roll-up).
      const { data: sheets, error } = await supabase
        .from("product_spec_sheets")
        .select("id, is_complete")
        .eq("product_id", productId)
        .eq("workspace_id", workspaceId);
      if (error) return null;
      if (!sheets || sheets.length === 0) return "not_started";
      return sheets.every((s) => s.is_complete) ? "complete" : "in_progress";
    }

    case "technical_details": {
      // Subjective section — never auto-completes. Content-aware floor only:
      // any canvas page means work has started.
      const { count, error } = await supabase
        .from("canvas_pages")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("workspace_id", workspaceId);
      if (error) return null;
      return (count ?? 0) > 0 ? "in_progress" : "not_started";
    }

    case "bom": {
      // Subjective section — never auto-completes. Any Fabrics & Trim pin
      // means the BOM has rows.
      const { count, error } = await supabase
        .from("canvas_annotations")
        .select("id, canvas_slots!inner(canvas_pages!inner(product_id))", {
          count: "exact",
          head: true,
        })
        .eq("workspace_id", workspaceId)
        .in("layer_type", ["fabric", "trim"])
        .eq("canvas_slots.canvas_pages.product_id", productId);
      if (error) return null;
      return (count ?? 0) > 0 ? "in_progress" : "not_started";
    }

    case "documents":
      // Placeholder section — no content model yet.
      return "not_started";
  }
}

/**
 * Recompute and persist a section's automatic status. A manually-completed
 * section is NEVER demoted here — durable completion means the recompute
 * simply stands down until the user un-marks it. Read failures leave the
 * stored status untouched (transient errors must not reset progress).
 */
export async function recomputeSectionStatus(
  supabase: ServerClient,
  productId: string,
  workspaceId: string,
  sectionKey: CompletableSectionKey,
): Promise<void> {
  const { data: section, error } = await supabase
    .from("product_sections")
    .select("status, completed_manually")
    .eq("product_id", productId)
    .eq("section_key", sectionKey)
    .single();
  if (error || !section) return;
  if (section.completed_manually) return;

  const status = await computeAutoSectionStatus(
    supabase,
    productId,
    workspaceId,
    sectionKey,
  );
  if (status === null || status === section.status) return;

  // The guard is re-stated ON the write: a "Mark complete" landing between
  // the read above and this update would otherwise be demoted by a stale
  // derived status (concurrent recomputes are routine — batch uploads fire
  // several at once). With the condition, the update simply matches zero
  // rows instead.
  await supabase
    .from("product_sections")
    .update({ status })
    .eq("product_id", productId)
    .eq("section_key", sectionKey)
    .eq("completed_manually", false);
}
