import { DashboardClient } from "@/components/dashboard-client";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Product, SectionStatus } from "@/types";

export default async function ProductsPage() {
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  const [
    { data: brands },
    { data: seasons },
    { data: collections },
    { data: products },
    { data: labels },
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
    supabase.from("labels").select("*").eq("workspace_id", wsId).order("name"),
  ]);

  const allProducts: Product[] = products ?? [];
  const productIds = allProducts.map((p) => p.id);

  const [{ data: sectionsData }, { data: productLabels }] =
    productIds.length > 0
      ? await Promise.all([
          supabase
            .from("product_sections")
            .select("product_id, status")
            .in("product_id", productIds)
            .eq("is_enabled", true),
          supabase
            .from("product_labels")
            .select("product_id, label_id")
            .in("product_id", productIds),
        ])
      : [
          { data: [] as { product_id: string; status: SectionStatus }[] },
          { data: [] as { product_id: string; label_id: string }[] },
        ];

  return (
    <DashboardClient
      workspaceName={ctx.workspace?.name ?? null}
      brands={brands ?? []}
      seasons={seasons ?? []}
      collections={collections ?? []}
      products={allProducts}
      sections={sectionsData ?? []}
      labels={labels ?? []}
      productLabels={productLabels ?? []}
    />
  );
}
