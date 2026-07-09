import { LaunchpadClient } from "@/components/launchpad-client";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getGarspecTemplateSummaries } from "@/lib/spec-library";
import { getTemplateSummaries } from "@/lib/templates";
import type { Product, SectionStatus } from "@/types";

export default async function DashboardPage() {
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  const [
    { data: brands },
    { data: seasons },
    { data: collections },
    { data: products },
    templates,
    specTemplates,
  ] = await Promise.all([
    supabase.from("brands").select("*").eq("workspace_id", wsId).order("name"),
    supabase
      .from("seasons")
      .select("*")
      .eq("workspace_id", wsId)
      .order("year", { ascending: false }),
    supabase
      .from("collections")
      .select("*")
      .eq("workspace_id", wsId)
      .order("name"),
    // Templates are excluded from every launchpad number (stats, collection
    // progress, needs-attention, recently updated) — they aren't work.
    supabase
      .from("products")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("is_template", false)
      .order("updated_at", { ascending: false }),
    getTemplateSummaries(supabase, wsId),
    getGarspecTemplateSummaries(),
  ]);

  const allProducts: Product[] = products ?? [];
  const productIds = allProducts.map((p) => p.id);

  const { data: sectionsData } =
    productIds.length > 0
      ? await supabase
          .from("product_sections")
          .select("product_id, status")
          .in("product_id", productIds)
          .eq("is_enabled", true)
      : { data: [] as { product_id: string; status: SectionStatus }[] };

  return (
    <LaunchpadClient
      workspaceName={ctx.workspace?.name ?? null}
      brands={brands ?? []}
      seasons={seasons ?? []}
      collections={collections ?? []}
      products={allProducts}
      sections={sectionsData ?? []}
      templates={templates}
      specTemplates={specTemplates}
      // Server Component: reading the request-time clock is intentional.
      // eslint-disable-next-line react-hooks/purity
      now={Date.now()}
    />
  );
}
