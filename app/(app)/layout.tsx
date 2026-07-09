import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import type { PinnedNavItem } from "@/components/app-nav";
import { LayerColoursProvider } from "@/components/canvas/layer-colours-context";
import { parseLayerColours } from "@/components/canvas/layers";
import { PinsProvider } from "@/components/pins-context";
import { UserPreferencesProvider } from "@/components/user-preferences-context";
import { pinsFromPreferences, type PinEntry } from "@/lib/pins";
import { getCurrentUser } from "@/lib/supabase/auth";
import { parseUserPreferences } from "@/lib/user-preferences";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentUser();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  // Resolve the user's pins (profiles.preferences.pins) into sidebar items.
  // This runs on every navigation, so it fetches nothing when there are no
  // pins of a kind. Collections are fetched wholesale (small, and a pinned
  // sub-collection needs its parent's name for the hint); products only by
  // pinned id.
  const pins = pinsFromPreferences(ctx.profile.preferences);
  const pinnedProductIds = pins
    .filter((p) => p.type === "product")
    .map((p) => p.id);
  const hasCollectionPins = pins.some((p) => p.type === "collection");

  const [{ data: collections }, { data: pinnedProducts }] = await Promise.all([
    hasCollectionPins
      ? supabase
          .from("collections")
          .select("id, name, parent_id")
          .eq("workspace_id", wsId)
      : Promise.resolve({
          data: [] as { id: string; name: string; parent_id: string | null }[],
        }),
    pinnedProductIds.length > 0
      ? supabase
          .from("products")
          .select("id, name")
          .in("id", pinnedProductIds)
          .eq("workspace_id", wsId)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const collectionById = new Map((collections ?? []).map((c) => [c.id, c]));
  const productById = new Map((pinnedProducts ?? []).map((p) => [p.id, p]));

  // Pin order = display order. Dangling pins (deleted targets) are filtered
  // out here — the stored array gets pruned durably the next time any pin
  // action writes it — and the provider is seeded with the RESOLVED entries
  // so the client-side cap check counts what the sidebar shows.
  const pinnedItems: PinnedNavItem[] = [];
  const resolvedPins: PinEntry[] = [];
  for (const pin of pins) {
    if (pin.type === "product") {
      const product = productById.get(pin.id);
      if (!product) continue;
      resolvedPins.push(pin);
      pinnedItems.push({
        type: "product",
        id: pin.id,
        name: product.name,
        href: `/products/${pin.id}`,
        parentName: null,
      });
    } else {
      const collection = collectionById.get(pin.id);
      if (!collection) continue;
      resolvedPins.push(pin);
      const parent = collection.parent_id
        ? collectionById.get(collection.parent_id)
        : null;
      pinnedItems.push({
        type: "collection",
        id: pin.id,
        name: collection.name,
        href: `/collections/${pin.id}`,
        parentName: parent?.name ?? null,
      });
    }
  }

  return (
    // Workspace marker colours + per-user preferences and pins are provided
    // app-wide: Settings, every product's canvas and every pin toggle
    // read/write the same live values.
    <LayerColoursProvider initial={parseLayerColours(ctx.workspace?.layer_colours)}>
      <UserPreferencesProvider
        initial={parseUserPreferences(ctx.profile.preferences)}
      >
        <PinsProvider initial={resolvedPins}>
          <AppShell
            user={ctx.user}
            profile={ctx.profile}
            workspace={ctx.workspace}
            pinnedItems={pinnedItems}
          >
            {children}
          </AppShell>
        </PinsProvider>
      </UserPreferencesProvider>
    </LayerColoursProvider>
  );
}
