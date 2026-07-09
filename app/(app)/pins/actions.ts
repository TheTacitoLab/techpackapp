"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addPin,
  pinKey,
  pinsFromPreferences,
  prunePins,
  removePin,
  type PinEntry,
} from "@/lib/pins";
import { requireActionContext } from "@/lib/supabase/action-context";

// Pins are a per-user preference (profiles.preferences.pins) — an ORDERED
// array of { type: 'product' | 'collection', id } entries, max 10 total.
// Array logic lives in lib/pins.ts (pure, unit-tested); this file owns the
// DB round-trips. Cap violations come back as `{ error }` rather than a
// throw because thrown action errors are redacted in production and the
// friendly message must reach the user verbatim.

const setPinnedSchema = z.object({
  type: z.enum(["product", "collection"]),
  id: z.string().uuid(),
  pinned: z.boolean(),
});

export type SetPinnedInput = z.input<typeof setPinnedSchema>;

type ActionSupabase = Awaited<
  ReturnType<typeof requireActionContext>
>["supabase"];

/**
 * Drop pins whose target no longer exists in the workspace. Runs on every
 * rewrite of the array (the lazy clean) so deleted products/collections
 * can't hold a slot against the 10-pin cap. A FAILED lookup must throw —
 * treating it as "everything was deleted" would wipe the user's pins.
 */
async function pruneAgainstDb(
  supabase: ActionSupabase,
  workspaceId: string,
  pins: PinEntry[],
): Promise<PinEntry[]> {
  if (pins.length === 0) return pins;
  const productIds = pins.filter((p) => p.type === "product").map((p) => p.id);
  const collectionIds = pins
    .filter((p) => p.type === "collection")
    .map((p) => p.id);

  const [products, collections] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("products")
          .select("id")
          .in("id", productIds)
          .eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    collectionIds.length > 0
      ? supabase
          .from("collections")
          .select("id")
          .in("id", collectionIds)
          .eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);
  if (products.error) throw new Error(products.error.message);
  if (collections.error) throw new Error(collections.error.message);

  const validKeys = new Set<string>();
  for (const row of products.data ?? []) {
    validKeys.add(pinKey({ type: "product", id: row.id }));
  }
  for (const row of collections.data ?? []) {
    validKeys.add(pinKey({ type: "collection", id: row.id }));
  }
  return prunePins(pins, validKeys);
}

/**
 * Pin or unpin a product/collection for the current user. Returns
 * `{ error }` with a friendly message when the 10-pin cap is hit; the UI
 * surfaces it as-is.
 */
export async function setPinned(
  input: SetPinnedInput,
): Promise<{ error: string | null }> {
  const { type, id, pinned } = setPinnedSchema.parse(input);
  const { supabase, workspaceId, userId } = await requireActionContext();

  // Only PINNING requires the target to exist — unpinning something that
  // was just deleted is exactly what pruning wants to allow. The two reads
  // are independent, so they share a round trip.
  const table = type === "product" ? "products" : "collections";
  const [targetResult, profileResult] = await Promise.all([
    pinned
      ? supabase
          .from(table)
          .select("id")
          .eq("id", id)
          .eq("workspace_id", workspaceId)
          .maybeSingle()
      : Promise.resolve({ data: { id } }),
    supabase.from("profiles").select("preferences").eq("id", userId).single(),
  ]);
  if (!targetResult.data) throw new Error("Not found in your workspace.");
  const profile = profileResult.data;
  if (!profile) throw new Error("No profile found.");

  const current = await pruneAgainstDb(
    supabase,
    workspaceId,
    pinsFromPreferences(profile.preferences),
  );

  let next: PinEntry[];
  if (pinned) {
    const result = addPin(current, { type, id });
    if (result.error) return { error: result.error };
    next = result.pins;
  } else {
    next = removePin(current, { type, id });
  }

  const raw = profile.preferences;
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const { error } = await supabase
    .from("profiles")
    .update({ preferences: { ...base, pins: next } })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  // The pinned list renders in the sidebar (app layout) on every page.
  revalidatePath("/", "layout");
  return { error: null };
}
