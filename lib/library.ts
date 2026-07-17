import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { LibraryCategory, LibraryItem, ResolvedLibraryItem } from "@/types";

/**
 * Resolves a workspace's visible Master Library: the merge of the active global
 * GarSpec catalogue (minus the items this workspace has hidden) with the
 * workspace's own items. This is the single entry point the canvas picker
 * (Phase 4) and BOM (Phase 6) consume.
 *
 * Each returned item is tagged:
 *   - `isGlobal`  — true for GarSpec catalogue items, false for own items.
 *   - `isHidden`  — true only for global items this workspace toggled off. These
 *     are excluded by default and only included when `includeHidden` is set
 *     (the Settings manager passes it so it can offer a "Show hidden" view).
 *   - `isFavourite` — true for items this workspace starred (global or
 *     workspace); drives the manager's star toggle and the annotation
 *     pickers' Favourites group.
 *
 * @param category       optional filter to a single library category.
 * @param options.includeHidden  include hidden global items (tagged isHidden).
 */
export async function getWorkspaceLibrary(
  category?: LibraryCategory,
  options?: { includeHidden?: boolean },
): Promise<ResolvedLibraryItem[]> {
  const ctx = await getCurrentUser();
  if (!ctx) return [];

  const workspaceId = ctx.profile.workspace_id;
  const includeHidden = options?.includeHidden ?? false;
  const supabase = await createClient();

  // Global (active) + this workspace's own items in one round-trip; the hidden
  // toggle set in a second. RLS already limits visibility, but we filter
  // explicitly so the query is correct regardless of who calls it.
  const itemsQuery = supabase
    .from("library_items")
    .select("*")
    .or(
      `and(source.eq.global,is_active.eq.true),and(source.eq.workspace,workspace_id.eq.${workspaceId})`,
    )
    .order("name");

  const [{ data: items }, { data: toggles }, { data: favourites }] =
    await Promise.all([
      category ? itemsQuery.eq("category", category) : itemsQuery,
      supabase
        .from("workspace_library_toggles")
        .select("library_item_id")
        .eq("workspace_id", workspaceId)
        .eq("hidden", true),
      supabase
        .from("library_favourites")
        .select("library_item_id")
        .eq("workspace_id", workspaceId),
    ]);

  const hiddenIds = new Set((toggles ?? []).map((t) => t.library_item_id));
  const favouriteIds = new Set(
    (favourites ?? []).map((f) => f.library_item_id),
  );

  const resolved: ResolvedLibraryItem[] = [];
  for (const item of (items ?? []) as LibraryItem[]) {
    const isGlobal = item.source === "global";
    const isHidden = isGlobal && hiddenIds.has(item.id);
    if (isHidden && !includeHidden) continue;
    resolved.push({
      ...item,
      isGlobal,
      isHidden,
      isFavourite: favouriteIds.has(item.id),
    });
  }

  return resolved;
}
