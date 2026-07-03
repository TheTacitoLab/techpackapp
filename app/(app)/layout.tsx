import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { BrandBootstrap } from "@/components/brand-bootstrap";
import { LayerColoursProvider } from "@/components/canvas/layer-colours-context";
import { parseLayerColours } from "@/components/canvas/layers";
import { getCurrentUser } from "@/lib/supabase/auth";
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

  const [{ data: brands }, { data: collections }] = await Promise.all([
    supabase.from("brands").select("*").eq("workspace_id", wsId).order("name"),
    supabase
      .from("collections")
      .select("*")
      .eq("workspace_id", wsId)
      .order("name"),
  ]);

  return (
    // Workspace marker colours are provided app-wide (not per-canvas): the
    // Settings tab and every product's canvas read/write the same live map.
    <LayerColoursProvider initial={parseLayerColours(ctx.workspace?.layer_colours)}>
      <BrandBootstrap brands={brands ?? []} />
      <AppShell
        user={ctx.user}
        profile={ctx.profile}
        workspace={ctx.workspace}
        collections={collections ?? []}
      >
        {children}
      </AppShell>
    </LayerColoursProvider>
  );
}
