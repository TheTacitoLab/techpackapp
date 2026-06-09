import { Archive, PackagePlus } from "lucide-react";
import Link from "next/link";

import { CreateCollectionDialog, CreateBrandDialog, CreateSeasonDialog } from "@/components/hierarchy-dialogs";
import { CreateProductDialog } from "@/components/create-product-dialog";
import { DashboardFilters } from "@/components/dashboard-filters";
import { EmptyState } from "@/components/empty-state";
import { ProductCard } from "@/components/product-card";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Brand, Collection, Product, Season, SectionStatus } from "@/types";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    brand?: string;
    collection?: string;
    season?: string;
    status?: string;
    archived?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const params = await searchParams;
  const showArchived = params.archived === "1";
  const wsId = ctx.profile.workspace_id;

  const supabase = await createClient();

  // Fetch all hierarchy data + products in parallel
  const [
    { data: brands },
    { data: seasons },
    { data: collections },
    { data: allProducts },
    { data: allSections },
  ] = await Promise.all([
    supabase.from("brands").select("*").eq("workspace_id", wsId).order("name"),
    supabase.from("seasons").select("*").eq("workspace_id", wsId).order("year", { ascending: false }),
    supabase.from("collections").select("*").eq("workspace_id", wsId).order("name"),
    supabase.from("products").select("*").eq("workspace_id", wsId).order("created_at", { ascending: false }),
    supabase.from("product_sections").select("product_id, status").in(
      "product_id",
      // We'll filter after; for now pull all — replaced below with targeted query
      ["00000000-0000-0000-0000-000000000000"],
    ),
  ]);

  const brandsData: Brand[] = brands ?? [];
  const seasonsData: Season[] = seasons ?? [];
  const collectionsData: Collection[] = collections ?? [];
  const productsData: Product[] = allProducts ?? [];

  // Build collection→season lookup for season-based filtering
  const collectionSeasonMap = new Map<string, string | null>(
    collectionsData.map((c) => [c.id, c.season_id]),
  );

  // Filter pipeline
  let filtered = productsData.filter((p) =>
    showArchived ? p.archived_at !== null : p.archived_at === null,
  );

  if (params.brand) {
    filtered = filtered.filter((p) => p.brand_id === params.brand);
  }
  if (params.collection) {
    filtered = filtered.filter((p) => p.collection_id === params.collection);
  }
  if (params.season) {
    filtered = filtered.filter((p) => {
      if (!p.collection_id) return false;
      return collectionSeasonMap.get(p.collection_id) === params.season;
    });
  }
  if (params.status) {
    filtered = filtered.filter((p) => p.status === params.status);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    const brandById = new Map(brandsData.map((b) => [b.id, b.name]));
    const collectionById = new Map(collectionsData.map((c) => [c.id, c.name]));
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.style_number ?? "").toLowerCase().includes(q) ||
        (p.brand_id ? (brandById.get(p.brand_id) ?? "").toLowerCase().includes(q) : false) ||
        (p.collection_id ? (collectionById.get(p.collection_id) ?? "").toLowerCase().includes(q) : false),
    );
  }

  // Single query for all section statuses for the VISIBLE products — O(1) queries
  const visibleIds = filtered.map((p) => p.id);
  let sectionStatusMap = new Map<string, SectionStatus[]>();

  if (visibleIds.length > 0) {
    const { data: sections } = await supabase
      .from("product_sections")
      .select("product_id, status")
      .in("product_id", visibleIds)
      .eq("is_enabled", true);

    for (const s of sections ?? []) {
      const arr = sectionStatusMap.get(s.product_id) ?? [];
      arr.push(s.status);
      sectionStatusMap.set(s.product_id, arr);
    }
  }

  const brandById = new Map(brandsData.map((b) => [b.id, b.name]));

  const hasProducts = productsData.filter((p) => p.archived_at === null).length > 0;
  const allArchived = hasProducts === false && productsData.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm">
            {ctx.workspace?.name ?? "Your workspace"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateProductDialog brands={brandsData} collections={collectionsData} />
        </div>
      </div>

      {/* Filters */}
      {productsData.length > 0 && (
        <DashboardFilters
          brands={brandsData}
          collections={collectionsData}
          seasons={seasonsData}
        />
      )}

      {/* Archived toggle */}
      {productsData.some((p) => p.archived_at !== null) && (
        <div className="flex">
          <Link
            href={
              showArchived
                ? "/dashboard"
                : "/dashboard?archived=1"
            }
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <Archive className="size-3.5" />
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        </div>
      )}

      {/* Empty states */}
      {productsData.length === 0 && (
        <EmptyState
          icon={PackagePlus}
          title="No products yet"
          description="Create your first tech pack to start building modular, factory-ready sections."
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              {brandsData.length === 0 && <CreateBrandDialog />}
              <CreateProductDialog brands={brandsData} collections={collectionsData} />
            </div>
          }
        />
      )}

      {productsData.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={PackagePlus}
          title={showArchived ? "No archived products" : "No products match your filters"}
          description={
            showArchived
              ? "Archive products to hide them from the main view."
              : "Try adjusting your search or filter."
          }
        />
      )}

      {/* Product grid */}
      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              brandName={product.brand_id ? (brandById.get(product.brand_id) ?? null) : null}
              sectionStatuses={sectionStatusMap.get(product.id) ?? []}
            />
          ))}
        </div>
      )}

      {/* Hierarchy quick-add (shown when no hierarchy exists yet) */}
      {brandsData.length === 0 && productsData.length > 0 && (
        <div className="border-t pt-6">
          <p className="text-muted-foreground mb-3 text-sm font-medium">
            Organise your products
          </p>
          <div className="flex flex-wrap gap-2">
            <CreateBrandDialog />
            <CreateSeasonDialog />
          </div>
        </div>
      )}
      {brandsData.length > 0 && (
        <div className="border-t pt-6">
          <p className="text-muted-foreground mb-3 text-sm font-medium">
            Manage hierarchy
          </p>
          <div className="flex flex-wrap gap-2">
            <CreateBrandDialog />
            <CreateSeasonDialog />
            <CreateCollectionDialog brands={brandsData} seasons={seasonsData} />
          </div>
        </div>
      )}
    </div>
  );
}
