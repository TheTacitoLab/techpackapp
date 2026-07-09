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
 * rewrite of the array (the "lazy clean") so deleted products/collections
 * can't hold a slot against the 10-pin cap.
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
      : Promise.resolve({ data: [] as { id: string }[] }),
    collectionIds.length > 0
      ? supabase
          .from("collections")
          .select("id")
          .in("id", collectionIds)
          .eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);

  const validKeys = new Set<string>();
  for (const row of products.data ?? []) {
    validKeys.add(pinKey({ type: "product", id: row.id }));
  }
  for (const row of collections.data ?? []) {
    validKeys.add(pinKey({ type: "collection", id: row.id }));
  }
  return prunePins(pins, validKeys);
}

async function writePins(
  supabase: ActionSupabase,
  userId: string,
  basePreferences: unknown,
  pins: PinEntry[],
) {
  const base =
    basePreferences &&
    typeof basePreferences === "object" &&
    !Array.isArray(basePreferences)
      ? basePreferences
      : {};
  const { error } = await supabase
    .from("profiles")
    .update({ preferences: { ...base, pins } })
    .eq("id", userId);
  if (error) throw new Error(error.message);
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

  // The pin target must exist in the caller's workspace.
  const table = type === "product" ? "products" : "collections";
  const { data: target } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!target) throw new Error("Not found in your workspace.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .single();
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

  await writePins(supabase, userId, profile.preferences, next);

  // The pinned list renders in the sidebar (app layout) on every page.
  revalidatePath("/", "layout");
  return { error: null };
}

/**
 * Re-validate every pin against the DB and persist the pruned array if
 * anything was dangling. Fired by the sidebar when it renders a pins array
 * that references deleted items — the render filters them out visually, this
 * makes the cleanup durable.
 */
export async function pruneDanglingPins(): Promise<void> {
  const { supabase, workspaceId, userId } = await requireActionContext();

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .single();
  if (!profile) return;

  const current = pinsFromPreferences(profile.preferences);
  if (current.length === 0) return;

  const pruned = await pruneAgainstDb(supabase, workspaceId, current);
  if (pruned.length === current.length) return;

  await writePins(supabase, userId, profile.preferences, pruned);
  revalidatePath("/", "layout");
}
