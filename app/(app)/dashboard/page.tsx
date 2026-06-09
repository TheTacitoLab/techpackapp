import { DashboardClient } from "@/components/dashboard-client";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
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
    supabase
      .from("products")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false }),
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
    <DashboardClient
      workspaceName={ctx.workspace?.name ?? null}
      brands={brands ?? []}
      seasons={seasons ?? []}
      collections={collections ?? []}
      products={allProducts}
      sections={sectionsData ?? []}
    />
  );
}
