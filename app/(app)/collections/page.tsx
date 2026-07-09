import {
  CollectionsDashboardClient,
  type DashboardCollection,
} from "@/components/collections-dashboard-client";
import {
  buildCollectionCardData,
  type CardLabel,
} from "@/lib/collection-card-data";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Collection, SectionStatus } from "@/types";

/**
 * The Collections dashboard — the visual, standalone grouping surface.
 * Cards are top-level collections; their counts, progress and cover mosaics
 * roll up the products of their sub-collections too.
 */
export default async function CollectionsPage() {
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  const [
    { data: brands },
    { data: seasons },
    { data: collections },
    { data: labels },
    { data: collectionLabels },
    { data: products },
    { data: assets },
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
    supabase.from("labels").select("*").eq("workspace_id", wsId).order("name"),
    supabase.from("collection_labels").select("collection_id, label_id"),
    // Live products only: archived ones drop out of counts, progress and
    // covers, exactly like every other live surface.
    supabase
      .from("products")
      .select("id, collection_id, hero_asset_id")
      .eq("workspace_id", wsId)
      .eq("is_template", false)
      .is("archived_at", null),
    // Oldest-first: the cover mosaic prefers each product's first upload.
    supabase
      .from("product_assets")
      .select("id, product_id, file_url")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: true }),
  ]);

  const allCollections: Collection[] = collections ?? [];
  const liveProducts = products ?? [];
  const productIds = liveProducts.map((p) => p.id);

  const { data: sections } =
    productIds.length > 0
      ? await supabase
          .from("product_sections")
          .select("product_id, status")
          .in("product_id", productIds)
          .eq("is_enabled", true)
      : { data: [] as { product_id: string; status: SectionStatus }[] };

  const sectionStatusesByProduct = new Map<string, SectionStatus[]>();
  for (const s of sections ?? []) {
    const arr = sectionStatusesByProduct.get(s.product_id) ?? [];
    arr.push(s.status);
    sectionStatusesByProduct.set(s.product_id, arr);
  }

  const brandNameById = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const labelById = new Map((labels ?? []).map((l) => [l.id, l]));

  const labelsByCollection = new Map<string, CardLabel[]>();
  const labelIdsByCollection = new Map<string, string[]>();
  for (const cl of collectionLabels ?? []) {
    const label = labelById.get(cl.label_id);
    if (!label) continue;
    const arr = labelsByCollection.get(cl.collection_id) ?? [];
    arr.push({ id: label.id, name: label.name, color: label.color });
    labelsByCollection.set(cl.collection_id, arr);
    const ids = labelIdsByCollection.get(cl.collection_id) ?? [];
    ids.push(cl.label_id);
    labelIdsByCollection.set(cl.collection_id, ids);
  }

  const items: DashboardCollection[] = allCollections
    .filter((c) => c.parent_id === null)
    .map((collection) => ({
      ...buildCollectionCardData({
        collection,
        collections: allCollections,
        products: liveProducts,
        sectionStatusesByProduct,
        assets: assets ?? [],
        brandNameById,
        labelsByCollection,
      }),
      brandId: collection.brand_id,
      labelIds: labelIdsByCollection.get(collection.id) ?? [],
    }));

  return (
    <CollectionsDashboardClient
      items={items}
      brands={brands ?? []}
      seasons={seasons ?? []}
      labels={labels ?? []}
      collections={allCollections}
    />
  );
}
